# Ambiente de desenvolvimento — Intranet GCMP

Este pacote DEV 3.15.0 evolui a partir da versão estável 3.9.2. Ele aponta somente para os bancos DEV, bloqueia referências de produção em propriedades, impede alterações em arquivos fora da pasta DEV e suprime os envios de e-mail. Esta versão mantém os ganhos anteriores, preserva a organização por blocos prefixados e remove funções públicas de instalação específica e importação de dados legados.

## Organização por prefixo

O Apps Script aceita subpastas no projeto local, mas publica os arquivos em uma lista plana no editor. Para evitar conflito de nomes e preservar a ordem lógica, este pacote usa prefixos:

| Prefixo | Bloco |
|---|---|
| `00_CORE` e `01_CORE` | configuração, ambiente, utilitários e serviços transversais |
| `02_SCHEMA` | schema registry, instalador, diagnóstico e migrações |
| `10_CONTROLLER` | entrada do Web App e registry de rotas |
| `20_SERVICE` | regras de negócio compartilhadas |
| `30_REPOSITORY` | acesso genérico e repositories de domínio |
| `40_FROTA` | backend do módulo Frota |
| `45_PATRIMONIO` | backend do módulo Patrimônio |
| `50_UI` e `51_UI` | shell, scripts e telas centrais |
| `65_UI_PATRIMONIO` | interface do Patrimônio |
| `70_UI_FROTA` | interface da Frota |

## Estrutura no Google Drive

- Pasta principal DEV: https://drive.google.com/drive/folders/1_ertpqhYvpn0Mai9YEkpOlDN0HWiO0P1
- Código DEV: https://drive.google.com/drive/folders/1yQUJu-IZ9JPeLInIuxVTrAgUXXafyC3T
- Bancos DEV: https://drive.google.com/drive/folders/1Ar0_cC0hjGI_4T5ergozZZoDqViwvjAb
- Arquivos de teste: https://drive.google.com/drive/folders/169rQxF7JsCFtG6ercO0oKmfljUb1oYLK
- Backups DEV: https://drive.google.com/drive/folders/1sDk4hR8_n24NbC5WXcMXAthzHf-tXeDt
- Documentação: https://drive.google.com/drive/folders/1Z0oNaOIDsoMiQURvZOgqSD2a2hmGBpOF

## Implantação segura

1. Crie um NOVO projeto independente em https://script.google.com.
2. Copie o ID do novo projeto em Configurações do projeto.
3. Extraia este ZIP em uma pasta local exclusiva para DEV.
4. Copie `.clasp.json.example` para `.clasp.json` e substitua `COLE_AQUI_O_ID_DO_PROJETO_APPS_SCRIPT` pelo ID do novo projeto.
5. Nessa pasta, execute `clasp push`.
6. No editor do projeto DEV, execute somente `configurarAmbienteDesenvolvimento()`.
7. Consulte o registro de execução. Ele exibirá o MASP `999999-99` e uma senha temporária exclusiva do DEV.
8. Execute `diagnosticarAmbienteDesenvolvimento()`. O campo `safe` precisa aparecer como `true`.
9. Implante como aplicativo da Web com uma descrição que comece por `DEV -`.

Para reparar cabeçalhos duplicados ou colunas ausentes nos bancos DEV, primeiro execute `MigrationService_().dryRun()` ou a rota `migration.dryRun`. A aplicação só ocorre com `operation: 'NORMALIZAR_SCHEMA_DEV'` e confirmação `APLICAR_MIGRACOES_DEV`; cada aba alterada recebe uma cópia de backup oculta antes da normalização.

Não execute `instalarSistema()` na primeira configuração. Os bancos DEV já são cópias prontas. As funções públicas de instalação específica por módulo e importação de dados legados foram removidas; use diagnóstico e migração estrutural controlada para qualquer ajuste de schema.

## Regras para não afetar a produção

- Nunca reutilize o `.clasp.json` da produção.
- Nunca envie `00_CORE_DevEnvironment.gs` ou este pacote para o projeto de produção.
- Faça alterações e testes primeiro na URL DEV.
- O DEV não envia e-mails reais; os códigos de recuperação aparecem apenas nos registros de execução.
- Referências antigas de arquivos copiados da produção são somente dados de teste. Qualquer tentativa de alterar arquivo ou pasta fora da estrutura DEV é bloqueada pelo código.
- Antes de promover uma versão aprovada, faça backup da produção e copie apenas os arquivos modificados, sem `00_CORE_DevEnvironment.gs` e sem as constantes DEV de `00_CORE_Config.gs`.

## Bancos conectados ao DEV

| Banco | ID |
|---|---|
| Configuração | `1yerhrcwEqY5PE0VHWXwT0CU6JejoYG5IEWqMdd5Q65Q` |
| Pessoal | `13QxsON-OvTKVYXobDsR25smbVMsGDDZZVeqLaSIKQVk` |
| Patrimônio | `12KitE1cZDYbFbNxFK1lyTw9xEuMlzgGYrSCATTM4G9s` |
| Viaturas legado | `1qTV82EFbbV-YrGxHBhrIb7pmjGsDooeRGIQDt23hqf4` |
| Documentos | `1GahWHs6G3VL9RC2AB91sRlOcoiFeEukZJQbVWOPeKIs` |
| Recompensas | `1eOCVbh2R2NgjmJOS9FvOuuGeeiW3ZgXqm57TYbyNr6Q` |
| Frota atual | `171Kew8XdzZvBCxohD-buLQui_5ylKul0cVos-YZU3J0` |

## Fluxo de promoção

1. Desenvolver no projeto DEV.
2. Executar o diagnóstico DEV.
3. Testar login, permissões, Frota, Patrimônio, Pessoal, pesquisas, cadastros e impressões.
4. Fazer backup da produção.
5. Criar uma versão identificada do código aprovado.
6. Enviar à produção somente os arquivos funcionais alterados.
7. Testar a implantação de produção sem executar instaladores, salvo quando a versão exigir migração documentada.
