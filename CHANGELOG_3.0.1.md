# Versão 3.0.1 — correções da Frota e navegação

## Frota

- A liberação de uma viatura após resolver um defeito agora verifica a movimentação de KM realmente aberta, em vez de bloquear por um identificador antigo.
- Um identificador de movimentação encerrada é limpo quando a viatura volta para `DISPONIVEL`.
- A viatura continua protegida contra liberação quando existe movimentação aberta ou outro defeito impeditivo pendente.
- A tela informa claramente se a viatura foi liberada ou por qual motivo a liberação foi impedida.
- Ao selecionar `RESOLVIDO`, a opção de retornar a viatura para disponível é marcada automaticamente.

## Navegação

- Resultados assíncronos de páginas antigas não tentam mais alterar a página atual.
- As telas de Frota e Patrimônio verificam se o elemento ainda existe antes de atualizar seu `innerHTML`.
- Corrigida a falha intermitente que exigia recarregar a página após navegar entre abas.
