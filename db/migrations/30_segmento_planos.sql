-- ============================================================
-- 30_segmento_planos.sql
-- Segmento do plano (erp | obra | ambos) + catalogo de planos
-- de obra. Idempotente. Nao backfill de dados de producao.
-- ============================================================

begin;

alter table public.planos
    add column if not exists segmento text not null default 'erp';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'planos_segmento_check'
          and conrelid = 'public.planos'::regclass
    ) then
        alter table public.planos
            add constraint planos_segmento_check
            check (segmento in ('erp', 'obra', 'ambos'));
    end if;
end $$;

update public.planos
   set segmento = 'erp'
 where segmento is null or segmento = '';

insert into public.planos
    (codigo, nome, preco_mensal, preco_anual, max_usuarios, inclui_mdf,
     recursos, descricao, destaque, ordem, ativo, segmento)
values
    ('obra_essencial', 'Obra Essencial', 97.00, 970.00, 2, false,
     '["obras","fases","equipe","financeiro","relatorios"]'::jsonb,
     'Obras, fases, equipe (ponto) e financeiro basico.', false, 11, true, 'obra'),
    ('obra_profissional', 'Obra Profissional', 297.00, 2970.00, 5, false,
     '["obras","fases","equipe","terceiros","fornecedores","oc","precos","financeiro","relatorios","gerencial"]'::jsonb,
     'Operacao completa de obra ate 5 usuarios, com OC, precos e gerencial.', true, 12, true, 'obra'),
    ('obra_enterprise', 'Obra Enterprise', 597.00, 5970.00, null, false,
     '["obras","fases","equipe","terceiros","fornecedores","oc","precos","financeiro","relatorios","gerencial"]'::jsonb,
     'Tudo de obra, usuarios ilimitados.', false, 13, true, 'obra')
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
    ativo = excluded.ativo,
    segmento = excluded.segmento;

-- ------------------------------------------------------------
-- minha_assinatura: devolve segmento (preserva campos atuais)
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

    if to_regclass('public.promocoes') is not null then
        select p.codigo, p.plano_codigo, p.valor_promocional, p.meses
          into v_promo_cod, v_promo_plano, v_promo_valor, v_promo_meses
          from public.promocoes p
         where p.ativo
           and p.ciclo = 'mensal'
           and (p.vigencia_inicio is null or p.vigencia_inicio <= current_date)
           and (p.vigencia_fim is null or p.vigencia_fim >= current_date)
         order by p.valor_promocional asc
         limit 1;
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
        'segmento', coalesce(p.segmento, 'erp'),
        'preco_mensal', p.preco_mensal,
        'preco_anual', p.preco_anual,
        'mp_status', a.mp_status,
        'mp_vinculada', (a.mp_preapproval_id is not null),
        'mp_pix_pendente', (a.mp_pix_preference_id is not null and a.mp_status = 'pix_pendente'),
        'mp_pix_init_point', a.mp_pix_init_point,
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

-- ------------------------------------------------------------
-- sa_listar_planos: inclui segmento
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
                 recursos, descricao, destaque, ordem, ativo, segmento
          from public.planos order by ordem) t;
    return v;
end $$;

revoke all on function public.sa_listar_planos() from public;
grant execute on function public.sa_listar_planos() to authenticated;

-- ------------------------------------------------------------
-- sa_listar_empresas: expoe segmento do plano
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
            coalesce(a.plano_codigo, e.plano) as plano,
            coalesce(p.segmento, 'erp') as segmento,
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

-- sa_definir_assinatura permanece igual: o segmento vem do plano escolhido.
-- Nada a alterar na assinatura da funcao.

commit;
