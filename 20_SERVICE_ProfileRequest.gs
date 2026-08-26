/** Solicitações de atualização dos dados do próprio usuário, sujeitas à aprovação administrativa. */

const PROFILE_UPDATE_SHEET = 'SOLICITACOES_ATUALIZACAO';
const PROFILE_UPDATE_FIELDS = Object.freeze([
  'NOME_COMPLETO', 'NOME_SOCIAL', 'MASP', 'CPF', 'RG', 'DATA_NASCIMENTO', 'SEXO',
  'TELEFONE', 'EMAIL', 'ENDERECO', 'BAIRRO', 'MUNICIPIO_ENDERECO', 'UF_ENDERECO', 'CEP',
  'NOME_PAI', 'NOME_MAE', 'PAIS_NASCIMENTO', 'MUNICIPIO_NASCIMENTO', 'UF_NASCIMENTO',
  'ESTADO_CIVIL', 'RG_DATA_EMISSAO', 'RG_ORGAO_EXPEDIDOR', 'RG_UF', 'TITULO_ELEITOR',
  'CARGO', 'FUNCAO', 'SETOR', 'EQUIPE', 'DATA_ADMISSAO', 'TIPO_VINCULO', 'TIPO_SANGUINEO',
  'PORTE_ARMA_NUMERO', 'ARMA_INSTITUCIONAL_NUMERO', 'PORTE_ARMA_VALIDADE', 'FOTO_URL'
]);

const PROFILE_UPDATE_DATE_FIELDS = Object.freeze([
  'DATA_NASCIMENTO', 'RG_DATA_EMISSAO', 'DATA_ADMISSAO', 'PORTE_ARMA_VALIDADE'
]);

function ownPersonForClient_(person) {
  if (!person) return null;
  const copy = Object.assign({}, person);
  ['_row', 'PASTA_DRIVE_ID', 'OBSERVACOES', 'CPF_PENDENTE_CONFERENCIA'].forEach(function (key) { delete copy[key]; });
  copy.MASP_FORMATADO = formatMasp_(copy.MASP);
  return copy;
}

function profileUpdateEnsureSheet_() {
  return repositoryAssertInstalled_(
    APP_CONFIG.DATABASES.PERSONNEL,
    PROFILE_UPDATE_SHEET,
    'PROFILE_UPDATE_NOT_INSTALLED',
    'A aba de solicitações de atualização não está instalada. Execute o reparo estrutural controlado no ambiente DEV.'
  );
}

function profileUpdateRequestsForUser_(userId) {
  profileUpdateEnsureSheet_();
  return repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET)
    .filter(function (item) { return String(item.ID_USUARIO) === String(userId); })
    .sort(function (a, b) { return new Date(b.SOLICITADO_EM || 0).getTime() - new Date(a.SOLICITADO_EM || 0).getTime(); });
}

function profileUpdateRequestsSafe_(userId) {
  try { return profileUpdateRequestsForUser_(userId); }
  catch (error) { if (error.code === 'PROFILE_UPDATE_NOT_INSTALLED') return []; throw error; }
}

function profileUpdateRequestForClient_(request) {
  const copy = Object.assign({}, request);
  delete copy._row;
  try { copy.requestedData = JSON.parse(copy.DADOS_SOLICITADOS || '{}'); } catch (error) { copy.requestedData = {}; }
  try { copy.previousData = JSON.parse(copy.DADOS_ANTERIORES || '{}'); } catch (error) { copy.previousData = {}; }
  try { copy.changedFields = JSON.parse(copy.CAMPOS_ALTERADOS || '[]'); } catch (error) { copy.changedFields = []; }
  delete copy.DADOS_SOLICITADOS;
  delete copy.DADOS_ANTERIORES;
  delete copy.CAMPOS_ALTERADOS;
  copy.MASP_FORMATADO = formatMasp_(copy.MASP);
  return copy;
}

function getOwnPendingProfileUpdate_(context) {
  try {
    const pending = profileUpdateRequestsForUser_(context.user.ID_USUARIO).find(function (item) { return normalizeUpper_(item.STATUS) === 'PENDENTE'; });
    return pending ? profileUpdateRequestForClient_(pending) : null;
  } catch (error) {
    if (error.code === 'PROFILE_UPDATE_NOT_INSTALLED') return null;
    throw error;
  }
}

function requestOwnProfileUpdate_(context, payload) {
  profileUpdateEnsureSheet_();
  if (!context.user.ID_PESSOA) throw appError_('PERSON_LINK_REQUIRED', 'Seu usuário precisa estar vinculado ao cadastro de Pessoal antes de solicitar alterações.');
  const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', context.user.ID_PESSOA);
  if (!person) throw appError_('PERSON_NOT_FOUND', 'Seu cadastro de Pessoal não foi encontrado.');
  const requested = profileUpdateNormalizeData_(payload || {}, person);
  const previous = profileUpdateSnapshot_(person);
  const changedFields = PROFILE_UPDATE_FIELDS.filter(function (field) {
    return profileUpdateComparable_(previous[field]) !== profileUpdateComparable_(requested[field]);
  });
  if (!changedFields.length) throw appError_('NO_PROFILE_CHANGES', 'Nenhuma informação foi alterada.');

  const existing = profileUpdateRequestsForUser_(context.user.ID_USUARIO).find(function (item) { return normalizeUpper_(item.STATUS) === 'PENDENTE'; });
  const timestamp = now_();
  const record = {
    ID_SOLICITACAO: existing ? existing.ID_SOLICITACAO : uuid_(),
    ID_USUARIO: context.user.ID_USUARIO, ID_PESSOA: person.ID_PESSOA,
    MASP: context.user.MASP, NOME: context.user.NOME,
    DADOS_ANTERIORES: JSON.stringify(previous), DADOS_SOLICITADOS: JSON.stringify(requested),
    CAMPOS_ALTERADOS: JSON.stringify(changedFields), JUSTIFICATIVA: normalizeText_(payload.JUSTIFICATIVA),
    STATUS: 'PENDENTE', SOLICITADO_EM: timestamp, ANALISADO_EM: '', ANALISADO_POR: '', OBSERVACAO_ADMIN: ''
  };
  const saved = existing
    ? repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET, existing._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET, record);
  profileUpdateNotifyAdministrators_(context, saved, changedFields);
  audit_(context, 'perfil', existing ? 'ATUALIZAR_SOLICITACAO_DADOS' : 'SOLICITAR_ATUALIZACAO_DADOS', saved.ID_SOLICITACAO, previous, requested, 'SUCESSO', record.JUSTIFICATIVA);
  return profileUpdateRequestForClient_(saved);
}

function profileUpdateNormalizeData_(payload, current) {
  const output = {};
  PROFILE_UPDATE_FIELDS.forEach(function (field) {
    let value = Object.prototype.hasOwnProperty.call(payload, field) ? payload[field] : current[field];
    if (PROFILE_UPDATE_DATE_FIELDS.indexOf(field) >= 0) value = value ? toDate_(value) : '';
    else value = normalizeText_(value);
    output[field] = value;
  });
  requireFields_(output, ['NOME_COMPLETO', 'MASP', 'EMAIL']);
  output.MASP = validateMasp_(output.MASP);
  output.CPF = output.CPF ? validateCpf_(output.CPF, false) : '';
  output.EMAIL = validateEmail_(output.EMAIL, true);
  ['UF_ENDERECO', 'UF_NASCIMENTO', 'RG_UF', 'SEXO', 'ESTADO_CIVIL', 'TIPO_SANGUINEO'].forEach(function (field) { output[field] = normalizeUpper_(output[field]); });
  return output;
}

function profileUpdateSnapshot_(person) {
  const output = {};
  PROFILE_UPDATE_FIELDS.forEach(function (field) { output[field] = person[field] || ''; });
  return output;
}

function profileUpdateComparable_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : null;
  if (date) return date.toISOString().slice(0, 10);
  const text = normalizeText_(value);
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) return text.slice(0, 10);
  return normalizeSearchText_(text);
}

function profileUpdateNotifyAdministrators_(context, request, fields) {
  try {
    const permission = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', 'CODIGO', 'pessoal.editar');
    if (!permission) return;
    const adminIds = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES').filter(function (item) {
      return String(item.ID_PERMISSAO) === String(permission.ID_PERMISSAO) && normalizeBoolean_(item.PERMITIDO);
    }).map(function (item) { return String(item.ID_USUARIO); });
    repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS').filter(function (user) {
      return adminIds.indexOf(String(user.ID_USUARIO)) >= 0 && normalizeUpper_(user.STATUS) === 'ATIVO' && String(user.ID_USUARIO) !== String(context.user.ID_USUARIO);
    }).forEach(function (admin) {
      repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', {
        ID: uuid_(), ID_USUARIO: admin.ID_USUARIO, TITULO: 'Atualização cadastral pendente',
        MENSAGEM: context.user.NOME + ' solicitou alteração em ' + fields.length + ' campo(s).',
        TIPO: 'INFO', MODULO: 'usuarios', ID_REGISTRO: request.ID_SOLICITACAO,
        LIDA: false, CRIADO_EM: now_(), LIDA_EM: ''
      });
    });
  } catch (error) {
    console.warn('Não foi possível notificar os administradores: ' + error.message);
  }
}

function listProfileUpdateRequests_(context, payload) {
  requirePermission_(context, 'pessoal.editar');
  profileUpdateEnsureSheet_();
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET);
  rows = searchRows_(rows, options.query, ['NOME', 'MASP', 'STATUS', 'JUSTIFICATIVA', 'CAMPOS_ALTERADOS', 'DADOS_SOLICITADOS']);
  if (options.status) rows = rows.filter(function (item) { return normalizeUpper_(item.STATUS) === normalizeUpper_(options.status); });
  rows.sort(function (a, b) { return new Date(b.SOLICITADO_EM || 0).getTime() - new Date(a.SOLICITADO_EM || 0).getTime(); });
  const page = paginate_(rows, options);
  page.items = page.items.map(profileUpdateRequestForClient_);
  return page;
}

function reviewProfileUpdateRequest_(context, payload) {
  requirePermission_(context, 'pessoal.editar');
  requireFields_(payload, ['id', 'decision']);
  profileUpdateEnsureSheet_();
  const decision = validateStatus_(payload.decision, ['APROVAR', 'RECUSAR'], 'Decisão');
  return withScriptLock_(function () {
    const request = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET, 'ID_SOLICITACAO', payload.id);
    if (!request) throw appError_('PROFILE_REQUEST_NOT_FOUND', 'Solicitação não encontrada.');
    if (normalizeUpper_(request.STATUS) !== 'PENDENTE') throw appError_('PROFILE_REQUEST_REVIEWED', 'Esta solicitação já foi analisada.');
    if (String(request.ID_USUARIO) === String(context.user.ID_USUARIO)) throw appError_('SELF_APPROVAL_FORBIDDEN', 'Outro administrador deve analisar sua própria solicitação.');
    const timestamp = now_();
    let applied = null;
    if (decision === 'APROVAR') applied = applyProfileUpdateRequest_(context, request);
    const status = decision === 'APROVAR' ? 'APROVADA' : 'RECUSADA';
    const saved = repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, PROFILE_UPDATE_SHEET, request._row, {
      STATUS: status, ANALISADO_EM: timestamp, ANALISADO_POR: context.user.ID_USUARIO,
      OBSERVACAO_ADMIN: normalizeText_(payload.note)
    });
    repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', {
      ID: uuid_(), ID_USUARIO: request.ID_USUARIO, TITULO: 'Solicitação cadastral ' + status.toLowerCase(),
      MENSAGEM: normalizeText_(payload.note) || (status === 'APROVADA' ? 'As alterações foram aplicadas ao seu cadastro.' : 'A solicitação não foi autorizada.'),
      TIPO: status === 'APROVADA' ? 'SUCESSO' : 'AVISO', MODULO: 'perfil', ID_REGISTRO: request.ID_SOLICITACAO,
      LIDA: false, CRIADO_EM: timestamp, LIDA_EM: ''
    });
    audit_(context, 'pessoal', decision === 'APROVAR' ? 'APROVAR_ATUALIZACAO_CADASTRAL' : 'RECUSAR_ATUALIZACAO_CADASTRAL', request.ID_SOLICITACAO, request, saved, 'SUCESSO', normalizeText_(payload.note));
    return { request: profileUpdateRequestForClient_(saved), applied: applied };
  });
}

function applyProfileUpdateRequest_(context, request) {
  let requested;
  try { requested = JSON.parse(request.DADOS_SOLICITADOS || '{}'); } catch (error) { throw appError_('PROFILE_REQUEST_INVALID', 'Os dados da solicitação estão inválidos.'); }
  const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', request.ID_PESSOA);
  if (!person) throw appError_('PERSON_NOT_FOUND', 'O cadastro de Pessoal relacionado não foi encontrado.');
  const normalized = profileUpdateNormalizeData_(requested, person);
  validateUnique_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'MASP', normalized.MASP, 'ID_PESSOA', person.ID_PESSOA, normalizeMasp_);
  if (normalized.CPF) validateUnique_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'CPF', normalized.CPF, 'ID_PESSOA', person.ID_PESSOA, normalizeCpf_);
  const patch = Object.assign({}, normalized, { ATUALIZADO_EM: now_() });
  const savedPerson = repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', person._row, patch);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', request.ID_USUARIO);
  let savedUser = null;
  if (user) {
    validateUnique_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', normalized.MASP, 'ID_USUARIO', user.ID_USUARIO, normalizeMasp_);
    validateUnique_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'EMAIL', normalized.EMAIL, 'ID_USUARIO', user.ID_USUARIO, function (value) { return normalizeText_(value).toLowerCase(); });
    savedUser = repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, {
      NOME: normalized.NOME_COMPLETO, MASP: normalized.MASP, EMAIL: normalized.EMAIL, TELEFONE: normalized.TELEFONE,
      CARGO: normalized.CARGO, FUNCAO: normalized.FUNCAO, SETOR: normalized.SETOR, ATUALIZADO_EM: now_()
    });
  }
  repositoryAppend_(APP_CONFIG.DATABASES.PERSONNEL, 'HISTORICO_FUNCIONAL', {
    ID: uuid_(), ID_PESSOA: person.ID_PESSOA, DATA_HORA: now_(), TIPO: 'ATUALIZACAO_APROVADA_PELO_USUARIO',
    VALOR_ANTERIOR: JSON.stringify(profileUpdateSnapshot_(person)), VALOR_NOVO: JSON.stringify(profileUpdateSnapshot_(savedPerson)),
    ID_USUARIO: context.user.ID_USUARIO, OBSERVACOES: 'Solicitação ' + request.ID_SOLICITACAO
  });
  return { person: ownPersonForClient_(savedPerson), user: omitSensitiveUser_(savedUser) };
}
