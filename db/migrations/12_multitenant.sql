-- ============================================================
-- 12_multitenant.sql
-- Ativa multi-tenant (empresa_id + RLS por empresa) reaproveitando
-- as tabelas existentes. Rodar DEPOIS de aplicar db/schema.sql.
-- Idempotente na maior parte; revisar a Fase 3 (backfill).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- FASE 1 - Empresas + coluna empresa_id
-- ------------------------------------------------------------
create table if not exists public.empresas (
    id        uuid primary key default gen_random_uuid(),
    nome      text not null,
    slug      text unique,
    plano     text not null default 'essencial',
    ativo     boolean not null default true,
    criado_em timestamptz not null default now()
);

do $$
declare
    t text;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs','mdf_agenda','mdf_itens',
        'mdf_orcamentos','produtos','rvp_funcionarios','vales','usuarios'
    ];
begin
    foreach t in array tabelas loop
        execute format('alter table public.%I add column if not exists empresa_id uuid', t);
        execute format('create index if not exists idx_%s_empresa on public.%I (empresa_id)', t, t);
    end loop;
end $$;

-- FK opcional (por empresa, sem cascade para nao apagar dados de negocio)
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'fk_clientes_empresa') then
        alter table public.clientes
            add constraint fk_clientes_empresa foreign key (empresa_id)
            references public.empresas(id) on delete restrict;
    end if;
end $$;

-- ------------------------------------------------------------
-- FASE 2 - Empresa do usuario (mapeia Auth -> usuarios.empresa_id)
-- ------------------------------------------------------------
create or replace function public.empresa_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select empresa_id
    from public.usuarios
    where lower(trim(email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1;
$$;

revoke all on function public.empresa_do_usuario() from public;
grant execute on function public.empresa_do_usuario() to authenticated;

-- ------------------------------------------------------------
-- FASE 3 - Backfill: dados atuais pertencem a empresa piloto
-- ATENCAO: rodar uma unica vez, no banco de teste ja clonado.
-- Se for um banco novo sem dados, pode deixar sem efeito.
-- ------------------------------------------------------------
insert into public.empresas (id, nome, slug, plano)
values ('a0000000-0000-4000-8000-000000000001', 'RV Portal Madeiras', 'rv', 'enterprise')
on conflict (id) do nothing;

do $$
declare
    t text;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs','mdf_agenda','mdf_itens',
        'mdf_orcamentos','produtos','rvp_funcionarios','vales','usuarios'
    ];
begin
    foreach t in array tabelas loop
        execute format(
            'update public.%I set empresa_id = %L where empresa_id is null',
            t, 'a0000000-0000-4000-8000-000000000001');
    end loop;
end $$;

-- So marca NOT NULL quando nao houver mais linhas orfas.
do $$
declare
    t text;
    falta int;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs','mdf_agenda','mdf_itens',
        'mdf_orcamentos','produtos','rvp_funcionarios','vales','usuarios'
    ];
begin
    foreach t in array tabelas loop
        execute format('select count(*) from public.%I where empresa_id is null', t) into falta;
        if falta = 0 then
            execute format('alter table public.%I alter column empresa_id set not null', t);
        else
            raise notice 'Tabela % ainda tem % linhas sem empresa_id', t, falta;
        end if;
    end loop;
end $$;

-- ------------------------------------------------------------
-- FASE 5 - Trigger: preenche empresa_id no INSERT
-- ------------------------------------------------------------
create or replace function public.set_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.empresa_id is null then
        new.empresa_id := public.empresa_do_usuario();
    end if;
    return new;
end $$;

do $$
declare
    t text;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs','mdf_agenda','mdf_itens',
        'mdf_orcamentos','produtos','rvp_funcionarios','vales','usuarios'
    ];
begin
    foreach t in array tabelas loop
        execute format('drop trigger if exists trg_set_empresa on public.%I', t);
        execute format(
            'create trigger trg_set_empresa before insert on public.%I
             for each row execute function public.set_empresa_id()', t);
    end loop;
end $$;

-- ------------------------------------------------------------
-- FASE 4 - RLS por empresa (substitui rls_authenticated_all)
-- ------------------------------------------------------------
do $$
declare
    t text;
    tabelas text[] := array[
        'clientes','despesas','equipe','folhas','logs','mdf_agenda','mdf_itens',
        'mdf_orcamentos','produtos','rvp_funcionarios','vales','usuarios'
    ];
begin
    foreach t in array tabelas loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists rls_authenticated_all on public.%I', t);
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format(
            'create policy tenant_isolation on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario())
             with check (empresa_id = public.empresa_do_usuario())', t);
    end loop;
end $$;

-- Empresas: somente leitura da propria empresa para authenticated.
alter table public.empresas enable row level security;
drop policy if exists tenant_empresa_self on public.empresas;
create policy tenant_empresa_self on public.empresas
    for select to authenticated
    using (id = public.empresa_do_usuario());

-- ------------------------------------------------------------
-- FASE 6 - Indices compostos mais usados
-- ------------------------------------------------------------
create index if not exists idx_logs_empresa_data      on public.logs (empresa_id, data);
create index if not exists idx_logs_empresa_cliente   on public.logs (empresa_id, cliente_id);
create index if not exists idx_despesas_empresa_data  on public.despesas (empresa_id, data);
create index if not exists idx_clientes_empresa_nome  on public.clientes (empresa_id, nome);
create index if not exists idx_produtos_empresa_nome  on public.produtos (empresa_id, nome);

-- ------------------------------------------------------------
-- Seguranca: anon nunca acessa
-- ------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

commit;

-- ============================================================
-- Conferencia (rodar depois)
-- ============================================================
-- select 'empresas' t, count(*) from public.empresas
-- union all select 'clientes', count(*) from public.clientes
-- union all select 'logs', count(*) from public.logs;
--
-- select tablename, rowsecurity from pg_tables where schemaname='public';
