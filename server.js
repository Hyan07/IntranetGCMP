import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { pool } from './src/config/db.js';
import { bootstrapDatabase } from './src/services/bootstrap.service.js';

let server = null;

async function start() {
  try {
    await bootstrapDatabase();
  } catch (error) {
    console.error('[BOOTSTRAP] Falha ao preparar o banco:', error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
    return;
  }

  server = app.listen(env.port, () => {
    console.log(`${env.appName} disponível em http://localhost:${env.port}`);
  });
}

async function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando aplicação...`);

  if (!server) {
    await pool.end().catch(() => {});
    process.exit(0);
    return;
  }

  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  console.error('[STARTUP] Falha inesperada ao iniciar a aplicação:', error);
  process.exitCode = 1;
});
