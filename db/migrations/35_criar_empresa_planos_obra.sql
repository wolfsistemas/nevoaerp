-- ============================================================
-- 35_criar_empresa_planos_obra.sql
-- Cadastro self-service aceita qualquer plano ativo do catalogo
-- (erp e obra). Antes so essencial|profissional|enterprise, e
-- obra_* caia silenciosamente em essencial.
-- Idempotente. Nao altera aceites nem trial.
-- ============================================================

begin;

create or replace function public.criar_empresa_e_admin(
    p_empresa_nome       text,
    p_admin_nome         text,
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
        'email',      v_email,
        'plano',      v_plano
    );
exception
    when unique_violation then
        raise exception 'Nao foi possivel concluir o cadastro (dados duplicados).';
end;
$$;

revoke all on function public.criar_empresa_e_admin(text, text, text, text, text, text, text, text) from public;
grant execute on function public.criar_empresa_e_admin(text, text, text, text, text, text, text, text) to authenticated;

commit;
