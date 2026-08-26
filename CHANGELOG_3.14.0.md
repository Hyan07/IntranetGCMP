# Changelog 3.14.0 DEV

- Organizado o pacote em blocos prefixados por camada, mantendo o formato plano exigido pelo Apps Script.
- Renomeados arquivos de Core, Schema, Controller, Service, Repository, Frota, Patrimônio e UI com prefixos numéricos estáveis.
- Atualizados `include()` e `createTemplateFromFile()` para os novos nomes prefixados.
- Ajustadas as validações estáticas para impedir arquivos fora do padrão de camada.
- Mantidas regras de negócio, bancos DEV e comportamento funcional sem alteração.
