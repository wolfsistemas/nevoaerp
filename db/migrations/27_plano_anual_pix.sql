-- ============================================================
-- 27_plano_anual_pix.sql
-- Plano anual pago a vista via Pix (Checkout Pro).
--
-- A assinatura recorrente do Mercado Pago (preapproval) so debita
-- cartao de credito. Para oferecer Pix no ciclo anual, o valor do
-- ano e cobrado como pagamento unico (preference) e o vencimento e
-- estendido em 12 meses quando o pagamento e aprovado. Nao ha
-- renovacao automatica: o cliente renova manualmente ao vencer.
--
-- Segredos (MP_ACCESS_TOKEN) NAO ficam aqui: vivem nas variaveis de
-- ambiente das Edge Functions.
--
-- Idempotente. Depende de 26_plano_intencao.sql.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Vinculo com a preference/pagamento do Pix anual
-- ------------------------------------------------------------
alter table public.assinaturas
    add column if not exists mp_pix_preference_id text,
    add column if not exists mp_pix_init_point    text,
    add column if not exists mp_pix_valor         numeric(10,2),
    add column if not exists mp_pix_payment_id    text,
    add column if not exists mp_pix_em            timestamptz;

create unique index if not exists uq_assinaturas_mp_pix_payment
    on public.assinaturas (mp_pix_payment_id)
    where mp_pix_payment_id is not null;

-- ------------------------------------------------------------
-- 2. Aplica um pagamento unico aprovado do plano anual
--    Chamada apenas pelo webhook (service_role).
--
--    Idempotente: repeticoes do mesmo pagamento nao somam dois anos.
--    Ao aplicar, limpa a promocao (a promo "novo CNPJ" e mensal) e
--    encerra a cobranca Pix pendente, sincronizando empresas.plano.
-- ------------------------------------------------------------
create or replace function public.mp_aplicar_pagamento_anual(
    p_empresa_id uuid,
    p_payment_id text,
    p_plano      text default null,
    p_valor      numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_emp        uuid;
    v_pagou      text;
    v_ciclo      text;
    v_plano      text;
    v_venc       date;
    v_novo       date;
    v_valor      numeric(10,2);
begin
    if p_empresa_id is null then
        return jsonb_build_object('ok', false, 'erro', 'empresa_obrigatoria');
    end if;
    if p_payment_id is null or p_payment_id = '' then
        return jsonb_build_object('ok', false, 'erro', 'pagamento_obrigatorio');
    end if;

    select a.mp_pix_payment_id, a.ciclo, a.plano_codigo, a.vencimento, a.valor
      into v_pagou, v_ciclo, v_plano, v_venc, v_valor
      from public.assinaturas a
     where a.empresa_id = p_empresa_id
     limit 1;

    if v_plano is null and v_ciclo is null and v_venc is null then
        return jsonb_build_object('ok', false, 'erro', 'assinatura_nao_encontrada');
    end if;

    -- Mesmo pagamento ja aplicado: nao estende o vencimento de novo.
    if v_pagou is not null and v_pagou = p_payment_id then
        return jsonb_build_object(
            'ok', true, 'empresa_id', p_empresa_id, 'duplicado', true,
            'vencimento', v_venc, 'plano', v_plano);
    end if;

    v_valor := coalesce(p_valor, v_valor);
    v_novo  := (greatest(coalesce(v_venc, current_date), current_date)
                + interval '1 year')::date;

    if p_plano is not null and exists (select 1 from public.planos where codigo = p_plano) then
        v_plano := p_plano;
    end if;

    update public.assinaturas
       set status              = 'ativa',
           ciclo               = 'anual',
           plano_codigo        = v_plano,
           plano_intencao      = null,
           valor               = v_valor,
           valor_normal        = v_valor,
           vencimento          = v_novo,
           inicio              = coalesce(inicio, current_date),
           ja_pagou            = true,
           mp_status           = 'pix_aprovado',
           mp_pix_payment_id   = p_payment_id,
           mp_pix_valor        = v_valor,
           mp_pix_em           = now(),
           mp_pix_preference_id = null,
           mp_pix_init_point   = null,
           promo_codigo        = null,
           promo_valor         = null,
           promo_meses         = null,
           promo_aplicada_em   = null,
           promo_ate           = null,
           promo_encerrada     = true,
           mp_atualizado_em    = now(),
           atualizado_em       = now()
     where empresa_id = p_empresa_id
     returning plano_codigo into v_plano;

    -- Mantem empresas.plano coerente com a assinatura ativa.
    update public.empresas set plano = v_plano where id = p_empresa_id;

    return jsonb_build_object(
        'ok', true, 'empresa_id', p_empresa_id, 'status', 'ativa',
        'vencimento', v_novo, 'plano', v_plano, 'valor', v_valor);
end $$;

revoke all on function public.mp_aplicar_pagamento_anual(uuid, text, text, numeric) from public;
revoke all on function public.mp_aplicar_pagamento_anual(uuid, text, text, numeric) from anon, authenticated;
grant execute on function public.mp_aplicar_pagamento_anual(uuid, text, text, numeric) to service_role;

-- ------------------------------------------------------------
-- 3. minha_assinatura expoe o estado do Pix anual pendente
-- ------------------------------------------------------------
create or replace function public.minha_assinatura()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_emp    uuid := public.empresa_do_usuario();
    v_promo_cod    text;
    v_promo_plano  text;
    v_promo_valor  numeric(10,2);
    v_promo_meses  integer;
    v jsonb;
begin
    if v_emp is null then
        return jsonb_build_object('tem_assinatura', false);
    end if;

    select p.codigo, p.plano_codigo, p.valor_promocional, p.meses
      into v_promo_cod, v_promo_plano, v_promo_valor, v_promo_meses
      from public.promocoes p
     where p.ativo
       and p.ciclo = 'mensal'
       and (p.vigencia_inicio is null or p.vigencia_inicio <= current_date)
       and (p.vigencia_fim is null or p.vigencia_fim >= current_date)
     order by p.valor_promocional asc
     limit 1;

    select jsonb_build_object(
        'tem_assinatura', true,
        'empresa_id', a.empresa_id,
        'plano_codigo', a.plano_codigo,
        'plano_nome', p.nome,
        'status', a.status,
        'ciclo', a.ciclo,
        'valor', a.valor,
        'inicio', a.inicio,
        'vencimento', a.vencimento,
        'trial_ate', a.trial_ate,
        'addon_mdf', a.addon_mdf,
        'inclui_mdf', (p.inclui_mdf or a.addon_mdf),
        'max_usuarios', p.max_usuarios,
        'recursos', p.recursos,
        'preco_mensal', p.preco_mensal,
        'preco_anual', p.preco_anual,
        'mp_status', a.mp_status,
        'mp_vinculada', (a.mp_preapproval_id is not null),
        'mp_pix_pendente', (a.mp_pix_preference_id is not null and a.mp_status = 'pix_pendente'),
        'mp_pix_init_point', a.mp_pix_init_point,
        'promo_codigo', a.promo_codigo,
        'promo_valor', a.promo_valor,
        'promo_meses', a.promo_meses,
        'promo_ciclos_pagos', a.promo_ciclos_pagos,
        'promo_ate', a.promo_ate,
        'valor_normal', a.valor_normal,
        'promo_encerrada', a.promo_encerrada,
        'promo_elegivel', (v_promo_cod is not null and public.promo_elegivel(v_emp, v_promo_cod)),
        'promo_disponivel', case when v_promo_cod is null then null else
            jsonb_build_object(
                'codigo', v_promo_cod,
                'plano_codigo', v_promo_plano,
                'valor', v_promo_valor,
                'meses', v_promo_meses) end,
        'uso_usuarios', (select count(*) from public.usuarios u where u.empresa_id = a.empresa_id),
        'bloqueada', public.assinatura_bloqueada()
    ) into v
    from public.assinaturas a
    join public.planos p on p.codigo = a.plano_codigo
    where a.empresa_id = v_emp;

    return coalesce(v, jsonb_build_object('tem_assinatura', false));
end $$;

revoke all on function public.minha_assinatura() from public;
grant execute on function public.minha_assinatura() to authenticated;

commit;
