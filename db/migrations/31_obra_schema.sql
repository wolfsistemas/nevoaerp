-- ============================================================
-- 31_obra_schema.sql
-- Tabelas novas do segmento Obra + RLS/triggers/indices.
-- Idempotente. Sem backfill.
-- ============================================================

begin;

-- Obras -------------------------------------------------------------------
create table if not exists public.obras (
    id             uuid primary key default gen_random_uuid(),
    empresa_id     uuid not null,
    nome           text not null,
    endereco       text,
    solicitante    text,
    valor_contrato numeric(14,2) not null default 0,
    data_inicio    date,
    data_termino   date,
    status         text not null default 'ATIVA'
                   check (status in ('ATIVA','PARALISADA','CONCLUIDA')),
    ativo          boolean not null default true,
    criado_em      timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- Fases de uma obra -------------------------------------------------------
create table if not exists public.obras_fases (
    id         uuid primary key default gen_random_uuid(),
    empresa_id uuid not null,
    obra_id    uuid not null references public.obras(id) on delete cascade,
    ordem      integer not null default 0,
    nome       text not null,
    criado_em  timestamptz not null default now()
);

-- Terceirizados (producao por metro) -------------------------------------
create table if not exists public.terceirizados (
    id                uuid primary key default gen_random_uuid(),
    empresa_id        uuid not null,
    nome              text not null,
    cpf_cnpj          text,
    rg                text,
    telefone          text,
    chave_pix         text,
    endereco          text,
    obra_atual_id     uuid references public.obras(id) on delete set null,
    valor_metro       numeric(12,2) not null default 0,
    data_contrato     date,
    contrato_assinado boolean not null default false,
    ativo             boolean not null default true,
    criado_em         timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- Ponto diario (batidas + ajustes) ---------------------------------------
create table if not exists public.ponto_diario (
    id               uuid primary key default gen_random_uuid(),
    empresa_id       uuid not null,
    funcionario_id   bigint not null references public.equipe(id) on delete cascade,
    obra_id          uuid references public.obras(id) on delete set null,
    tipo             text not null check (tipo in ('ENTRADA','SAIDA','AJUSTE_MANUAL')),
    status           text not null default 'VALIDADO'
                     check (status in ('VALIDADO','PENDENTE','ESTORNADO')),
    hora_registro    timestamptz not null default now(),
    fracao_diaria    numeric(4,2),
    observacao       text,
    pago_em_fechamento boolean not null default false,
    despesa_uid      uuid,
    fechamento_uid   uuid,
    lat_registro     text,
    lng_registro     text,
    criado_em        timestamptz not null default now()
);

-- Producao de terceirizado (metros por dia) ------------------------------
create table if not exists public.producao_terc (
    id               uuid primary key default gen_random_uuid(),
    empresa_id       uuid not null,
    terceirizado_id  uuid not null references public.terceirizados(id) on delete cascade,
    obra_id          uuid references public.obras(id) on delete set null,
    data_registro    date not null default current_date,
    metros           numeric(12,2) not null default 0,
    status           text not null default 'PENDENTE'
                     check (status in ('PENDENTE','PAGO','ESTORNADO')),
    observacao       text,
    fechamento_uid   uuid,
    despesa_uid      uuid,
    criado_em        timestamptz not null default now()
);

-- Medicoes de empreita (percentual do contrato) --------------------------
create table if not exists public.medicoes_empreita (
    id            uuid primary key default gen_random_uuid(),
    empresa_id    uuid not null,
    equipe_id     bigint not null references public.equipe(id) on delete cascade,
    obra_id       uuid references public.obras(id) on delete set null,
    data_medicao  date not null default current_date,
    percentual    numeric(6,2) not null default 0,
    valor         numeric(14,2) not null default 0,
    descricao     text,
    status        text not null default 'PENDENTE'
                  check (status in ('PENDENTE','PAGO','ESTORNADO')),
    fechamento_uid uuid,
    despesa_uid   uuid,
    criado_em     timestamptz not null default now()
);

-- Fornecedores de obra ----------------------------------------------------
create table if not exists public.fornecedores (
    id         uuid primary key default gen_random_uuid(),
    empresa_id uuid not null,
    nome       text not null,
    telefone   text,
    documento  text,
    endereco   text,
    ativo      boolean not null default true,
    criado_em  timestamptz not null default now()
);

-- Historico de precos por produto/fornecedor ------------------------------
create table if not exists public.historico_precos (
    id             uuid primary key default gen_random_uuid(),
    empresa_id     uuid not null,
    produto_id     bigint references public.produtos(id) on delete set null,
    fornecedor_id  uuid references public.fornecedores(id) on delete set null,
    data_preco     date not null default current_date,
    preco_unitario numeric(12,2) not null default 0,
    origem         text not null default 'manual'
                   check (origem in ('manual','automatico')),
    observacao     text,
    criado_em      timestamptz not null default now()
);

-- Ordens de compra --------------------------------------------------------
create table if not exists public.ordens_compra (
    id            uuid primary key default gen_random_uuid(),
    empresa_id    uuid not null,
    obra_id       uuid references public.obras(id) on delete set null,
    fornecedor_id uuid references public.fornecedores(id) on delete set null,
    numero        text,
    data          date not null default current_date,
    status        text not null default 'RASCUNHO'
                  check (status in ('RASCUNHO','CONFIRMADA','CANCELADA')),
    observacao    text,
    valor_total   numeric(14,2) not null default 0,
    log_uid       uuid,
    criado_em     timestamptz not null default now()
);

create table if not exists public.ordens_compra_itens (
    id             uuid primary key default gen_random_uuid(),
    empresa_id     uuid not null,
    oc_id          uuid not null references public.ordens_compra(id) on delete cascade,
    produto_id     bigint references public.produtos(id) on delete set null,
    descricao      text not null,
    quantidade     numeric(12,3) not null default 1,
    unidade        text default 'un',
    preco_unitario numeric(12,2) not null default 0,
    valor_total    numeric(14,2) not null default 0
);

-- Indices -----------------------------------------------------------------
create index if not exists idx_obras_empresa on public.obras (empresa_id);
create index if not exists idx_obras_fases_empresa on public.obras_fases (empresa_id);
create index if not exists idx_obras_fases_obra on public.obras_fases (obra_id);
create index if not exists idx_terceirizados_empresa on public.terceirizados (empresa_id);
create index if not exists idx_ponto_diario_empresa on public.ponto_diario (empresa_id);
create index if not exists idx_ponto_diario_func_obra on public.ponto_diario (funcionario_id, obra_id);
create index if not exists idx_producao_terc_empresa on public.producao_terc (empresa_id);
create index if not exists idx_producao_terc_terc on public.producao_terc (terceirizado_id);
create index if not exists idx_medicoes_empreita_empresa on public.medicoes_empreita (empresa_id);
create index if not exists idx_medicoes_empreita_equipe on public.medicoes_empreita (equipe_id);
create index if not exists idx_fornecedores_empresa on public.fornecedores (empresa_id);
create index if not exists idx_historico_precos_empresa on public.historico_precos (empresa_id);
create index if not exists idx_historico_precos_produto on public.historico_precos (produto_id);
create index if not exists idx_ordens_compra_empresa on public.ordens_compra (empresa_id);
create index if not exists idx_ordens_compra_itens_empresa on public.ordens_compra_itens (empresa_id);
create index if not exists idx_ordens_compra_itens_oc on public.ordens_compra_itens (oc_id);

-- RLS + triggers (mesmo padrao da migracao 12/18) -------------------------
do $$
declare
    t text;
    tabelas text[] := array[
        'obras','obras_fases','terceirizados','ponto_diario','producao_terc',
        'medicoes_empreita','fornecedores','historico_precos',
        'ordens_compra','ordens_compra_itens'
    ];
begin
    foreach t in array tabelas loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists tenant_isolation on public.%I', t);
        execute format(
            'create policy tenant_isolation on public.%I
             for all to authenticated
             using (empresa_id = public.empresa_do_usuario())
             with check (empresa_id = public.empresa_do_usuario())', t);

        execute format('drop trigger if exists trg_set_empresa on public.%I', t);
        execute format(
            'create trigger trg_set_empresa before insert on public.%I
             for each row execute function public.set_empresa_id()', t);

        execute format('drop trigger if exists trg_bloqueio_inadimplencia on public.%I', t);
        execute format(
            'create trigger trg_bloqueio_inadimplencia
             before insert or update or delete on public.%I
             for each row execute function public.bloqueia_escrita_inadimplente()', t);

        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end $$;

commit;
