# Versão 3.6.0 — Perfis, filtros e aprovação cadastral

## Usuários

- Botão **Ver perfil completo** com dados da conta, cadastro pessoal e funcional, permissões, sessões e solicitações cadastrais.
- Pesquisa combinada com vários filtros e frases entre aspas, por exemplo: `"Operacional" "ATIVO" "Almeida"`.
- Todos os termos informados precisam corresponder ao mesmo usuário.
- Pesquisa preserva a tolerância ao MASP com ou sem zero inicial e hífen.
- Botão **Exportar** gera CSV com todos os usuários correspondentes aos filtros ativos.
- Administradores com `pessoal.editar` recebem a área **Alterações pendentes** para aprovar ou recusar solicitações.

## Minha Conta

- O usuário pode visualizar seus dados pessoais e funcionais completos.
- O formulário permite solicitar correções de identificação, contato, endereço, documentação e dados funcionais.
- A alteração fica pendente e não modifica o cadastro oficial antes da aprovação.
- O próprio solicitante não pode aprovar sua solicitação, mesmo que seja administrador.
- Após aprovação, os dados são sincronizados entre Pessoal e Usuários e registrados no histórico funcional e na auditoria.

## Permissões em massa

- Conferência final diretamente na planilha `USUARIO_PERMISSOES` após a gravação.
- Resultado detalhado por usuário, separando permissões novas, reativadas e já existentes.
- A interface informa explicitamente quantas concessões foram verificadas.
- Usuários já conectados sincronizam automaticamente os novos acessos ao voltar para a janela e também em verificação periódica, sem exigir novo login.

## Instalação

- Nova aba `SOLICITACOES_ATUALIZACAO` na planilha de Pessoal.
- Execute uma vez `instalarAtualizacaoPerfilUsuarios()` após o `clasp push`.
