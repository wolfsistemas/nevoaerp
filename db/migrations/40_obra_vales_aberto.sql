-- ============================================================
-- 40_obra_vales_aberto.sql
-- Vales com saldo em aberto (abatimento parcial) no padrao RV:
--   obra_vales.valor_aberto + tabela obra_vale_abatimentos.
-- Idempotente.
-- ============================================================

begin;

-- Saldo em aberto do vale (parte ainda nao abatida) -----------------------
alter table public.obra_vales add column if not exists valor_aberto numeric(14,2);
update public.obra_vales set valor_aberto = valor where valor_aberto is null;
alter table public.obra_vales alter column valor_aberto set default 0;
alter table public.obra_vales alter column valor_aberto set not null;

-- Status: ABERTO / ABATIDO / ESTORNADO (converte legado DESCONTADO) --------
alter table public.obra_vales drop constraint if exists obra_vales_status_check;
update public.obra_vales set status = 'ABATIDO' where status = 'DESCONTADO';
alter table public.obra_vales add constraint obra_vales_status_check
    check (status in ('ABERTO','ABATIDO','ESTORNADO'));

-- Abatimentos por fechamento (permite abatimento parcial e reversao) -------
create table if not exists public.obra_vale_abatimentos (
    id             uuid primary key default gen_random_uuid(),
    empresa_id     uuid not null,
    vale_id        uuid not null references public.obra_vales(id) on delete cascade,
    fechamento_uid uuid,
    valor          numeric(14,2) not null default 0,
    criado_em      timestamptz not null default now()
);

create index if not exists idx_obra_vale_abat_empresa on public.obra_vale_abatimentos (empresa_id);
create index if not exists idx_obra_vale_abat_vale on public.obra_vale_abatimentos (vale_id);
create index if not exists idx_obra_vale_abat_fech on public.obra_vale_abatimentos (fechamento_uid);

do $$
begin
    execute 'alter table public.obra_vale_abatimentos enable row level security';
    execute 'drop policy if exists tenant_isolation on public.obra_vale_abatimentos';
    execute 'create policy tenant_isolation on public.obra_vale_abatimentos
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario())
             with check (empresa_id = public.empresa_do_usuario())';
    execute 'drop trigger if exists trg_set_empresa on public.obra_vale_abatimentos';
    execute 'create trigger trg_set_empresa before insert on public.obra_vale_abatimentos
             for each row execute function public.set_empresa_id()';
    execute 'drop trigger if exists trg_bloqueio_inadimplencia on public.obra_vale_abatimentos';
    execute 'create trigger trg_bloqueio_inadimplencia
             before insert or update or delete on public.obra_vale_abatimentos
             for each row execute function public.bloqueia_escrita_inadimplente()';
    execute 'grant select, insert, update, delete on public.obra_vale_abatimentos to authenticated';
end $$;

commit;
