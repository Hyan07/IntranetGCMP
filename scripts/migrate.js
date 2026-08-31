import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const migrationsDir = path.resolve('database/migrations');
const connection = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  multipleStatements: true,
  charset: 'utf8mb4'
});

const databaseName = env.db.name.replace(/`/g, '');
let lockAcquired = false;

try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${databaseName}\``);
  await connection.query(`SET SESSION time_zone = '+00:00'`);
  await connection.query(`SET SESSION sql_mode = CONCAT_WS(',', @@sql_mode, 'STRICT_TRANS_TABLES')`);

  const [lockRows] = await connection.execute(`SELECT GET_LOCK(?, 20) AS acquired`, [`intranet_gcmp:migrations:${databaseName}`]);
  lockAcquired = Number(lockRows[0]?.acquired) === 1;
  if (!lockAcquired) throw new Error('Não foi possível obter o lock exclusivo das migrations.');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.filename));
  const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`- ${filename}: já aplicada`);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    console.log(`> Aplicando ${filename}...`);
    await connection.query(sql);
    await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
    console.log(`✓ ${filename}`);
  }

  console.log('Migrações concluídas.');
} finally {
  if (lockAcquired) await connection.execute('SELECT RELEASE_LOCK(?)', [`intranet_gcmp:migrations:${databaseName}`]).catch(() => {});
  await connection.end();
}
