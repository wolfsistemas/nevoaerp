-- 23_logs_papel.sql
-- Separa os logs de vendas (orcamento/venda/entrega/recebimento/ajuste_estoque),
-- que o vendedor usa, dos logs financeiros (despesa/receita), restritos ao admin.
--
-- Depende de public.usuario_eh_admin() (21_folha_admin.sql).
-- Idempotente.

do $$
begin
    execute 'drop policy if exists tenant_isolation on public.logs';
    execute 'drop policy if exists tenant_read on public.logs';
    execute 'drop policy if exists tenant_write on public.logs';

    execute 'create policy tenant_write on public.logs
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario()
                    and (public.usuario_eh_admin() or coalesce(tipo, '''') not in (''despesa'', ''receita'')))
             with check (empresa_id = public.empresa_do_usuario()
                    and (public.usuario_eh_admin() or coalesce(tipo, '''') not in (''despesa'', ''receita'')))';
end $$;
