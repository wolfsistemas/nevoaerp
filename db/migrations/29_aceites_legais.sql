-- ============================================================
-- 29_aceites_legais.sql
-- Registro de aceite dos Termos de Uso e da Politica de Privacidade
-- (LGPD - Lei 13.709/2018) no cadastro self-service.
--
-- - Cria a tabela public.aceites_legais (prova de consentimento).
-- - Redefine criar_empresa_e_admin para gravar a versao aceita, o IP e o
--   user-agent (lidos dos cabecalhos do PostgREST).
-- - Remove a versao anterior (6 parametros) para evitar chamadas sem aceite.
--
-- Rodar depois de 28_essencial_sem_expedicao.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tabela de aceites
-- ------------------------------------------------------------
create table if not exists public.aceites_legais (
    id                  bigint generated always as identity primary key,
    empresa_id          uuid not null references public.empresas(id) on delete cascade,
    usuario_id          bigint references public.usuarios(id) on delete set null,
    email               text,
    termos_versao       text,
    privacidade_versao  text,
    aceito              boolean not null default true,
    ip                  text,
    user_agent          text,
    criado_em           timestamptz not null default now()
);

create index if not exists idx_aceites_legais_empresa on public.aceites_legais (empresa_id);

alter table public.aceites_legais enable row level security;

drop policy if exists aceites_select_tenant on public.aceites_legais;
create policy aceites_select_tenant on public.aceites_legais
    for select to authenticated
    using (empresa_id = public.empresa_do_usuario() or public.is_super_admin());

-- Somente leitura direta; a gravacao ocorre pela funcao SECURITY DEFINER.
revoke all on public.aceites_legais from anon, authenticated;
grant select on public.aceites_legais to authenticated;

-- ------------------------------------------------------------
-- 2. Cadastro passa a exigir/registrar o aceite
--    (remove a versao antiga, sem parametros de aceite)
-- ------------------------------------------------------------
drop function if exists public.criar_empresa_e_admin(text, text, text, text, text, text);

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
    if v_plano not in ('essencial', 'profissional', 'enterprise') then
        v_plano := 'essencial';
    end if;

    if exists (select 1 from public.usuarios where lower(trim(email)) = v_email) then
        raise exception 'Este e-mail ja possui cadastro.';
    end if;

    -- Cabecalhos da requisicao (PostgREST) para prova de aceite.
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
