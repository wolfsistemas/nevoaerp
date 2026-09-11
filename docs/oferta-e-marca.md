# Oferta e marca

## Posicionamento

ERP generico para pequenas e medias empresas (PME) brasileiras. Nao e um sistema de nicho:
atende comercio e servicos com venda (PDV), estoque, financeiro, clientes, orcamentos e
equipe. O modulo de MDF/marcenaria (herdado do RV) passa a ser **add-on opcional**.

Mensagem central: "Toda a gestao do seu negocio num so lugar, sem complicacao."

## Nomes sugeridos

**Nome escolhido: Névoa.** Dominio `nevoa.com.br` sem DNS (indicio de disponibilidade);
`nevoa.com` esta ocupado. Tagline: "Toda a gestao do seu negocio, leve como uma nuvem."

Historico da avaliacao (checagem de DNS apenas como indicio; confirmar no registro.br):
`orbeerp` e `zeraerp` tambem nao responderam; `nexoerp`, `verta`, `meuerp`, `fluxoerp`
ja estao ocupados.

| Nome | Tagline | Racional | DNS |
|------|---------|----------|-----|
| **Orbe ERP** (recomendado) | "Toda a gestao do seu negocio na mesma orbita." | Curto, brandavel, nao preso a nicho; simbolo de orbita/anel | orbeerp.com.br e .com sem DNS |
| **Zera ERP** | "Organize seu negocio do zero." | Remete a comecar/zerar; bom para quem sai da planilha | zeraerp.com.br sem DNS |
| **Konta** | "Do caixa ao estoque, sem complicacao." | Foco financeiro; facil de falar | konta.com.br sem DNS |
| **Prisma ERP** | "Cada area do negocio, num so foco." | Moderno, tecnologico | verificar |
| **Vertice ERP** | "Sua gestao no ponto mais alto." | Solido, corporativo | verificar |

## Identidade visual (proposta)

- Primaria: azul profundo (`#1D4ED8`) — confianca/gestao.
- Acento: ambar (`#F59E0B`) — acao/destaque.
- Neutros: slate. Tipografia: Inter (ou system-ui).
- Logo: anel/orbita (Orbe). O app hoje usa verde esmeralda (marca RV), sera trocado.

## Planos (estrutura sugerida; ajustar precos)

| Plano | Preco/mes | Inclui |
|-------|-----------|--------|
| Essencial | R$ 149 | 1 filial, ate 3 usuarios, PDV/vendas, estoque, clientes, financeiro, orcamento simples |
| Profissional | R$ 297 | ate 10 usuarios, relatorios, equipe/folha, PDFs, suporte por e-mail/WhatsApp |
| Enterprise | R$ 597 | usuarios e filiais ilimitados, API, dominio/white-label, suporte prioritario |

- Add-on: modulo MDF/marcenaria.
- Implantacao opcional: R$ 500 a 1.500.

## White-label dos documentos (importante)

Hoje recibos, holerites, orcamentos e relatorios trazem **nome, endereco e CNPJ da RV**
fixos no codigo. Num ERP vendavel, esses documentos devem puxar os dados da **empresa
contratante** (tabela `empresas`: `nome`, `logo_url`, `cnpj`, `endereco`, `telefone`).
A marca do produto aparece so na interface/login.

## Proximo passo

1. Nome escolhido: **Névoa**.
2. Desvinculo da RV: primeira passada concluida (marca, dados fixos e integracoes).
3. Ainda pendente: documentos com dados da empresa contratante (white-label) e cadastro
   self-service (empresa + admin).
