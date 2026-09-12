# Estrutura do RV Portal (somente schema, sem dados)

Clone **apenas da estrutura** (DDL) das 12 tabelas do RV Portal, para recriar o sistema no
ambiente de teste zerado. **Nenhum dado real e copiado ou salvo aqui.**

Excluidas as tabelas com prefixo `jsp_` (sistema de ponto/obras, nao faz parte deste sistema).

## Arquivos

- `schema.sql` — estrutura completa: sequences, tabelas, PK/FK/CHECK/UNIQUE, indices,
  funcoes, triggers, RLS e grants. Sem nenhum `insert`.
- `metadata.json` — metadados (colunas, constraints, indices, sequences, policies).
- `migrations/12_multitenant.sql` — ativacao do multi-tenant (empresa_id + RLS).
- `migrations/13_signup.sql` — cadastro self-service: perfil da empresa + RPC
  `criar_empresa_e_admin` (cria empresa e usuario admin).

## Tabelas (12)

`clientes, despesas, equipe, folhas, logs, mdf_agenda, mdf_itens, mdf_orcamentos,
produtos, rvp_funcionarios, usuarios, vales`

Objetos criados: 10 funcoes, 5 triggers, 8 sequences, RLS habilitada nas 12 tabelas.

## Onde foi aplicado

Base de teste **basedetestes** (`jcgkgvqrluvvglenxumb`) — recriada do zero com
`schema.sql` (12 tabelas, 0 registros).

## Como reaplicar

1. Em um projeto Supabase vazio, rode o `schema.sql` no SQL Editor, ou:

```bash
psql "postgresql://postgres:[SENHA]@db.[REF].supabase.co:5432/postgres" -f db/schema.sql
```

2. Depois, para multi-tenant: `db/migrations/12_multitenant.sql`.

## Decisoes de limpeza (importante)

- As policies **legadas** que liberavam acesso publico/anon
  (`LiberaClientes`, `LiberaDespesas`, `LiberaLogs`, `LiberaProdutos`,
  `Enable read access for all users`) **nao** foram reproduzidas.
  O schema nasce apenas com a policy `rls_authenticated_all` (authenticated) e com o
  `anon` sem privilegios.
- Nenhum dado de producao foi mantido no repositorio.
