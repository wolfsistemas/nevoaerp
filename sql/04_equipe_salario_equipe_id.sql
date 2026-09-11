-- ============================================================
-- MIGRACAO 4: despesas.equipe_id (FK para equipe.id)
-- Objetivo: o pagamento de folha cria uma despesa cujo
--   "fornecedor" guarda o NOME do funcionario como texto livre.
--   Renomear o funcionario na tela de Equipe nao refletia nessas
--   despesas antigas. Agora a despesa passa a referenciar o
--   funcionario por ID estavel (mesmo padrao de cliente_id/
--   produto_id), e o nome exibido e resolvido pelo cadastro atual.
--
-- COMO USAR:
--   1. Abra o Supabase Studio > SQL Editor (do seu projeto)
--   2. Rode a PARTE 1 (obrigatoria)
--   3. Rode a PARTE 2 (backfill dos dados historicos ja pagos)
--   4. [Opcional] rode a PARTE 3 (conferencia)
--
-- OBS: Nao apaga nada. As tabelas bkp_ nao sao tocadas.
-- O texto original (fornecedor) e preservado como fallback.
-- ============================================================

-- ============================================================
-- PARTE 1 - Adicionar a coluna equipe_id + FK + indice
-- O tipo copia automaticamente o tipo de equipe.id.
-- ============================================================

DO $$
DECLARE
    v_tipo   text;
    v_existe boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'despesas'
          AND column_name = 'equipe_id'
    ) INTO v_existe;

    IF NOT v_existe THEN
        SELECT format_type(a.atttypid, a.atttypmod)
          INTO v_tipo
          FROM pg_attribute a
          JOIN pg_class c    ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'equipe'
           AND a.attname = 'id'
           AND NOT a.attisdropped;

        EXECUTE format('ALTER TABLE public.despesas ADD COLUMN equipe_id %s', v_tipo);
    END IF;

    EXECUTE 'ALTER TABLE public.despesas DROP CONSTRAINT IF EXISTS fk_despesas_equipe';
    EXECUTE 'ALTER TABLE public.despesas
             ADD CONSTRAINT fk_despesas_equipe
             FOREIGN KEY (equipe_id) REFERENCES public.equipe(id)
             ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_despesas_equipe_id ON public.despesas(equipe_id)';
END $$;

-- ============================================================
-- PARTE 2 - Backfill das despesas de salario ja pagas
-- Caminho PRECISO (sem chutar nome):
--   folhas.despesa_id -> despesa;  folhas.equipe_id -> funcionario
-- Etapa A: despesas cuja folha ja aponta (despesa_id).
-- Etapa B: sobras com item 'Salario' (folha antiga sem despesa_id
--   ou inconsistencia), casadas por mes (observacao
--   'SALARIO REF. AAAA-MM') + valor pago, apenas quando existe
--   EXATAMENTE uma folha compativel.
-- ============================================================

-- Etapa A: vínculo direto pela folha
UPDATE public.despesas d
SET equipe_id = f.equipe_id
FROM public.folhas f
WHERE f.despesa_id = d.id
  AND d.equipe_id IS NULL;

-- Etapa B: sobras casadas por mes + valor (1 folha compativel)
UPDATE public.despesas d
SET equipe_id = sub.equipe_id
FROM (
    SELECT dep.id,
           min(fol.equipe_id) AS equipe_id
    FROM public.despesas dep
    JOIN public.folhas fol
      ON fol.mes_referencia = replace(split_part(dep.observacao, 'REF. ', 2), '.', '')
     AND fol.valor_pago = dep.custo
    WHERE dep.equipe_id IS NULL
      AND dep.item = 'Salário'
      AND dep.observacao LIKE 'SALÁRIO REF. %'
    GROUP BY dep.id
    HAVING count(fol.id) = 1
) sub
WHERE d.id = sub.id;

-- ============================================================
-- PARTE 3 (OPCIONAL) - CONFERENCIA
-- Despesas de salario com/sem funcionario vinculado.
-- ============================================================

SELECT
    count(*)                                              AS total_salario,
    count(equipe_id)                                      AS com_equipe_id,
    count(*) - count(equipe_id)                           AS sem_equipe_id,
    count(*) FILTER (WHERE equipe_id IS NULL
        AND observacao NOT LIKE 'SALÁRIO REF. %')         AS nao_reconhecidas
FROM public.despesas
WHERE item = 'Salário';
