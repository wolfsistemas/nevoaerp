-- ============================================================
-- MIGRACAO 6: Padronizacao de CPF/CNPJ e preparo do ENDERECO
--
-- 1) CPF/CNPJ: o cadastro passa a gravar SEMPRE formatado
--    (CPF 000.000.000-00 / CNPJ 00.000.000/0000-00). Este script
--    NORMALIZA os registros existentes COM MUITO CUIDADO:
--      * so altera documentos cujo numero (so digitos) tenha
--        exatamente 11 (CPF) ou 14 (CNPJ) digitos;
--      * e somente se o digito verificador for VALIDO
--        (evita 'corrigir' lixo/digitos errados);
--      * registros que nao passarem ficam INTACTOS e sao listados
--        na PARTE 3 para revisao manual.
--
-- 2) ENDERECO: adiciona colunas estruturadas (logradouro, numero,
--    complemento, bairro, cidade, uf). A coluna 'cep' ja existe.
--    O campo 'endereco' (texto completo) continua sendo montado
--    pelo sistema a partir dessas partes.
--
-- COMO USAR: rode no Supabase SQL Editor (idempotente).
-- ============================================================

-- ============================================================
-- PARTE 1 - Adicionar colunas de endereco (se nao existirem)
-- ============================================================

DO $$
DECLARE
    cols text[] := ARRAY['logradouro','numero','complemento','bairro','cidade','uf'];
    col  text;
BEGIN
    FOREACH col IN ARRAY cols
    LOOP
        EXECUTE format(
            'ALTER TABLE public.clientes
               ADD COLUMN IF NOT EXISTS %I text DEFAULT NULL', col);
    END LOOP;
END $$;

-- ============================================================
-- PARTE 2 - Funcoes de validacao de digito verificador
-- ============================================================

CREATE OR REPLACE FUNCTION public.valida_cpf(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    d    int[];
    i    int;
    s    int;
    r    int;
BEGIN
    p := regexp_replace(p, '[^0-9]', '', 'g');
    IF length(p) <> 11 THEN RETURN false; END IF;
    SELECT array_agg((substr(p, g, 1))::int) INTO d FROM generate_series(1, 11) g;

    -- rejeita sequencias repetidas (ex.: 111.111.111-11)
    IF d[1] = d[2] AND d[2] = d[3] AND d[3] = d[4] AND d[4] = d[5]
       AND d[5] = d[6] AND d[6] = d[7] AND d[7] = d[8] AND d[8] = d[9]
       AND d[9] = d[10] AND d[10] = d[11] THEN RETURN false; END IF;

    -- 1o verificador
    s := 0;
    FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
    r := (s * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    IF r <> d[10] THEN RETURN false; END IF;

    -- 2o verificador
    s := 0;
    FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
    r := (s * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    RETURN r = d[11];
END $$;

CREATE OR REPLACE FUNCTION public.valida_cnpj(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    d    int[];
    w1   int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
    w2   int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
    i    int;
    s    int;
    r    int;
BEGIN
    p := regexp_replace(p, '[^0-9]', '', 'g');
    IF length(p) <> 14 THEN RETURN false; END IF;
    SELECT array_agg((substr(p, g, 1))::int) INTO d FROM generate_series(1, 14) g;

    IF d[1] = d[2] AND d[3] = d[4] AND d[5] = d[6] AND d[7] = d[8]
       AND d[9] = d[10] AND d[11] = d[12] AND d[13] = d[14]
       AND d[1] = d[3] THEN RETURN false; END IF;

    -- 1o verificador
    s := 0;
    FOR i IN 1..12 LOOP s := s + d[i] * w1[i]; END LOOP;
    r := s % 11;
    IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
    IF r <> d[13] THEN RETURN false; END IF;

    -- 2o verificador
    s := 0;
    FOR i IN 1..13 LOOP s := s + d[i] * w2[i]; END LOOP;
    r := s % 11;
    IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
    RETURN r = d[14];
END $$;

-- ============================================================
-- PARTE 3 - NORMALIZAR documentos (SO VALIDOS, muito cuidado)
-- ============================================================

-- 3a. Quantidade por categoria (somente leitura, para conferencia)
SELECT
    CASE
        WHEN length(regexp_replace(documento, '[^0-9]', '', 'g')) = 11 THEN '11 dig (possivel CPF)'
        WHEN length(regexp_replace(documento, '[^0-9]', '', 'g')) = 14 THEN '14 dig (possivel CNPJ)'
        ELSE 'outros/vazio'
    END AS categoria,
    count(*) AS qtd
FROM public.clientes
GROUP BY 1
ORDER BY 1;

-- 3b. Aplicar formatacao padrao onde o documento e VALIDO.
UPDATE public.clientes c
SET documento = CASE
        WHEN length(cleaned) = 11 THEN
            format('%s.%s.%s-%s',
                   substr(cleaned,1,3), substr(cleaned,4,3),
                   substr(cleaned,7,3), substr(cleaned,10,2))
        ELSE
            format('%s.%s.%s/%s-%s',
                   substr(cleaned,1,2), substr(cleaned,3,3),
                   substr(cleaned,6,3), substr(cleaned,9,4),
                   substr(cleaned,13,2))
    END
FROM (
    SELECT c2.id,
           regexp_replace(c2.documento, '[^0-9]', '', 'g') AS cleaned
    FROM public.clientes c2
    WHERE c2.documento IS NOT NULL
      AND c2.documento <> ''
) t
WHERE c.id = t.id
  AND (
        (length(t.cleaned) = 11 AND public.valida_cpf(t.cleaned))
     OR (length(t.cleaned) = 14 AND public.valida_cnpj(t.cleaned))
  );

-- ============================================================
-- PARTE 4 - RELATORIO (conferencia)
-- ============================================================

-- 4a. Resumo pos-normalizacao
SELECT
    count(*) FILTER (WHERE documento ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$')  AS cpf_formatado,
    count(*) FILTER (WHERE documento ~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$') AS cnpj_formatado,
    count(*) FILTER (WHERE documento IS NOT NULL AND documento <> ''
        AND documento !~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$'
        AND documento !~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$')    AS sem_padrao
FROM public.clientes;

-- 4b. Documentos NAO padronizados (revisao manual) - NAO foram alterados
SELECT id, nome, documento
FROM public.clientes
WHERE documento IS NOT NULL AND documento <> ''
  AND documento !~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$'
  AND documento !~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$'
ORDER BY id;
