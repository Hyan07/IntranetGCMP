import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../config/db.js';
import { AppError, normalizeMasp } from '../lib/http.js';

const editableFields = {
  nomeCompleto: 'nome_completo', nomeSocial: 'nome_social', masp: 'masp', cpf: 'cpf', rg: 'rg',
  dataNascimento: 'data_nascimento', sexo: 'sexo', telefone: 'telefone', email: 'email', endereco: 'endereco',
  bairro: 'bairro', municipioEndereco: 'municipio_endereco', ufEndereco: 'uf_endereco', cep: 'cep',
  nomePai: 'nome_pai', nomeMae: 'nome_mae', paisNascimento: 'pais_nascimento', municipioNascimento: 'municipio_nascimento',
  ufNascimento: 'uf_nascimento', estadoCivil: 'estado_civil', rgDataEmissao: 'rg_data_emissao',
  rgOrgaoExpedidor: 'rg_orgao_expedidor', rgUf: 'rg_uf', tituloEleitor: 'titulo_eleitor', cargo: 'cargo',
  funcao: 'funcao', setor: 'setor', equipe: 'equipe', dataAdmissao: 'data_admissao', tipoVinculo: 'tipo_vinculo',
  tipoSanguineo: 'tipo_sanguineo', porteArmaNumero: 'porte_arma_numero', armaInstitucionalNumero: 'arma_institucional_numero',
  porteArmaValidade: 'porte_arma_validade', fotoUrl: 'foto_url'
};

function normalizeValue(key, value) {
  if (value == null) return null;
  if (key === 'masp') return normalizeMasp(value);
  if (key === 'cpf') return String(value).replace(/\D/g, '') || null;
  if (key === 'email') return String(value).trim().toLowerCase() || null;
  if (['ufEndereco','ufNascimento','rgUf','sexo','estadoCivil','tipoSanguineo'].includes(key)) return String(value).trim().toUpperCase() || null;
  return typeof value === 'string' ? (value.trim() || null) : value;
}

function clientPerson(row) {
  if (!row) return null;
  const safe = { ...row };
  delete safe.observacoes;
  delete safe.cpf_pendente_conferencia;
  return safe;
}

export async function getOwnProfile(userId) {
  const [rows] = await pool.execute(`SELECT p.* FROM usuarios u JOIN pessoas p ON p.id=u.id_pessoa WHERE u.id=? LIMIT 1`, [userId]);
  return clientPerson(rows[0]);
}

export async function getOwnRequests(userId) {
  const [rows] = await pool.execute(`SELECT id,status,campos_alterados,justificativa,solicitado_em,analisado_em,observacao_admin FROM solicitacoes_atualizacao WHERE id_usuario=? ORDER BY solicitado_em DESC`, [userId]);
  return rows;
}

export async function requestProfileUpdate(sessionUser, payload) {
  return transaction(async (db) => {
    const [users] = await db.execute(`SELECT u.id AS user_id,u.id_pessoa,u.masp AS user_masp,u.nome AS user_nome,p.* FROM usuarios u JOIN pessoas p ON p.id=u.id_pessoa WHERE u.id=? FOR UPDATE`, [sessionUser.id]);
    const person = users[0];
    if (!person) throw new AppError(409,'PERSON_LINK_REQUIRED','Seu usuário precisa estar vinculado ao cadastro de Pessoal.');
    const [pending] = await db.execute(`SELECT id FROM solicitacoes_atualizacao WHERE id_usuario=? AND status='PENDENTE' LIMIT 1 FOR UPDATE`, [sessionUser.id]);
    const requested = {}, previous = {}, changed = [];
    for (const [inputKey,column] of Object.entries(editableFields)) {
      previous[column] = person[column] ?? null;
      const next = Object.prototype.hasOwnProperty.call(payload,inputKey) ? normalizeValue(inputKey,payload[inputKey]) : previous[column];
      requested[column] = next;
      if (String(previous[column] ?? '') !== String(next ?? '')) changed.push(column);
    }
    if (!changed.length) throw new AppError(400,'NO_PROFILE_CHANGES','Nenhuma informação foi alterada.');
    if (!requested.nome_completo || !requested.masp || !requested.email) throw new AppError(400,'INVALID_PROFILE','Nome, MASP e e-mail são obrigatórios.');
    const id = pending[0]?.id || randomUUID();
    if (pending[0]) {
      await db.execute(`UPDATE solicitacoes_atualizacao SET masp=?,nome=?,dados_anteriores=?,dados_solicitados=?,campos_alterados=?,justificativa=?,solicitado_em=NOW(),analisado_em=NULL,analisado_por=NULL,observacao_admin=NULL,status='PENDENTE' WHERE id=?`, [sessionUser.masp,sessionUser.nome,JSON.stringify(previous),JSON.stringify(requested),JSON.stringify(changed),String(payload.justificativa||'').trim()||null,id]);
    } else {
      await db.execute(`INSERT INTO solicitacoes_atualizacao (id,id_usuario,id_pessoa,masp,nome,dados_anteriores,dados_solicitados,campos_alterados,justificativa,status) VALUES (?,?,?,?,?,?,?,?,?,'PENDENTE')`, [id,sessionUser.id,person.id_pessoa,sessionUser.masp,sessionUser.nome,JSON.stringify(previous),JSON.stringify(requested),JSON.stringify(changed),String(payload.justificativa||'').trim()||null]);
    }
    const [admins] = await db.execute(`SELECT DISTINCT up.id_usuario FROM usuario_permissoes up JOIN permissoes p ON p.id=up.id_permissao JOIN usuarios u ON u.id=up.id_usuario WHERE p.codigo='pessoal.editar' AND p.ativa=1 AND up.permitido=1 AND u.status='ATIVO' AND u.id<>?`, [sessionUser.id]);
    for (const admin of admins) await db.execute(`INSERT INTO notificacoes (id,id_usuario,titulo,mensagem,tipo,modulo,id_registro) VALUES (?,?,'Atualização cadastral pendente',?,'INFO','pessoal',?)`, [randomUUID(),admin.id_usuario,`${sessionUser.nome} solicitou alteração em ${changed.length} campo(s).`,id]);
    return { id,status:'PENDENTE',changedFields:changed };
  });
}

export async function listProfileRequests({ status='', q='' }={}) {
  const params=[], where=[];
  if (status) { where.push('s.status=?'); params.push(String(status).toUpperCase()); }
  if (q) { const like=`%${String(q).trim()}%`; where.push('(s.nome LIKE ? OR s.masp LIKE ? OR s.justificativa LIKE ?)'); params.push(like,like,like); }
  const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
  const [rows]=await pool.execute(`SELECT s.id,s.id_usuario,s.id_pessoa,s.masp,s.nome,s.campos_alterados,s.justificativa,s.status,s.solicitado_em,s.analisado_em,s.observacao_admin FROM solicitacoes_atualizacao s ${clause} ORDER BY s.solicitado_em DESC LIMIT 300`,params);
  return rows;
}

export async function reviewProfileRequest(reviewer, requestId, decision, note) {
  const normalizedDecision=String(decision||'').toUpperCase();
  if (!['APROVAR','RECUSAR'].includes(normalizedDecision)) throw new AppError(400,'INVALID_DECISION','Decisão inválida.');
  return transaction(async(db)=>{
    const [rows]=await db.execute('SELECT * FROM solicitacoes_atualizacao WHERE id=? FOR UPDATE',[requestId]);
    const request=rows[0];
    if(!request) throw new AppError(404,'PROFILE_REQUEST_NOT_FOUND','Solicitação não encontrada.');
    if(request.status!=='PENDENTE') throw new AppError(409,'PROFILE_REQUEST_REVIEWED','Esta solicitação já foi analisada.');
    if(request.id_usuario===reviewer.id) throw new AppError(403,'SELF_APPROVAL_FORBIDDEN','Outro administrador deve analisar sua própria solicitação.');
    let applied=null;
    if(normalizedDecision==='APROVAR'){
      const requested=typeof request.dados_solicitados==='string'?JSON.parse(request.dados_solicitados):request.dados_solicitados;
      const [persons]=await db.execute('SELECT * FROM pessoas WHERE id=? FOR UPDATE',[request.id_pessoa]);
      const person=persons[0];
      if(!person) throw new AppError(404,'PERSON_NOT_FOUND','Cadastro de Pessoal não encontrado.');
      const columns=Object.values(editableFields), assignments=columns.map((column)=>`${column}=?`).join(', '), values=columns.map((column)=>requested[column]??null);
      await db.execute(`UPDATE pessoas SET ${assignments}, atualizado_em=NOW() WHERE id=?`,[...values,request.id_pessoa]);
      await db.execute(`UPDATE usuarios SET nome=?,masp=?,email=?,telefone=?,cargo=?,funcao=?,setor=?,atualizado_em=NOW() WHERE id=?`,[requested.nome_completo,requested.masp,requested.email,requested.telefone,requested.cargo,requested.funcao,requested.setor,request.id_usuario]);
      await db.execute(`INSERT INTO historico_funcional (id,id_pessoa,tipo,valor_anterior,valor_novo,id_usuario,observacoes) VALUES (?,?,'ATUALIZACAO_CADASTRAL_APROVADA',?,?,?,?)`,[randomUUID(),request.id_pessoa,request.dados_anteriores,request.dados_solicitados,reviewer.id,`Solicitação ${request.id}`]);
      applied=requested;
    }
    const finalStatus=normalizedDecision==='APROVAR'?'APROVADA':'RECUSADA';
    await db.execute(`UPDATE solicitacoes_atualizacao SET status=?,analisado_em=NOW(),analisado_por=?,observacao_admin=? WHERE id=?`,[finalStatus,reviewer.id,String(note||'').trim()||null,requestId]);
    await db.execute(`INSERT INTO notificacoes (id,id_usuario,titulo,mensagem,tipo,modulo,id_registro) VALUES (?,?,?,?,?,'perfil',?)`,[randomUUID(),request.id_usuario,`Solicitação cadastral ${finalStatus.toLowerCase()}`,String(note||'').trim()||(finalStatus==='APROVADA'?'As alterações foram aplicadas ao seu cadastro.':'A solicitação não foi autorizada.'),finalStatus==='APROVADA'?'SUCESSO':'AVISO',requestId]);
    return { id:requestId,status:finalStatus,applied };
  });
}
