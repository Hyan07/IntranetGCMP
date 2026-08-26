# Versão 3.2.0 — cautela administrativa e Minha Conta

- Nova aba **Cautela administrativa** no módulo Patrimônio.
- Nova permissão `CAUTELA_ADMINISTRATIVA_GERENCIAR` para registrar, visualizar e descautelar itens administrativos.
- Cautela administrativa aceita qualquer patrimônio ativo com saldo, inclusive itens marcados como não cauteláveis.
- Prazo indeterminado selecionado por padrão para itens fixos dos agentes.
- Numeração administrativa identificada pelo prefixo `CAD-` e tipo gravado na coluna **Tipo de Cautela**.
- Registros anteriores normalizados automaticamente como cautela comum pelo instalador.
- Cautelas administrativas ocultadas das listas e do descautelamento para usuários sem a permissão específica.
- Validação de permissão repetida no servidor para impedir acesso direto indevido.
- Termos, e-mails, histórico e auditoria identificam cautelas comuns e administrativas.
- **Minha Conta** lista os itens do usuário em subabas separadas: **Cautela** e **Cautela administrativa**.
- MASP do intendente permanece preenchido e bloqueado no descautelamento, com validação contra o usuário logado.
