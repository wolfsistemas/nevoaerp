-- ===========================================================
-- RV PORTAL - SCHEMA ONLY (sem dados) - clone das 12 tabelas
-- tabelas public excluindo prefixo jsp_ | sem dados
-- ===========================================================
set client_encoding = 'UTF8';
set standard_conforming_strings = on;
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- SEQUENCES ----------
create sequence if not exists public.equipe_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.equipe_matricula_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 100 cache 1;
create sequence if not exists public.folhas_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.global_matricula_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.mdf_agenda_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.mdf_itens_id_seq as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1;
create sequence if not exists public.mdf_orcamentos_id_seq as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1;
create sequence if not exists public.vales_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;

-- ---------- TABLES ----------
create table if not exists public.clientes (
    id bigint not null,
    nome text not null,
    telefone text,
    documento text,
    endereco text,
    tipo varchar(20) default 'CLIENTE'::character varying,
    ie varchar(20),
    cep varchar(10),
    contato varchar(100),
    ativo boolean default true,
    fornecedor_desde date,
    logradouro text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf text,
    bkp_endereco text
);
create table if not exists public.despesas (
    uid uuid not null default uuid_generate_v4(),
    id bigint not null,
    item text not null,
    quantidade numeric default 0,
    unidade text,
    custo numeric not null default 0,
    data text,
    observacao text,
    status text,
    funcionario_id bigint,
    tipo_despesa varchar(20) default 'SERVICO'::character varying,
    fornecedor text,
    observacao_backup text,
    equipe_id bigint,
    valor_pago numeric(12,2) not null default 0,
    desconto_total numeric(12,2) not null default 0,
    acrescimo_total numeric(12,2) not null default 0
);
create table if not exists public.equipe (
    id bigint not null default nextval('equipe_id_seq'::regclass),
    nome text not null,
    tipo text not null,
    valor_mensal double precision,
    valor_diaria double precision,
    chave_pix text,
    ativo boolean default true
);
create table if not exists public.folhas (
    id bigint not null default nextval('folhas_id_seq'::regclass),
    equipe_id bigint not null,
    mes_referencia text not null,
    tipo text not null,
    salario_base double precision not null,
    vales_total double precision default 0,
    valor_pago double precision not null,
    status text not null default 'PENDENTE'::text,
    dias_trabalhados integer default 0,
    chave_pix text,
    data_criacao timestamp with time zone default now(),
    despesa_id bigint
);
create table if not exists public.logs (
    uid uuid not null default uuid_generate_v4(),
    id bigint not null,
    tipo text not null,
    produto_nome text,
    quantidade numeric not null default 0,
    data text,
    observacao text,
    valor_total numeric default 0,
    cliente_nome text,
    forma_pagamento text,
    status text,
    status_entrega text,
    qtd_entregue numeric default 0,
    desconto numeric default 0,
    status_financeiro text,
    vencimento text,
    valor_pago numeric default 0,
    endereco_entrega text,
    produto_id bigint,
    cliente_id bigint,
    pgto_anotacao text,
    acrescimo numeric(12,2) not null default 0
);
create table if not exists public.mdf_agenda (
    id bigint not null default nextval('mdf_agenda_id_seq'::regclass),
    orcamento_id integer not null,
    data_agendada date not null,
    horario time without time zone not null,
    status varchar(20) default 'AGENDADO'::character varying,
    instalador_nome varchar(100),
    instalador_telefone varchar(20),
    observacoes text,
    foto_instalacao_url text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create table if not exists public.mdf_itens (
    id integer not null default nextval('mdf_itens_id_seq'::regclass),
    orcamento_id integer not null,
    nome text not null,
    descricao text,
    preco numeric(10,2) not null default 0,
    desconto numeric(10,2) default 0,
    foto_url text,
    created_at timestamp with time zone default now()
);
create table if not exists public.mdf_orcamentos (
    id integer not null default nextval('mdf_orcamentos_id_seq'::regclass),
    cliente_nome text not null,
    cliente_telefone text,
    cliente_email text,
    observacoes text,
    status text default 'ABERTO'::text,
    created_at timestamp with time zone default now(),
    desconto numeric(10,2) default 0,
    tipo_desconto varchar(1) default '$'::character varying,
    faturado boolean default false,
    cliente_id bigint
);
create table if not exists public.produtos (
    id bigint not null,
    nome text not null,
    categoria text,
    preco numeric not null default 0,
    estoque_fisico numeric not null default 0,
    estoque_comprometido numeric not null default 0,
    custo numeric(10,2) default 0,
    produto_parceiro boolean default false,
    fornecedor_parceiro text default ''::text,
    unidade_medida text default 'un'::text,
    venda_por_metro boolean not null default false
);
create table if not exists public.rvp_funcionarios (
    id bigint not null,
    nome text not null,
    telefone text,
    documento text,
    endereco text,
    data_admissao date,
    tipo_remuneracao text,
    valor_mensal numeric(10,2),
    valor_diaria numeric(10,2),
    valor_producao numeric(10,2),
    ativo boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    chave_pix text
);
create table if not exists public.usuarios (
    id bigint not null,
    nome text not null,
    login text not null,
    nivel_acesso text default 'vendedor'::text,
    ativo boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()),
    email text
);
create table if not exists public.vales (
    id bigint not null default nextval('vales_id_seq'::regclass),
    equipe_id bigint not null,
    valor double precision not null,
    data timestamp with time zone default now(),
    mes_referencia text not null
);

-- ---------- CONSTRAINTS ----------
alter table public.clientes add constraint clientes_pkey PRIMARY KEY (id);
alter table public.despesas add constraint despesas_pkey PRIMARY KEY (uid);
alter table public.equipe add constraint equipe_pkey PRIMARY KEY (id);
alter table public.folhas add constraint folhas_pkey PRIMARY KEY (id);
alter table public.logs add constraint logs_pkey PRIMARY KEY (uid);
alter table public.mdf_agenda add constraint mdf_agenda_pkey PRIMARY KEY (id);
alter table public.mdf_itens add constraint mdf_itens_pkey PRIMARY KEY (id);
alter table public.mdf_orcamentos add constraint mdf_orcamentos_pkey PRIMARY KEY (id);
alter table public.produtos add constraint produtos_pkey PRIMARY KEY (id);
alter table public.rvp_funcionarios add constraint rvp_funcionarios_pkey PRIMARY KEY (id);
alter table public.usuarios add constraint usuarios_pkey PRIMARY KEY (id);
alter table public.vales add constraint vales_pkey PRIMARY KEY (id);
alter table public.usuarios add constraint usuarios_login_key UNIQUE (login);
alter table public.equipe add constraint equipe_tipo_check CHECK ((tipo = ANY (ARRAY['Mensal'::text, 'Diarista'::text])));
alter table public.folhas add constraint folhas_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PAGO'::text])));
alter table public.folhas add constraint folhas_tipo_check CHECK ((tipo = ANY (ARRAY['Mensal'::text, 'Diarista'::text])));
alter table public.rvp_funcionarios add constraint rvp_funcionarios_tipo_remuneracao_check CHECK ((tipo_remuneracao = ANY (ARRAY['mensal'::text, 'diaria'::text, 'producao'::text])));
alter table public.despesas add constraint fk_despesas_equipe FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE SET NULL;
alter table public.folhas add constraint folhas_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE CASCADE;
alter table public.logs add constraint fk_logs_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
alter table public.logs add constraint fk_logs_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
alter table public.mdf_agenda add constraint mdf_agenda_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES mdf_orcamentos(id) ON DELETE CASCADE;
alter table public.mdf_itens add constraint mdf_itens_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES mdf_orcamentos(id) ON DELETE CASCADE;
alter table public.mdf_orcamentos add constraint fk_mdf_orcamentos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
alter table public.vales add constraint vales_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE CASCADE;

-- ---------- INDEXES ----------
create unique index if not exists clientes_pkey ON public.clientes USING btree (id);
create index if not exists idx_clientes_tipo ON public.clientes USING btree (tipo);
create unique index if not exists despesas_pkey ON public.despesas USING btree (uid);
create index if not exists idx_despesas_equipe_id ON public.despesas USING btree (equipe_id);
create unique index if not exists equipe_pkey ON public.equipe USING btree (id);
create unique index if not exists folhas_pkey ON public.folhas USING btree (id);
create index if not exists idx_folhas_equipe ON public.folhas USING btree (equipe_id);
create index if not exists idx_folhas_mes ON public.folhas USING btree (mes_referencia);
create index if not exists idx_logs_cliente_id ON public.logs USING btree (cliente_id);
create index if not exists idx_logs_produto_id ON public.logs USING btree (produto_id);
create unique index if not exists logs_pkey ON public.logs USING btree (uid);
create index if not exists idx_mdf_agenda_data ON public.mdf_agenda USING btree (data_agendada);
create index if not exists idx_mdf_agenda_orcamento ON public.mdf_agenda USING btree (orcamento_id);
create unique index if not exists mdf_agenda_pkey ON public.mdf_agenda USING btree (id);
create unique index if not exists mdf_itens_pkey ON public.mdf_itens USING btree (id);
create index if not exists idx_mdf_orcamentos_cliente_id ON public.mdf_orcamentos USING btree (cliente_id);
create unique index if not exists mdf_orcamentos_pkey ON public.mdf_orcamentos USING btree (id);
create unique index if not exists produtos_pkey ON public.produtos USING btree (id);
create unique index if not exists rvp_funcionarios_pkey ON public.rvp_funcionarios USING btree (id);
create unique index if not exists uq_usuarios_email ON public.usuarios USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (TRIM(BOTH FROM email) <> ''::text));
create unique index if not exists usuarios_login_key ON public.usuarios USING btree (login);
create unique index if not exists usuarios_pkey ON public.usuarios USING btree (id);
create index if not exists idx_vales_equipe_mes ON public.vales USING btree (equipe_id, mes_referencia);
create unique index if not exists vales_pkey ON public.vales USING btree (id);

-- ---------- FUNCTIONS ----------
CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(usuario_busca text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT email
    FROM public.usuarios
    WHERE lower(trim(login)) = lower(trim(usuario_busca))
      AND email IS NOT NULL
      AND trim(email) <> ''
    LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.fn_upper_produtos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Converte nome e categoria para maiúsculas, removendo espaços nas bordas
    NEW.nome := UPPER(TRIM(NEW.nome));
    NEW.categoria := UPPER(TRIM(NEW.categoria));
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_matricula_global()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Gera o próximo número da sequência global e armazena como texto
  NEW.matricula := nextval('global_matricula_seq')::text;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_fornecedor_upper_despesas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.fornecedor := UPPER(NEW.fornecedor);
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.uppercase_nome_produto()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Converter o campo 'nome' para maiúsculas
    NEW.nome = UPPER(NEW.nome);
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.uppercase_text_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Converte campos específicos de cada tabela
    -- Tabela: clientes
    IF TG_TABLE_NAME = 'clientes' THEN
        NEW.nome = UPPER(NEW.nome);
        NEW.telefone = UPPER(NEW.telefone);
        NEW.documento = UPPER(NEW.documento);
        NEW.endereco = UPPER(NEW.endereco);
    
    -- Tabela: produtos
    ELSIF TG_TABLE_NAME = 'produtos' THEN
        NEW.nome = UPPER(NEW.nome);
        NEW.categoria = UPPER(NEW.categoria);
        NEW.fornecedor_parceiro = UPPER(NEW.fornecedor_parceiro);
    
    -- Tabela: usuarios
    ELSIF TG_TABLE_NAME = 'usuarios' THEN
        NEW.nome = UPPER(NEW.nome);
        NEW.login = UPPER(NEW.login);
    
    -- Tabela: logs
    ELSIF TG_TABLE_NAME = 'logs' THEN
        NEW.produto_nome = UPPER(NEW.produto_nome);
        NEW.cliente_nome = UPPER(NEW.cliente_nome);
        NEW.observacao = UPPER(NEW.observacao);
        NEW.endereco_entrega = UPPER(NEW.endereco_entrega);
    
    -- Tabela: despesas
    ELSIF TG_TABLE_NAME = 'despesas' THEN
        NEW.item = UPPER(NEW.item);
        NEW.observacao = UPPER(NEW.observacao);
    END IF;

    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.valida_cnpj(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    d    int[];
    w1   int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
    w2   int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
    i    int;
    s    int;
    r    int;
BEGIN
    p := regexp_replace(p, '[^0-9]', '', 'g');
    IF length(p) <> 14 THEN RETURN false; END IF;
    SELECT array_agg((substr(p, g, 1))::int) INTO d FROM generate_series(1, 14) g;

    IF d[1] = d[2] AND d[3] = d[4] AND d[5] = d[6] AND d[7] = d[8]
       AND d[9] = d[10] AND d[11] = d[12] AND d[13] = d[14]
       AND d[1] = d[3] THEN RETURN false; END IF;

    -- 1o verificador
    s := 0;
    FOR i IN 1..12 LOOP s := s + d[i] * w1[i]; END LOOP;
    r := s % 11;
    IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
    IF r <> d[13] THEN RETURN false; END IF;

    -- 2o verificador
    s := 0;
    FOR i IN 1..13 LOOP s := s + d[i] * w2[i]; END LOOP;
    r := s % 11;
    IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
    RETURN r = d[14];
END $function$;
CREATE OR REPLACE FUNCTION public.valida_cpf(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    d    int[];
    i    int;
    s    int;
    r    int;
BEGIN
    p := regexp_replace(p, '[^0-9]', '', 'g');
    IF length(p) <> 11 THEN RETURN false; END IF;
    SELECT array_agg((substr(p, g, 1))::int) INTO d FROM generate_series(1, 11) g;

    -- rejeita sequencias repetidas (ex.: 111.111.111-11)
    IF d[1] = d[2] AND d[2] = d[3] AND d[3] = d[4] AND d[4] = d[5]
       AND d[5] = d[6] AND d[6] = d[7] AND d[7] = d[8] AND d[8] = d[9]
       AND d[9] = d[10] AND d[10] = d[11] THEN RETURN false; END IF;

    -- 1o verificador
    s := 0;
    FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
    r := (s * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    IF r <> d[10] THEN RETURN false; END IF;

    -- 2o verificador
    s := 0;
    FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
    r := (s * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    RETURN r = d[11];
END $function$;

-- ---------- TRIGGERS ----------
CREATE TRIGGER trigger_uppercase_clientes BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION uppercase_text_fields();
CREATE TRIGGER trg_fornecedor_upper_despesas BEFORE INSERT OR UPDATE OF fornecedor ON public.despesas FOR EACH ROW EXECUTE FUNCTION set_fornecedor_upper_despesas();
CREATE TRIGGER trigger_uppercase_despesas BEFORE INSERT OR UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION uppercase_text_fields();
CREATE TRIGGER trigger_mdf_agenda_updated_at BEFORE UPDATE ON public.mdf_agenda FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_uppercase_produtos BEFORE INSERT OR UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION uppercase_text_fields();

-- ---------- RLS ----------
-- Obs.: policies legadas que liberavam acesso anon/public foram omitidas
--       de proposito; o novo banco nasce somente com acesso authenticated.
alter table public.clientes enable row level security;
alter table public.despesas enable row level security;
alter table public.equipe enable row level security;
alter table public.folhas enable row level security;
alter table public.logs enable row level security;
alter table public.mdf_agenda enable row level security;
alter table public.mdf_itens enable row level security;
alter table public.mdf_orcamentos enable row level security;
alter table public.produtos enable row level security;
alter table public.rvp_funcionarios enable row level security;
alter table public.usuarios enable row level security;
alter table public.vales enable row level security;
create policy rls_authenticated_all on public.clientes for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.despesas for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.equipe for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.folhas for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.logs for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.mdf_agenda for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.mdf_itens for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.mdf_orcamentos for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.produtos for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.rvp_funcionarios for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.usuarios for ALL to authenticated using (true) with check (true);
create policy rls_authenticated_all on public.vales for ALL to authenticated using (true) with check (true);

-- ---------- GRANTS ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

