// ============================================================================
// Edge Function: mp-webhook
// Recebe notificacoes do Mercado Pago (preapproval / pagamentos de assinatura),
// registra o evento (idempotencia) e atualiza a assinatura da empresa.
//
// Variaveis de ambiente:
//   MP_ACCESS_TOKEN     - access token do app Mercado Pago (obrigatorio)
//   MP_WEBHOOK_SECRET   - segredo para validar x-signature (recomendado)
//   MP_API_BASE         - override da API (default https://api.mercadopago.com)
//
// Configure verify_jwt = false para esta funcao (o MP nao envia JWT Supabase).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseSignature(header) {
  const out = {};
  String(header || '').split(',').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

async function mpGet(api, token, path) {
  const resp = await fetch(`${api}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: resp.ok, status: resp.status, data };
}

function toDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_nao_permitido' }, 405);

  const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const MP_API = Deno.env.get('MP_API_BASE') || 'https://api.mercadopago.com';
  const WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET');

  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'ambiente incompleto' }, 500);
  }

  const raw = await req.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { /* corpo nao-JSON */ }

  const url = new URL(req.url);
  const resourceId = String(
    body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '',
  );
  const tipo = String(
    body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '',
  ).toLowerCase();
  const requestId = req.headers.get('x-request-id') || '';
  const eventoId = String(body?.id ?? requestId ?? '');

  if (WEBHOOK_SECRET) {
    const sig = parseSignature(req.headers.get('x-signature'));
    const ts = sig.ts || url.searchParams.get('ts') || '';
    const provided = sig.v1 || '';
    // Doc do MP: no manifesto, o data.id vai em minusculas.
    const manifestId = String(resourceId || '').toLowerCase();
    const manifest = `id:${manifestId};request-id:${requestId};ts:${ts};`;
    const expected = await hmacHex(WEBHOOK_SECRET, manifest);
    if (!provided || !timingSafeEqual(expected, provided)) {
      return json({ error: 'assinatura invalida' }, 401);
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: evento, error: evErr } = await admin
    .from('mp_eventos')
    .insert({
      evento_id: eventoId || null,
      tipo: tipo || null,
      recurso_id: resourceId || null,
      payload: body && typeof body === 'object' ? body : { raw },
    })
    .select('id')
    .maybeSingle();
  if (evErr) return json({ error: 'erro ao registrar evento: ' + evErr.message }, 500);
  if (!evento) return json({ ok: true, ignorado: 'evento_duplicado' });
  const eventoPk = evento.id;

  async function finalizar(status, erro, extra = {}) {
    await admin.from('mp_eventos')
      .update({ status, erro: erro || null, processado_em: new Date().toISOString() })
      .eq('id', eventoPk);
    return json({ ok: true, ...extra }, 200);
  }

  try {
    let preapprovalId = null;
    // Marca true apenas quando ha de fato uma cobranca da assinatura.
    // Contamos no evento canonico de recorrencia (subscription_authorized_payment)
    // para nao contar duas vezes a mesma cobranca (o topico "payment" tambem
    // dispara para o mesmo pagamento).
    let pagamentoAprovado = false;

    if (tipo.includes('preapproval')) {
      preapprovalId = resourceId;
    } else if (tipo.includes('authorized_payment')) {
      const r = await mpGet(MP_API, MP_ACCESS_TOKEN, `/authorized_payments/${resourceId}`);
      if (r.ok) {
        preapprovalId = r.data?.preapproval_id ? String(r.data.preapproval_id) : null;
        const stPag = String(r.data?.payment?.status || '').toLowerCase();
        const stRes = String(r.data?.status || '').toLowerCase();
        pagamentoAprovado = stPag === 'approved' || stRes === 'processed';
      }
    } else if (tipo.includes('payment')) {
      const r = await mpGet(MP_API, MP_ACCESS_TOKEN, `/payments/${resourceId}`);
      if (r.ok) {
        const pag = r.data || {};
        const meta = pag?.metadata || {};
        preapprovalId = meta.preapproval_id
          || pag.preapproval_id
          || null;
        if (preapprovalId) preapprovalId = String(preapprovalId);

        // Plano anual pago a vista via Pix (Checkout Pro): sem preapproval.
        // Ao aprovar, estende o vencimento em 12 meses (RPC idempotente).
        if (!preapprovalId && String(meta.tipo || '') === 'anual_pix') {
          const stPag = String(pag.status || '').toLowerCase();
          if (stPag !== 'approved') {
            return await finalizar('ignorado', null, {
              ignorado: 'pagamento_nao_aprovado', status: stPag,
            });
          }
          const empRef = String(pag.external_reference || meta.empresa_id || '');
          if (!/^[0-9a-f-]{36}$/i.test(empRef)) {
            return await finalizar('erro', 'empresa_id ausente no pagamento anual');
          }
          const { data: rpcAnual, error: errAnual } = await admin.rpc(
            'mp_aplicar_pagamento_anual',
            {
              p_empresa_id: empRef,
              p_payment_id: String(pag.id || resourceId),
              p_plano: meta.plano ? String(meta.plano) : null,
              p_valor: pag.transaction_amount ?? null,
            },
          );
          if (errAnual) return await finalizar('erro', errAnual.message);
          return await finalizar('processado', null, {
            tipo: 'anual_pix', resultado: rpcAnual,
          });
        }
      }
    }

    if (!preapprovalId) {
      return await finalizar('ignorado', null, { ignorado: 'tipo_sem_preapproval' });
    }

    const pre = await mpGet(MP_API, MP_ACCESS_TOKEN, `/preapproval/${preapprovalId}`);
    if (!pre.ok) {
      return await finalizar('erro', `MP ${pre.status}: ${pre?.data?.message || 'falha no preapproval'}`);
    }

    const d = pre.data || {};
    const externalRef = d.external_reference ? String(d.external_reference) : null;
    const empresaUuid = externalRef && /^[0-9a-f-]{36}$/i.test(externalRef) ? externalRef : null;

    const { data: rpcRes, error: rpcErr } = await admin.rpc('mp_aplicar_assinatura', {
      p_preapproval_id: String(d.id || preapprovalId),
      p_empresa_id: empresaUuid,
      p_status_mp: d.status || null,
      p_payer_id: d.payer_id ? String(d.payer_id) : null,
      p_valor: d.auto_recurring?.transaction_amount ?? null,
      p_proximo_venc: toDate(d.next_payment_date),
    });
    if (rpcErr) return await finalizar('erro', rpcErr.message);

    // Contabiliza o ciclo da promocao "novo CNPJ" a cada cobranca aprovada.
    // Ao completar os meses da promocao, aumenta o valor do preapproval para
    // o preco normal (PUT /preapproval/{id}) e encerra a promocao.
    let promoRes = null;
    if (pagamentoAprovado) {
      const pid = String(d.id || preapprovalId);
      const { data: cicloRes, error: cicloErr } = await admin.rpc('mp_registrar_pagamento', {
        p_preapproval_id: pid,
      });
      if (cicloErr) return await finalizar('erro', cicloErr.message);
      promoRes = cicloRes;

      if (cicloRes?.encerrar_promo) {
        const ar = d.auto_recurring || {};
        const putResp = await fetch(`${MP_API}/preapproval/${pid}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auto_recurring: {
              frequency: ar.frequency ?? 1,
              frequency_type: ar.frequency_type ?? 'months',
              transaction_amount: Number(cicloRes.valor_normal),
              currency_id: ar.currency_id ?? 'BRL',
            },
          }),
        });
        if (!putResp.ok) {
          const txt = await putResp.text();
          return await finalizar('erro', `PUT preapproval ${putResp.status}: ${txt.slice(0, 300)}`);
        }
        await admin.rpc('mp_encerrar_promo', { p_preapproval_id: pid });
      }
    }

    return await finalizar('processado', null, {
      preapproval_id: String(d.id || preapprovalId),
      status_mp: d.status || null,
      resultado: rpcRes,
      promo: promoRes,
    });
  } catch (e) {
    return await finalizar('erro', String(e?.message || e));
  }
});
