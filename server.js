import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { pool } from './src/config/db.js';
import { bootstrapDatabase } from './src/services/bootstrap.service.js';

try {
  await bootstrapDatabase();
} catch (error) {
  console.error('[BOOTSTRAP] Falha ao preparar o banco:', error);
  await pool.end().catch(() => {});
  process.exit(1);
}

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
