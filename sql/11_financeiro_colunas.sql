-- 11_financeiro_colunas.sql
-- Feature financeira (multiplas formas, desconto/juros na baixa, parcelas).
-- Somente DDL (metadados). Nao faz backfill/altera dados existentes.
-- Colunas novas valem para registros novos.

-- 1) logs: anotacao de recebimento do PDV + acrescimo (juros/multa) por baixa
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS pgto_anotacao text;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS acrescimo numeric(12,2) NOT NULL DEFAULT 0;

-- 2) despesas: acumuladores para baixa parcial/parcelamento (desconto/juros/multa)
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS desconto_total numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS acrescimo_total numeric(12,2) NOT NULL DEFAULT 0;

-- RLS: as politicas autenticado ja cobrem toda a linha (nao precisam mudar por nova coluna).
-- Os acumuladores com DEFAULT nao sao aplicados retroativamente nas linhas antigas.
