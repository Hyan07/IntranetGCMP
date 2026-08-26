# Versão 3.9.0

## Frota integrada

- vínculo persistente entre defeitos/observações e manutenções;
- botão **Abrir manutenção** diretamente na ocorrência, com viatura, classificação e descrição preenchidas;
- indicação do status da manutenção na lista e nos detalhes das ocorrências;
- indicação da ocorrência de origem na lista, pesquisa, formulário e detalhes da manutenção;
- sincronização automática: triagem, reparo, conclusão, resolução e cancelamento;
- bloqueio do encerramento manual de defeito enquanto houver manutenção ativa vinculada;
- reabertura da ocorrência e das notificações quando a manutenção for reaberta ou cancelada;
- liberação para `DISPONIVEL` somente quando não houver movimentação aberta, outro defeito impeditivo ou outra manutenção ativa;
- instalador idempotente acrescenta somente as novas colunas e preserva todos os dados existentes.

## Atualização

Depois de enviar os arquivos com `clasp push`, execute uma vez:

```javascript
instalarModuloFrota()
```

Em seguida, crie uma nova versão da implantação do aplicativo da Web.
