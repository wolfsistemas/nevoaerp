-- ============================================================
-- MIGRACAO 2: logs.cliente_id (FK para clientes.id)
-- Objetivo: logs passa a referenciar o cliente por ID estavel.
--   Assim, renomear/editar um cliente reflete em cadeia
--   (historico, relatorios, financeiro), sem depender do nome.
--
-- COMO USAR:
--   1. Abra o Supabase Studio > SQL Editor (do seu projeto)
--   2. Rode a PARTE 1 (obrigatoria)
--   3. [Opcional] rode a PARTE 2 (backfill de dados historicos
--      que ja batem com clientes atuais por nome normalizado)
--   4. Rode a PARTE 3 (conferencia) se quiser validar
--
-- OBS: Nao apaga nada. As tabelas bkp_ nao sao tocadas.
-- O MDF sera tratado em um script separado (03).
-- ============================================================

-- ============================================================
-- PARTE 1 - Adicionar a coluna cliente_id + FK + indice
-- O tipo da coluna copia automaticamente o tipo de clientes.id,
-- garantindo que a FK seja aceita.
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

        EXECUTE format('ALTER TABLE public.logs ADD COLUMN cliente_id %s', v_tipo);
    END IF;

    EXECUTE 'ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS fk_logs_cliente';
    EXECUTE 'ALTER TABLE public.logs
             ADD CONSTRAINT fk_logs_cliente
             FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
             ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_logs_cliente_id ON public.logs(cliente_id)';
END $$;

-- ============================================================
-- PARTE 2 (OPCIONAL) - Backfill dos registros ANTIGOS
-- Vincula cliente_id nas logs cujo cliente_nome bate (apos
-- normalizar maiusculas/espacos) com EXATAMENTE UM cliente atual.
-- Nomes sem correspondencia, ambiguos (2+ clientes iguais) ou
-- "Consumidor Final" ficam NULL, preservando o texto original.
-- ============================================================

UPDATE public.logs l
SET cliente_id = sub.cliente_id
FROM (
    SELECT lg.uid, min(c.id) AS cliente_id
    FROM public.logs lg
    JOIN public.clientes c
      ON upper(trim(c.nome)) = upper(trim(lg.cliente_nome))
    WHERE lg.cliente_id IS NULL
    GROUP BY lg.uid
    HAVING count(c.id) = 1
) sub
WHERE l.uid = sub.uid;

-- ============================================================
-- PARTE 3 (OPCIONAL) - CONFERENCIA
-- Mostra logs com cliente vinculado x sem vinculo por tipo.
-- ============================================================

SELECT
    tipo,
    count(*)                                                AS total,
    count(cliente_id)                                       AS com_cliente_id,
    count(*) - count(cliente_id)                            AS sem_cliente_id
FROM public.logs
GROUP BY tipo
ORDER BY tipo;
