import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';
import { asyncRoute, pagination, requiredFields } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const rewardsRoutes = Router();
rewardsRoutes.use(requireAuth);

rewardsRoutes.get('/', requirePermission('recompensas.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE numero LIKE ? OR titulo LIKE ? OR solicitante_nome LIKE ? OR setor LIKE ? OR status LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, numero, titulo, data_fato, local_fato, solicitante_nome, setor, tipo_recompensa, status, decisao_em, criado_em
       FROM recompensas ${where} ORDER BY criado_em DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM recompensas ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

rewardsRoutes.post('/', requirePermission('recompensas.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['titulo']);
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO recompensas
     (id, numero, titulo, descricao_fato, data_fato, local_fato, fundamentacao, solicitante_nome, setor, tipo_recompensa, status, observacoes, criado_por, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, req.body.numero || null, req.body.titulo, req.body.descricaoFato || null, req.body.dataFato || null,
      req.body.localFato || null, req.body.fundamentacao || null, req.body.solicitanteNome || null,
      req.body.setor || null, req.body.tipoRecompensa || null, req.body.status || 'EM_ANALISE',
      req.body.observacoes || null, req.session.user.id, req.session.user.id
    ]
  );
  await audit(req, { module: 'recompensas', action: 'CRIAR', recordId: id, after: req.body });
  res.status(201).json({ ok: true, id });
}));
