# rvportalpreparo

Ambiente de preparacao do RV Portal para multi-tenant. **Contexto (importante):**

- A partir de agora **nao acessamos mais a base de producao da RV** (`lyieiqhkspbowsrlngvn`).
- Base de teste: **basedetestes** (`jcgkgvqrluvvglenxumb`), zerada e recriada somente com a
  **estrutura** das tabelas.
- **Nenhum dado real e copiado**: trabalhamos apenas com o schema (DDL).
- Base nova, repo novo, apenas para testes.

## Estrutura

- `db/schema.sql` — estrutura completa das 12 tabelas (0 registros).
- `db/metadata.json` — metadados da estrutura.
- `db/migrations/12_multitenant.sql` — ativacao do multi-tenant.
- `docs/plano-multitenant.md` — plano de ativacao.

## Base de teste

12 tabelas, 0 registros, 10 funcoes, 5 triggers, 8 sequences, RLS habilitada nas 12 tabelas.
Estrutura validada como identica a da base original (somente colunas/objetos).
