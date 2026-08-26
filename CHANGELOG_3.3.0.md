# Versão 3.3.0 — Importação de Pessoal e preparação para implantação

## Pessoal e usuários

- Importação direta e idempotente do arquivo `pessoal.xlsm` armazenado no Google Drive.
- Criação e atualização conjunta dos registros em `PESSOAS` e `USUARIOS`, vinculados pelo MASP.
- Senha inicial dos novos usuários definida como os 11 dígitos do CPF, armazenada somente como hash.
- Troca obrigatória da senha no primeiro acesso.
- Senhas de usuários já existentes são preservadas em reimportações.
- Registros ativos e inativos são mantidos conforme a planilha.
- E-mail provisório único para agente sem e-mail válido, com sinalização administrativa.
- CPFs com dígito verificador divergente são sinalizados no cadastro e no diagnóstico.
- Campos complementares da ficha funcional foram adicionados ao banco de Pessoal.

## Implantação definitiva

- Novo botão **Zerar registros de teste** em Administração > Configurações gerais.
- Exige permissão administrativa, senha atual e a frase de confirmação completa.
- Cria backup automático antes da limpeza.
- Preserva usuários, Pessoal, permissões, configurações, sessões, categorias e toda a Frota.
- Remove registros operacionais de Patrimônio, cautelas, documentos e recompensas.
- Reinicia a numeração sequencial das cautelas.
