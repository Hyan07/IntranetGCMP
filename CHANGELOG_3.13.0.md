# Changelog 3.13.0 DEV

## Performance

- Criado `20_SERVICE_PagePayload.gs` com a rota `page.payload` para consolidar dados iniciais por tela.
- Dashboard passa a carregar cartões, alertas, atividades e notificações em uma chamada da tela.
- Usuários passa a carregar lista inicial, notificações e contagem de solicitações cadastrais em uma chamada da tela.
- Pessoal passa a carregar lookups e lista inicial em uma chamada da tela.
- Administração passa a carregar configurações e, conforme a subaba ativa, permissões em massa ou auditoria inicial em uma chamada da tela.
- Ativado cache real de permissões por usuário em `getUserPermissionCodes_`, aproveitando a invalidação já existente após alterações administrativas.

## Migração Estrutural

- Criado `02_SCHEMA_MigrationRepository.gs` para planejar e aplicar normalização estrutural de cabeçalhos no DEV.
- `MigrationService_().dryRun()` agora inclui plano de abas com colunas ausentes, duplicadas e extras.
- `MigrationService_().apply()` aceita `operation: 'NORMALIZAR_SCHEMA_DEV'` apenas no DEV e somente com confirmação `APLICAR_MIGRACOES_DEV`.
- Cada aba normalizada recebe backup oculto antes da alteração.
- Colunas duplicadas são mescladas pela primeira célula preenchida e conflitos são relatados.
- Colunas extras duplicadas são preservadas com sufixo (`_2`, `_3`), evitando perda no corpo principal da aba.

## Compatibilidade

- Rotas antigas continuam disponíveis.
- Nenhuma regra de negócio foi removida ou alterada.
- Nenhuma migração executa automaticamente.
- Produção permanece fora do escopo desta versão.
