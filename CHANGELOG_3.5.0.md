# Versão 3.5.0 — Permissões em massa

## Administração

- Nova subaba **Permissões em massa** dentro de Administração.
- Pesquisa e seleção de vários usuários por nome, MASP, setor, função ou e-mail.
- Pesquisa e seleção de permissões, agrupadas por módulo.
- Ações para selecionar todos os resultados exibidos, selecionar um módulo inteiro e limpar a seleção.
- Resumo da quantidade de usuários, permissões e combinações antes da confirmação.
- Campo opcional de justificativa administrativa e registro completo na auditoria.

## Segurança e integridade

- A operação exige simultaneamente `configuracoes.gerenciar` e `usuarios.gerenciar_permissoes`.
- A concessão em massa apenas adiciona ou reativa permissões; acessos existentes não são removidos.
- Novos vínculos são gravados em lote e o cache de permissões dos usuários afetados é invalidado.
- Não há alteração de planilhas, abas ou cabeçalhos nesta versão.
