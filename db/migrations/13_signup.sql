-- ============================================================
-- 13_signup.sql
-- Cadastro self-service: cria a empresa e o usuario admin em um
-- unico passo, a partir do usuario recem-criado no Supabase Auth.
-- Rodar depois de 12_multitenant.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Perfil da empresa (dados que aparecem nos documentos)
-- ------------------------------------------------------------
alter table public.empresas
    add column if not exists cnpj          text,
    add column if not exists telefone      text,
    add column if not exists endereco      text,
    add column if not exists logo_url      text,
    add column if not exists email_contato text;

-- ------------------------------------------------------------
-- RPC: criar empresa + admin do zero
-- Chamada pelo usuario autenticado logo apos o signUp.
-- SECURITY DEFINER: ignora a RLS de empresas/usuarios.
-- ------------------------------------------------------------
-- remove a versao anterior (sem plano), se existir
drop function if exists public.criar_empresa_e_admin(text, text, text, text, text);

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

    -- slug unico a partir do nome (remove acentos e simbolos)
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

    -- id do usuario: migration 13 usa max(id)+1; a migration 15 adiciona a
    -- sequencia/trigger e redefine esta funcao para usar o id gerado.
    select coalesce(max(id), 0) + 1 into v_usu_id from public.usuarios;

    insert into public.usuarios (id, nome, login, email, empresa_id, nivel_acesso, ativo)
    values (v_usu_id, trim(p_admin_nome), v_email, v_email, v_emp_id, 'admin', true);

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

commit;
