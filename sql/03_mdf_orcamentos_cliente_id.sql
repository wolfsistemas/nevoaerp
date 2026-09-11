-- ============================================================
-- MIGRACAO 3: mdf_orcamentos.cliente_id (FK para clientes.id)
-- Objetivo: orcamentos do MDF passam a referenciar o cliente por
--   ID estavel (como logs.cliente_id). Assim renomear um cliente
--   reflete em cadeia tambem nos orcamentos MDF, na agenda e nos
--   logs de venda gerados no faturamento.
--
-- COMO USAR:
--   1. Rode a PARTE 1 (obrigatoria)
--   2. [Opcional] rode a PARTE 2 (backfill por nome normalizado,
--      so quando existir EXATAMENTE UM cliente com aquele nome)
--   3. Rode a PARTE 3 (conferencia) se quiser validar
--
-- OBS: Nao apaga nada. As tabelas bkp_ nao sao tocadas.
-- ============================================================

-- ============================================================
-- PARTE 1 - Adicionar a coluna cliente_id + FK + indice
-- O tipo da coluna copia automaticamente o tipo de clientes.id.
-- ============================================================

DO $$
DECLARE
    v_tipo   text;
    v_existe boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mdf_orcamentos'
          AND column_name = 'cliente_id'
    ) INTO v_existe;

    IF NOT v_existe THEN
        SELECT format_type(a.atttypid, a.atttypmod)
          INTO v_tipo
          FROM pg_attribute a
          JOIN pg_class c    ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'clientes'
           AND a.attname = 'id'
           AND NOT a.attisdropped;

        EXECUTE format('ALTER TABLE public.mdf_orcamentos ADD COLUMN cliente_id %s', v_tipo);
    END IF;

    EXECUTE 'ALTER TABLE public.mdf_orcamentos DROP CONSTRAINT IF EXISTS fk_mdf_orcamentos_cliente';
    EXECUTE 'ALTER TABLE public.mdf_orcamentos
             ADD CONSTRAINT fk_mdf_orcamentos_cliente
             FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
             ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mdf_orcamentos_cliente_id ON public.mdf_orcamentos(cliente_id)';
END $$;

-- ============================================================
-- PARTE 2 (OPCIONAL) - Backfill dos orcamentos MDF ANTIGOS
-- Vincula cliente_id quando cliente_nome bate com EXATAMENTE UM
-- cliente atual. Ambiguos/orfaos ficam NULL (nome preservado).
-- ============================================================

UPDATE public.mdf_orcamentos o
SET cliente_id = sub.cliente_id
FROM (
    SELECT m.id, min(c.id) AS cliente_id
    FROM public.mdf_orcamentos m
    JOIN public.clientes c
      ON upper(trim(c.nome)) = upper(trim(m.cliente_nome))
    WHERE m.cliente_id IS NULL
    GROUP BY m.id
    HAVING count(c.id) = 1
) sub
WHERE o.id = sub.id;

-- ============================================================
-- PARTE 3 (OPCIONAL) - CONFERENCIA
-- ============================================================

SELECT
    count(*)                         AS total_orcamentos,
    count(cliente_id)                AS com_cliente_id,
    count(*) - count(cliente_id)     AS sem_cliente_id
FROM public.mdf_orcamentos;
