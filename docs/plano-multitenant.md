# Plano de ativacao do multi-tenant

Objetivo: transformar o RV PORTAL (hoje single-tenant, um projeto Supabase por cliente)
em multi-tenant (uma base atendendo N empresas com isolamento por RLS), reaproveitando as
mesmas 12 tabelas.

Base de partida: projeto de teste **basedetestes**, recriado do zero apenas com a estrutura
(`db/schema.sql`), sem dados.

---

## Conceito

Todas as linhas ganham dono por meio de uma coluna `empresa_id`. Uma empresa nova = um
registro em `empresas` + usuarios vinculados. A RLS garante que cada usuario autenticado
so enxerga linhas da propria empresa. O frontend continua chamando
`sb.from('clientes').select()` sem filtro; o banco filtra.

Tabelas que recebem `empresa_id` (12):
`clientes, despesas, equipe, folhas, logs, mdf_agenda, mdf_itens, mdf_orcamentos,
produtos, rvp_funcionarios, usuarios, vales`.

---

## Fase 0 - Preparacao do banco de teste

1. Aplicar `db/schema.sql` (somente estrutura; sem dados).
2. Conferir que as policies legadas de acesso publico nao existem (o schema ja nao as cria).
3. Base zerada: nao ha backup de dados a fazer.

## Fase 1 - Tabela de empresas e coluna discriminadora

Arquivo: `db/migrations/12_multitenant.sql`.

- Cria `public.empresas (id uuid pk, nome, slug, plano, ativo, criado_em)`.
- Adiciona `empresa_id uuid` em cada uma das 12 tabelas (nullable nesta etapa).
- Cria indice em `empresa_id` de cada tabela.

## Fase 2 - Identidade da empresa na sessao

Funcao `public.empresa_do_usuario()` (SECURITY DEFINER), que resolve o `empresa_id` a
partir do e-mail do JWT do Supabase Auth:

```sql
select empresa_id from public.usuarios
where lower(trim(email)) = lower(auth.jwt() ->> 'email')
limit 1;
```

Por ser SECURITY DEFINER, ela ignora a RLS (evita recursao ao ser usada em policy de
`usuarios`). E o equivalente multi-tenant do `buscar_email_por_usuario` (sql/09).

## Fase 3 - Empresa piloto (opcional na base zerada)

Como a base de teste esta **sem dados**, esta fase e um no-op (nenhuma linha para
atribuir). O bloco fica no fim de `12_multitenant.sql` para quando houver dados a migrar:
cria a empresa "RV Portal Madeiras" e aponta as linhas sem `empresa_id` para ela.

## Fase 4 - RLS por empresa

Substitui a policy atual `rls_authenticated_all` por `tenant_isolation`:

```sql
create policy tenant_isolation on public.<tabela>
for all to authenticated
using (empresa_id = public.empresa_do_usuario())
with check (empresa_id = public.empresa_do_usuario());
```

`USING` filtra leitura/alteracao/exclusao; `WITH CHECK` impede gravar linha de outra
empresa. O `anon` permanece sem privilegio.

## Fase 5 - Preenchimento automatico no INSERT

Trigger `set_empresa_id` em cada tabela preenche `empresa_id` quando o app nao envia,
usando `empresa_do_usuario()`. Assim o frontend nao precisa mudar os `insert` existentes.

## Fase 6 - Ajustes de unicidade e indices

- `usuarios.login` continua UNIQUE global (necessario para `buscar_email_por_usuario`).
  No medio prazo, migrar login para e-mail (identidade do Auth e global no projeto).
- `uq_usuarios_email` continua global: um e-mail so pertence a uma empresa por projeto.
- Criar indices compostos onde houver filtro por empresa + campo (ex.:
  `logs(empresa_id, data)`, `clientes(empresa_id, nome)`).
- `despesas.id` e `logs.id` sao "id legivel" gerado no cliente (`getNextId`). No
  multi-tenant o calculo deve ser `max(id)+1` **dentro da empresa** (ajuste no frontend).
  A chave real continua `uid`.

## Fase 7 - Frontend

1. Login: apos autenticar, carregar `usuarios.empresa_id` e guardar na sessao.
2. Nenhuma consulta precisa mudar: a RLS filtra por empresa.
3. Inserts podem omitir `empresa_id` (trigger preenche).
4. Nova tela "Empresas" (super-admin) para criar/gerenciar clientes do SaaS.
5. `config.js`/secrets: cada deploy com a URL/chave do projeto compartilhado.
6. Remover hardcodes: `abas/mdf.js:9` (URL/chave), `sistema.html:7048` (OCR key),
   `sistema.html:7467` (GAS/Pix).

## Fase 8 - Testes obrigatorios

- Usuario da empresa A nao le/grava nada da empresa B (select e insert).
- Criar empresa B, usuario B, e repetir fluxos basicos (PDV, financeiro, equipe).
- `anon` continua bloqueado (chave publishable nao le tabela nenhuma).
- Fluxos de login, folha, parcelamento e estorno intactos.

## Rollback

Tudo em transacao (`begin ... commit`). Para desfazer antes do commit: `rollback`.
Depois do commit: `drop` das policies `tenant_isolation`, recriar `rls_authenticated_all`,
e opcionalmente remover as colunas `empresa_id` e a tabela `empresas`.

## Riscos e decisoes

- Isolamento depende 100% de RLS correta: qualquer tabela nova precisa de `empresa_id` e
  policy. O `rls_auto_enable` (event trigger) ja ajuda a habilitar RLS automaticamente.
- Dados sensiveis (CPF, endereco, telefone) passam a conviver no mesmo banco: exige
  auditoria, backup por empresa e politica de LGPD.
- E-mail unico global limita a mesma pessoa em duas empresas; avaliar login por
  `empresa + email` numa fase 2.

---

## Ordem de execucao na base de teste

```sql
-- 1) criar a estrutura (sem dados)
\i db/schema.sql

-- 2) aplicar multi-tenant (schema + RLS + triggers; backfill so se houver dados)
\i db/migrations/12_multitenant.sql
```

Depois: ajustar o frontend (Fase 7) e rodar os testes da Fase 8.
