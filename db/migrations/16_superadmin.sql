-- ============================================================
-- 16_superadmin.sql
-- Painel do dono da plataforma (super-admin).
--
-- Diferente do "admin da empresa": o super-admin gerencia a
-- plataforma (empresas, plano, ativacao), e nao os dados de
-- negocio de um tenant. O acesso e sempre por RPC SECURITY
-- DEFINER com checagem public.is_super_admin().
--
-- Rodar depois de 15_usuarios_rls.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Allowlist de super-admins (gerenciada pelo proprio painel)
-- ------------------------------------------------------------
create table if not exists public.super_admins (
    id        uuid primary key default gen_random_uuid(),
    email     text not null,
    nome      text,
    ativo     boolean not null default true,
    criado_em timestamptz not null default now()
);

create unique index if not exists uq_super_admins_email
    on public.super_admins (lower(email));

-- Sem policies: nenhum cliente le/escreve direto. So via RPC.
alter table public.super_admins enable row level security;

-- ------------------------------------------------------------
-- Helper de identificacao
-- ------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.super_admins
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and ativo
    );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- ------------------------------------------------------------
-- Estatisticas gerais da plataforma
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
        'por_plano',       (
            select coalesce(jsonb_object_agg(plano, q), '{}'::jsonb)
            from (select plano, count(*) q from public.empresas group by plano) s
        ),
        -- Estimativa de receita recorrente. Precos iguais aos da landing;
        -- quando o billing entrar, ler do catalogo de planos.
        'mrr_estimado',    (
            select coalesce(sum(
                case plano
                    when 'essencial'    then 149
                    when 'profissional' then 297
                    when 'enterprise'   then 597
                    else 0
                end), 0)
            from public.empresas where ativo
        )
    ) into v;

    return v;
end;
$$;

revoke all on function public.sa_estatisticas() from public;
grant execute on function public.sa_estatisticas() to authenticated;

-- ------------------------------------------------------------
-- Lista de empresas (com contagem de usuarios)
-- ------------------------------------------------------------
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
            e.plano,
            e.ativo,
            e.criado_em,
            e.email_contato,
            e.telefone,
            e.cnpj,
            (select count(*) from public.usuarios u where u.empresa_id = e.id) as total_usuarios,
            (select max(u.created_at) from public.usuarios u where u.empresa_id = e.id) as ultimo_usuario_em
        from public.empresas e
        where p_busca is null
           or trim(p_busca) = ''
           or e.nome ilike '%' || p_busca || '%'
           or e.slug ilike '%' || p_busca || '%'
    ) t;

    return v;
end;
$$;

revoke all on function public.sa_listar_empresas(text) from public;
grant execute on function public.sa_listar_empresas(text) to authenticated;

-- ------------------------------------------------------------
-- Usuarios de uma empresa (detalhe do painel)
-- ------------------------------------------------------------
create or replace function public.sa_listar_usuarios(p_empresa_id uuid)
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
        select id, nome, login, email, nivel_acesso, ativo, created_at
        from public.usuarios
        where empresa_id = p_empresa_id
    ) t;

    return v;
end;
$$;

revoke all on function public.sa_listar_usuarios(uuid) from public;
grant execute on function public.sa_listar_usuarios(uuid) to authenticated;

-- ------------------------------------------------------------
-- Atualiza plano / ativacao de uma empresa
-- ------------------------------------------------------------
create or replace function public.sa_atualizar_empresa(
    p_empresa_id uuid,
    p_ativo      boolean default null,
    p_plano      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;

    if p_plano is not null
       and lower(trim(p_plano)) not in ('essencial', 'profissional', 'enterprise') then
        raise exception 'Plano invalido: %', p_plano;
    end if;

    update public.empresas
       set ativo = coalesce(p_ativo, ativo),
           plano = coalesce(lower(trim(p_plano)), plano)
     where id = p_empresa_id;

    if not found then
        raise exception 'Empresa nao encontrada';
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sa_atualizar_empresa(uuid, boolean, text) from public;
grant execute on function public.sa_atualizar_empresa(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Gestao da propria allowlist de super-admins
-- ------------------------------------------------------------
create or replace function public.sa_listar_admins()
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

    select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]'::jsonb)
    into v
    from (select id, email, nome, ativo, criado_em from public.super_admins) t;

    return v;
end;
$$;

revoke all on function public.sa_listar_admins() from public;
grant execute on function public.sa_listar_admins() to authenticated;

create or replace function public.sa_salvar_admin(
    p_email text,
    p_nome  text default null,
    p_ativo boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;
    if coalesce(trim(p_email), '') = '' then
        raise exception 'Informe o e-mail';
    end if;

    insert into public.super_admins (email, nome, ativo)
    values (trim(p_email), nullif(trim(coalesce(p_nome, '')), ''), coalesce(p_ativo, true))
    on conflict (lower(email)) do update
        set nome  = coalesce(excluded.nome, public.super_admins.nome),
            ativo = excluded.ativo;

    return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sa_salvar_admin(text, text, boolean) from public;
grant execute on function public.sa_salvar_admin(text, text, boolean) to authenticated;

commit;
