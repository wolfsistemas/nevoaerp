-- ============================================================
-- 37_cadastro_login_documento.sql
-- Cadastro self-service passa a exigir:
--   1) um NOME DE USUARIO (login) separado do e-mail; e
--   2) um documento valido (CPF ou CNPJ) com conferencia de digitos.
--
-- Antes o e-mail era usado direto como login. Agora o login e um campo
-- proprio, unico em todo o sistema (usuarios + super_admins) e sem os
-- logins reservados da plataforma.
--
-- Inclui a funcao public.doc_valido(text) que valida CPF (11 digitos) e
-- CNPJ (14 digitos) pelo algoritmo oficial dos digitos verificadores.
--
-- Rodar depois de 36_obra_planos_por_usuarios.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Validacao de CPF/CNPJ (digitos verificadores).
-- Retorna true apenas para um CPF (11) ou CNPJ (14) valido.
-- ------------------------------------------------------------
create or replace function public.doc_valido(p_doc text)
returns boolean
language plpgsql
immutable
as $$
declare
    d          text := regexp_replace(coalesce(p_doc, ''), '[^0-9]', '', 'g');
    i          int;
    soma       int;
    resto      int;
    dig        int;
    pesos1     int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
    pesos2     int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
    if d = '' then
        return false;
    end if;

    -- Rejeita sequencias repetidas (000..., 111..., etc.).
    if d ~ '^([0-9])\1*$' then
        return false;
    end if;

    if length(d) = 11 then
        -- CPF - primeiro digito
        soma := 0;
        for i in 1..9 loop
            soma := soma + substr(d, i, 1)::int * (11 - i);
        end loop;
        resto := soma % 11;
        dig := case when resto < 2 then 0 else 11 - resto end;
        if dig <> substr(d, 10, 1)::int then
            return false;
        end if;
        -- CPF - segundo digito
        soma := 0;
        for i in 1..10 loop
            soma := soma + substr(d, i, 1)::int * (12 - i);
        end loop;
        resto := soma % 11;
        dig := case when resto < 2 then 0 else 11 - resto end;
        return dig = substr(d, 11, 1)::int;

    elsif length(d) = 14 then
        -- CNPJ - primeiro digito
        soma := 0;
        for i in 1..12 loop
            soma := soma + substr(d, i, 1)::int * pesos1[i];
        end loop;
        resto := soma % 11;
        dig := case when resto < 2 then 0 else 11 - resto end;
        if dig <> substr(d, 13, 1)::int then
            return false;
        end if;
        -- CNPJ - segundo digito
        soma := 0;
        for i in 1..13 loop
            soma := soma + substr(d, i, 1)::int * pesos2[i];
        end loop;
        resto := soma % 11;
        dig := case when resto < 2 then 0 else 11 - resto end;
        return dig = substr(d, 14, 1)::int;

    else
        return false;
    end if;
end;
$$;

-- ------------------------------------------------------------
-- Cadastro: agora recebe p_login e valida o documento.
-- ------------------------------------------------------------
drop function if exists public.criar_empresa_e_admin(text, text, text, text, text, text, text, text);

create or replace function public.criar_empresa_e_admin(
    p_empresa_nome       text,
    p_admin_nome         text,
    p_login              text,
    p_cnpj               text default null,
    p_telefone           text default null,
    p_endereco           text default null,
    p_plano              text default 'essencial',
    p_termos_versao      text default null,
    p_privacidade_versao text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email    text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    v_login    text := lower(trim(coalesce(p_login, '')));
    v_doc      text := trim(coalesce(p_cnpj, ''));
    v_base     text;
    v_slug     text;
    v_n        int := 1;
    v_emp_id   uuid;
    v_usu_id   bigint;
    v_plano    text;
    v_headers  json;
    v_ip       text;
    v_ua       text;
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

    -- Login (nome de usuario) proprio, separado do e-mail.
    if v_login = '' then
        raise exception 'Informe o nome de usuario (login).';
    end if;
    if v_login !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' then
        raise exception 'O nome de usuario deve ter de 3 a 30 caracteres (letras minusculas, numeros, ponto, hifen ou underline).';
    end if;
    if v_login in ('admin', 'administrador') then
        raise exception 'Este nome de usuario e reservado da plataforma. Escolha outro.';
    end if;
    if exists (select 1 from public.usuarios where lower(trim(login)) = v_login)
       or exists (select 1 from public.super_admins where lower(trim(coalesce(login, ''))) = v_login) then
        raise exception 'Este nome de usuario ja esta em uso. Escolha outro.';
    end if;

    -- Documento (CPF ou CNPJ) obrigatorio e com digitos conferidos.
    if v_doc = '' then
        raise exception 'Informe um CPF ou CNPJ.';
    end if;
    if not public.doc_valido(v_doc) then
        raise exception 'CPF/CNPJ invalido. Confira os digitos informados.';
    end if;

    v_plano := lower(trim(coalesce(p_plano, 'essencial')));
    if not exists (select 1 from public.planos where codigo = v_plano and ativo is true) then
        v_plano := 'essencial';
    end if;

    if exists (select 1 from public.usuarios where lower(trim(email)) = v_email) then
        raise exception 'Este e-mail ja possui cadastro.';
    end if;

    begin
        v_headers := nullif(current_setting('request.headers', true), '')::json;
    exception when others then
        v_headers := null;
    end;
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
    v_ua := left(coalesce(v_headers ->> 'user-agent', ''), 400);

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
        v_doc,
        nullif(trim(coalesce(p_telefone, '')), ''),
        nullif(trim(coalesce(p_endereco, '')), ''),
        null,
        v_email,
        v_plano
    )
    returning id into v_emp_id;

    insert into public.usuarios (nome, login, email, empresa_id, nivel_acesso, ativo)
    values (trim(p_admin_nome), v_login, v_email, v_emp_id, 'admin', true)
    returning id into v_usu_id;

    insert into public.aceites_legais
        (empresa_id, usuario_id, email, termos_versao, privacidade_versao, aceito, ip, user_agent)
    values
        (v_emp_id, v_usu_id, v_email,
         coalesce(nullif(trim(p_termos_versao), ''), 'nao_informada'),
         coalesce(nullif(trim(p_privacidade_versao), ''), 'nao_informada'),
         true, v_ip, v_ua);

    return jsonb_build_object(
        'empresa_id', v_emp_id,
        'slug',       v_slug,
        'usuario_id', v_usu_id,
        'login',      v_login,
        'email',      v_email,
        'plano',      v_plano
    );
exception
    when unique_violation then
        raise exception 'Nao foi possivel concluir o cadastro (dados duplicados).';
end;
$$;

revoke all on function public.criar_empresa_e_admin(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.criar_empresa_e_admin(text, text, text, text, text, text, text, text, text) to authenticated;

grant execute on function public.doc_valido(text) to authenticated, anon;

commit;
