-- ============================================================
-- 38_obra_fases_lancamentos.sql
-- Vincula fases da obra aos lancamentos financeiros (logs) e as
-- despesas, e troca o hack "(removida)" por um flag arquivada.
-- Aditivo e idempotente. Sem backfill de valores.
-- ============================================================

begin;

-- Fase nos lancamentos de obra (logs: receita, compra, baixa) ---------
alter table public.logs add column if not exists fase_id uuid;
create index if not exists idx_logs_fase on public.logs (empresa_id, fase_id);

-- despesas.fase_id ja existe desde 32_obra_extensoes; garante indice ---
create index if not exists idx_despesas_fase on public.despesas (empresa_id, fase_id);

-- Arquivamento de fase (mantem historico nos lancamentos antigos) ------
alter table public.obras_fases add column if not exists arquivada boolean not null default false;
update public.obras_fases
   set arquivada = true
 where arquivada = false
   and lower(trim(nome)) = '(removida)';

-- FKs com on delete set null: apagar a fase nao apaga o historico ------
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'logs_fase_fk'
          and conrelid = 'public.logs'::regclass
    ) then
        alter table public.logs
            add constraint logs_fase_fk
            foreign key (fase_id) references public.obras_fases(id) on delete set null;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'despesas_fase_fk'
          and conrelid = 'public.despesas'::regclass
    ) then
        alter table public.despesas
            add constraint despesas_fase_fk
            foreign key (fase_id) references public.obras_fases(id) on delete set null;
    end if;
end $$;

create index if not exists idx_obras_fases_obra_ativa on public.obras_fases (obra_id, arquivada);

commit;
