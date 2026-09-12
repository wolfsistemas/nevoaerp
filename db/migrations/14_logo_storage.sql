-- ============================================================
-- 14_logo_storage.sql
-- Upload do logo da empresa (white-label) no Supabase Storage.
-- Cria o bucket publico "logos" + policies por empresa e libera
-- o UPDATE do perfil em empresas para o admin da propria empresa.
-- Rodar depois de 13_signup.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Helper: o usuario autenticado e admin da propria empresa?
-- SECURITY DEFINER para nao depender da RLS de usuarios.
-- ------------------------------------------------------------
create or replace function public.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((
        select nivel_acesso = 'admin'
        from public.usuarios
        where lower(trim(email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
        limit 1
    ), false);
$$;

revoke all on function public.usuario_eh_admin() from public;
grant execute on function public.usuario_eh_admin() to authenticated;

-- ------------------------------------------------------------
-- Empresas: admin da propria empresa pode alterar o perfil
-- (nome, cnpj, telefone, endereco, email_contato, logo_url).
-- ------------------------------------------------------------
drop policy if exists tenant_empresa_update on public.empresas;
create policy tenant_empresa_update on public.empresas
    for update to authenticated
    using (id = public.empresa_do_usuario() and public.usuario_eh_admin())
    with check (id = public.empresa_do_usuario() and public.usuario_eh_admin());

-- ------------------------------------------------------------
-- Bucket publico de logos. Leitura via URL publica nao exige
-- policy; as policies abaixo cobrem upload/atualizacao/remocao.
-- Convencao de caminho: <empresa_id>/logo.<ext>
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "logos_insert_own" on storage.objects;
create policy "logos_insert_own" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'logos'
        and public.usuario_eh_admin()
        and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    );

drop policy if exists "logos_update_own" on storage.objects;
create policy "logos_update_own" on storage.objects
    for update to authenticated
    using (
        bucket_id = 'logos'
        and public.usuario_eh_admin()
        and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    )
    with check (
        bucket_id = 'logos'
        and public.usuario_eh_admin()
        and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    );

drop policy if exists "logos_delete_own" on storage.objects;
create policy "logos_delete_own" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'logos'
        and public.usuario_eh_admin()
        and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    );

drop policy if exists "logos_select_own" on storage.objects;
create policy "logos_select_own" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'logos'
        and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    );

commit;
