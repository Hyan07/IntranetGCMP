import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../config/db.js';
import { asyncRoute, pagination, requiredFields, AppError } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const fleetRoutes = Router();
fleetRoutes.use(requireAuth);

fleetRoutes.get('/viaturas', requirePermission('frota.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE prefixo LIKE ? OR placa LIKE ? OR marca LIKE ? OR modelo LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, prefixo, placa, tipo, marca, modelo, ano_fabricacao, ano_modelo, status, km_atual, setor, proxima_revisao_km, proxima_revisao_data
       FROM viaturas ${where} ORDER BY prefixo LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM viaturas ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

fleetRoutes.post('/viaturas', requirePermission('frota.viaturas.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['prefixo', 'placa']);
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO viaturas (id, prefixo, placa, tipo, marca, modelo, ano_fabricacao, ano_modelo, cor, combustivel, setor, status, km_atual, observacoes, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, String(req.body.prefixo).trim(), String(req.body.placa).trim().toUpperCase(), req.body.tipo || null,
      req.body.marca || null, req.body.modelo || null, req.body.anoFabricacao || null, req.body.anoModelo || null,
      req.body.cor || null, req.body.combustivel || null, req.body.setor || null, req.body.status || 'DISPONIVEL',
      Number(req.body.kmAtual || 0), req.body.observacoes || null, req.session.user.id
    ]
  );
  await audit(req, { module: 'frota', action: 'CRIAR_VIATURA', recordId: id, after: req.body });
  res.status(201).json({ ok: true, id });
}));

fleetRoutes.post('/viaturas/:id/km', requirePermission('frota.km.registrar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['km']);
  const newKm = Number(req.body.km);
  if (!Number.isFinite(newKm) || newKm < 0) throw new AppError(400, 'INVALID_KM', 'Quilometragem inválida.');

  await transaction(async (db) => {
    const [rows] = await db.execute('SELECT id, prefixo, km_atual FROM viaturas WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Viatura não localizada.');
    const oldKm = Number(rows[0].km_atual || 0);
    if (newKm < oldKm && !String(req.body.justificativa || '').trim()) {
      throw new AppError(400, 'KM_REQUIRES_JUSTIFICATION', 'Informe uma justificativa para reduzir a quilometragem.');
    }
    await db.execute('UPDATE viaturas SET km_atual=?, km_atualizado_em=NOW(), atualizado_em=NOW(), atualizado_por=? WHERE id=?', [newKm, req.session.user.id, req.params.id]);
    await db.execute(
      `INSERT INTO historico_km (id, id_viatura, prefixo, km_anterior, km_novo, origem, id_usuario, justificativa)
       VALUES (?, ?, ?, ?, ?, 'ATUALIZACAO_MANUAL', ?, ?)`,
      [randomUUID(), req.params.id, rows[0].prefixo, oldKm, newKm, req.session.user.id, req.body.justificativa || null]
    );
  });
  await audit(req, { module: 'frota', action: 'ATUALIZAR_KM', recordId: req.params.id, after: req.body });
  res.json({ ok: true });
}));

fleetRoutes.get('/defeitos', requirePermission('frota.defeitos.visualizar'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT d.*, v.prefixo, v.placa
       FROM defeitos_frota d JOIN viaturas v ON v.id=d.id_viatura
      ORDER BY FIELD(d.status,'ABERTO','EM_ANALISE','EM_MANUTENCAO','RESOLVIDO'), d.criado_em DESC`
  );
  res.json({ ok: true, data: rows });
}));

fleetRoutes.post('/defeitos', requirePermission('frota.defeitos.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['idViatura', 'descricao']);
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO defeitos_frota (id, id_viatura, titulo, descricao, gravidade, status, registrado_por, registrado_por_nome, observacoes)
     VALUES (?, ?, ?, ?, ?, 'ABERTO', ?, ?, ?)`,
    [id, req.body.idViatura, req.body.titulo || 'Defeito informado', req.body.descricao, req.body.gravidade || 'MEDIA', req.session.user.id, req.session.user.nome, req.body.observacoes || null]
  );
  await audit(req, { module: 'frota', action: 'REGISTRAR_DEFEITO', recordId: id, after: req.body });
  res.status(201).json({ ok: true, id });
}));

fleetRoutes.post('/defeitos/:id/resolver', requirePermission('frota.defeitos.resolver'), asyncRoute(async (req, res) => {
  const [result] = await pool.execute(
    `UPDATE defeitos_frota SET status='RESOLVIDO', resolvido_em=NOW(), resolvido_por=?, solucao=?, atualizado_em=NOW() WHERE id=?`,
    [req.session.user.id, req.body.solucao || null, req.params.id]
  );
  if (!result.affectedRows) throw new AppError(404, 'DEFECT_NOT_FOUND', 'Defeito não localizado.');
  await audit(req, { module: 'frota', action: 'RESOLVER_DEFEITO', recordId: req.params.id, after: req.body });
  res.json({ ok: true });
}));
