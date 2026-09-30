# Relatorio Névoa Obra

Implantacao aditiva do segmento Obra no SaaS Névoa (repo BASE). ERP existente permanece intacto.

## 1. Resumo por fase

| Fase | Status | O que foi feito |
|---|---|---|
| F0 — Exploracao | Concluida | Brief lido; BASE mapeado; RV clonado em `/tmp/rvnegocios` (read-only). |
| F1 — Schema | Concluida | Migracoes 30–34 criadas; 30–34 aplicadas na base de teste. |
| F2 — Nucleo JS | Concluida | `js/obra/equipe-core.js`, `api.js`, `contrato.js`. |
| F3 — Telas desktop | Concluida | Obras, equipe/ponto, terceirizados, fornecedores, OC, precos, gerencial. |
| F4 — Gating | Concluida | `data-segmento` no menu; `renderEquipe` ERP vs Obra; papéis; superadmin. |
| F5 — Financeiro | Concluida | Cadeia despesa+log em ponto, medicao, producao e OC. Estorno marca ESTORNADO, reabre origem, nunca apaga. Gerencial ignora estornados. |
| F6 — Planos | Concluida (codigo) | Planos no catalogo; landing com abas ERP/Obra; cadastro com optgroups. Trial/checkout MP de obra ainda precisa de teste manual autenticado. |
| F7 — Testes desktop | Parcial | Schema/RPCs validados na base de teste. Isolamento RLS e billing de obra exigem login de duas empresas. |
| F8 — Mobile | Concluida (codigo) | Ponto (entrada/saida/ajuste) e medicao no `mobile.html`; gating por segmento. |

## 2. Arquivos criados / alterados

### Criados
- `db/migrations/30_segmento_planos.sql`
- `db/migrations/31_obra_schema.sql`
- `db/migrations/32_obra_extensoes.sql`
- `db/migrations/33_obra_seed_opcional.sql`
- `db/migrations/34_obra_estorno_status.sql`
- `js/obra/equipe-core.js`
- `js/obra/api.js`
- `js/obra/contrato.js`
- `js/obra/mobile-obra.js`
- `abas/obra/obras.js`
- `abas/obra/equipe-obra.js`
- `abas/obra/terceirizados.js`
- `abas/obra/fornecedores.js`
- `abas/obra/oc.js`
- `abas/obra/precos.js`
- `abas/obra/gerencial-obra.js`
- `RELATORIO-nevoa-obra.md`

### Alterados
- `sistema.html` — nav `data-segmento`, views e scripts de obra
- `mobile.html` — nav Ponto/Medicao, gating por segmento
- `landing.html` — abas ERP/Obra + `mostrarPlanos()`
- `cadastro.html` — optgroups ERP/Obra
- `superadmin.html` — coluna segmento
- `abas/assinatura.js` — segmento + recursos de obra
- `abas/equipe.js` — despacha para `renderEquipeObra` se segmento=obra
- `abas/configuracoes.js` — exibe segmento
- `js/papeis.js` — vendedor acessa telas essenciais de obra

`config.js` nao foi alterado (placeholders).

## 3. Migracoes

| Arquivo | Aplicada? | Onde |
|---|---|---|
| `30_segmento_planos.sql` | Sim | projeto teste `jcgkgvqrluvvglenxumb` (`basedetestes`) |
| `31_obra_schema.sql` | Sim | idem |
| `32_obra_extensoes.sql` | Sim | idem |
| `33_obra_seed_opcional.sql` | Sim (no-op `select 1`) | idem |
| `34_obra_estorno_status.sql` | Sim | idem (`ESTORNADO` em `medicoes_empreita` e `producao_terc`) |

Producao: **nao aplicada**. Credencial/ref de producao continua `TODO(dono)`.

RPCs conferidas na base de teste: `minha_assinatura`, `sa_listar_planos` e `sa_listar_empresas` incluem `segmento`.

Planos no catalogo:
- ERP: essencial 49 / profissional 389,90 / enterprise 447
- Obra: `obra_essencial` 129,90 (ate 2 usuarios) / `obra_profissional` 199,90 (ate 5) / `obra_enterprise` 299,90 (ilimitado). Todos com os mesmos recursos.

Tabelas novas: `obras`, `obras_fases`, `terceirizados`, `ponto_diario`, `producao_terc`, `medicoes_empreita`, `fornecedores`, `historico_precos`, `ordens_compra`, `ordens_compra_itens`.

## 4. Defaults adotados (brief 4.2)

- Planos de obra: 129,90 / 199,90 / 299,90 (anual = 10x). Todos com os mesmos recursos, diferenciados so pela quantidade de usuarios (2 / 5 / ilimitado).
- Segmento dos planos de obra: `obra` (nao `ambos`).
- Mesma landing, abas ERP/Obra.
- Ponto: manual + CSV `data_hora;tipo`. Sem relogio externo.
- Jornada: manha 07–11 / tarde 13–17; cada periodo presente = 0,5 diaria.
- OC: tabelas proprias; ao confirmar, espelha em `logs` (`tipo='compra'`) + `historico_precos`.
- Equipe compartilhada; check de `tipo` ampliado para `Mensal|Diarista|Diaria|Empreita|Terceirizado`.
- `rvp_funcionarios` intacta.
- Seed 33 so com exemplos comentados.

## 5. Pendencias `TODO(dono)`

- Credencial e ref do Supabase de **producao**.
- Confirmacao de precos dos planos de obra.
- Dump de schema do RV (DDL de ponto/medicao/producao e proposta).
- Token GitHub para push — **so depois do preview aprovado**.
- Teste autenticado de trial/checkout MP de plano de obra.
- Empresa piloto de obra (ERP piloto `a0000000-0000-4000-8000-000000000001` permanece ERP).

Nao ha `TODO(dono)` no codigo; as pendencias ficam neste relatorio.

## 6. Como testar (criterios da secao 15)

Preview local: `https://8000-a1a11ed35bc27a23.monkeycode-ai.live`
(landing `/landing.html`, sistema `/sistema.html`, mobile `/mobile.html`, cadastro `/cadastro.html`).

1. **Superadmin define plano/segmento**
   - Abrir `superadmin.html`, listar planos (coluna segmento) e empresas.
   - Definir assinatura de uma empresa para `obra_profissional`.
   - Recarregar o sistema dessa empresa: menu Obra visivel, menu ERP oculto.

2. **Empresa plano Obra**
   - Login na empresa com plano obra.
   - Confirmar: Obras, Equipe (variante ponto/empreita), Terceirizados, Fornecedores, OC, Precos, Financeiro, Gerencial.
   - Equipe nao mostra folha/vales; mostra ponto, medicao e cadastro Diaria/Empreita/Terceirizado.

3. **Empresa plano ERP**
   - Login na empresa piloto ERP.
   - PDV, expedicao, orcamentos, MDF, equipe folha, financeiro e gerencial iguais ao atual.
   - Itens de obra ocultos.

4. **Isolamento por empresa**
   - Duas sessoes (empresas A e B).
   - A cadastra uma obra; B nao ve no select.
   - Tentativa de insert com `empresa_id` de A logado como B deve falhar na RLS.

5. **`empresa_id` automatico**
   - Insert de obra/ponto sem `empresa_id` no payload.
   - Conferir na tabela: `empresa_id` = empresa do usuario (`trg_set_empresa`).

6. **Ponto / medicao / OC**
   - Bater entrada+saida (ou ajuste 0,5/1,0) -> filtrar periodo -> Fechar periodo -> `despesas` com `obra_id` e `categoria='ponto'`.
   - Lancar medicao empreita -> Pagar -> `despesas` `categoria='empreita'`.
   - Producao terceirizado PAGO -> despesa.
   - OC CONFIRMAR -> `logs` `tipo='compra'` + linha em `historico_precos`.

7. **Custo / estorno**
   - Gerencial de obra: soma bate com despesas/logs da obra.
   - Estornar fechamento: status ESTORNADO / registro permanece; nao usar delete.

8. **Billing de plano de obra**
   - Cadastro com `?plano=obra_profissional` (14 dias trial).
   - Checkout MP (mensal/anual) e inadimplencia: escrita bloqueada pelo trigger existente.
   - `minha_assinatura()` deve devolver `segmento='obra'`.

9. **Segredos**
   - `config.js` so placeholders. Nenhuma chave no git.

10. **Um repo, dois segmentos**
    - Sem duplicar `equipe`/`logs`/`despesas`/`clientes`/`produtos`/`usuarios`.
    - Telas novas so em `abas/obra/` e `js/obra/`.

Mobile: com segmento obra, nav mostra Ponto e Medicao; ERP some. Batida, ajuste, estorno de batida pendente e lancamento/% com teto 100% usam as mesmas tabelas. Medicao PAGA so estorna no desktop (cadeia financeira).

## 8. Cadeia fazer / desfazer (pedido do dono)

Regra: nunca `delete` em ponto, medicao, producao, despesa, log ou OC. Falha no vinculo estorna o financeiro gerado.

| Rotina | Grava | Desfaz |
|---|---|---|
| Fechar ponto | `despesas`+`logs` (`Ref Despesa #id`); batidas `pago_em_fechamento` | Estorno: financeiro ESTORNADO; batidas reabertas |
| Pagar medicao | idem, medicao `PAGO` | Estorno: financeiro ESTORNADO; medicao `ESTORNADO` |
| Pagar producao | idem, metros `PAGO` | Estorno pgto: financeiro ESTORNADO; metros voltam `PENDENTE` |
| Confirmar OC | `logs tipo=compra` + `historico_precos` | Estorno: log ESTORNADO; OC `CANCELADA`; historico permanece |
| Batida / metros / medicao pendente | insert | status `ESTORNADO` |
| Fase de obra | insert | nome `(removida)` (sem delete) |

Gerencial e extrato somam so o que nao esta ESTORNADO. Check SQL 34 aceita `ESTORNADO` em `medicoes_empreita` e `producao_terc`.

## 7. Riscos e o que ficou de fora

- DDL de `ponto_diario` / `medicoes_empreita` / `producao_terc` e proposta (sem dump RV).
- Meio-periodo 0,5 assume jornada fixa; nao ha tela de parametrizacao no MVP.
- Ponto eletronico externo nao entra no MVP (manual + CSV).
- Trial/checkout MP de obra nao foi exercitado com usuario real nesta sessao.
- Isolamento A/B e inadimplencia exigem dois logins; nao automatizado.
- SQL **nao** rodou em producao.
- Push GitHub bloqueado ate o preview ser aprovado e o token enviado.
- `empresas.plano` (texto) nao e fonte da verdade; usar `assinaturas.plano_codigo`.
- Tabela de itens de OC: `ordens_compra_itens` (nao `oc_itens`).

## Preview

Servidor local na porta 8000.

- Landing: `https://8000-a1a11ed35bc27a23.monkeycode-ai.live/landing.html`
- Cadastro: `https://8000-a1a11ed35bc27a23.monkeycode-ai.live/cadastro.html`
- Sistema: `https://8000-a1a11ed35bc27a23.monkeycode-ai.live/sistema.html`
- Mobile: `https://8000-a1a11ed35bc27a23.monkeycode-ai.live/mobile.html`

Nao houve push. Quando o preview estiver ok, envie o token GH.
