-- ============================================================
-- 26_plano_intencao.sql
-- Corrige a troca de plano no checkout.
--
-- O mp-checkout pode cobrar um plano diferente do plano atual da
-- assinatura (ex.: empresa em trial no Essencial assina o
-- Profissional). Antes, o preapproval era criado mas a assinatura
-- continuava no plano antigo, deixando entitlements e a tela
-- "Empresa e Plano" incoerentes.
--
-- Solucao: guardar o plano pretendido em assinaturas.plano_intencao
-- e aplica-lo quando o preapproval fica "authorized", sincronizando
-- tambem empresas.plano.
--
-- Idempotente. Depende de 25_promocao_profissional.sql.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Plano pretendido no checkout
-- ------------------------------------------------------------
alter table public.assinaturas
    add column if not exists plano_intencao text references public.planos(codigo);

-- ------------------------------------------------------------
-- 2. mp_aplicar_assinatura aplica o plano ao confirmar o pagamento
-- ------------------------------------------------------------
create or replace function public.mp_aplicar_assinatura(
    p_preapproval_id text,
    p_empresa_id     uuid default null,
    p_status_mp      text default null,
    p_payer_id       text default null,
    p_valor          numeric default null,
    p_proximo_venc   date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_emp         uuid;
    v_ciclo       text;
    v_status      text;
    v_venc        date;
    v_plano_final text;
begin
    if p_preapproval_id is not null then
        select a.empresa_id, a.ciclo
          into v_emp, v_ciclo
          from public.assinaturas a
         where a.mp_preapproval_id = p_preapproval_id
         limit 1;
    end if;

    if v_emp is null and p_empresa_id is not null then
        select a.empresa_id, a.ciclo
          into v_emp, v_ciclo
          from public.assinaturas a
         where a.empresa_id = p_empresa_id
           and a.mp_preapproval_id is null
         limit 1;
    end if;

    if v_emp is null then
        return jsonb_build_object('ok', false, 'erro', 'assinatura_nao_encontrada');
    end if;

    v_status := case lower(coalesce(p_status_mp, ''))
        when 'authorized' then 'ativa'
        when 'pending'    then 'trial'
        when 'paused'     then 'inadimplente'
        when 'cancelled'  then 'cancelada'
        else null
    end;

    if v_status is null then
        update public.assinaturas
           set mp_preapproval_id = coalesce(p_preapproval_id, mp_preapproval_id),
               mp_status         = coalesce(p_status_mp, mp_status),
               mp_payer_id       = coalesce(p_payer_id, mp_payer_id),
               mp_atualizado_em  = now()
         where empresa_id = v_emp;
        return jsonb_build_object('ok', true, 'empresa_id', v_emp, 'status', 'ignorado');
    end if;

    if v_status = 'ativa' then
        v_venc := coalesce(
            p_proximo_venc,
            (greatest(coalesce((select vencimento from public.assinaturas where empresa_id = v_emp),
                               current_date), current_date)
             + case when v_ciclo = 'anual' then interval '1 year' else interval '1 month' end)::date
        );
    else
        v_venc := (select vencimento from public.assinaturas where empresa_id = v_emp);
    end if;

    update public.assinaturas
       set status            = v_status,
           mp_preapproval_id = coalesce(p_preapproval_id, mp_preapproval_id),
           mp_status         = coalesce(p_status_mp, mp_status),
           mp_payer_id       = coalesce(p_payer_id, mp_payer_id),
           valor             = coalesce(p_valor, valor),
           vencimento        = v_venc,
           ja_pagou          = (ja_pagou or v_status = 'ativa'),
           plano_codigo      = case
                                   when v_status = 'ativa' and plano_intencao is not null
                                   then plano_intencao
                                   else plano_codigo
                               end,
           mp_atualizado_em  = now(),
           atualizado_em     = now()
     where empresa_id = v_emp
     returning plano_codigo into v_plano_final;

    -- Mantem empresas.plano coerente com a assinatura ativa.
    if v_status = 'ativa' and v_plano_final is not null then
        update public.empresas set plano = v_plano_final where id = v_emp;
    end if;

    return jsonb_build_object(
        'ok', true, 'empresa_id', v_emp, 'status', v_status,
        'vencimento', v_venc, 'plano', v_plano_final);
end $$;

revoke all on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) from public;
revoke all on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) from anon, authenticated;
grant execute on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) to service_role;

-- ------------------------------------------------------------
-- 3. Backfill: alinha empresas.plano com assinaturas ativas
-- ------------------------------------------------------------
update public.empresas e
   set plano = a.plano_codigo
  from public.assinaturas a
 where a.empresa_id = e.id
   and a.status = 'ativa'
   and e.plano is distinct from a.plano_codigo;

commit;
