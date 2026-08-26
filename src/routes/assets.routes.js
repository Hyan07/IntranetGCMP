import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../config/db.js';
import { asyncRoute, pagination, requiredFields, AppError, normalizeMasp } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const assetsRoutes = Router();
assetsRoutes.use(requireAuth);

assetsRoutes.get('/', requirePermission('patrimonio.visualizar'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE numero_patrimonial LIKE ? OR descricao LIKE ? OR categoria LIKE ? OR marca LIKE ? OR modelo LIKE ?';
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, numero_patrimonial, descricao, categoria, marca, modelo, numero_serie, status, estado_conservacao, unidade, setor_responsavel, localizacao_atual
       FROM patrimonios ${where} ORDER BY descricao LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM patrimonios ${where}`, params);
  res.json({ ok: true, data: rows, pagination: { page, limit, total: Number(countRows[0].total) } });
}));

assetsRoutes.post('/', requirePermission('patrimonio.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['numeroPatrimonial', 'descricao']);
  const id = randomUUID();
  const data = {
    numero: String(req.body.numeroPatrimonial).trim(),
    descricao: String(req.body.descricao).trim(),
    categoria: String(req.body.categoria || '').trim() || null,
    marca: String(req.body.marca || '').trim() || null,
    modelo: String(req.body.modelo || '').trim() || null,
    serie: String(req.body.numeroSerie || '').trim() || null,
    estado: String(req.body.estadoConservacao || 'BOM').toUpperCase(),
    unidade: String(req.body.unidade || 'UN').toUpperCase(),
    setor: String(req.body.setorResponsavel || '').trim() || null,
    local: String(req.body.localizacaoAtual || '').trim() || null
  };
  await pool.execute(
    `INSERT INTO patrimonios (id, numero_patrimonial, descricao, categoria, marca, modelo, numero_serie, status, estado_conservacao, unidade, setor_responsavel, localizacao_atual, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DISPONIVEL', ?, ?, ?, ?, ?)`,
    [id, data.numero, data.descricao, data.categoria, data.marca, data.modelo, data.serie, data.estado, data.unidade, data.setor, data.local, req.session.user.id]
  );
  await audit(req, { module: 'patrimonio', action: 'CRIAR', recordId: id, after: data });
  res.status(201).json({ ok: true, id });
}));

assetsRoutes.get('/cautelas/ativas', requirePermission('patrimonio.cautelas.visualizar'), asyncRoute(async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.numero, c.nome_pessoa, c.masp, c.setor, c.entregue_em, c.previsao_devolucao, c.finalidade, c.status,
            COUNT(ci.id) itens
       FROM cautelas c LEFT JOIN itens_cautela ci ON ci.id_cautela = c.id
      WHERE c.status = 'ATIVA'
      GROUP BY c.id ORDER BY c.entregue_em DESC`
  );
  res.json({ ok: true, data: rows });
}));

assetsRoutes.post('/cautelas', requirePermission('patrimonio.cautelas.criar'), asyncRoute(async (req, res) => {
  requiredFields(req.body, ['idPessoa', 'nomePessoa', 'masp', 'itens']);
  if (!Array.isArray(req.body.itens) || !req.body.itens.length) throw new AppError(400, 'EMPTY_CUSTODY', 'Inclua ao menos um patrimônio na cautela.');

  const result = await transaction(async (db) => {
    const id = randomUUID();
    const numero = `CAU-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    await db.execute(
      `INSERT INTO cautelas
       (id, numero, id_pessoa, nome_pessoa, masp, setor, entregue_em, previsao_devolucao, estado_entrega, finalidade, entregue_por_id, entregue_por_nome, status, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, 'ATIVA', ?)`,
      [
        id, numero, req.body.idPessoa, req.body.nomePessoa, normalizeMasp(req.body.masp),
        req.body.setor || null, req.body.previsaoDevolucao || null, req.body.estadoEntrega || 'BOM',
        req.body.finalidade || null, req.session.user.id, req.session.user.nome, req.body.observacoes || null
      ]
    );

    for (const item of req.body.itens) {
      const [assets] = await db.execute('SELECT id, status FROM patrimonios WHERE id = ? FOR UPDATE', [item.idPatrimonio]);
      if (!assets[0] || assets[0].status !== 'DISPONIVEL') throw new AppError(409, 'ASSET_UNAVAILABLE', 'Um dos patrimônios selecionados não está disponível.');
      await db.execute(
        'INSERT INTO itens_cautela (id, id_cautela, id_patrimonio, quantidade, estado_entrega, acessorios, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), id, item.idPatrimonio, Number(item.quantidade || 1), item.estadoEntrega || 'BOM', item.acessorios || null, item.observacoes || null]
      );
      await db.execute("UPDATE patrimonios SET status='CAUTELADO', atualizado_em=NOW(), atualizado_por=? WHERE id=?", [req.session.user.id, item.idPatrimonio]);
    }
    return { id, numero };
  });

  await audit(req, { module: 'patrimonio', action: 'CAUTELAR', recordId: result.id, after: req.body });
  res.status(201).json({ ok: true, ...result });
}));

assetsRoutes.post('/cautelas/:id/devolver', requirePermission('patrimonio.cautelas.devolver'), asyncRoute(async (req, res) => {
  await transaction(async (db) => {
    const [custodies] = await db.execute("SELECT * FROM cautelas WHERE id=? AND status='ATIVA' FOR UPDATE", [req.params.id]);
    if (!custodies[0]) throw new AppError(404, 'CUSTODY_NOT_FOUND', 'Cautela ativa não localizada.');
    const [items] = await db.execute('SELECT * FROM itens_cautela WHERE id_cautela=?', [req.params.id]);
    for (const item of items) {
      await db.execute(
        `INSERT INTO devolucoes_patrimonio
         (id, id_cautela, id_patrimonio, id_pessoa, devolvido_em, recebido_por_id, recebido_por_nome, estado_recebimento, possui_avaria, descricao_dano, providencias, observacoes, status_patrimonio)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), req.params.id, item.id_patrimonio, custodies[0].id_pessoa, req.session.user.id, req.session.user.nome,
          req.body.estadoRecebimento || 'BOM', req.body.possuiAvaria ? 1 : 0, req.body.descricaoDano || null,
          req.body.providencias || null, req.body.observacoes || null, req.body.statusPatrimonio || 'DISPONIVEL'
        ]
      );
      await db.execute('UPDATE patrimonios SET status=?, estado_conservacao=?, atualizado_em=NOW(), atualizado_por=? WHERE id=?',
        [req.body.statusPatrimonio || 'DISPONIVEL', req.body.estadoRecebimento || 'BOM', req.session.user.id, item.id_patrimonio]);
    }
    await db.execute("UPDATE cautelas SET status='DEVOLVIDA', devolvido_em=NOW(), recebido_por_id=? WHERE id=?", [req.session.user.id, req.params.id]);
  });
  await audit(req, { module: 'patrimonio', action: 'DEVOLVER_CAUTELA', recordId: req.params.id, after: req.body });
  res.json({ ok: true });
}));
