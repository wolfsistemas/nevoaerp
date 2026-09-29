-- ============================================================
-- 33_obra_seed_opcional.sql
-- Sem dados de producao. Exemplos comentados para QA manual.
-- ============================================================

-- Exemplo (NAO executar em producao; use apenas em QA com JWT da empresa):
--
-- insert into public.obras (nome, endereco, solicitante, valor_contrato, status)
-- values ('Obra piloto', 'Rua Exemplo, 100', 'Cliente QA', 150000.00, 'ATIVA');
--
-- insert into public.obras_fases (obra_id, ordem, nome)
-- select id, 1, 'Fundacao' from public.obras where nome = 'Obra piloto' limit 1;
--
-- insert into public.equipe (nome, tipo, tipo_remuneracao, categoria, valor_diaria, ativo)
-- values ('Pedreiro QA', 'Diaria', 'diaria', 'Diaria', 180.00, true);

select 1;
