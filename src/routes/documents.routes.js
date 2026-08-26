import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';
import { asyncRoute, pagination, requiredFields } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const documentsRoutes = Router();
documentsRoutes.use(requireAuth);

documentsRoutes.get('/', requirePermission('documentos.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE numero LIKE ? OR tipo LIKE ? OR assunto LIKE ? OR origem LIKE ? OR destino LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, numero, tipo, assunto, data_documento, origem, destino, setor, responsavel, nivel_acesso, situacao, prazo, vencimento, criado_em
       FROM documentos ${where} ORDER BY COALESCE(data_documento, DATE(criado_em)) DESC, criado_em DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM documentos ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

documentsRoutes.post('/', requirePermission('documentos.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['assunto']);
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO documentos
     (id, numero, tipo, assunto, descricao, data_documento, origem, destino, setor, responsavel, nivel_acesso, situacao, prazo, vencimento, observacoes, criado_por, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, req.body.numero || null, req.body.tipo || null, req.body.assunto, req.body.descricao || null,
      req.body.dataDocumento || null, req.body.origem || null, req.body.destino || null, req.body.setor || null,
      req.body.responsavel || null, req.body.nivelAcesso || 'INTERNO', req.body.situacao || 'ATIVO',
      req.body.prazo || null, req.body.vencimento || null, req.body.observacoes || null,
      req.session.user.id, req.session.user.id
    ]
  );
  await audit(req, { module: 'documentos', action: 'CRIAR', recordId: id, after: req.body });
  res.status(201).json({ ok: true, id });
}));
