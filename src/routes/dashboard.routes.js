import { Router } from 'express';
import { pool } from '../config/db.js';
import { asyncRoute } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);

dashboardRoutes.get('/', asyncRoute(async (_req, res) => {
  const queries = await Promise.all([
    pool.query("SELECT COUNT(*) total FROM pessoas WHERE status = 'ATIVO'"),
    pool.query("SELECT COUNT(*) total FROM patrimonios WHERE status = 'DISPONIVEL'"),
    pool.query("SELECT COUNT(*) total FROM cautelas WHERE status = 'ATIVA'"),
    pool.query("SELECT COUNT(*) total FROM viaturas WHERE status = 'DISPONIVEL'"),
    pool.query("SELECT COUNT(*) total FROM defeitos_frota WHERE status IN ('ABERTO','EM_ANALISE','EM_MANUTENCAO')"),
    pool.query("SELECT COUNT(*) total FROM notificacoes WHERE lida = 0")
  ]);
  const totals = queries.map(([rows]) => Number(rows[0].total || 0));
  res.json({
    ok: true,
    data: {
      pessoalAtivo: totals[0],
      patrimonioDisponivel: totals[1],
      cautelasAtivas: totals[2],
      viaturasDisponiveis: totals[3],
      defeitosAbertos: totals[4],
      notificacoesPendentes: totals[5]
    }
  });
}));
