-- ============================================================
-- 18_billing.sql
-- Nucleo de billing: catalogo de planos, assinatura por empresa,
-- limites/entitlements e camada de cobranca do super-admin.
--
-- Planos:
--   essencial    - R$ 49/mes  | R$ 490/ano   | 1 usuario  | sem MDF
--   profissional - R$ 197/mes | R$ 1.970/ano | 5 usuarios | sem MDF
--   enterprise   - R$ 447/mes | R$ 4.470/ano | ilimitado  | com MDF
--   Anual = 10x mensal (2 meses gratis).
--
-- Rodar depois de 17_login_reservado.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Catalogo de planos
-- ------------------------------------------------------------
create table if not exists public.planos (
    codigo        text primary key,
    nome          text not null,
    preco_mensal  numeric(10,2) not null default 0,
    preco_anual   numeric(10,2) not null default 0,
    max_usuarios  integer,
    inclui_mdf    boolean not null default false,
    recursos      jsonb not null default '[]'::jsonb,
    descricao     text,
    destaque      boolean not null default false,
    ordem         integer not null default 0,
    ativo         boolean not null default true,
    criado_em     timestamptz not null default now()
);

insert into public.planos
    (codigo, nome, preco_mensal, preco_anual, max_usuarios, inclui_mdf, recursos, descricao, destaque, ordem, ativo)
values
    ('essencial', 'Essencial', 49.00, 490.00, 1, false,
     '["pdv","expedicao","orcamentos","clientes","produtos","financeiro"]'::jsonb,
     'Para comecar a vender: PDV, orcamentos, clientes, produtos e financeiro.', false, 1, true),
    ('profissional', 'Profissional', 197.00, 1970.00, 5, false,
     '["pdv","expedicao","orcamentos","equipe","clientes","produtos","financeiro","relatorios","gerencial"]'::jsonb,
     'Operacao completa (sem MDF) ate 5 usuarios, com equipe e gerencial.', true, 2, true),
    ('enterprise', 'Enterprise', 447.00, 4470.00, null, true,
     '["pdv","expedicao","orcamentos","equipe","clientes","produtos","financeiro","relatorios","gerencial","mdf"]'::jsonb,
     'Tudo liberado, usuarios ilimitados e modulo MDF.', false, 3, true)
on conflict (codigo) do update set
    nome = excluded.nome,
    preco_mensal = excluded.preco_mensal,
    preco_anual = excluded.preco_anual,
    max_usuarios = excluded.max_usuarios,
    inclui_mdf = excluded.inclui_mdf,
    recursos = excluded.recursos,
    descricao = excluded.descricao,
    destaque = excluded.destaque,
    ordem = excluded.ordem,
    ativo = excluded.ativo;

alter table public.planos enable row level security;

drop policy if exists planos_select_public on public.planos;
create policy planos_select_public on public.planos
    for select to anon, authenticated
    using (ativo);

grant select on public.planos to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Assinatura por empresa
-- ------------------------------------------------------------
create table if not exists public.assinaturas (
    id           uuid primary key default gen_random_uuid(),
    empresa_id   uuid not null unique references public.empresas(id) on delete cascade,
    plano_codigo text not null references public.planos(codigo),
    ciclo        text not null default 'mensal' check (ciclo in ('mensal','anual')),
    status       text not null default 'trial'
                 check (status in ('trial','ativa','inadimplente','cancelada','expirada')),
    valor        numeric(10,2),
    inicio       date not null default current_date,
    vencimento   date,
    trial_ate    date,
    addon_mdf    boolean not null default false,
    observacao   text,
    criado_em    timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_assinaturas_status on public.assinaturas (status);

alter table public.assinaturas enable row level security;

drop policy if exists assinaturas_select_tenant on public.assinaturas;
create policy assinaturas_select_tenant on public.assinaturas
    for select to authenticated
    using (empresa_id = public.empresa_do_usuario());

revoke insert, update, delete on public.assinaturas from authenticated;
grant select on public.assinaturas to authenticated;

-- ------------------------------------------------------------
-- 3. Toda empresa nova nasce em trial (14 dias) no plano escolhido
-- ------------------------------------------------------------
create or replace function public.cria_assinatura_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.assinaturas
        (empresa_id, plano_codigo, ciclo, status, valor, inicio, vencimento, trial_ate)
    select new.id, p.codigo, 'mensal', 'trial', p.preco_mensal,
           current_date, current_date + 14, current_date + 14
    from public.planos p
    where p.codigo = new.plano;

    if not found then
        insert into public.assinaturas
            (empresa_id, plano_codigo, ciclo, status, valor, inicio, vencimento, trial_ate)
        select new.id, p.codigo, 'mensal', 'trial', p.preco_mensal,
               current_date, current_date + 14, current_date + 14
        from public.planos p
        where p.codigo = 'essencial';
    end if;

    return new;
end $$;

drop trigger if exists trg_cria_assinatura on public.empresas;
create trigger trg_cria_assinatura
    after insert on public.empresas
    for each row execute function public.cria_assinatura_trial();

-- Backfill de empresas existentes (sem assinatura)
insert into public.assinaturas
    (empresa_id, plano_codigo, ciclo, status, valor, inicio, vencimento)
select e.id, p.codigo, 'mensal', 'ativa', p.preco_mensal,
       current_date, current_date + 30
from public.empresas e
join public.planos p on p.codigo = e.plano
where not exists (select 1 from public.assinaturas a where a.empresa_id = e.id);

-- ------------------------------------------------------------
-- 4. Helpers de entitlement / limites
-- ------------------------------------------------------------
create or replace function public.assinatura_da_empresa(p_empresa_id uuid)
returns public.assinaturas
language sql
stable
security definer
set search_path = public
as $$
    select * from public.assinaturas where empresa_id = p_empresa_id limit 1;
$$;

revoke all on function public.assinatura_da_empresa(uuid) from public;
grant execute on function public.assinatura_da_empresa(uuid) to authenticated;

-- Assinatura vencida/inadimplente bloqueia escrita (mas nao leitura)
create or replace function public.assinatura_bloqueada()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_status text;
    v_venc   date;
begin
    select a.status, a.vencimento into v_status, v_venc
    from public.assinaturas a
    where a.empresa_id = public.empresa_do_usuario();

    if v_status is null then
        return false; -- sem assinatura: mantem comportamento atual
    end if;
    if v_status in ('cancelada', 'expirada', 'inadimplente') then
        return true;
    end if;
    if v_status in ('trial', 'ativa') and v_venc is not null and v_venc < current_date then
        return true;
    end if;
    return false;
end $$;

revoke all on function public.assinatura_bloqueada() from public;
grant execute on function public.assinatura_bloqueada() to authenticated;

-- Limite de usuarios do plano (null = ilimitado)
create or replace function public.empresa_pode_adicionar_usuario(p_empresa_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_lim   int;
    v_count int;
begin
    v_lim := (
        select p.max_usuarios
        from public.assinaturas a
        join public.planos p on p.codigo = a.plano_codigo
        where a.empresa_id = p_empresa_id
        limit 1
    );
    if v_lim is null then
        v_lim := (
            select p.max_usuarios
            from public.empresas e
            join public.planos p on p.codigo = e.plano
            where e.id = p_empresa_id
            limit 1
        );
    end if;

    if v_lim is null then
        return true; -- ilimitado ou plano desconhecido
    end if;

    select count(*) into v_count from public.usuarios where empresa_id = p_empresa_id;
    return v_count < v_lim;
end $$;

revoke all on function public.empresa_pode_adicionar_usuario(uuid) from public;
grant execute on function public.empresa_pode_adicionar_usuario(uuid) to authenticated;

-- MDF liberado: incluso no plano ou comprado como add-on
create or replace function public.empresa_tem_mdf()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v boolean;
begin
    select (coalesce(p.inclui_mdf, false) or coalesce(a.addon_mdf, false))
    into v
    from public.assinaturas a
    join public.planos p on p.codigo = a.plano_codigo
    where a.empresa_id = public.empresa_do_usuario();

    return coalesce(v, true); -- sem assinatura: mantem comportamento atual
end $$;

revoke all on function public.empresa_tem_mdf() from public;
grant execute on function public.empresa_tem_mdf() to authenticated;

-- Trigger: aplica o limite no INSERT de usuarios
create or replace function public.aplica_limite_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_emp uuid := coalesce(new.empresa_id, public.empresa_do_usuario());
begin
    if v_emp is not null and not public.empresa_pode_adicionar_usuario(v_emp) then
        raise exception 'Limite de usuarios do plano atingido. Faca upgrade para adicionar mais.'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

drop trigger if exists trg_limite_usuarios on public.usuarios;
create trigger trg_limite_usuarios
    before insert on public.usuarios
    for each row execute function public.aplica_limite_usuario();

-- ------------------------------------------------------------
-- 5. RLS do MDF passa a exigir o entitlement
-- ------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['mdf_agenda','mdf_itens','mdf_orcamentos'] loop
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format('drop policy if exists mdf_tenant on public.%I', t);
        execute format(
            'create policy mdf_tenant on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario() and public.empresa_tem_mdf())
             with check (empresa_id = public.empresa_do_usuario() and public.empresa_tem_mdf())', t);
    end loop;
end $$;

-- ------------------------------------------------------------
-- 6. Bloqueio de escrita quando a assinatura vence
-- ------------------------------------------------------------
create or replace function public.bloqueia_escrita_inadimplente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.assinatura_bloqueada() then
        raise exception 'Assinatura vencida. Regularize para voltar a editar.'
            using errcode = 'P0001';
    end if;
    return coalesce(new, old);
end $$;

do $$
declare
    t text;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs',
        'mdf_agenda','mdf_itens','mdf_orcamentos',
        'produtos','rvp_funcionarios','vales'
    ];
begin
    foreach t in array tabelas loop
        execute format('drop trigger if exists trg_bloqueio_inadimplencia on public.%I', t);
        execute format(
            'create trigger trg_bloqueio_inadimplencia
             before insert or update or delete on public.%I
             for each row execute function public.bloqueia_escrita_inadimplente()', t);
    end loop;
end $$;

-- ------------------------------------------------------------
-- 7. RPC do tenant: minha assinatura
-- ------------------------------------------------------------
create or replace function public.minha_assinatura()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_emp uuid := public.empresa_do_usuario();
    v jsonb;
begin
    if v_emp is null then
        return jsonb_build_object('tem_assinatura', false);
    end if;

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

-- ------------------------------------------------------------
-- 8. RPCs do super-admin (billing)
-- ------------------------------------------------------------
create or replace function public.sa_listar_planos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v jsonb;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.ordem), '[]'::jsonb) into v
    from (select codigo, nome, preco_mensal, preco_anual, max_usuarios, inclui_mdf,
                 recursos, descricao, destaque, ordem, ativo
          from public.planos order by ordem) t;
    return v;
end $$;

revoke all on function public.sa_listar_planos() from public;
grant execute on function public.sa_listar_planos() to authenticated;

-- sa_listar_empresas com dados de assinatura
create or replace function public.sa_listar_empresas(p_busca text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v jsonb;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.nome), '[]'::jsonb)
    into v
    from (
        select
            e.id,
            e.nome,
            e.slug,
            coalesce(a.plano_codigo, e.plano) as plano,
            e.ativo,
            e.criado_em,
            e.email_contato,
            e.telefone,
            e.cnpj,
            a.status            as assinatura_status,
            a.ciclo             as assinatura_ciclo,
            a.vencimento        as assinatura_vencimento,
            a.trial_ate         as assinatura_trial_ate,
            a.valor             as assinatura_valor,
            coalesce(a.addon_mdf, false) as addon_mdf,
            p.max_usuarios      as limite_usuarios,
            (select count(*) from public.usuarios u where u.empresa_id = e.id) as total_usuarios,
            (select max(u.created_at) from public.usuarios u where u.empresa_id = e.id) as ultimo_usuario_em
        from public.empresas e
        left join public.assinaturas a on a.empresa_id = e.id
        left join public.planos p on p.codigo = a.plano_codigo
        where p_busca is null
           or trim(p_busca) = ''
           or e.nome ilike '%' || p_busca || '%'
           or e.slug ilike '%' || p_busca || '%'
    ) t;

    return v;
end $$;

revoke all on function public.sa_listar_empresas(text) from public;
grant execute on function public.sa_listar_empresas(text) to authenticated;

-- sa_atualizar_empresa: ativo e/ou plano (sincroniza assinatura)
create or replace function public.sa_atualizar_empresa(
    p_empresa_id uuid,
    p_ativo      boolean default null,
    p_plano      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_plano text;
    v_ciclo text;
    v_valor numeric(10,2);
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    if p_plano is not null then
        v_plano := lower(trim(p_plano));
        if not exists (select 1 from public.planos where codigo = v_plano) then
            raise exception 'Plano invalido: %', p_plano;
        end if;

        select a.ciclo into v_ciclo from public.assinaturas a where a.empresa_id = p_empresa_id;
        v_ciclo := coalesce(v_ciclo, 'mensal');

        select case v_ciclo when 'anual' then preco_anual else preco_mensal end
        into v_valor from public.planos where codigo = v_plano;

        update public.assinaturas
           set plano_codigo = v_plano, valor = v_valor, atualizado_em = now()
         where empresa_id = p_empresa_id;
    end if;

    update public.empresas
       set ativo = coalesce(p_ativo, ativo),
           plano = coalesce(v_plano, plano)
     where id = p_empresa_id;

    if not found then
        raise exception 'Empresa nao encontrada';
    end if;

    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.sa_atualizar_empresa(uuid, boolean, text) from public;
grant execute on function public.sa_atualizar_empresa(uuid, boolean, text) to authenticated;

-- sa_definir_assinatura: controle fino (plano/ciclo/status/vencimento/add-on)
create or replace function public.sa_definir_assinatura(
    p_empresa_id  uuid,
    p_plano       text default null,
    p_ciclo       text default null,
    p_status      text default null,
    p_vencimento  date default null,
    p_addon_mdf   boolean default null,
    p_valor       numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_plano   text;
    v_ciclo   text;
    v_status  text;
    v_valor   numeric(10,2);
    v_venc    date;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    v_plano := nullif(trim(coalesce(p_plano, '')), '');
    if v_plano is null then
        select coalesce(
            (select plano_codigo from public.assinaturas where empresa_id = p_empresa_id),
            (select plano from public.empresas where id = p_empresa_id),
            'essencial') into v_plano;
    end if;
    if not exists (select 1 from public.planos where codigo = v_plano) then
        raise exception 'Plano invalido: %', v_plano;
    end if;

    v_ciclo := nullif(trim(coalesce(p_ciclo, '')), '');
    if v_ciclo is null then
        select coalesce((select ciclo from public.assinaturas where empresa_id = p_empresa_id), 'mensal')
        into v_ciclo;
    end if;
    if v_ciclo not in ('mensal', 'anual') then
        raise exception 'Ciclo invalido: %', v_ciclo;
    end if;

    v_status := nullif(trim(coalesce(p_status, '')), '');
    if v_status is null then
        select coalesce((select status from public.assinaturas where empresa_id = p_empresa_id), 'ativa')
        into v_status;
    end if;
    if v_status not in ('trial', 'ativa', 'inadimplente', 'cancelada', 'expirada') then
        raise exception 'Status invalido: %', v_status;
    end if;

    v_valor := p_valor;
    if v_valor is null then
        select case v_ciclo when 'anual' then preco_anual else preco_mensal end
        into v_valor from public.planos where codigo = v_plano;
    end if;

    v_venc := coalesce(p_vencimento, (select vencimento from public.assinaturas where empresa_id = p_empresa_id));

    insert into public.assinaturas
        (empresa_id, plano_codigo, ciclo, status, valor, vencimento, addon_mdf, atualizado_em)
    values
        (p_empresa_id, v_plano, v_ciclo, v_status, v_valor, v_venc, coalesce(p_addon_mdf, false), now())
    on conflict (empresa_id) do update set
        plano_codigo = excluded.plano_codigo,
        ciclo        = excluded.ciclo,
        status       = excluded.status,
        valor        = excluded.valor,
        vencimento   = excluded.vencimento,
        addon_mdf    = coalesce(p_addon_mdf, public.assinaturas.addon_mdf),
        atualizado_em = now();

    update public.empresas set plano = v_plano where id = p_empresa_id;

    return jsonb_build_object('ok', true, 'plano', v_plano, 'ciclo', v_ciclo,
                              'status', v_status, 'vencimento', v_venc);
end $$;

revoke all on function public.sa_definir_assinatura(uuid, text, text, text, date, boolean, numeric) from public;
grant execute on function public.sa_definir_assinatura(uuid, text, text, text, date, boolean, numeric) to authenticated;

-- sa_registrar_pagamento: marca ativa e avanca um ciclo
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
-- 9. Estatisticas usando o catalogo
-- ------------------------------------------------------------
create or replace function public.sa_estatisticas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v jsonb;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    select jsonb_build_object(
        'total_empresas',  (select count(*) from public.empresas),
        'empresas_ativas', (select count(*) from public.empresas where ativo),
        'total_usuarios',  (select count(*) from public.usuarios),
        'em_trial',        (select count(*) from public.assinaturas where status = 'trial'),
        'por_plano',       (
            select coalesce(jsonb_object_agg(plano, q), '{}'::jsonb)
            from (
                select coalesce(a.plano_codigo, e.plano) plano, count(*) q
                from public.empresas e
                left join public.assinaturas a on a.empresa_id = e.id
                group by 1
            ) s
        ),
        'mrr_estimado',    (
            select coalesce(sum(
                case a.ciclo when 'anual' then p.preco_anual / 12 else p.preco_mensal end), 0)
            from public.assinaturas a
            join public.planos p on p.codigo = a.plano_codigo
            where a.status = 'ativa'
        )
    ) into v;

    return v;
end $$;

revoke all on function public.sa_estatisticas() from public;
grant execute on function public.sa_estatisticas() to authenticated;

commit;
