# Névoa

ERP de gestao para pequenas e medias empresas (PME).
Frontend estatico (HTML + JS vanilla + Tailwind + Supabase + three.js/pdfmake/Tesseract).

## Contexto deste repositorio (importante)

- **Base de teste**: `basedetestes` (`jcgkgvqrluvvglenxumb`).
- **Nao acessamos mais a base de producao da RV** (`lyieiqhkspbowsrlngvn`).
- **Nenhum dado real** e copiado ou mantido aqui: apenas schema (DDL).
- Base nova, repositorio novo, apenas para testes e preparacao do multi-tenant.

## Estado da base de teste

- 12 tabelas de negocio + `empresas` (0 registros).
- **Multi-tenant ativo**: `empresa_id` (NOT NULL) nas 12 tabelas, RLS com policy
  `tenant_isolation`, trigger `trg_set_empresa` e funcao `empresa_do_usuario()`.
- Empresa piloto: RV Portal Madeiras (`a0000000-0000-4000-8000-000000000001`).
- Estrutura original validada como identica (colunas/objetos) antes da migration.

## Estrutura

- `index.html` — login (RPC `buscar_email_por_usuario` + Supabase Auth).
- `sistema.html` — aplicacao desktop.
- `mobile.html` — aplicacao mobile.
- `nova-senha.html` — redefinicao de senha.
- `config.js` — placeholders publicos injetados no deploy (GitHub Actions secrets).
- `abas/` — modulos (mdf, equipe, gerencial, agenda).
- `js/` — relatorios/calculadoras.
- `sql/` — migrations do sistema original (01..06, 08..11). O `07` foi removido por
  conter ~1032 enderecos reais de clientes (PII).
- `db/` — schema limpo (sem dados) + `migrations/12_multitenant.sql`.
- `docs/` — planos (multi-tenant, financeiro).

## Segredos / configuracao

`config.js` tem apenas placeholders (`__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`,
`__OCR_API_KEY__`, `__GAS_WEB_APP_URL__`). O workflow do GitHub Pages injeta os valores
a partir de **repository secrets**:

- `SUPABASE_URL` e `SUPABASE_ANON_KEY` (obrigatorios)
- `OCR_API_KEY` e `GAS_WEB_APP_URL` (opcionais)

Nenhuma chave real fica no codigo.

## Multi-tenant

Ver `docs/plano-multitenant.md`.
