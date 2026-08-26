import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { pool } from './src/config/db.js';

const server = app.listen(env.port, () => {
  console.log(`${env.appName} disponível em http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando aplicação...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
