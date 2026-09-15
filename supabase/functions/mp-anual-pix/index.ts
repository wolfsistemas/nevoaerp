// ============================================================================
// Edge Function: mp-anual-pix
// Cria um pagamento unico (Checkout Pro / preference) do plano anual via Pix
// para a empresa do usuario autenticado e devolve o init_point do checkout.
//
// Por que Pix: a assinatura recorrente do Mercado Pago (preapproval) so debita
// cartao. No ciclo anual cobramos o valor do ano a vista via Pix e o webhook
// (mp-webhook) estende o vencimento por 12 meses quando o pagamento e aprovado.
// Nao ha renovacao automatica.
//
// Variaveis de ambiente:
//   MP_ACCESS_TOKEN    - access token do app Mercado Pago (obrigatorio)
//   MP_SANDBOX         - "true" para usar sandbox_init_point (opcional)
//   APP_BASE_URL       - URL publica do app (opcional, back_url)
//   MP_API_BASE        - override da API (default https://api.mercadopago.com)
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sao injetadas
// automaticamente pelo Supabase. Nenhum segredo fica no repositorio.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Mesmo saneamento do mp-checkout: alguns links do Mercado Pago vem com
// "&activation=true", que renderiza "Esta pagina nao existe".
function sanitizeInitPoint(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('activation');
    return u.toString();
  } catch {
    return url.replace(/([?&])activation=true(&|$)/i, (_m, p1, p2) => (p2 ? p1 : ''))
              .replace(/[?&]$/, '');
  }
}

// Deixa apenas Pix: exclui cartao, boleto, loterica e prepago.
// (account_money nao pode ser excluido pela API do Mercado Pago.)
const EXCLUDE_PIX = [
  { id: 'credit_card' },
  { id: 'debit_card' },
  { id: 'ticket' },
  { id: 'atm' },
  { id: 'prepaid_card' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_nao_permitido' }, 405);

  const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
  if (!MP_ACCESS_TOKEN) {
    return json({ error: 'Pagamento nao configurado (MP_ACCESS_TOKEN ausente).' }, 503);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const MP_API = Deno.env.get('MP_API_BASE') || 'https://api.mercadopago.com';
  const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || '').replace(/\/+$/, '');
  const sandbox = String(Deno.env.get('MP_SANDBOX') || '').toLowerCase() === 'true';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'ambiente Supabase incompleto' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'nao autenticado' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo invalido' }, 400);
  }

  const plano = String(body?.plano || '').trim().toLowerCase();
  if (!plano) return json({ error: 'plano obrigatorio' }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'sessao invalida' }, 401);

  const email = (userData.user.email || '').trim();
  if (!email) return json({ error: 'usuario sem e-mail' }, 400);

  const emailPat = email.replace(/([%_\\])/g, '\\$1');
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: perfil, error: perfilErr } = await admin
    .from('usuarios')
    .select('id, empresa_id, ativo')
    .ilike('email', emailPat)
    .maybeSingle();
  if (perfilErr) return json({ error: 'erro ao carregar perfil: ' + perfilErr.message }, 500);
  if (!perfil) return json({ error: 'perfil nao encontrado' }, 403);
  if (perfil.ativo === false) return json({ error: 'usuario bloqueado' }, 403);

  const empresaId = perfil.empresa_id;

  const { data: planoRow, error: planoErr } = await admin
    .from('planos')
    .select('codigo, nome, preco_anual, ativo')
    .eq('codigo', plano)
    .maybeSingle();
  if (planoErr) return json({ error: 'erro ao carregar plano' }, 500);
  if (!planoRow || planoRow.ativo === false) return json({ error: 'plano indisponivel' }, 400);

  const valor = Number(planoRow.preco_anual);
  if (!(valor > 0)) return json({ error: 'valor do plano invalido' }, 400);

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('empresa_id, mp_preapproval_id, mp_status, mp_pix_preference_id, mp_pix_init_point, plano_codigo')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  // Assinatura recorrente ativa: nao permitir contratar o anual por cima.
  if (assinatura?.mp_status === 'authorized' && assinatura?.mp_preapproval_id) {
    return json({
      error: 'ja_assinante',
      message: 'A assinatura recorrente ja esta ativa. Cancele no Mercado Pago antes de contratar o plano anual.',
      preapproval_id: assinatura.mp_preapproval_id,
    }, 409);
  }

  const agora = new Date().toISOString();

  // Assinatura recorrente (cartao) apenas pendente: cancela no Mercado Pago
  // antes de trocar para o Pix, para nao deixar cobranca orfa.
  const preapprovalPendente = assinatura?.mp_preapproval_id
    && String(assinatura.mp_status || '').toLowerCase() !== 'authorized'
    ? String(assinatura.mp_preapproval_id)
    : null;
  if (preapprovalPendente) {
    await fetch(`${MP_API}/preapproval/${preapprovalPendente}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }

  const campos: Record<string, unknown> = {
    ciclo: 'anual',
    plano_intencao: plano,
    valor,
    valor_normal: valor,
    mp_pix_valor: valor,
    mp_pix_em: agora,
    mp_atualizado_em: agora,
    // Pix a vista substitui a assinatura recorrente pendente (se houver).
    mp_preapproval_id: null,
    mp_payer_id: null,
    // Anual a vista nao usa promocao mensal.
    promo_codigo: null,
    promo_valor: null,
    promo_meses: null,
    promo_aplicada_em: null,
    promo_ate: null,
    promo_encerrada: true,
  };

  // Reaproveita uma cobranca Pix pendente do mesmo plano (checkout interrompido)
  // para nao acumular preferencias orfas no Mercado Pago.
  const prefId = assinatura?.mp_pix_preference_id ? String(assinatura.mp_pix_preference_id) : null;
  const statusLocal = String(assinatura?.mp_status || '').toLowerCase();
  if (prefId && assinatura?.mp_pix_init_point && statusLocal !== 'pix_aprovado') {
    const rAtual = await fetch(`${MP_API}/checkout/preferences/${prefId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (rAtual.ok) {
      const prefs = await rAtual.json();
      const meta = prefs?.metadata || {};
      if (String(meta.plano || '') === plano && String(meta.tipo || '') === 'anual_pix') {
        campos.mp_status = 'pix_pendente';
        await admin.from('assinaturas').update(campos).eq('empresa_id', empresaId);
        const reuso = sandbox
          ? (prefs.sandbox_init_point || prefs.init_point)
          : (prefs.init_point || prefs.sandbox_init_point);
        return json({
          ok: true,
          reaproveitado: true,
          preference_id: prefId,
          init_point: sanitizeInitPoint(reuso || assinatura.mp_pix_init_point),
          sandbox_init_point: sanitizeInitPoint(prefs.sandbox_init_point) || null,
          plano,
          ciclo: 'anual',
          valor,
          valor_normal: valor,
          promo: null,
        });
      }
    }
  }

  const backUrl = APP_BASE_URL
    ? `${APP_BASE_URL}/sistema.html?assinatura=retorno`
    : undefined;

  const preferenceReq: Record<string, unknown> = {
    items: [{
      id: `nevoa-${plano}-anual`,
      title: `Nevoa ${planoRow.nome} (anual)`,
      description: `Plano ${planoRow.nome} - 12 meses`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: valor,
    }],
    payer: { email },
    external_reference: empresaId,
    metadata: { tipo: 'anual_pix', empresa_id: empresaId, plano, ciclo: 'anual' },
    payment_methods: {
      excluded_payment_types: EXCLUDE_PIX,
      installments: 1,
    },
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
  };

  if (backUrl) {
    preferenceReq.back_urls = { success: backUrl, pending: backUrl, failure: backUrl };
    preferenceReq.auto_return = 'approved';
  }

  const mpResp = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferenceReq),
  });

  const mpText = await mpResp.text();
  let mpJson;
  try { mpJson = JSON.parse(mpText); } catch { mpJson = { raw: mpText }; }

  if (!mpResp.ok) {
    return json({
      error: 'mercadopago',
      status: mpResp.status,
      message: mpJson?.message || mpJson?.error || 'Falha ao criar o checkout Pix.',
      cause: mpJson?.cause || null,
    }, 502);
  }

  const preferenceId = mpJson?.id ? String(mpJson.id) : null;
  if (!preferenceId) return json({ error: 'sem_preference', message: 'MP nao retornou o id.' }, 502);

  const initPoint = sandbox
    ? (mpJson.sandbox_init_point || mpJson.init_point)
    : (mpJson.init_point || mpJson.sandbox_init_point);

  const link = {
    ...campos,
    mp_status: 'pix_pendente',
    mp_pix_preference_id: preferenceId,
    mp_pix_init_point: initPoint || null,
  };

  const { error: updErr } = await admin
    .from('assinaturas')
    .update(link)
    .eq('empresa_id', empresaId);
  if (updErr) return json({ error: 'erro ao vincular assinatura: ' + updErr.message }, 500);

  return json({
    ok: true,
    preference_id: preferenceId,
    init_point: sanitizeInitPoint(initPoint),
    sandbox_init_point: sanitizeInitPoint(mpJson.sandbox_init_point) || null,
    plano,
    ciclo: 'anual',
    valor,
    valor_normal: valor,
    promo: null,
  });
});
