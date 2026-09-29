-- ============================================================
-- 32_obra_extensoes.sql
-- Colunas novas em logs/despesas/equipe para o segmento Obra.
-- Amplia o check de tipo da equipe sem quebrar o ERP.
-- Idempotente. Sem backfill.
-- ============================================================

begin;

-- logs (financeiro de obra)
alter table public.logs add column if not exists obra_id uuid;
alter table public.logs add column if not exists categoria text;
alter table public.logs add column if not exists fornecedor_id uuid;
create index if not exists idx_logs_obra on public.logs (empresa_id, obra_id);

-- despesas (custo por obra/fase)
alter table public.despesas add column if not exists obra_id uuid;
alter table public.despesas add column if not exists fase_id uuid;
alter table public.despesas add column if not exists categoria text;
create index if not exists idx_despesas_obra on public.despesas (empresa_id, obra_id);

-- equipe (peca central compartilhada ERP + Obra)
alter table public.equipe add column if not exists categoria text;
alter table public.equipe add column if not exists tipo_remuneracao text;
alter table public.equipe add column if not exists valor_metro numeric(12,2) default 0;
alter table public.equipe add column if not exists valor_contrato numeric(14,2) default 0;
alter table public.equipe add column if not exists obra_atual_id uuid;
alter table public.equipe add column if not exists cpf text;
alter table public.equipe add column if not exists rg text;
alter table public.equipe add column if not exists telefone text;
alter table public.equipe add column if not exists endereco text;
alter table public.equipe add column if not exists data_contrato date;
alter table public.equipe add column if not exists contrato_assinado boolean not null default false;
alter table public.equipe add column if not exists updated_at timestamptz default now();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'equipe_obra_atual_fk'
          and conrelid = 'public.equipe'::regclass
    ) then
        alter table public.equipe
            add constraint equipe_obra_atual_fk
            foreign key (obra_atual_id) references public.obras(id) on delete set null;
    end if;
end $$;

alter table public.equipe drop constraint if exists equipe_tipo_check;
alter table public.equipe add constraint equipe_tipo_check
    check (tipo = any (array['Mensal','Diarista','Diaria','Empreita','Terceirizado']));

-- tipo_remuneracao: mensal | diaria | metro | empreita
-- categoria (rotulo de UI): Diaria | Empreita | Terceirizado (obra) | folha (erp)

-- rvp_funcionarios permanece intacta (legado, sem uso ativo no frontend).
-- Nao dropar. Equipe e a unica fonte de cadastro de colaborador.

commit;
