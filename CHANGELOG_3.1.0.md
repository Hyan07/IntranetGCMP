# Versão 3.1.0 — novo fluxo de Patrimônio e Cautelas

## Patrimônios

- O código interno passa a ser gerado automaticamente e corresponde ao ID do registro.
- O número patrimonial é opcional para equipamentos que não possuem tombamento.
- O histórico individual também funciona corretamente para itens sem número patrimonial.

## Cautela

- Pesquisa do GCM recebedor por nome ou MASP.
- Pesquisa de equipamentos por código, patrimônio, nome, série ou categoria.
- Itens selecionados são adicionados à gaveta da cautela antes da confirmação.
- Prazo padrão de devolução de 12 horas, editável, com opção de prazo indeterminado.
- Removido o campo Finalidade.
- O termo é enviado automaticamente ao e-mail cadastrado do GCM recebedor.

## Descautelamento

- Botão de Descautelamento disponível ao lado de Nova cautela.
- Pesquisa das cautelas ativas pelo nome ou MASP do GCM que está devolvendo.
- Exibição conjunta de todos os equipamentos acautelados com seleção individual ou Selecionar todos.
- Removido o campo Foto/URL.
- A autenticação passa a ser feita pelo intendente que recebe os equipamentos para conferência e guarda.

## Auditoria

- Nova consulta de termos por número, GCM, MASP, equipamento ou intendente.
- Impressão individual ou conjunta dos termos encontrados, em formato institucional.
