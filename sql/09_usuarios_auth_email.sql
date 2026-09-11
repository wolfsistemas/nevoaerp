-- ============================================================
-- MIGRACAO 9: Login por Supabase Auth + email em usuarios (idempotente)
--
-- Contexto:
--   * usuarios passa a ter a coluna 'email' (vinculo com o Auth).
--   * A coluna 'senha' (texto puro) deixa de ser usada para login;
--     fica anulavel e recebe apenas valores legados.
--   * RPC 'buscar_email_por_usuario' resolve login -> email para a
--     tela de login (pode ser chamada por anon mesmo com RLS ativo,
--     porque e SECURITY DEFINER e roda como o dono da tabela).
--
-- COMO USAR: rode no Supabase SQL Editor.
-- PODE SER RODADO QUANTAS VEZES QUISER (idempotente).
-- ============================================================

-- 1) Coluna email
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS email text;

-- 2) Backfill dos usuarios que JA possuem conta no Auth
--    Os e-mails reais foram removidos deste repositorio (privacidade).
--    Ao migrar uma base com dados, rode o mapeamento login -> e-mail aqui:
-- UPDATE public.usuarios
-- SET email = lower(trim(CASE login
--     WHEN '<login>' THEN '<email-do-usuario>'
--     ELSE email
-- END));

-- 3) Senha legada: deixa de ser obrigatoria (senha real fica so no Auth)
ALTER TABLE public.usuarios
    ALTER COLUMN senha DROP NOT NULL;

-- 4) Garante unicidade de email entre os que possuem email
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email
    ON public.usuarios (lower(email))
    WHERE email IS NOT NULL AND trim(email) <> '';

-- 5) RPC de resolucao login -> email (roda como owner, ignora RLS)
CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(usuario_busca text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT email
    FROM public.usuarios
    WHERE lower(trim(login)) = lower(trim(usuario_busca))
      AND email IS NOT NULL
      AND trim(email) <> ''
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.buscar_email_por_usuario(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(text) TO anon, authenticated;
