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

  const valor = ciclo === 'anual' ? Number(planoRow.preco_anual) : Number(planoRow.preco_mensal);
  if (!(valor > 0)) return json({ error: 'valor do plano invalido' }, 400);

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('empresa_id, mp_preapproval_id, mp_status, plano_codigo, ciclo')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (assinatura?.mp_status === 'authorized' && assinatura?.mp_preapproval_id) {
    return json({
      error: 'ja_assinante',
      message: 'A assinatura ja esta ativa no Mercado Pago. Gerencie ou cancele pelo Mercado Pago.',
      preapproval_id: assinatura.mp_preapproval_id,
    }, 409);
  }

  const backUrl = APP_BASE_URL
    ? `${APP_BASE_URL}/sistema.html?assinatura=retorno`
    : undefined;

  const preapprovalReq = {
    reason: `Nevoa ${planoRow.nome} (${ciclo})`,
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

  const { error: updErr } = await admin
    .from('assinaturas')
    .update({
      mp_preapproval_id: preapprovalId,
      mp_status: mpJson.status || 'pending',
      mp_iniciada_em: new Date().toISOString(),
      mp_atualizado_em: new Date().toISOString(),
    })
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
  });
});
