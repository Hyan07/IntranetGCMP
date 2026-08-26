import { Router } from 'express';
import { pool, transaction } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncRoute, requiredFields, normalizeMasp, AppError } from '../lib/http.js';
import { hashPassword, verifyPassword, randomRecoveryCode, recoveryHash } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { sendRecoveryEmail } from '../services/mail.service.js';

export const authRoutes = Router();

async function getPermissions(userId, db = pool) {
  const [rows] = await db.execute(
    `SELECT p.codigo
       FROM permissoes p
       JOIN usuario_permissoes up ON up.id_permissao = p.id
      WHERE up.id_usuario = ? AND up.permitido = 1 AND p.ativa = 1`,
    [userId]
  );
  return rows.map((row) => row.codigo);
}

authRoutes.post('/login', asyncRoute(async (req, res) => {
  requiredFields(req.body, ['masp', 'password']);
  const masp = normalizeMasp(req.body.masp);
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE masp = ? LIMIT 1', [masp]);
  const user = rows[0];

  if (!user || user.status !== 'ATIVO') {
    await audit(req, { module: 'autenticacao', action: 'FALHA_LOGIN', result: 'NEGADO', technicalNote: 'Usuário inexistente ou inativo' });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }

  if (user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
    throw new AppError(423, 'TEMPORARILY_BLOCKED', `Acesso bloqueado temporariamente até ${new Date(user.bloqueado_ate).toLocaleString('pt-BR')}.`);
  }

  const valid = await verifyPassword(req.body.password, user.senha_hash);
  if (!valid) {
    const attempts = Number(user.tentativas || 0) + 1;
    const shouldLock = attempts >= env.auth.maxAttempts;
    await pool.execute(
      'UPDATE usuarios SET tentativas = ?, bloqueado_ate = ?, atualizado_em = NOW() WHERE id = ?',
      [
        shouldLock ? 0 : attempts,
        shouldLock ? new Date(Date.now() + env.auth.lockMinutes * 60_000) : null,
        user.id
      ]
    );
    await audit(req, { module: 'autenticacao', action: 'FALHA_LOGIN', recordId: user.id, result: 'NEGADO', technicalNote: 'Senha inválida' });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }

  const permissions = await getPermissions(user.id);
  if (!permissions.length) throw new AppError(403, 'NO_PERMISSIONS', 'Seu usuário ainda não possui permissões de acesso.');

  await pool.execute('UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL, ultimo_acesso = NOW(), atualizado_em = NOW() WHERE id = ?', [user.id]);

  req.session.user = { id: user.id, masp: user.masp, nome: user.nome, email: user.email, cargo: user.cargo, funcao: user.funcao, setor: user.setor };
  req.session.permissions = permissions;
  req.session.mustChangePassword = Boolean(user.trocar_senha);
  req.session.lastActivity = Date.now();

  await audit(req, { module: 'autenticacao', action: 'LOGIN', recordId: user.id });
  res.json({ ok: true, user: req.session.user, permissions, mustChangePassword: req.session.mustChangePassword });
}));

authRoutes.post('/logout', asyncRoute(async (req, res) => {
  if (req.session?.user) await audit(req, { module: 'autenticacao', action: 'LOGOUT', recordId: req.session.user.id });
  req.session.destroy(() => res.json({ ok: true }));
}));

authRoutes.get('/me', requireAuth, asyncRoute(async (req, res) => {
  res.json({ ok: true, user: req.session.user, permissions: req.session.permissions || [], mustChangePassword: Boolean(req.session.mustChangePassword) });
}));

authRoutes.post('/password/change', requireAuth, asyncRoute(async (req, res) => {
  requiredFields(req.body, ['currentPassword', 'newPassword']);
  const [rows] = await pool.execute('SELECT senha_hash FROM usuarios WHERE id = ?', [req.session.user.id]);
  if (!rows[0] || !(await verifyPassword(req.body.currentPassword, rows[0].senha_hash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'A senha atual está incorreta.');
  }
  const senhaHash = await hashPassword(req.body.newPassword);
  await pool.execute('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, senha_alterada_em = NOW(), atualizado_em = NOW() WHERE id = ?', [senhaHash, req.session.user.id]);
  req.session.mustChangePassword = false;
  await audit(req, { module: 'perfil', action: 'ALTERAR_SENHA', recordId: req.session.user.id });
  res.json({ ok: true, message: 'Senha alterada com sucesso.' });
}));

authRoutes.post('/password/recovery/request', asyncRoute(async (req, res) => {
  requiredFields(req.body, ['masp', 'email']);
  const generic = { ok: true, message: 'Caso os dados estejam corretos, as instruções serão enviadas ao e-mail cadastrado.' };
  const masp = normalizeMasp(req.body.masp);
  const email = String(req.body.email).trim().toLowerCase();
  const [rows] = await pool.execute('SELECT id, nome, email, status FROM usuarios WHERE masp = ? LIMIT 1', [masp]);
  const user = rows[0];
  if (!user || user.status !== 'ATIVO' || String(user.email || '').toLowerCase() !== email) return res.json(generic);

  const code = randomRecoveryCode();
  const expiresAt = new Date(Date.now() + env.auth.recoveryMinutes * 60_000);
  await pool.execute(
    'INSERT INTO recuperacao_senha (id_usuario, codigo_hash, expira_em) VALUES (?, ?, ?)',
    [user.id, recoveryHash(code, user.id), expiresAt]
  );
  await sendRecoveryEmail(user, code, expiresAt);
  res.json(generic);
}));

authRoutes.post('/password/recovery/confirm', asyncRoute(async (req, res) => {
  requiredFields(req.body, ['masp', 'email', 'code', 'newPassword']);
  const masp = normalizeMasp(req.body.masp);
  const email = String(req.body.email).trim().toLowerCase();

  await transaction(async (db) => {
    const [users] = await db.execute('SELECT id, email FROM usuarios WHERE masp = ? LIMIT 1 FOR UPDATE', [masp]);
    const user = users[0];
    if (!user || String(user.email || '').toLowerCase() !== email) throw new AppError(400, 'INVALID_RECOVERY', 'Código inválido ou expirado.');

    const [codes] = await db.execute(
      `SELECT * FROM recuperacao_senha
        WHERE id_usuario = ? AND utilizado = 0 AND expira_em > NOW()
        ORDER BY criado_em DESC LIMIT 10 FOR UPDATE`,
      [user.id]
    );
    const expected = recoveryHash(String(req.body.code).trim(), user.id);
    const record = codes.find((item) => item.codigo_hash === expected);
    if (!record) throw new AppError(400, 'INVALID_RECOVERY', 'Código inválido ou expirado.');

    const senhaHash = await hashPassword(req.body.newPassword);
    await db.execute('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, tentativas = 0, bloqueado_ate = NULL, senha_alterada_em = NOW(), atualizado_em = NOW() WHERE id = ?', [senhaHash, user.id]);
    await db.execute('UPDATE recuperacao_senha SET utilizado = 1, utilizado_em = NOW() WHERE id = ?', [record.id]);
  });

  res.json({ ok: true, message: 'Senha redefinida. Você já pode entrar.' });
}));
