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
  multipleStatements: true
});

try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.name.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${env.db.name.replace(/`/g, '')}\``);
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.filename));
  const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    console.log(`Aplicando ${filename}...`);
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  console.log('Migrações concluídas.');
} finally {
  await connection.end();
}
