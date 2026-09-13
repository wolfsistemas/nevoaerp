-- ============================================================
-- 19_fixes.sql
-- Correcoes da revisao geral (pre-Mercado Pago):
--
--  1. IDs globais para clientes/produtos: o front gerava o ID a
--     partir do maior ID visivel ao tenant (RLS), entao dois
--     tenants podiam gerar o mesmo PK -> duplicate key. Passa a
--     usar sequencia no banco; o front deixa de enviar o ID.
--  2. buscar_email_por_usuario passa a casar login OU email
--     (super-admin com login curto nao logava pelo e-mail).
--  3. sa_salvar_admin aceita login curto e impede o admin de
--     desativar o proprio acesso / o ultimo super-admin ativo.
--
-- Rodar depois de 18_billing.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Sequencias para IDs globais (clientes/produtos)
-- ------------------------------------------------------------
create sequence if not exists public.clientes_id_seq
    as bigint increment by 1 minvalue 1 start with 1 cache 1;
create sequence if not exists public.produtos_id_seq
    as bigint increment by 1 minvalue 1 start with 1 cache 1;

select setval('public.clientes_id_seq',
    coalesce((select max(id) from public.clientes), 0) + 1, false);
select setval('public.produtos_id_seq',
    coalesce((select max(id) from public.produtos), 0) + 1, false);

alter table public.clientes alter column id set default nextval('public.clientes_id_seq');
alter table public.produtos alter column id set default nextval('public.produtos_id_seq');

alter sequence public.clientes_id_seq owned by public.clientes.id;
alter sequence public.produtos_id_seq owned by public.produtos.id;

-- ------------------------------------------------------------
-- 2. Login curto/e-mail do super-admin
-- ------------------------------------------------------------
create or replace function public.buscar_email_por_usuario(usuario_busca text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select email
    from (
        select email, login
        from public.usuarios
        where email is not null and trim(email) <> ''
        union all
        select email, login
        from public.super_admins
        where ativo and email is not null and trim(email) <> ''
    ) t
    where lower(trim(coalesce(login, ''))) = lower(trim(usuario_busca))
       or lower(trim(email)) = lower(trim(usuario_busca))
    order by (lower(trim(coalesce(login, ''))) = lower(trim(usuario_busca))) desc
    limit 1;
$$;

revoke all on function public.buscar_email_por_usuario(text) from public;
grant execute on function public.buscar_email_por_usuario(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Gestao de super-admins: login curto + protecoes
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
    from (select id, email, login, nome, ativo, criado_em from public.super_admins) t;

    return v;
end $$;

revoke all on function public.sa_listar_admins() from public;
grant execute on function public.sa_listar_admins() to authenticated;

drop function if exists public.sa_salvar_admin(text, text, boolean);

create or replace function public.sa_salvar_admin(
    p_email text,
    p_nome  text default null,
    p_ativo boolean default true,
    p_login text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email   text := lower(trim(coalesce(p_email, '')));
    v_login   text := nullif(lower(trim(coalesce(p_login, ''))), '');
    v_eu      text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    v_ativos  int;
begin
    if not public.is_super_admin() then
        raise exception 'Acesso restrito';
    end if;
    if v_email = '' then
        raise exception 'Informe o e-mail';
    end if;
    if v_login is not null and v_login in ('admin', 'administrador') then
        raise exception 'Este login e reservado. Escolha outro.';
    end if;

    -- Nao deixar o admin desativar o proprio acesso.
    if coalesce(p_ativo, true) = false and v_email = v_eu then
        raise exception 'Voce nao pode desativar o seu proprio acesso.';
    end if;

    -- Nao deixar desativar o ultimo super-admin ativo.
    if coalesce(p_ativo, true) = false
       and exists (select 1 from public.super_admins where lower(email) = v_email and ativo) then
        select count(*) into v_ativos from public.super_admins where ativo;
        if v_ativos <= 1 then
            raise exception 'Nao e possivel desativar o ultimo super-admin ativo.';
        end if;
    end if;

    insert into public.super_admins (email, nome, ativo, login)
    values (v_email, nullif(trim(coalesce(p_nome, '')), ''), coalesce(p_ativo, true), v_login)
    on conflict (lower(email)) do update
        set nome  = coalesce(excluded.nome, public.super_admins.nome),
            ativo = excluded.ativo,
            login = coalesce(excluded.login, public.super_admins.login);

    return jsonb_build_object('ok', true);
exception
    when unique_violation then
        raise exception 'Este login curto ja esta em uso.';
end;
$$;

revoke all on function public.sa_salvar_admin(text, text, boolean, text) from public;
grant execute on function public.sa_salvar_admin(text, text, boolean, text) to authenticated;

commit;
