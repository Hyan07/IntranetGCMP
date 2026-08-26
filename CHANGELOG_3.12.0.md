# Changelog 3.12.0 DEV

## Arquitetura

- Migrados os Services e módulos de negócio restantes para `RepositoryBase` e Repositories de domínio.
- Removidos acessos diretos a Google Sheets fora das camadas permitidas em Frota, Perfil, Permissões e importação inicial de Patrimônio.
- Adicionado `repositoryUpdateMany_` para gravações em lote por blocos contíguos, preservando `_row` e invalidando cache.
- Adicionado `repositoryAssertInstalled_` para validar abas físicas sem expor `getSheetByName()` aos Services.
- Adicionado `repositoryFlush_` para centralizar o flush do Apps Script.
- Movido o relatório reverso do Histórico da Frota para `FrotaRepository_().reverseReport`.
- Transformada a regra arquitetural em teste automatizado: Services não podem chamar helpers legados nem `SpreadsheetApp`/`getRange()` diretamente.

## Compatibilidade

- Nenhuma regra de negócio foi alterada.
- Nenhuma rota, tela, permissão ou fluxo foi removido.
- O pacote continua apontando somente para DEV.
- Produção permanece fora do escopo desta versão.
