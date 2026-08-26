import { Router } from 'express';
import { pool } from '../config/db.js';
import { asyncRoute, pagination } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const auditRoutes = Router();
auditRoutes.use(requireAuth);

auditRoutes.get('/', requirePermission('auditoria.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req, 50, 200);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE masp LIKE ? OR modulo LIKE ? OR acao LIKE ? OR resultado LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, data_hora, id_usuario, masp, modulo, acao, id_registro, resultado, justificativa, observacao_tecnica, ip
       FROM auditoria ${where} ORDER BY data_hora DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM auditoria ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));
