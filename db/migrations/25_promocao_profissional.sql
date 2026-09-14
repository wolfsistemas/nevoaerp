-- ============================================================
-- 25_promocao_profissional.sql
-- Preco do Profissional + promocao "novo CNPJ" (3 meses).
--
-- Regras:
--   Profissional: R$ 389,90/mes  | R$ 3.899,00/ano
--   Promocao novo-cnpj-3m: R$ 129,90/mes nos 3 primeiros ciclos
--   (somente ciclo mensal). Depois volta para 389,90, via
--   PUT /preapproval/{id} disparado pelo webhook.
--
-- Idempotente. Depende de 24_mp_preapproval.sql.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Catalogo: preco normal do Profissional
-- ------------------------------------------------------------
update public.planos
   set preco_mensal = 389.90,
       preco_anual  = 3899.00,
       destaque     = true
 where codigo = 'profissional';

update public.planos set destaque = false where codigo <> 'profissional';

-- ------------------------------------------------------------
-- 2. Colunas de promocao e historico de pagamento
-- ------------------------------------------------------------
alter table public.assinaturas
    add column if not exists promo_codigo      text,
    add column if not exists promo_valor       numeric(10,2),
    add column if not exists promo_meses        integer,
    add column if not exists promo_ciclos_pagos integer not null default 0,
    add column if not exists promo_ate          date,
    add column if not exists valor_normal       numeric(10,2),
    add column if not exists promo_encerrada    boolean not null default false,
    add column if not exists promo_aplicada_em  timestamptz,
    add column if not exists ja_pagou           boolean not null default false;

-- ------------------------------------------------------------
-- 2b. CNPJ normalizado (so digitos) para a regra "novo CNPJ"
--     Coluna gerada + indice de busca. Nao e unique global de
--     proposito: um mesmo CNPJ pode ter mais de uma conta; a
--     exclusividade da PROMOCAO e garantida em promo_elegivel().
-- ------------------------------------------------------------
alter table public.empresas
    add column if not exists cnpj_normalizado text
    generated always as (nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '')) stored;

create index if not exists idx_empresas_cnpj_normalizado
    on public.empresas (cnpj_normalizado);

-- ------------------------------------------------------------
-- 3. Catalogo de promocoes
-- ------------------------------------------------------------
create table if not exists public.promocoes (
    codigo            text primary key,
    nome              text not null,
    plano_codigo      text not null references public.planos(codigo),
    ciclo             text not null default 'mensal' check (ciclo in ('mensal','anual')),
    valor_promocional numeric(10,2) not null,
    meses             integer not null default 3,
    novo_cnpj_only    boolean not null default true,
    vigencia_inicio   date,
    vigencia_fim      date,
    ativo             boolean not null default true,
    criado_em         timestamptz not null default now()
);

insert into public.promocoes
    (codigo, nome, plano_codigo, ciclo, valor_promocional, meses, novo_cnpj_only, ativo)
values
    ('novo-cnpj-3m', 'Novo CNPJ - 3 primeiros meses', 'profissional', 'mensal', 129.90, 3, true, true)
on conflict (codigo) do update set
    nome              = excluded.nome,
    plano_codigo      = excluded.plano_codigo,
    ciclo             = excluded.ciclo,
    valor_promocional = excluded.valor_promocional,
    meses             = excluded.meses,
    novo_cnpj_only    = excluded.novo_cnpj_only,
    ativo             = excluded.ativo;

alter table public.promocoes enable row level security;

drop policy if exists promocoes_select_public on public.promocoes;
create policy promocoes_select_public on public.promocoes
    for select to anon, authenticated
    using (ativo);

grant select on public.promocoes to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Elegibilidade da promocao
--    Cliente novo (nunca pagou / nunca usou promo) e, quando o
--    CNPJ estiver preenchido, sem outra empresa que ja usou a
--    mesma promocao com o mesmo CNPJ.
-- ------------------------------------------------------------
create or replace function public.promo_elegivel(p_empresa_id uuid, p_promocao text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_promo public.promocoes;
    v_ass   public.assinaturas;
    v_cnpj  text;
begin
    select * into v_promo
      from public.promocoes
     where codigo = p_promocao
       and ativo
       and (vigencia_inicio is null or vigencia_inicio <= current_date)
       and (vigencia_fim is null or vigencia_fim >= current_date);
    if not found then
        return false;
    end if;

    select * into v_ass from public.assinaturas where empresa_id = p_empresa_id;
    if v_ass.empresa_id is not null then
        if coalesce(v_ass.ja_pagou, false) then
            return false;
        end if;
        if v_ass.promo_aplicada_em is not null then
            return false;
        end if;
    end if;

    if v_promo.novo_cnpj_only then
        select cnpj_normalizado
          into v_cnpj
          from public.empresas where id = p_empresa_id;

        if v_cnpj is not null then
            if exists (
                select 1
                  from public.empresas e2
                  join public.assinaturas a2 on a2.empresa_id = e2.id
                 where e2.id <> p_empresa_id
                   and e2.cnpj_normalizado = v_cnpj
                   and a2.promo_aplicada_em is not null
            ) then
                return false;
            end if;
        end if;
    end if;

    return true;
end $$;

revoke all on function public.promo_elegivel(uuid, text) from public;
grant execute on function public.promo_elegivel(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. mp_aplicar_assinatura passa a marcar ja_pagou
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
    v_emp    uuid;
    v_ciclo  text;
    v_status text;
    v_venc   date;
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
           mp_atualizado_em  = now(),
           atualizado_em     = now()
     where empresa_id = v_emp;

    return jsonb_build_object(
        'ok', true, 'empresa_id', v_emp, 'status', v_status, 'vencimento', v_venc);
end $$;

revoke all on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) from public;
revoke all on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) from anon, authenticated;
grant execute on function public.mp_aplicar_assinatura(text, uuid, text, text, numeric, date) to service_role;

-- ------------------------------------------------------------
-- 6. Ciclos pagos da promocao (chamada pelo webhook a cada cobranca)
-- ------------------------------------------------------------
create or replace function public.mp_registrar_pagamento(p_preapproval_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v public.assinaturas;
    v_encerrar boolean := false;
begin
    select * into v from public.assinaturas
     where mp_preapproval_id = p_preapproval_id limit 1;
    if not found then
        return jsonb_build_object('ok', false, 'erro', 'assinatura_nao_encontrada');
    end if;

    update public.assinaturas
       set ja_pagou = true,
           promo_ciclos_pagos = case
               when promo_codigo is not null and not promo_encerrada
               then coalesce(promo_ciclos_pagos, 0) + 1
               else coalesce(promo_ciclos_pagos, 0)
           end,
           mp_atualizado_em = now(),
           atualizado_em    = now()
     where empresa_id = v.empresa_id
     returning * into v;

    if v.promo_codigo is not null
       and not v.promo_encerrada
       and coalesce(v.promo_ciclos_pagos, 0) >= coalesce(v.promo_meses, 3) then
        v_encerrar := true;
    end if;

    return jsonb_build_object(
        'ok', true,
        'empresa_id', v.empresa_id,
        'encerrar_promo', v_encerrar,
        'valor_normal', v.valor_normal,
        'promo_ciclos_pagos', v.promo_ciclos_pagos,
        'promo_meses', v.promo_meses,
        'mp_preapproval_id', v.mp_preapproval_id
    );
end $$;

revoke all on function public.mp_registrar_pagamento(text) from public;
revoke all on function public.mp_registrar_pagamento(text) from anon, authenticated;
grant execute on function public.mp_registrar_pagamento(text) to service_role;

-- ------------------------------------------------------------
-- 7. Encerramento da promocao (apos o PUT do valor normal)
-- ------------------------------------------------------------
create or replace function public.mp_encerrar_promo(p_preapproval_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.assinaturas
       set promo_encerrada = true,
           valor           = coalesce(valor_normal, valor),
           promo_ate       = null,
           mp_atualizado_em = now(),
           atualizado_em   = now()
     where mp_preapproval_id = p_preapproval_id;
    if not found then
        return jsonb_build_object('ok', false, 'erro', 'assinatura_nao_encontrada');
    end if;
    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.mp_encerrar_promo(text) from public;
revoke all on function public.mp_encerrar_promo(text) from anon, authenticated;
grant execute on function public.mp_encerrar_promo(text) to service_role;

-- ------------------------------------------------------------
-- 8. Pagamento manual (super-admin) tambem marca ja_pagou
-- ------------------------------------------------------------
create or replace function public.sa_registrar_pagamento(p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ciclo text;
    v_plano text;
    v_novo  date;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    select ciclo, plano_codigo into v_ciclo, v_plano
    from public.assinaturas where empresa_id = p_empresa_id;

    if v_ciclo is null then
        raise exception 'Empresa sem assinatura';
    end if;

    update public.assinaturas
       set status = 'ativa',
           ja_pagou = true,
           valor = (select case v_ciclo when 'anual' then preco_anual else preco_mensal end
                    from public.planos where codigo = v_plano),
           vencimento = (greatest(coalesce(vencimento, current_date), current_date)
                         + case when v_ciclo = 'anual' then interval '1 year' else interval '1 month' end)::date,
           atualizado_em = now()
     where empresa_id = p_empresa_id
    returning vencimento into v_novo;

    return jsonb_build_object('ok', true, 'vencimento', v_novo, 'status', 'ativa');
end $$;

revoke all on function public.sa_registrar_pagamento(uuid) from public;
grant execute on function public.sa_registrar_pagamento(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. minha_assinatura expoe a promocao
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

    -- Promocao mensal vigente (independente do plano atual, para que o
    -- upgrade promocional apareca mesmo para quem esta no trial).
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
