# Checklist - desvincular a RV

Objetivo: remover toda a marca, dados fixos e integracoes da RV, deixando o produto neutro
e pronto para white-label (documentos com dados da empresa contratante).

## 1. Identidade / textos ("RV Portal", "RV PORTAL MADEIRAS")

| Arquivo | Pontos |
|---------|--------|
| `manifest.json` | `name`, `short_name`, `start_url` (hoje `/rvportal/index.html`) |
| `index.html` | `<title>`, metas `application-name`/`apple-mobile-web-app-title`, logo e `<h1>` |
| `sistema.html` | `<title>`, metas e ~50 ocorrencias |
| `mobile.html` | title, metas, logo, `<h1>`, recibos e PDFs |
| `nova-senha.html` | title, logo, `<h1>` |
| `abas/equipe.js` | recibos/holerites (nome da empresa) |
| `abas/mdf.js` | `LOGO_RV_PORTAL` e PDFs |
| `js/relatoriodespesas.js` | nome/logo do relatorio |
| `README.md`, `db/README.md`, `docs/*` | referencias a RV |

## 2. Dados fixos da RV (endereco/CNPJ/telefone)

- "Rua Mineiros, 532 - Jatai/GO", "(64) 3636-4861", "CNPJ: 30.942.123/0001-02".
- Devem sair do codigo e vir de `empresas` (white-label).
- Ocorrencias conhecidas: `mobile.html`, `abas/equipe.js`, `abas/mdf.js`.

## 3. Logo

- `https://i.postimg.cc/52cvrkkP/LOGRVPORTAL.png` (usado em `index.html`, `mobile.html`,
  `nova-senha.html`, `abas/equipe.js`, `abas/mdf.js`, `js/relatoriodespesas.js`).
- Trocar por logo do produto e, nos documentos, pela logo da empresa contratante.

## 4. Integracoes especificas da RV

- `GAS_WEB_APP_URL` (Pix via Google Apps Script da RV) — remover ou virar plugin por empresa.
- `OCR_API_KEY` — usar chave do produto (nova) ou tornar config por empresa.
- Mensagens de WhatsApp ("aqui e da RV Portal") — usar nome da empresa.

## 5. Login / onboarding

- Remover "login curto" e o RPC `buscar_email_por_usuario` (com mapeamento de e-mails da RV).
- Migrar para login por e-mail + cadastro self-service.
- Remover/neutralizar a empresa piloto fixa em `db/migrations/12_multitenant.sql`
  (`RV Portal Madeiras`, id `a0000000-...-0001`).

## 6. Banco / marca

- `db/schema.sql`, `db/migrations/12_multitenant.sql`, `db/README.md` — tirar "RV".
- Plano default da empresa: generico (hoje a piloto nasce `enterprise`).

## 7. Verificacao final

- `grep -riE 'rv ?portal|madeiras|jata|postimg|LOGRV|30\.942|3636-4861'` deve retornar 0
  (fora do clone `rvportal/`).
- Build do GitHub Pages ok e smoke test de login/navegacao.
