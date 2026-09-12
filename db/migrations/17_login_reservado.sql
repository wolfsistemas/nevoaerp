-- ============================================================
-- 17_login_reservado.sql
-- Login curto para super-admins + reserva de logins sensiveis.
--
--  1. super_admins ganha "login" e a busca do login normal passa a
--     resolver tambem super-admins (ex.: "admin" -> e-mail do dono).
--  2. "admin" e "administrador" ficam reservados: usuarios de tenant
--     nao podem usa-los (trava no banco, nao so no front).
--
-- Rodar depois de 16_superadmin.sql. Idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Login curto do super-admin
-- ------------------------------------------------------------
alter table public.super_admins add column if not exists login text;

create unique index if not exists uq_super_admins_login
    on public.super_admins (lower(login))
    where login is not null;

-- ------------------------------------------------------------
-- 2. Reserva de logins para usuarios de tenant
-- ------------------------------------------------------------
create or replace function public.bloqueia_login_reservado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if lower(trim(coalesce(new.login, ''))) in ('admin', 'administrador') then
        raise exception 'O login "%" e reservado da plataforma.', new.login
            using errcode = '23514';
    end if;
    return new;
end $$;

drop trigger if exists trg_bloqueia_login_reservado on public.usuarios;
create trigger trg_bloqueia_login_reservado
    before insert or update of login on public.usuarios
    for each row execute function public.bloqueia_login_reservado();

-- ------------------------------------------------------------
-- 3. Busca do login normal tambem acha super-admins
-- ------------------------------------------------------------
create or replace function public.buscar_email_por_usuario(usuario_busca text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select email
    from (
        select email, login
        from public.usuarios
        where email is not null and trim(email) <> ''
        union all
        select email, login
        from public.super_admins
        where ativo and email is not null and trim(email) <> ''
    ) t
    where lower(trim(login)) = lower(trim(usuario_busca))
    limit 1;
$$;

revoke all on function public.buscar_email_por_usuario(text) from public;
grant execute on function public.buscar_email_por_usuario(text) to anon, authenticated;

commit;
