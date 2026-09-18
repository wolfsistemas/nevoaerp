-- ============================================================
-- 28_essencial_sem_expedicao.sql
-- Remove o recurso "expedicao" do plano Essencial.
--
-- A aba Expedicao passa a ser exclusiva dos planos Profissional e Enterprise.
-- Os planos Profissional e Enterprise ja possuem o recurso e nao sao afetados.
--
-- IMPORTANTE: os registros de entrega continuam sendo gravados na tabela `logs`
-- (tipo = 'entrega', com status_entrega/qtd_entregue) pelo fluxo normal de
-- vendas, independentemente do plano. O gating e apenas de interface: se a
-- empresa fizer upgrade, todo o historico de entregas ja estara disponivel na
-- aba Expedicao.
--
-- Rodar depois de 27_plano_anual_pix.sql. Idempotente.
-- ============================================================

begin;

update public.planos
   set recursos = recursos - 'expedicao'
 where codigo = 'essencial'
   and recursos ? 'expedicao';

commit;
