# Versão 3.8.0

## Desempenho

- leituras das planilhas agora usam cache curto e dividido em blocos, com invalidação automática após gravações;
- planilhas, abas e cabeçalhos são reutilizados durante a mesma execução do Apps Script;
- a atividade da sessão continua validada em toda chamada, mas só é gravada periodicamente, evitando uma escrita para cada tecla pesquisada;
- o painel inicial de Patrimônio reutiliza os dados já recebidos no bootstrap e deixa de fazer uma chamada duplicada;
- pesquisas de GCM, equipamento e cautela possuem cache no navegador, resultado local imediato e espera mínima antes de consultar o servidor;
- respostas antigas de pesquisas assíncronas são descartadas para não substituir o filtro mais recente;
- a mesma otimização de leitura e invalidação foi aplicada às páginas da Frota.

## Segurança e consistência

- alterações, importações, limpeza de testes e concessões em massa invalidam os dados correspondentes do cache;
- expiração e encerramento por inatividade continuam sendo verificados em todas as ações autenticadas;
- o cache é apenas uma aceleração temporária; as planilhas permanecem como fonte oficial dos dados.
