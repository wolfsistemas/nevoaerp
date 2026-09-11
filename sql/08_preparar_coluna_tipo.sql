-- ============================================================
-- MIGRACAO 8: Preparar coluna "tipo" em clientes (v2 - idempotente)
--
-- A coluna 'tipo' JÁ EXISTE na tabela com valores em caixa alta
-- ('CLIENTE'/'FORNECEDOR'). Esta versao:
--   * garante DEFAULT 'cliente' e NOT NULL
--   * normaliza valores para minusculas ('cliente'/'fornecedor'),
--     convertendo qualquer valor fora do padrao para 'cliente'
--   * cria CHECK limitando a ('cliente', 'fornecedor')
--   * indice para filtro futuro por tipo
--   * view 'v_contagem_clientes_tipo' para acompanhar a divisao
--
-- O SISTEMA JA ESTA PREPARADO: sistema.html e mobile.html mapeiam
-- c.tipo (fallback 'cliente') e o formulario atual cria/edita sem
-- enviar 'tipo' (banco assume 'cliente'), entao nada quebra.
--
-- PODE SER RODADO QUANTAS VEZES QUISER (idempotente).
-- COMO USAR: rode no Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS tipo text;

UPDATE public.clientes
SET tipo = CASE
    WHEN upper(trim(tipo)) IN ('CLIENTE', 'FORNECEDOR') THEN lower(trim(tipo))
    ELSE 'cliente'
END;

ALTER TABLE public.clientes
    ALTER COLUMN tipo SET DEFAULT 'cliente';

ALTER TABLE public.clientes
    ALTER COLUMN tipo SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.clientes'::regclass
          AND conname = 'clientes_tipo_check'
    ) THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_tipo_check
            CHECK (tipo IN ('cliente', 'fornecedor'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON public.clientes (tipo);

CREATE OR REPLACE VIEW public.v_contagem_clientes_tipo AS
SELECT
    tipo,
    COUNT(*) AS total
FROM public.clientes
GROUP BY tipo
ORDER BY tipo;
