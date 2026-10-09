-- ============================================================
-- 39_obra_vales.sql
-- Vales/adiantamentos de mao de obra no segmento Obra.
-- O vale nasce como despesa (PENDENTE, categoria VALE) e e
-- descontado no fechamento de Diaria e Metragem.
-- Idempotente. Sem backfill.
-- ============================================================

begin;

create table if not exists public.obra_vales (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null,
    obra_id         uuid references public.obras(id) on delete set null,
    equipe_id       bigint references public.equipe(id) on delete cascade,
    terceirizado_id uuid references public.terceirizados(id) on delete cascade,
    valor           numeric(14,2) not null check (valor > 0),
    data            date not null default current_date,
    observacao      text,
    status          text not null default 'ABERTO'
                    check (status in ('ABERTO','DESCONTADO','ESTORNADO')),
    despesa_uid     uuid,
    fechamento_uid  uuid,
    criado_em       timestamptz not null default now(),
    constraint obra_vales_pessoa_chk check (
        (equipe_id is not null and terceirizado_id is null) or
        (equipe_id is null and terceirizado_id is not null)
    )
);

create index if not exists idx_obra_vales_empresa on public.obra_vales (empresa_id);
create index if not exists idx_obra_vales_equipe on public.obra_vales (equipe_id, status);
create index if not exists idx_obra_vales_terc on public.obra_vales (terceirizado_id, status);
create index if not exists idx_obra_vales_fechamento on public.obra_vales (fechamento_uid);
create index if not exists idx_obra_vales_obra on public.obra_vales (empresa_id, obra_id);

-- RLS + triggers (mesmo padrao da migracao 31) ----------------------------
do $$
begin
    execute 'alter table public.obra_vales enable row level security';
    execute 'drop policy if exists tenant_isolation on public.obra_vales';
    execute 'create policy tenant_isolation on public.obra_vales
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario())
             with check (empresa_id = public.empresa_do_usuario())';
    execute 'drop trigger if exists trg_set_empresa on public.obra_vales';
    execute 'create trigger trg_set_empresa before insert on public.obra_vales
             for each row execute function public.set_empresa_id()';
    execute 'drop trigger if exists trg_bloqueio_inadimplencia on public.obra_vales';
    execute 'create trigger trg_bloqueio_inadimplencia
             before insert or update or delete on public.obra_vales
             for each row execute function public.bloqueia_escrita_inadimplente()';
    execute 'grant select, insert, update, delete on public.obra_vales to authenticated';
end $$;

commit;
