-- 22_admin_apenas.sql
-- Coerencia de papeis: alem de equipe/folhas/vales (migration 21), restringe
-- LEITURA e ESCRITA de dados administrativos a administradores da empresa.
--
-- Vendedor (forca de vendas) passa a acessar apenas: produtos, clientes e logs
-- (orcamentos/vendas/recebimentos). Financeiro, folha de pagamento e MDF ficam
-- exclusivos do admin (e do super-admin da plataforma).
--
-- Depende de public.usuario_eh_admin() criada em 21_folha_admin.sql.
-- Idempotente: pode rodar de novo para corrigir policies antigas (ex.: mdf_tenant).

do $$
declare
    t text;
    tabelas_adm text[] := array['despesas', 'equipe', 'folhas', 'vales'];
    tabelas_mdf text[] := array['mdf_agenda', 'mdf_itens', 'mdf_orcamentos'];
begin
    -- Tabelas administrativas comuns.
    foreach t in array tabelas_adm loop
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format('drop policy if exists tenant_read on public.%I', t);
        execute format('drop policy if exists tenant_admin_write on public.%I', t);
        execute format('drop policy if exists tenant_admin_only on public.%I', t);
        execute format('drop policy if exists mdf_tenant on public.%I', t);
        execute format(
            'create policy tenant_admin_only on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario() and public.usuario_eh_admin())
             with check (empresa_id = public.empresa_do_usuario() and public.usuario_eh_admin())', t);
    end loop;

    -- MDF: mantem o entitlement do plano E exige admin.
    foreach t in array tabelas_mdf loop
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format('drop policy if exists tenant_read on public.%I', t);
        execute format('drop policy if exists tenant_admin_write on public.%I', t);
        execute format('drop policy if exists tenant_admin_only on public.%I', t);
        execute format('drop policy if exists mdf_tenant on public.%I', t);
        execute format(
            'create policy tenant_admin_only on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario()
                    and public.empresa_tem_mdf()
                    and public.usuario_eh_admin())
             with check (empresa_id = public.empresa_do_usuario()
                    and public.empresa_tem_mdf()
                    and public.usuario_eh_admin())', t);
    end loop;
end $$;
