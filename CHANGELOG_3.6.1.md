# Versão 3.6.1 — Correção da pesquisa e exportação

## Pesquisa de usuários

- Botão explícito **Pesquisar** e pesquisa ao pressionar Enter.
- Reconhecimento de aspas duplas, simples e tipográficas: `"termo"`, `'termo'`, `“termo”` e `‘termo’`.
- Exibição dos filtros efetivamente aplicados logo abaixo da pesquisa.
- Proteção contra respostas antigas: uma consulta anterior não pode mais sobrescrever o resultado da consulta mais recente.
- O botão **Exportar** utiliza exatamente os filtros já aplicados à tabela.

## Exportação

- O CSV passa a ser preparado no servidor, fora do iframe do HTML Service.
- O clique abre uma janela de preparação e inicia o download pelo próprio endereço do Web App.
- Se o navegador bloquear a janela, o sistema exibe um botão manual com o link do arquivo.
- O link é individual, de uso único e expira em cinco minutos.
