# Implantação rápida

## Cadastros iniciais

As importações embutidas de dados legados foram removidas deste pacote. Cadastre pessoas, usuários, viaturas e patrimônios pelas telas do sistema ou por migração documentada e aprovada separadamente.

## Limpar registros de teste

Em **Administração > Configurações gerais**, use **Zerar registros de teste** somente quando for iniciar a implantação definitiva. A operação cria um backup e preserva Usuários, Pessoal, permissões, configurações e toda a Frota.

## Publicar o sistema

1. Configure `.clasp.json` com o `scriptId`.
2. Execute `clasp push`.
3. Abra o projeto com `clasp open`.
4. Execute `instalarSistema()`; ele também cria `INTRANET_GCMP_FROTA` e o trigger diário.
5. Copie do registro de execução a senha temporária do MASP `000000-00`.
6. Implante como Aplicativo da Web, executando como o proprietário institucional.
7. Entre, troque a senha e configure usuários/permissões. Na Frota, além de `FROTA_ACESSAR`, libere somente as áreas e ações que cada usuário realmente utilizará.

Se o sistema já estava instalado, use `repararEstruturaSistema()` somente após backup. Depois confira com `diagnosticarModuloPatrimonio()`, `diagnosticarModuloFrota()` e `diagnosticarArquiteturaDev()` quando estiver no DEV.

Para atualizar: `clasp push`, execute o instalador/reparo e publique uma nova versão da implantação em **Implantar → Gerenciar implantações → Editar → Nova versão**.
