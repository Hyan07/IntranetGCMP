'use strict';

// Ponto de entrada compatível com o carregador Node.js da Hostinger/LiteSpeed.
// O hPanel/lsnode carrega o arquivo inicial com require(), enquanto a aplicação
// principal usa ES Modules. O import() dinâmico faz a ponte sem top-level await
// no módulo CommonJS.

import('./server.js').catch((error) => {
  console.error('[STARTUP] Falha ao carregar a aplicação:', error);
  process.exitCode = 1;
});
