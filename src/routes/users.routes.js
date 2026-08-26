import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../config/db.js';
import { asyncRoute, pagination, requiredFields, normalizeMasp, AppError } from '../lib/http.js';
import { hashPassword } from '../lib/security.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const usersRoutes = Router();
usersRoutes.use(requireAuth);

usersRoutes.get('/', requirePermission('usuarios.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE nome LIKE ? OR masp LIKE ? OR email LIKE ? OR cargo LIKE ? OR setor LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, id_pessoa, masp, nome, email, telefone, cargo, funcao, setor, status, trocar_senha, ultimo_acesso, criado_em, atualizado_em
       FROM usuarios ${where} ORDER BY nome LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM usuarios ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

usersRoutes.get('/permissions/catalog', requirePermission('usuarios.visualizar'), asyncRoute(async (_req, res) => {
  const [rows] = await pool.execute('SELECT id, codigo, modulo, acao, descricao FROM permissoes WHERE ativa=1 ORDER BY modulo, codigo');
  res.json({ ok: true, data: rows });
}));

usersRoutes.get('/:id/permissions', requirePermission('usuarios.visualizar'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.codigo, up.permitido
       FROM permissoes p
       LEFT JOIN usuario_permissoes up ON up.id_permissao=p.id AND up.id_usuario=?
      WHERE p.ativa=1 ORDER BY p.modulo, p.codigo`,
    [req.params.id]
  );
  res.json({ ok: true, data: rows });
}));

usersRoutes.post('/', requirePermission('usuarios.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['masp', 'nome', 'password']);
  const id = randomUUID();
  const senhaHash = await hashPassword(req.body.password);
  await pool.execute(
    `INSERT INTO usuarios (id, id_pessoa, masp, nome, email, telefone, cargo, funcao, setor, status, senha_hash, trocar_senha, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [
      id, req.body.idPessoa || null, normalizeMasp(req.body.masp), String(req.body.nome).trim(),
      String(req.body.email || '').trim().toLowerCase() || null, req.body.telefone || null, req.body.cargo || null,
      req.body.funcao || null, req.body.setor || null, req.body.status || 'ATIVO', senhaHash
    ]
  );
  await audit(req, { module: 'usuarios', action: 'CRIAR', recordId: id, after: { ...req.body, password: undefined } });
  res.status(201).json({ ok: true, id });
}));

usersRoutes.put('/:id/permissions', requirePermission('usuarios.gerenciar_permissoes'), asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body.permissions)) throw new AppError(400, 'INVALID_PERMISSIONS', 'Informe uma lista de permissões.');
  await transaction(async (db) => {
    const [catalog] = await db.query('SELECT id, codigo FROM permissoes WHERE ativa=1');
    const desired = new Set(req.body.permissions);
    for (const permission of catalog) {
      await db.execute(
        `INSERT INTO usuario_permissoes (id, id_usuario, id_permissao, permitido, concedido_por, concedido_em)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE permitido=VALUES(permitido), concedido_por=VALUES(concedido_por), concedido_em=NOW()`,
        [randomUUID(), req.params.id, permission.id, desired.has(permission.codigo) ? 1 : 0, req.session.user.id]
      );
    }
  });
  await audit(req, { module: 'usuarios', action: 'ALTERAR_PERMISSOES', recordId: req.params.id, after: req.body.permissions, justification: req.body.justificativa || null });
  res.json({ ok: true });
}));
