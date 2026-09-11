-- ============================================================
-- MIGRACAO 10: RLS - acesso somente para usuarios autenticados
--
-- Contexto:
--   * Hoje o anon (chave publica) consegue ler/escrever em TODAS
--     as tabelas via API REST, porque as tabelas nao tem RLS.
--   * Objetivo: dados acessiveis SOMENTE por usuarios logados
--     (role 'authenticated' - vendedor e admin). Nao logado
--     (anon) fica bloqueado: le 0 linhas / nao insere nada.
--   * Nivel (admin/vendedor) continua controlado pela interface
--     (defesa em profundidade; por-usuario/por-nivel fica para
--     uma proxima fase).
--   * O login por login-curto continua funcionando porque a
--     funcao buscar_email_por_usuario e SECURITY DEFINER e roda
--     como o dono (independe de RLS).
--
-- COMO USAR: rode no Supabase SQL Editor.
-- PODE SER RODADO QUANTAS VEZES QUISER (idempotente).
-- ============================================================

-- 1) Habilita RLS em TODAS as tabelas do schema public (dinamico,
--    cobre qualquer tabela existente hoje ou criada depois de rodar).
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END;
$$;

-- 2) Politica unica em cada tabela: role 'authenticated' pode tudo
--    (SELECT/INSERT/UPDATE/DELETE). anon nao recebe politica nenhuma,
--    portanto e negado pela propria RLS (default deny).
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS rls_authenticated_all ON public.%I', r.tablename);
        EXECUTE format(
            'CREATE POLICY rls_authenticated_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            r.tablename
        );
    END LOOP;
END;
$$;

-- 3) Reforco: remove privilegios de tabela/sequencia/view do anon
--    (alem da RLS, o anon deixa de ter permissao de consulta REST).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

DO $$
DECLARE
    v record;
BEGIN
    FOR v IN
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('REVOKE ALL ON VIEW public.%I FROM anon', v.viewname);
        EXECUTE format('GRANT SELECT ON VIEW public.%I TO authenticated', v.viewname);
    END LOOP;
END;
$$;

-- 4) Garante (de forma idempotente) os privilegios do authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 5) Default privileges: futuras tabelas/sequencias tambem nascem
--    acessiveis para authenticated e SEM acesso para anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
