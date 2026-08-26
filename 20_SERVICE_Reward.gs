/** Estrutura inicial do fluxo de pedidos de recompensa. */

function cleanReward_(reward) {
  const copy = Object.assign({}, reward);
  delete copy._row;
  return copy;
}

function canViewReward_(context, reward) {
  if (hasPermission_(context, 'recompensas.visualizar_todos') || hasPermission_(context, 'recompensas.analisar')) return true;
  return String(reward.CRIADO_POR) === String(context.user.ID_USUARIO) || String(reward.ID_PESSOA_SOLICITANTE) === String(context.user.ID_PESSOA || '');
}

function listRewards_(context, payload) {
  requirePermission_(context, 'recompensas.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS').filter(function (r) { return canViewReward_(context, r); });
  rows = searchRows_(rows, options.query, ['NUMERO', 'TITULO', 'DESCRICAO_FATO', 'SOLICITANTE_NOME', 'SETOR', 'STATUS']);
  if (options.status) rows = rows.filter(function (r) { return r.STATUS === normalizeUpper_(options.status); });
  return paginate_(sortByDateDesc_(rows, 'CRIADO_EM'), options);
}

function getReward_(context, payload) {
  requirePermission_(context, 'recompensas.visualizar');
  requireFields_(payload, ['id']);
  const reward = repositoryFindOne_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', 'ID_PEDIDO', payload.id);
  if (!reward || !canViewReward_(context, reward)) throw appError_('REWARD_NOT_FOUND', 'Pedido não encontrado ou sem acesso.');
  return {
    reward: cleanReward_(reward),
    people: repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDO_PESSOAS').filter(function (p) { return String(p.ID_PEDIDO) === String(reward.ID_PEDIDO); }),
    history: sortByDateDesc_(repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'HISTORICO_RECOMPENSA').filter(function (h) { return String(h.ID_PEDIDO) === String(reward.ID_PEDIDO); }), 'DATA_HORA'),
    opinions: repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PARECERES').filter(function (p) { return String(p.ID_PEDIDO) === String(reward.ID_PEDIDO); })
  };
}

function nextRewardNumber_() {
  const year = Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyy');
  const rows = repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS').filter(function (r) { return String(r.NUMERO || '').slice(-4) === year; });
  const max = rows.reduce(function (value, row) {
    const number = Number(String(row.NUMERO || '').split('/')[0]);
    return Number.isFinite(number) ? Math.max(value, number) : value;
  }, 0);
  return String(max + 1).padStart(4, '0') + '/' + year;
}

function saveReward_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_PEDIDO);
  requirePermission_(context, isEdit ? 'recompensas.editar_proprio' : 'recompensas.criar');
  requireFields_(payload, ['TITULO', 'DESCRICAO_FATO', 'DATA_FATO']);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', 'ID_PEDIDO', payload.ID_PEDIDO) : null;
  if (isEdit && (!current || String(current.CRIADO_POR) !== String(context.user.ID_USUARIO) || current.STATUS !== 'RASCUNHO')) {
    throw appError_('REWARD_NOT_EDITABLE', 'Este pedido não pode mais ser editado por você.');
  }
  const timestamp = now_();
  const record = {
    ID_PEDIDO: isEdit ? current.ID_PEDIDO : uuid_(), NUMERO: isEdit ? current.NUMERO : nextRewardNumber_(),
    TITULO: normalizeText_(payload.TITULO), DESCRICAO_FATO: normalizeText_(payload.DESCRICAO_FATO), DATA_FATO: toDate_(payload.DATA_FATO),
    LOCAL_FATO: normalizeText_(payload.LOCAL_FATO), FUNDAMENTACAO: normalizeText_(payload.FUNDAMENTACAO),
    ID_PESSOA_SOLICITANTE: context.user.ID_PESSOA || normalizeText_(payload.ID_PESSOA_SOLICITANTE), SOLICITANTE_NOME: context.user.NOME,
    SETOR: normalizeText_(payload.SETOR || context.user.SETOR), TIPO_RECOMPENSA: normalizeText_(payload.TIPO_RECOMPENSA),
    STATUS: isEdit ? current.STATUS : 'RASCUNHO', PARECER_FINAL: isEdit ? current.PARECER_FINAL : '', DECISAO_EM: isEdit ? current.DECISAO_EM : '',
    DECIDIDO_POR: isEdit ? current.DECIDIDO_POR : '', OBSERVACOES: normalizeText_(payload.OBSERVACOES),
    PASTA_DRIVE_ID: isEdit ? current.PASTA_DRIVE_ID : '', CRIADO_EM: isEdit ? current.CRIADO_EM : timestamp,
    CRIADO_POR: isEdit ? current.CRIADO_POR : context.user.ID_USUARIO, ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
  };
  if (!isEdit) {
    try { record.PASTA_DRIVE_ID = ensureEntityFolder_('RECOMPENSA', record.NUMERO.replace('/', '-') + '_' + record.TITULO).getId(); } catch (error) { record.PASTA_DRIVE_ID = ''; }
  }
  const saved = isEdit
    ? repositoryUpdate_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', current._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', record);
  if (Array.isArray(payload.PESSOAS_IDS)) {
    payload.PESSOAS_IDS.forEach(function (personId) {
      const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', personId);
      if (!person) return;
      const exists = repositoryFindMany_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDO_PESSOAS', function (p) { return String(p.ID_PEDIDO) === String(saved.ID_PEDIDO) && String(p.ID_PESSOA) === String(personId); });
      if (!exists.length) repositoryAppend_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDO_PESSOAS', { ID: uuid_(), ID_PEDIDO: saved.ID_PEDIDO, ID_PESSOA: person.ID_PESSOA, NOME: person.NOME_COMPLETO, MASP: person.MASP, PAPEL: 'INDICADO', CRIADO_EM: timestamp });
    });
  }
  appendRewardHistory_(saved.ID_PEDIDO, isEdit ? 'EDITADO' : 'CRIADO', isEdit ? current.STATUS : '', saved.STATUS, context, payload.OBSERVACOES);
  audit_(context, 'recompensas', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_PEDIDO, current, saved, 'SUCESSO');
  return cleanReward_(saved);
}

function transitionReward_(context, payload) {
  requireFields_(payload, ['id', 'action']);
  const reward = repositoryFindOne_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', 'ID_PEDIDO', payload.id);
  if (!reward) throw appError_('REWARD_NOT_FOUND', 'Pedido não encontrado.');
  const action = normalizeUpper_(payload.action);
  const transitions = {
    ENVIAR: { from: ['RASCUNHO'], to: 'ENVIADO', permission: 'recompensas.editar_proprio', own: true },
    INICIAR_ANALISE: { from: ['ENVIADO'], to: 'EM_ANALISE', permission: 'recompensas.analisar' },
    EMITIR_PARECER: { from: ['EM_ANALISE'], to: 'PARECER', permission: 'recompensas.emitir_parecer' },
    APROVAR: { from: ['EM_ANALISE', 'PARECER'], to: 'APROVADO', permission: 'recompensas.aprovar' },
    INDEFERIR: { from: ['EM_ANALISE', 'PARECER'], to: 'INDEFERIDO', permission: 'recompensas.indeferir' },
    CANCELAR: { from: ['RASCUNHO', 'ENVIADO'], to: 'CANCELADO', permission: 'recompensas.cancelar', own: true }
  };
  const rule = transitions[action];
  if (!rule || rule.from.indexOf(reward.STATUS) < 0) throw appError_('INVALID_TRANSITION', 'Essa mudança não é permitida no estado atual.');
  requirePermission_(context, rule.permission);
  if (rule.own && String(reward.CRIADO_POR) !== String(context.user.ID_USUARIO) && !hasPermission_(context, 'recompensas.visualizar_todos')) throw appError_('FORBIDDEN', 'Você não pode alterar este pedido.');
  const patch = { STATUS: rule.to, ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO };
  if (action === 'APROVAR' || action === 'INDEFERIR') {
    patch.PARECER_FINAL = normalizeText_(payload.opinion); patch.DECISAO_EM = now_(); patch.DECIDIDO_POR = context.user.ID_USUARIO;
  }
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS', reward._row, patch);
  if (normalizeText_(payload.opinion)) repositoryAppend_(APP_CONFIG.DATABASES.REWARDS, 'PARECERES', { ID_PARECER: uuid_(), ID_PEDIDO: reward.ID_PEDIDO, TIPO: action, TEXTO: normalizeText_(payload.opinion), ID_USUARIO: context.user.ID_USUARIO, NOME_USUARIO: context.user.NOME, CRIADO_EM: now_() });
  appendRewardHistory_(reward.ID_PEDIDO, action, reward.STATUS, rule.to, context, payload.opinion);
  audit_(context, 'recompensas', action, reward.ID_PEDIDO, { STATUS: reward.STATUS }, { STATUS: rule.to }, 'SUCESSO', payload.opinion || '');
  return cleanReward_(saved);
}

function appendRewardHistory_(id, action, from, to, context, observation) {
  repositoryAppend_(APP_CONFIG.DATABASES.REWARDS, 'HISTORICO_RECOMPENSA', {
    ID: uuid_(), ID_PEDIDO: id, DATA_HORA: now_(), ACAO: action, STATUS_ANTERIOR: from,
    STATUS_NOVO: to, ID_USUARIO: context.user.ID_USUARIO, NOME_USUARIO: context.user.NOME, OBSERVACOES: normalizeText_(observation)
  });
}
