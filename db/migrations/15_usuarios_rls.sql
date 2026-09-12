-- ============================================================
-- 15_usuarios_rls.sql
-- Corrige o cadastro de usuarios pela aba "Usuarios" e refina a
-- RLS de usuarios/empresas com menor privilegio.
--
-- Problemas resolvidos:
--  1. usuarios.id era bigint NOT NULL sem default/sequencia, entao o
--     INSERT da aba Usuarios falhava (null value in column "id").
--  2. A policy generica tenant_isolation (FOR ALL) em usuarios deixava
--     qualquer membro editar qualquer usuario da empresa, inclusive se
--     promover a admin (escalacao de privilegio).
--  3. authenticated tinha UPDATE de tabela inteira em empresas, podendo
--     alterar plano/ativo por conta propria (billing).
--
-- Rodar depois de 14_logo_storage.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Geracao de id para usuarios
--    Trigger SECURITY DEFINER: nao depende de GRANT na sequencia e
--    convive com inserts que informem id explicitamente.
-- ------------------------------------------------------------
create sequence if not exists public.usuarios_id_seq
    as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807
    start with 1 cache 1;

select setval(
    'public.usuarios_id_seq',
    coalesce((select max(id) from public.usuarios), 0) + 1,
    false
);

create or replace function public.set_usuario_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.id is null then
        new.id := nextval('public.usuarios_id_seq');
    end if;
    return new;
end $$;

drop trigger if exists trg_set_usuario_id on public.usuarios;
create trigger trg_set_usuario_id
    before insert on public.usuarios
    for each row execute function public.set_usuario_id();

-- ------------------------------------------------------------
-- 2. RPC de cadastro passa a usar o id gerado (remove max(id)+1,
--    que podia colidir com a sequencia em cadastros simultaneos).
-- ------------------------------------------------------------
create or replace function public.criar_empresa_e_admin(
    p_empresa_nome text,
    p_admin_nome   text,
    p_cnpj         text default null,
    p_telefone     text default null,
    p_endereco     text default null,
    p_plano        text default 'essencial'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email   text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    v_base    text;
    v_slug    text;
    v_n       int := 1;
    v_emp_id  uuid;
    v_usu_id  bigint;
    v_plano   text;
begin
    if v_email = '' then
        raise exception 'Sessao sem e-mail. Faca o cadastro novamente.';
    end if;
    if coalesce(trim(p_empresa_nome), '') = '' then
        raise exception 'Informe o nome da empresa.';
    end if;
    if coalesce(trim(p_admin_nome), '') = '' then
        raise exception 'Informe o nome do administrador.';
    end if;

    v_plano := lower(trim(coalesce(p_plano, 'essencial')));
    if v_plano not in ('essencial', 'profissional', 'enterprise') then
        v_plano := 'essencial';
    end if;

    if exists (select 1 from public.usuarios where lower(trim(email)) = v_email) then
        raise exception 'Este e-mail ja possui cadastro.';
    end if;

    v_base := translate(lower(p_empresa_nome),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn');
    v_base := trim(both '-' from regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then
        v_base := 'empresa';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.empresas where slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.empresas (nome, slug, cnpj, telefone, endereco, logo_url, email_contato, plano)
    values (
        trim(p_empresa_nome),
        v_slug,
        nullif(trim(coalesce(p_cnpj, '')), ''),
        nullif(trim(coalesce(p_telefone, '')), ''),
        nullif(trim(coalesce(p_endereco, '')), ''),
        null,
        v_email,
        v_plano
    )
    returning id into v_emp_id;

    insert into public.usuarios (nome, login, email, empresa_id, nivel_acesso, ativo)
    values (trim(p_admin_nome), v_email, v_email, v_emp_id, 'admin', true)
    returning id into v_usu_id;

    return jsonb_build_object(
        'empresa_id', v_emp_id,
        'slug',       v_slug,
        'usuario_id', v_usu_id,
        'email',      v_email,
        'plano',      v_plano
    );
exception
    when unique_violation then
        raise exception 'Nao foi possivel concluir o cadastro (dados duplicados).';
end;
$$;

revoke all on function public.criar_empresa_e_admin(text, text, text, text, text, text) from public;
grant execute on function public.criar_empresa_e_admin(text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. RLS de usuarios: leitura para o time; escrita somente admin
--    da propria empresa. Substitui a tenant_isolation generica.
-- ------------------------------------------------------------
alter table public.usuarios enable row level security;

drop policy if exists tenant_isolation           on public.usuarios;
drop policy if exists usuarios_select_tenant     on public.usuarios;
drop policy if exists usuarios_insert_admin      on public.usuarios;
drop policy if exists usuarios_update_admin      on public.usuarios;
drop policy if exists usuarios_delete_admin      on public.usuarios;

create policy usuarios_select_tenant on public.usuarios
    for select to authenticated
    using (empresa_id = public.empresa_do_usuario());

create policy usuarios_insert_admin on public.usuarios
    for insert to authenticated
    with check (
        empresa_id = public.empresa_do_usuario()
        and public.usuario_eh_admin()
    );

create policy usuarios_update_admin on public.usuarios
    for update to authenticated
    using (
        empresa_id = public.empresa_do_usuario()
        and public.usuario_eh_admin()
    )
    with check (empresa_id = public.empresa_do_usuario());

create policy usuarios_delete_admin on public.usuarios
    for delete to authenticated
    using (
        empresa_id = public.empresa_do_usuario()
        and public.usuario_eh_admin()
    );

-- Menor privilegio por coluna: id/empresa_id/created_at nao vem do cliente.
revoke insert, update, delete on public.usuarios from authenticated;
grant select on public.usuarios to authenticated;
grant insert (nome, login, email, nivel_acesso, ativo) on public.usuarios to authenticated;
grant update (nome, login, email, nivel_acesso, ativo) on public.usuarios to authenticated;
grant delete on public.usuarios to authenticated;

-- ------------------------------------------------------------
-- 4. Empresas: tenant so edita os dados de perfil, nunca plano/ativo.
-- ------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.empresas from authenticated;
grant select on public.empresas to authenticated;
grant update (nome, cnpj, telefone, endereco, email_contato, logo_url)
    on public.empresas to authenticated;

commit;
