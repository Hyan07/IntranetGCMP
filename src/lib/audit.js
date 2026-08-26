import { pool } from '../config/db.js';

export async function audit(req, {
  module,
  action,
  recordId = null,
  before = null,
  after = null,
  result = 'SUCESSO',
  justification = null,
  technicalNote = null
}) {
  const user = req.session?.user || null;
  try {
    await pool.execute(
      `INSERT INTO auditoria
       (id_usuario, masp, modulo, acao, id_registro, valor_anterior, valor_novo, resultado, justificativa, observacao_tecnica, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user?.id || null,
        user?.masp || null,
        module,
        action,
        recordId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        result,
        justification,
        technicalNote,
        req.ip || null,
        req.get('user-agent') || null
      ]
    );
  } catch (error) {
    console.error('Falha ao registrar auditoria:', error.message);
  }
}
