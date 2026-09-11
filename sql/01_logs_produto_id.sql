-- ============================================================
-- MIGRACAO 1: logs.produto_id (FK para produtos.id)
-- Objetivo: logs passa a referenciar produtos por ID estavel.
--   Assim, renomear um produto reflete em cadeia (relatorios,
--   historico, etc.) via JOIN, sem depender do nome gravado.
--
-- COMO USAR:
--   1. Abra o Supabase Studio > SQL Editor (do seu projeto)
--   2. Rode a PARTE 1 (obrigatoria)
--   3. [Opcional] rode a PARTE 2 (backfill de dados historicos
--      que ja batem com produtos atuais por nome normalizado)
--   4. Rode a PARTE 3 (conferencia) se quiser validar
--
-- OBS: Nao apaga nada. As tabelas bkp_ nao sao tocadas.
-- ============================================================

-- ============================================================
-- PARTE 1 - Adicionar a coluna produto_id + FK + indice
-- O tipo da coluna copia automaticamente o tipo de produtos.id
-- (int4, int8, etc.), garantindo que a FK seja aceita.
-- ============================================================

DO $$
DECLARE
    v_tipo   text;
    v_existe boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'logs'
          AND column_name = 'produto_id'
    ) INTO v_existe;

    IF NOT v_existe THEN
        SELECT format_type(a.atttypid, a.atttypmod)
          INTO v_tipo
          FROM pg_attribute a
          JOIN pg_class c    ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'produtos'
           AND a.attname = 'id'
           AND NOT a.attisdropped;

        EXECUTE format('ALTER TABLE public.logs ADD COLUMN produto_id %s', v_tipo);
    END IF;

    EXECUTE 'ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS fk_logs_produto';
    EXECUTE 'ALTER TABLE public.logs
             ADD CONSTRAINT fk_logs_produto
             FOREIGN KEY (produto_id) REFERENCES public.produtos(id)
             ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_logs_produto_id ON public.logs(produto_id)';
END $$;

-- ============================================================
-- PARTE 2 (OPCIONAL) - Backfill dos registros ANTIGOS
-- Vincula produto_id nas logs cujo produto_nome bate (apos
-- normalizar maiusculas/espacos) com EXATAMENTE UM produto atual.
-- Linhas sem correspondencia (renomeados/orfaos) OU com nome
-- ambiguo (2+ produtos iguais, ex.: produto proprio x parceiro
-- com o mesmo nome) ficam NULL, preservando o nome original.
-- ============================================================

UPDATE public.logs l
SET produto_id = sub.produto_id
FROM (
    SELECT lg.uid, min(p.id) AS produto_id
    FROM public.logs lg
    JOIN public.produtos p
      ON upper(trim(p.nome)) = upper(trim(lg.produto_nome))
    WHERE lg.produto_id IS NULL
    GROUP BY lg.uid
    HAVING count(p.id) = 1
) sub
WHERE l.uid = sub.uid;

-- ============================================================
-- PARTE 3 (OPCIONAL) - CONFERENCIA
-- Mostra logs com produto_id vinculado x sem vinculo por tipo.
-- ============================================================

SELECT
    tipo,
    count(*)                                              AS total,
    count(produto_id)                                     AS com_produto_id,
    count(*) - count(produto_id)                          AS sem_produto_id
FROM public.logs
GROUP BY tipo
ORDER BY tipo;
