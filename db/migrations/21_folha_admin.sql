-- 21_folha_admin.sql
-- Restringe a ESCRITA em dados de folha de pagamento (equipe/folhas/vales) a
-- administradores da empresa. A leitura continua liberada a todos os membros do
-- tenant. Super-admin da plataforma tambem passa.
--
-- Motivo: equipe.js so tinha checagem de papel no lado cliente (e o cliente pode
-- ser contornado). A RLS garantia isolamento entre empresas, mas nao entre papeis
-- dentro da mesma empresa.

create or replace function public.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_super_admin() or exists (
        select 1 from public.usuarios
        where lower(trim(email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and nivel_acesso = 'admin'
          and ativo = true
    );
$$;

revoke all on function public.usuario_eh_admin() from public;
grant execute on function public.usuario_eh_admin() to authenticated;

do $$
declare
    t text;
    tabelas text[] := array['equipe','folhas','vales'];
begin
    foreach t in array tabelas loop
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format('drop policy if exists tenant_read on public.%I', t);
        execute format('drop policy if exists tenant_admin_write on public.%I', t);
        execute format(
            'create policy tenant_read on public.%I
             for select to authenticated
             using (empresa_id = public.empresa_do_usuario())', t);
        execute format(
            'create policy tenant_admin_write on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario() and public.usuario_eh_admin())
             with check (empresa_id = public.empresa_do_usuario() and public.usuario_eh_admin())', t);
    end loop;
end $$;
