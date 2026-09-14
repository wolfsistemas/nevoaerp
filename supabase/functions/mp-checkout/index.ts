// ============================================================================
// Edge Function: mp-checkout
// Cria uma assinatura recorrente (preapproval) no Mercado Pago para a
// empresa do usuario autenticado e devolve o init_point do checkout.
//
// Variaveis de ambiente (configurar com `supabase secrets set`):
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
  const ciclo = String(body?.ciclo || 'mensal').trim().toLowerCase();
  if (!plano) return json({ error: 'plano obrigatorio' }, 400);
  if (ciclo !== 'mensal' && ciclo !== 'anual') return json({ error: 'ciclo invalido' }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'sessao invalida' }, 401);

  const email = (userData.user.email || '').trim();
  if (!email) return json({ error: 'usuario sem e-mail' }, 400);

  // Escapa curingas do LIKE para nao casar outro e-mail por acidente.
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
    .select('codigo, nome, preco_mensal, preco_anual, ativo')
    .eq('codigo', plano)
    .maybeSingle();
  if (planoErr) return json({ error: 'erro ao carregar plano' }, 500);
  if (!planoRow || planoRow.ativo === false) return json({ error: 'plano indisponivel' }, 400);

  const valorNormal = ciclo === 'anual'
    ? Number(planoRow.preco_anual)
    : Number(planoRow.preco_mensal);

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('empresa_id, mp_preapproval_id, mp_status, plano_codigo, ciclo, promo_codigo, promo_encerrada, promo_valor, promo_meses')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (assinatura?.mp_status === 'authorized' && assinatura?.mp_preapproval_id) {
    return json({
      error: 'ja_assinante',
      message: 'A assinatura ja esta ativa no Mercado Pago. Gerencie ou cancele pelo Mercado Pago.',
      preapproval_id: assinatura.mp_preapproval_id,
    }, 409);
  }

  // Promocao "novo CNPJ": somente no ciclo mensal. Reaproveita a promo
  // ja vinculada (checkout interrompido) ou avalia a elegibilidade.
  let promo = null;
  if (ciclo === 'mensal') {
    const hoje = new Date().toISOString().slice(0, 10);

    // Promo ja vinculada a um checkout interrompido: reaproveita somente se ela
    // valer para o plano/ciclo solicitado (evita aplicar a promo de um plano em
    // outro, ex.: desconto do Profissional ao assinar o Essencial).
    if (assinatura?.promo_codigo && assinatura.promo_encerrada !== true) {
      const { data: vinculada } = await admin
        .from('promocoes')
        .select('codigo, plano_codigo, ciclo, valor_promocional, meses, ativo, vigencia_inicio, vigencia_fim')
        .eq('codigo', assinatura.promo_codigo)
        .maybeSingle();
      const valida = vinculada && vinculada.ativo !== false
        && vinculada.plano_codigo === plano
        && vinculada.ciclo === 'mensal'
        && (!vinculada.vigencia_inicio || vinculada.vigencia_inicio <= hoje)
        && (!vinculada.vigencia_fim || vinculada.vigencia_fim >= hoje);
      if (valida) {
        promo = {
          codigo: vinculada.codigo,
          valor: Number(vinculada.valor_promocional),
          meses: vinculada.meses || 3,
        };
      }
    }

    if (!promo) {
      const { data: promoRows } = await admin
        .from('promocoes')
        .select('codigo, valor_promocional, meses, vigencia_inicio, vigencia_fim')
        .eq('plano_codigo', plano)
        .eq('ciclo', 'mensal')
        .eq('ativo', true);
      const cand = (promoRows || []).find((p) =>
        (!p.vigencia_inicio || p.vigencia_inicio <= hoje) &&
        (!p.vigencia_fim || p.vigencia_fim >= hoje));
      if (cand) {
        const { data: eleg } = await admin.rpc('promo_elegivel', {
          p_empresa_id: empresaId,
          p_promocao: cand.codigo,
        });
        if (eleg === true) {
          promo = {
            codigo: cand.codigo,
            valor: Number(cand.valor_promocional),
            meses: cand.meses || 3,
          };
        }
      }
    }
  }

  const valor = promo ? promo.valor : valorNormal;
  if (!(valor > 0)) return json({ error: 'valor do plano invalido' }, 400);

  function addMeses(base, meses) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + Number(meses || 0));
    return d.toISOString().slice(0, 10);
  }

  const backUrl = APP_BASE_URL
    ? `${APP_BASE_URL}/sistema.html?assinatura=retorno`
    : undefined;

  const agora = new Date().toISOString();

  // Campos de sincronizacao da assinatura local (comuns ao reuso e ao criar).
  function camposAssinatura(
    p: { codigo: string; valor: number; meses: number } | null,
  ): Record<string, unknown> {
    const campos: Record<string, unknown> = {
      mp_status: 'pending',
      mp_atualizado_em: agora,
      // Aplicado quando o preapproval for autorizado (mp_aplicar_assinatura).
      plano_intencao: plano,
      valor_normal: valorNormal,
    };
    if (p) {
      campos.promo_codigo = p.codigo;
      campos.promo_valor = p.valor;
      campos.promo_meses = p.meses;
      campos.promo_encerrada = false;
      campos.valor = p.valor;
    } else {
      // Checkout sem promo (preco normal): limpa residuos de uma promo
      // anterior para nao reaplicar desconto em outro plano.
      campos.promo_codigo = null;
      campos.promo_valor = null;
      campos.promo_meses = null;
      campos.promo_encerrada = true;
      campos.promo_aplicada_em = null;
      campos.promo_ate = null;
      campos.valor = valorNormal;
    }
    return campos;
  }

  // Reaproveita um preapproval PENDENTE do proprio usuario (checkout
  // interrompido) para nao acumular cobrancas orfas no Mercado Pago.
  const pendenteId = assinatura?.mp_preapproval_id
    ? String(assinatura.mp_preapproval_id)
    : null;
  const statusLocal = String(assinatura?.mp_status || '').toLowerCase();
  if (pendenteId && statusLocal !== 'authorized') {
    const rAtual = await fetch(`${MP_API}/preapproval/${pendenteId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (rAtual.ok) {
      const atual = await rAtual.json();
      const stAtual = String(atual?.status || '').toLowerCase();

      if (stAtual === 'authorized') {
        return json({
          error: 'ja_assinante',
          message: 'A assinatura ja esta ativa no Mercado Pago.',
          preapproval_id: pendenteId,
        }, 409);
      }

      if (stAtual === 'pending') {
        const amountAtual = Number(atual?.auto_recurring?.transaction_amount);
        if (Number.isFinite(amountAtual) && amountAtual === Number(valor)) {
          await admin.from('assinaturas')
            .update(camposAssinatura(promo))
            .eq('empresa_id', empresaId);
          const reuso = sandbox
            ? (atual.sandbox_init_point || atual.init_point)
            : (atual.init_point || atual.sandbox_init_point);
          return json({
            ok: true,
            reaproveitado: true,
            preapproval_id: pendenteId,
            status: 'pending',
            init_point: reuso,
            sandbox_init_point: atual.sandbox_init_point || null,
            plano,
            ciclo,
            valor,
            promo: promo
              ? { codigo: promo.codigo, valor: promo.valor, meses: promo.meses }
              : null,
            valor_normal: valorNormal,
          });
        }
        // Valor diferente (troca de plano/ciclo): cancela o pendente antes
        // de gerar um novo checkout, evitando duplicidade no MP.
        await fetch(`${MP_API}/preapproval/${pendenteId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        });
      }
    }
  }

  const preapprovalReq = {
    reason: `Nevoa ${planoRow.nome} (${ciclo})${promo ? ' - promocao novo CNPJ' : ''}`,
    external_reference: empresaId,
    payer_email: email,
    status: 'pending',
    auto_recurring: {
      frequency: ciclo === 'anual' ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: valor,
      currency_id: 'BRL',
    },
    ...(backUrl ? { back_url: backUrl } : {}),
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
  };

  const mpResp = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preapprovalReq),
  });

  const mpText = await mpResp.text();
  let mpJson;
  try { mpJson = JSON.parse(mpText); } catch { mpJson = { raw: mpText }; }

  if (!mpResp.ok) {
    return json({
      error: 'mercadopago',
      status: mpResp.status,
      message: mpJson?.message || mpJson?.error || 'Falha ao criar a assinatura.',
      cause: mpJson?.cause || null,
    }, 502);
  }

  const preapprovalId = mpJson?.id ? String(mpJson.id) : null;
  if (!preapprovalId) return json({ error: 'sem_preapproval', message: 'MP nao retornou o id.' }, 502);

  const link: Record<string, unknown> = {
    ...camposAssinatura(promo),
    mp_status: mpJson.status || 'pending',
    mp_preapproval_id: preapprovalId,
    mp_iniciada_em: agora,
  };
  if (promo) {
    link.promo_aplicada_em = agora;
    link.promo_ate = addMeses(agora, promo.meses);
  }

  const { error: updErr } = await admin
    .from('assinaturas')
    .update(link)
    .eq('empresa_id', empresaId);
  if (updErr) return json({ error: 'erro ao vincular assinatura: ' + updErr.message }, 500);

  const initPoint = sandbox
    ? (mpJson.sandbox_init_point || mpJson.init_point)
    : (mpJson.init_point || mpJson.sandbox_init_point);

  return json({
    ok: true,
    preapproval_id: preapprovalId,
    status: mpJson.status || 'pending',
    init_point: initPoint,
    sandbox_init_point: mpJson.sandbox_init_point || null,
    plano,
    ciclo,
    valor,
    promo: promo ? { codigo: promo.codigo, valor: promo.valor, meses: promo.meses } : null,
    valor_normal: valorNormal,
  });
});
