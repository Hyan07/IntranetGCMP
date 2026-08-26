import { pool } from '../src/config/db.js';
import { bootstrapDatabase } from '../src/services/bootstrap.service.js';

try {
  await bootstrapDatabase();
  console.log('Seed concluído.');
} finally {
  await pool.end();
}
