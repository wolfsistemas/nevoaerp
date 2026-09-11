# PLANO — Financeiro completo + Correção de desconto no estorno

Escopo fechado em 08/09/2026 com o cliente. Objetivo: implementar **uma única vez**, sem
mexer/backfillar dados existentes. Mudanças valem para **registros novos**.

---

## Decisões confirmadas

1. **Nada de baixa automática**: toda venda nasce `A RECEBER` (mesmo à vista) e aguarda
   **baixa manual** em Contas a Receber (mantém comportamento atual).
   No PDV as formas/valores informados são **só anotação** (não geram caixa nem status).
2. Colunas novas: **podem ser criadas** (DDL ok). Só evitar alterar/backfillar **dados**.
3. Parcelamento de venda: venda original vira `PARCELADO` + N títulos `receita` (1 por parcela).
4. Vendedor: deixar estrutura pronta para adicionar depois (coluna única, sem migração de dados).
5. Sistema e mobile atualizados **juntos e equivalentes**.

---

## Features (rotina de uso)

### A. Formas múltiplas de pagamento/recebimento
- **PDV (anotação)**: seção "Recebimento" com `Adicionar forma` (PIX, Dinheiro, Cartão Débito/Crédito,
  Boleto, Carteira, Cheque). Cada linha = forma + valor. Soma em tempo real vs total da venda.
  Ao salvar, grava anotação na venda (coluna nova `logs.pgto_anotacao`). Venda continua `A RECEBER`.
- **Baixa/edição Contas a Receber**: modal com `Adicionar forma` (1..N linhas). Cada forma vira um
  log `tipo:'recebimento'` (`observacao` = `Ref Lanc #<id>`), e o título atualiza 1 única vez
  `valor_pago`/status. Caixa soma os N logs.
- **Contas a Pagar**: modal de baixa de despesa com as mesmas N formas → N logs `tipo:'despesa'`.

### B. Desconto/Juros na baixa (Receber E Pagar)
- Campos **Desconto (R$)** e **Juros/Multa (R$)** no modal de baixa.
- Regra: `saldo = valor_original + juros_acum − desconto_acum − pago`.
  Pago menos que o devido hoje → fica **PARCIAL** (restante pendente).
- Persistência (registros novos):
  - `logs.acrescimo` (novo, default 0): juros/multa de cada baixa (log `recebimento`/`despesa`).
  - `logs.desconto` reaproveitado para o desconto da própria baixa (recebimento/despesa) — hoje não usado nessas linhas.
- Acumuladores no título:
  - Vendas (receber): linhas `venda` mantêm `valor_pago`; ajustes somados nas linhas de baixa.
  - Despesas (pagar): **novas colunas** `valor_pago`, `desconto_total`, `acrescimo_total` (default 0)
    na `despesas`; status `PENDENTE/PARCIAL/PAGO`. Regras:
    - `status='PAGO'` histórico (sem acumulador) continua exibido como quitado (não backfillar).
    - Atualizar só registros novos via modal de baixa.

### C. Parcelamento
- **Contas a Pagar**: ao lançar despesa, opção `Parcelar em N×` com intervalo (padrão 30 dias) +
  prévia das parcelas. Salvar gera **N despesas** (uma por parcela; `data`=vencimento;
  `observacao`=`Parcela i/N ...`). Id de cada parcela obtido do **banco** (máx+1), nunca do `getNextId` local.
- **Contas a Receber**: venda com `Parcelar em N×` → venda original marcada `status_financeiro='PARCELADO'`
  (estado novo em coluna de texto já existente) e gerados N títulos `tipo:'receita'`
  (`produto_nome`=`Parcela i/N — Venda #X`, `observacao`=`Parcela i/N Ref Venda #X`,
  valor=parcela, `status_financeiro='PENDENTE'`, `vencimento` próprio).
  - Listas de receber **ignoram** títulos `PARCELADO` (filtro).
  - Cada parcela é baixada individualmente (fluxo de título atual já suporta `receita`).

### D. Duplicar título (Contas a Pagar)
- Botão de cópia por despesa: insere nova despesa (categoria/fornecedor/valor iguais,
  vencimento +30 dias, status PENDENTE). Só em Contas a Pagar.

### E. Vendas por cliente / vendedor (fase futura)
- Histórico por cliente: tela filtrada por `cliente_id` (logs já tem tudo). Sem DDL.
- Vendedor: adicionar depois coluna única `usuario_id` (e/ou `usuario_nome`) nas vendas; hoje **não grava**.

---

## DDL a criar (1 migração, sem tocar em dados)

```sql
-- 1) logs: anotação de recebimento do PDV + juros/multa por baixa
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS pgto_anotacao text;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS acrescimo numeric(12,2) NOT NULL DEFAULT 0;

-- 2) despesas: acumuladores para baixa parcial (desconto/juros)
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS desconto_total numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS acrescimo_total numeric(12,2) NOT NULL DEFAULT 0;

-- 3) RLS: políticas ja cobrem novas colunas/tabelas (politica autenticado all). Nada a fazer.
-- Obs.: rodar somente DDL; sem UPDATE/backfill de linhas existentes.
```

`ADD COLUMN ... DEFAULT` no Postgres é só metadado (não reescreve a tabela) — não toca nos dados.

---

## Correção: desconto duplicado no estorno venda→orçamento

### Causa raiz
- Orçamento guarda item com valor **BRUTO** + desconto separado (`saveQuote` sistema.html:2479/2484);
  impressão = subtotal(bruto) − desconto → correto.
- Venda guarda item com valor **LÍQUIDO** (rateio por `fator`, sistema.html:2118/2160) e também o `desconto`.
- `cancelSaleToQuote` (sistema.html:2511) só troca `tipo` p/ orçamento: itens continuam líquidos, mas a
  renderização do orçamento subtrai desconto de novo no rodapé (`renderInvoice` sistema.html:4416-4470).
- `reprintSale` (sistema.html:5073) **não** tem o bug: reconstrói bruto (5077-5080).
- Mobile reproduz em `duplicarParaOrcamento` (mobile.html:2314).

### Correção (sem backfill)
Converter venda→orçamento recompondo o **bruto** de cada item, usando a mesma matemática do reprint:

```
netTotal  = Σ valor_total das linhas 'venda' (ignora linhas entrega)
grossTotal = netTotal + desconto
fator     = grossTotal / netTotal
bruto_i   = round(valor_total_i * fator, 2)   → distribuir sobra de centavos p/ Σ bruto = grossTotal
```

Aplicar em:
1. `cancelSaleToQuote` (sistema): antes de virar `orcamento`, atualizar cada `uid` com `valor_total` bruto
   (mantém `desconto` e `status_financeiro='$'` como tipo).
2. `duplicarParaOrcamento` (mobile): inserir as linhas orçamento já com valor bruto.
3. Revisar qualquer outro ponto venda→orçamento (ex.: editar venda para orçamento, se houver).

---

## Tarefas (sistema + mobile juntos)

1. **SQL**: migração DDL acima (sem backfill).
2. **Baixa de Contas a Receber** (modal `modal-receivable-edit` sistema.html:1113 / mobile.html:473):
   - campos Desconto + Juros/Multa;
   - lista de formas múltiplas (`Adicionar forma`);
   - gera N logs `recebimento` (valor/forma/desconto/acrescimo) e 1 update no título;
   - recalcula status (PAGO/PARCIAL/PENDENTE).
3. **PDV (anotação)** (sistema.html PDV): seção formas/valores; grava `logs.pgto_anotacao`; sem baixa automática.
4. **Contas a Pagar** (sistema `payExpense` 2954 / mobile `payExpense` 1387):
   - criar **modal de baixa** (valor, desconto, juros, data, formas múltiplas);
   - suportar **pagamento parcial** → status `PARCIAL` + acumuladores novos na `despesas`;
   - cada baixa gera N logs `tipo:'despesa'`.
5. **Parcelamento Pagar**: opção no cadastro de despesa + geração de N despesas.
6. **Parcelamento Receber**: opção no PDV/finalizar venda + marcação `PARCELADO` + N títulos `receita`;
   filtros das listas/relatórios ignoram `PARCELADO`; estorno remove parcelas vinculadas.
7. **Duplicar título** (Contas a Pagar): botão + insert cópia +30d.
8. **Estorno/estorno de recebimento**: tratar múltiplos logs por título (loop) — hoje alguns estornos
   (mobile, ex. `estornarDespesaLog` por `productName`) só acham 1 linha; padronizar por `observacao Ref ...`.
9. **Revisão de relatórios/extrato** para não contar 2x quando houver múltiplas linhas de baixa.

## Testes a fazer
- Venda à vista com 2 formas: continua `A RECEBER`; baixa manual com as formas → PAGO; caixa = soma.
- Baixa parcial com desconto/juros: saldo correto, status PARCIAL/PAGO.
- Despesa parcelada 3×: 3 contas; pagar parcial → PARCIAL com restante; pagar todo → PAGO.
- Venda parcelada 3×: venda `PARCELADO` some da lista; 3 títulos `receita` baixáveis; estorno volta estoque e limpa parcelas.
- Estorno de venda COM desconto → orçamento sem desconto duplicado (subtotal bruto − desconto = líquido).
- Duplicar título a pagar → cópia +30d PENDENTE.
- RLS intacta (autenticado); testes em sistema e mobile.

## Fora de escopo agora
- Registro/gravação de vendedor (estrutura pronta p/ coluna futura).
- Tela de histórico por cliente (fase seguinte).
- Correção do bug "folha paga nasce PENDENTE e permite pagar 2x" (equipe.js:498-537) — registrar como pendência.
- Consistência `despesas.id` (não único; sql/05) — mitigada com id via banco nas parcelas.
