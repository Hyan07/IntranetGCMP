import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';
import { asyncRoute, pagination, requiredFields, normalizeMasp, AppError } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const personnelRoutes = Router();
personnelRoutes.use(requireAuth);

personnelRoutes.get('/', requirePermission('pessoal.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const where = [];
  const params = [];
  if (search) {
    where.push('(nome_completo LIKE ? OR masp LIKE ? OR cpf LIKE ? OR cargo LIKE ? OR setor LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (status) { where.push('status = ?'); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT id, nome_completo, nome_social, masp, cpf, telefone, email, cargo, funcao, setor, equipe, status, foto_url, atualizado_em
       FROM pessoas ${clause}
      ORDER BY nome_completo LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM pessoas ${clause}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

personnelRoutes.get('/:id', requirePermission('pessoal.visualizar'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM pessoas WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new AppError(404, 'PERSON_NOT_FOUND', 'Pessoa não localizada.');
  res.json({ ok: true, data: rows[0] });
}));

personnelRoutes.post('/', requirePermission('pessoal.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['nomeCompleto', 'masp']);
  const record = {
    id: randomUUID(),
    nomeCompleto: String(req.body.nomeCompleto).trim(),
    masp: normalizeMasp(req.body.masp),
    cpf: String(req.body.cpf || '').replace(/\D/g, '') || null,
    telefone: String(req.body.telefone || '').trim() || null,
    email: String(req.body.email || '').trim().toLowerCase() || null,
    cargo: String(req.body.cargo || '').trim() || null,
    funcao: String(req.body.funcao || '').trim() || null,
    setor: String(req.body.setor || '').trim() || null,
    equipe: String(req.body.equipe || '').trim() || null,
    status: String(req.body.status || 'ATIVO').toUpperCase()
  };
  await pool.execute(
    `INSERT INTO pessoas (id, nome_completo, masp, cpf, telefone, email, cargo, funcao, setor, equipe, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.id, record.nomeCompleto, record.masp, record.cpf, record.telefone, record.email, record.cargo, record.funcao, record.setor, record.equipe, record.status]
  );
  await audit(req, { module: 'pessoal', action: 'CRIAR', recordId: record.id, after: record });
  res.status(201).json({ ok: true, data: record });
}));

personnelRoutes.put('/:id', requirePermission('pessoal.editar'), asyncRoute(async (req, res) => {
  const [beforeRows] = await pool.execute('SELECT * FROM pessoas WHERE id = ?', [req.params.id]);
  if (!beforeRows[0]) throw new AppError(404, 'PERSON_NOT_FOUND', 'Pessoa não localizada.');
  const updates = {
    nome_completo: String(req.body.nomeCompleto ?? beforeRows[0].nome_completo).trim(),
    telefone: String(req.body.telefone ?? beforeRows[0].telefone ?? '').trim() || null,
    email: String(req.body.email ?? beforeRows[0].email ?? '').trim().toLowerCase() || null,
    cargo: String(req.body.cargo ?? beforeRows[0].cargo ?? '').trim() || null,
    funcao: String(req.body.funcao ?? beforeRows[0].funcao ?? '').trim() || null,
    setor: String(req.body.setor ?? beforeRows[0].setor ?? '').trim() || null,
    equipe: String(req.body.equipe ?? beforeRows[0].equipe ?? '').trim() || null,
    status: String(req.body.status ?? beforeRows[0].status).toUpperCase()
  };
  await pool.execute(
    `UPDATE pessoas SET nome_completo=?, telefone=?, email=?, cargo=?, funcao=?, setor=?, equipe=?, status=?, atualizado_em=NOW() WHERE id=?`,
    [updates.nome_completo, updates.telefone, updates.email, updates.cargo, updates.funcao, updates.setor, updates.equipe, updates.status, req.params.id]
  );
  await audit(req, { module: 'pessoal', action: 'EDITAR', recordId: req.params.id, before: beforeRows[0], after: updates });
  res.json({ ok: true });
}));
