import { Router } from 'express';
import { pool } from '../config/db.js';
import { asyncRoute, requiredFields } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const settingsRoutes = Router();
settingsRoutes.use(requireAuth);

settingsRoutes.get('/', requirePermission('configuracoes.gerenciar'), asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT chave, valor, descricao, atualizado_em FROM configuracoes ORDER BY chave');
  res.json({ ok: true, data: rows });
}));

settingsRoutes.put('/:key', requirePermission('configuracoes.gerenciar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['valor']);
  const key = String(req.params.key).trim().toUpperCase();
  const [beforeRows] = await pool.execute('SELECT * FROM configuracoes WHERE chave=?', [key]);
  await pool.execute(
    `INSERT INTO configuracoes (chave, valor, descricao) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE valor=VALUES(valor), descricao=COALESCE(VALUES(descricao), descricao), atualizado_em=NOW()`,
    [key, String(req.body.valor), req.body.descricao || null]
  );
  await audit(req, { module: 'configuracoes', action: 'ALTERAR', recordId: key, before: beforeRows[0] || null, after: req.body });
  res.json({ ok: true });
}));
