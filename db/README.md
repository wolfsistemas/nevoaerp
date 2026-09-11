# Clone da base RV PORTAL (preparo para multi-tenant)

Dump extraido do projeto Supabase **RV PORTAL** (`lyieiqhkspbowsrlngvn`) via Management API,
excluindo as tabelas com prefixo `jsp_` (sistema de ponto/obras, nao faz parte deste sistema).

## Arquivos

- `dump.sql` — schema completo + dados das 12 tabelas (executavel de uma vez).
- `raw/<tabela>.json` — dados brutos por tabela (para conferencia).
- `metadata.json` — metadados (colunas, constraints, indices, sequences, policies).

## Conteudo

| Tabela | Registros |
|---|---:|
| clientes | 2202 |
| despesas | 649 |
| equipe | 6 |
| folhas | 15 |
| logs | 2466 |
| mdf_agenda | 1 |
| mdf_itens | 94 |
| mdf_orcamentos | 19 |
| produtos | 186 |
| rvp_funcionarios | 5 |
| usuarios | 4 |
| vales | 10 |
| **Total** | **5657** |

Inclui: sequences, tabelas, PK/FK/CHECK/UNIQUE, indices, funcoes
(`buscar_email_por_usuario`, `valida_cpf`, `valida_cnpj`, `uppercase_text_fields`, etc.),
dados, setval das sequences, triggers e policies de RLS.

## Como restaurar num projeto novo

1. Crie um projeto Supabase vazio.
2. Abra o SQL Editor e rode o conteudo de `dump.sql`. Como o arquivo e grande (~2,7 MB),
   prefira o `psql`:

```bash
psql "postgresql://postgres:[SENHA]@db.[REF].supabase.co:5432/postgres" -f db/dump.sql
```

3. Confirme as sequences com `setval` (ja incluido no final do dump).

## Decisoes de limpeza (importante)

- As policies **legadas** que liberavam acesso publico/anon
  (`LiberaClientes`, `LiberaDespesas`, `LiberaLogs`, `LiberaProdutos`,
  `Enable read access for all users`) **nao** foram reproduzidas de proposito.
  Elas permitiam leitura por qualquer um com a chave publishable.
- O dump cria apenas a policy `rls_authenticated_all` (authenticated, `using(true)`)
  e revoga privilegios do `anon`. Esse e o ponto de partida para a migration multi-tenant.
- As tabelas `jsp_*` e suas sequences foram ignoradas.

## Aviso

Os dados contem informacao pessoal (nomes, CPF/CNPJ, telefone, endereco). Nao devem ser
publicados em repositorio publico. Ver `docs/plano-multitenant.md`.
