-- ============================================================
-- 36_obra_planos_por_usuarios.sql
-- Reorganiza os planos do segmento OBRA.
--
-- Regra de negocio: os tres planos de obra oferecem EXATAMENTE os mesmos
-- recursos (obras, fases, equipe, terceiros, fornecedores, OC, precos,
-- financeiro, gerencial e relatorios). A unica diferenca entre eles passa a
-- ser a QUANTIDADE DE USUARIOS:
--   obra_essencial    -> R$ 129,90/mes (anual R$ 1.299,00) -> ate 2 usuarios
--   obra_profissional -> R$ 199,90/mes (anual R$ 1.999,00) -> ate 5 usuarios
--   obra_enterprise   -> R$ 299,90/mes (anual R$ 2.999,00) -> ilimitado
--     (anual enterprise = 10x mensal = R$ 2.999,00)
--
-- O catalogo do ERP (essencial/profissional/enterprise) NAO e alterado.
--
-- Migracao das empresas existentes: cada empresa no segmento obra e remapeada
-- para o plano equivalente pela quantidade de usuarios (<=2 essencial,
-- <=5 profissional, >5 enterprise), sem perder dados nem trocar recursos.
--
-- Rodar depois de 35_criar_empresa_planos_obra.sql. Idempotente.
-- ============================================================

begin;

-- 1) Catalogo unico dos recursos de obra (todos os planos tem tudo).
with recursos_obra as (
    select '["obras","fases","equipe","terceiros","fornecedores","oc","precos","financeiro","gerencial","relatorios"]'::jsonb as r
)
update public.planos p
   set nome         = 'Obra Essencial',
       preco_mensal = 129.90,
       preco_anual  = 1299.00,
       max_usuarios = 2,
       destaque     = false,
       ordem        = 11,
       descricao    = 'Todos os recursos de obra, ate 2 usuarios.',
       recursos     = (select r from recursos_obra)
 where p.codigo = 'obra_essencial';

with recursos_obra as (
    select '["obras","fases","equipe","terceiros","fornecedores","oc","precos","financeiro","gerencial","relatorios"]'::jsonb as r
)
update public.planos p
   set nome         = 'Obra Profissional',
       preco_mensal = 199.90,
       preco_anual  = 1999.00,
       max_usuarios = 5,
       destaque     = true,
       ordem        = 12,
       descricao    = 'Todos os recursos de obra, ate 5 usuarios.',
       recursos     = (select r from recursos_obra)
 where p.codigo = 'obra_profissional';

with recursos_obra as (
    select '["obras","fases","equipe","terceiros","fornecedores","oc","precos","financeiro","gerencial","relatorios"]'::jsonb as r
)
update public.planos p
   set nome         = 'Obra Enterprise',
       preco_mensal = 299.90,
       preco_anual  = 2999.00,
       max_usuarios = null,
       destaque     = false,
       ordem        = 13,
       descricao    = 'Todos os recursos de obra, usuarios ilimitados.',
       recursos     = (select r from recursos_obra)
 where p.codigo = 'obra_enterprise';

-- 2) Remapeia as empresas de obra pelo numero de usuarios.
with alvo as (
    select e.id                                                               as empresa_id,
           (select count(*) from public.usuarios u where u.empresa_id = e.id) as qtd,
           coalesce(a.plano_codigo, e.plano)                                  as plano_atual,
           coalesce(a.ciclo, 'mensal')                                        as ciclo
      from public.empresas e
      left join public.assinaturas a on a.empresa_id = e.id
     where coalesce(a.plano_codigo, e.plano) like 'obra_%'
),
novo as (
    select empresa_id, ciclo,
           case when qtd <= 2 then 'obra_essencial'
                when qtd <= 5 then 'obra_profissional'
                else 'obra_enterprise' end as plano_novo
      from alvo
)
update public.assinaturas a
   set plano_codigo  = n.plano_novo,
       valor         = (select case when n.ciclo = 'anual' then p.preco_anual else p.preco_mensal end
                          from public.planos p where p.codigo = n.plano_novo),
       atualizado_em = now()
  from novo n
 where a.empresa_id = n.empresa_id;

-- 3) Sincroniza a coluna denormalizada empresas.plano.
update public.empresas e
   set plano = a.plano_codigo
  from public.assinaturas a
 where a.empresa_id = e.id
   and e.plano like 'obra_%'
   and e.plano is distinct from a.plano_codigo;

commit;
