-- ============================================================
-- MIGRACAO 5: corrige/vincula despesas.equipe_id das FOLHAS PAGAS
--
-- POR QUE EXISTE: o script 04 usou item = 'Salário' (com 'S'), mas
--   o app grava 'SALÁRIO' (maiusculo). Alem disso, folhas de Mai e
--   Jun/2026 acabaram com o MESMO despesa_id (411 e 445 repetidos)
--   por colisao de getNextId, entao o backfill atribuiu o funcionario
--   ERRADO (Marcos -> Maicon) nessas despesas.
--
-- AQUI o vinculo e refeito de forma DETERMINISTICA e sem depender
--   de nomes digitados:
--   Etapa A: despesa cuja folha e unica (despesa_id -> 1 folha).
--   Etapa B: apenas linhas com id duplicado, casadas por MES (lido
--            da observacao, formato AAAA-MM) + VALOR pago, quando
--            existe EXATAMENTE uma folha compativel. O UPDATE usa o
--            uid (chave unica real), pois despesas.id NAO e unico.
--
-- Nota: despesas manuais de categoria SALÁRIO (sem folha, id unico)
--   nao sao tocadas.
--
-- COMO USAR: rode no Supabase SQL Editor (idempotente).
-- ============================================================

-- ============================================================
-- PARTE 1 - Garantir coluna + FK + indice (idempotente)
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
-- PARTE 2 - Recompor o vinculo (so para item = 'SALÁRIO')
-- ============================================================

-- Etapa A: despesa com EXATAMENTE UMA folha apontando para ela
-- (cobre Jul/2026 e qualquer folha com vinculo saudavel).
UPDATE public.despesas d
SET equipe_id = f.equipe_id
FROM (
    SELECT f.despesa_id,
           min(f.equipe_id) AS equipe_id
    FROM public.folhas f
    WHERE f.despesa_id IS NOT NULL
    GROUP BY f.despesa_id
    HAVING count(*) = 1
       AND count(DISTINCT f.equipe_id) = 1
) f
WHERE f.despesa_id = d.id
  AND d.item = 'SALÁRIO';

-- Etapa B: somente as linhas de id duplicado (411/445 e futuras),
-- casadas por mes (lido da obs) + valor pago, com 1 folha compativel.
UPDATE public.despesas d
SET equipe_id = sub.equipe_id
FROM (
    SELECT dep.uid,
           min(fol.equipe_id) AS equipe_id
    FROM public.despesas dep
    JOIN public.folhas fol
      ON fol.mes_referencia = (regexp_match(dep.observacao, '[0-9]{4}-[0-9]{2}'))[1]
     AND fol.valor_pago = dep.custo
    WHERE dep.item = 'SALÁRIO'
      AND dep.id IN (
          SELECT id FROM public.despesas
          WHERE item = 'SALÁRIO'
          GROUP BY id HAVING count(*) > 1
      )
      AND (regexp_match(dep.observacao, '[0-9]{4}-[0-9]{2}'))[1] IS NOT NULL
    GROUP BY dep.uid
    HAVING count(fol.id) = 1
) sub
WHERE d.uid = sub.uid;

-- ============================================================
-- PARTE 3 (OPCIONAL) - CONFERENCIA
-- Salarios com/sem funcionario vinculado + detalhe dos sem vinculo
-- (esperado: lancamentos manuais de categoria SALÁRIO, sem folha).
-- ============================================================

SELECT
    count(*)                       AS total_salario,
    count(equipe_id)               AS com_equipe_id,
    count(*) - count(equipe_id)    AS sem_equipe_id
FROM public.despesas
WHERE item = 'SALÁRIO';

SELECT id, custo, observacao, equipe_id
FROM public.despesas
WHERE item = 'SALÁRIO'
  AND equipe_id IS NULL
ORDER BY id;
