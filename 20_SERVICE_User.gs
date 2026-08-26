/** Cadastro e administração de usuários. */

function listUsers_(context, payload) {
  requirePermission_(context, 'usuarios.visualizar');
  const options = payload || {};
  const rows = filterUsers_(context, options);
  const page = paginate_(rows, options);
  page.items = page.items.map(function (row) { return omitSensitiveUser_(userWithoutSearchIndex_(row)); });
  page.filters = parseSearchTerms_(options.query).map(function (item) { return item.raw; });
  if (options.status) page.filters.push('Situação: ' + normalizeUpper_(options.status));
  return page;
}

function filterUsers_(context, options) {
  const people = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS');
  const peopleById = {};
  people.forEach(function (person) { peopleById[String(person.ID_PESSOA)] = sanitizePersonForContext_(context, person); });
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS').map(function (user) {
    const copy = Object.assign({}, user);
    const person = peopleById[String(user.ID_PESSOA || '')] || null;
    copy.PESSOA_BUSCA = person ? Object.keys(person).filter(function (key) { return key !== 'STATUS'; }).map(function (key) { return person[key]; }).join(' ') : '';
    return copy;
  });
  rows = searchRows_(rows, options.query, ['NOME', 'MASP', 'EMAIL', 'TELEFONE', 'SETOR', 'FUNCAO', 'CARGO', 'STATUS', 'OBSERVACOES', 'PESSOA_BUSCA']);
  if (options.status) rows = rows.filter(function (row) { return normalizeUpper_(row.STATUS) === normalizeUpper_(options.status); });
  rows.sort(function (a, b) { return String(a.NOME).localeCompare(String(b.NOME), 'pt-BR'); });
  return rows;
}

function userWithoutSearchIndex_(row) {
  const copy = Object.assign({}, row);
  delete copy.PESSOA_BUSCA;
  return copy;
}

function exportUsers_(context, payload) {
  requirePermission_(context, 'usuarios.visualizar');
  const rows = filterUsers_(context, payload || {}).map(function (row) {
    const user = omitSensitiveUser_(userWithoutSearchIndex_(row));
    return {
      'Nome': user.NOME || '', 'MASP': user.MASP_FORMATADO || formatMasp_(user.MASP), 'E-mail': user.EMAIL || '',
      'Telefone': user.TELEFONE || '', 'Cargo': user.CARGO || '', 'Função': user.FUNCAO || '', 'Setor': user.SETOR || '',
      'Situação': user.STATUS || '', 'Último acesso': user.ULTIMO_ACESSO || '', 'Criado em': user.CRIADO_EM || '',
      'Atualizado em': user.ATUALIZADO_EM || '', 'Observações': user.OBSERVACOES || ''
    };
  });
  audit_(context, 'usuarios', 'EXPORTAR', '', null, { quantidade: rows.length, filtros: payload || {} }, 'SUCESSO');
  return { filename: 'usuarios_gcmp_' + Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd_HH-mm') + '.csv', rows: rows };
}

/** Prepara um CSV temporário e devolve um link de download do próprio Web App. */
function prepareUsersExport_(context, payload) {
  const exported = exportUsers_(context, payload || {});
  if (!exported.rows.length) throw appError_('EXPORT_EMPTY', 'Nenhum usuário corresponde aos filtros aplicados.');
  const headers = Object.keys(exported.rows[0]);
  const csv = '\ufeff' + [headers].concat(exported.rows.map(function (row) {
    return headers.map(function (header) { return row[header] === null || row[header] === undefined ? '' : row[header]; });
  })).map(function (line) {
    return line.map(function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; }).join(';');
  }).join('\r\n');
  const folder = getOrCreateChildFolder_(getRootFolder_(), 'TEMPORARIOS');
  const file = folder.createFile(Utilities.newBlob(csv, 'text/csv', exported.filename));
  const token = randomToken_(32);
  CacheService.getScriptCache().put('users-export:' + token, JSON.stringify({
    fileId: file.getId(), filename: exported.filename, userId: context.user.ID_USUARIO
  }), 300);
  const serviceUrl = ScriptApp.getService().getUrl();
  if (!serviceUrl) throw appError_('EXPORT_URL_UNAVAILABLE', 'Publique uma nova versão do aplicativo da Web para habilitar a exportação.');
  return { url: serviceUrl + '?downloadUsers=' + encodeURIComponent(token), filename: exported.filename, count: exported.rows.length, expiresInSeconds: 300 };
}

function servePreparedUsersExport_(token) {
  const normalized = normalizeText_(token);
  const cache = CacheService.getScriptCache();
  const raw = normalized ? cache.get('users-export:' + normalized) : '';
  if (!raw) return ContentService.createTextOutput('O link de exportação expirou ou já foi utilizado.').setMimeType(ContentService.MimeType.TEXT);
  cache.remove('users-export:' + normalized);
  try {
    const data = JSON.parse(raw);
    const file = DriveApp.getFileById(data.fileId);
    const content = file.getBlob().getDataAsString('UTF-8');
    try { file.setTrashed(true); } catch (error) { console.warn('Não foi possível remover o CSV temporário: ' + error.message); }
    return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.CSV).downloadAsFile(data.filename || 'usuarios_gcmp.csv');
  } catch (error) {
    return ContentService.createTextOutput('Não foi possível gerar o arquivo de exportação.').setMimeType(ContentService.MimeType.TEXT);
  }
}

function getUser_(context, payload) {
  requirePermission_(context, 'usuarios.visualizar');
  requireFields_(payload, ['id']);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.id);
  if (!user) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  return { user: omitSensitiveUser_(user), permissions: getUserPermissionCodes_(user.ID_USUARIO) };
}

function getUserProfile_(context, payload) {
  requirePermission_(context, 'usuarios.visualizar');
  requireFields_(payload, ['id']);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.id);
  if (!user) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  const person = user.ID_PESSOA ? repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', user.ID_PESSOA) : null;
  const codes = getUserPermissionCodes_(user.ID_USUARIO);
  const catalogByCode = {};
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES').forEach(function (item) { catalogByCode[item.CODIGO] = item; });
  const sessions = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES').filter(function (item) {
    return String(item.ID_USUARIO) === String(user.ID_USUARIO);
  }).sort(function (a, b) { return new Date(b.CRIADO_EM || 0).getTime() - new Date(a.CRIADO_EM || 0).getTime(); }).slice(0, 10).map(function (item) {
    return { createdAt: item.CRIADO_EM, lastActivity: item.ULTIMA_ATIVIDADE, expiresAt: item.EXPIRA_EM, active: normalizeBoolean_(item.ATIVA), reason: item.MOTIVO || '' };
  });
  const requests = profileUpdateRequestsSafe_(user.ID_USUARIO).slice(0, 10).map(profileUpdateRequestForClient_);
  if (!hasPermission_(context, 'pessoal.visualizar_dados_sensiveis') && !hasPermission_(context, 'pessoal.editar')) {
    requests.forEach(function (request) { delete request.requestedData; delete request.previousData; });
  }
  audit_(context, 'usuarios', 'VISUALIZAR_PERFIL_COMPLETO', user.ID_USUARIO, null, null, 'SUCESSO');
  return {
    user: omitSensitiveUser_(user),
    person: person ? sanitizePersonForContext_(context, person) : null,
    permissions: codes.map(function (code) {
      const item = catalogByCode[code] || {};
      return { code: code, module: item.MODULO || String(code).split('.')[0], description: item.DESCRICAO || code };
    }),
    sessions: sessions,
    updateRequests: requests
  };
}

function saveUser_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_USUARIO);
  requirePermission_(context, isEdit ? 'usuarios.editar' : 'usuarios.criar');
  requireFields_(payload, ['NOME', 'MASP', 'EMAIL', 'STATUS']);
  const masp = validateMasp_(payload.MASP);
  const email = validateEmail_(payload.EMAIL, true);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.ID_USUARIO) : null;
  if (isEdit && !current) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  validateUnique_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, 'ID_USUARIO', payload.ID_USUARIO, normalizeMasp_);
  validateUnique_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'EMAIL', email, 'ID_USUARIO', payload.ID_USUARIO, function (v) { return normalizeText_(v).toLowerCase(); });
  if (payload.ID_PESSOA) {
    const linked = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS').find(function (u) {
      return String(u.ID_PESSOA) === String(payload.ID_PESSOA) && String(u.ID_USUARIO) !== String(payload.ID_USUARIO || '');
    });
    if (linked) throw appError_('PERSON_ALREADY_LINKED', 'Essa pessoa já está vinculada a outro usuário.');
  }
  const temporaryPassword = !isEdit ? (normalizeText_(payload.SENHA_INICIAL) || generateTemporaryPassword_()) : '';
  const timestamp = now_();
  const base = {
    ID_USUARIO: isEdit ? current.ID_USUARIO : uuid_(),
    ID_PESSOA: normalizeText_(payload.ID_PESSOA),
    MASP: masp,
    NOME: normalizeText_(payload.NOME),
    EMAIL: email,
    TELEFONE: normalizeText_(payload.TELEFONE),
    CARGO: normalizeText_(payload.CARGO),
    FUNCAO: normalizeText_(payload.FUNCAO),
    SETOR: normalizeText_(payload.SETOR),
    STATUS: validateStatus_(payload.STATUS, ['ATIVO', 'INATIVO', 'AFASTADO', 'BLOQUEADO']),
    OBSERVACOES: normalizeText_(payload.OBSERVACOES),
    ATUALIZADO_EM: timestamp
  };
  let saved;
  if (isEdit) {
    saved = repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', current._row, base);
  } else {
    const passwordRecord = makePasswordRecord_(temporaryPassword);
    saved = repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', Object.assign(base, passwordRecord, {
      TROCAR_SENHA: true,
      TENTATIVAS: 0,
      BLOQUEADO_ATE: '',
      ULTIMO_ACESSO: '',
      CRIADO_EM: timestamp
    }));
  }
  if (Array.isArray(payload.PERMISSOES) && hasPermission_(context, 'usuarios.gerenciar_permissoes')) {
    setUserPermissions_(context, { userId: saved.ID_USUARIO, permissions: payload.PERMISSOES, justification: 'Cadastro/edição de usuário' });
  }
  audit_(context, 'usuarios', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_USUARIO, current ? omitSensitiveUser_(current) : null, omitSensitiveUser_(saved), 'SUCESSO');
  return { user: omitSensitiveUser_(saved), temporaryPassword: isEdit ? null : temporaryPassword };
}

function changeUserStatus_(context, payload) {
  requirePermission_(context, 'usuarios.inativar');
  requireFields_(payload, ['id', 'status']);
  if (String(payload.id) === String(context.user.ID_USUARIO) && normalizeUpper_(payload.status) !== 'ATIVO') {
    throw appError_('SELF_LOCKOUT', 'Você não pode desativar o próprio usuário.');
  }
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.id);
  if (!user) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  const status = validateStatus_(payload.status, ['ATIVO', 'INATIVO', 'AFASTADO', 'BLOQUEADO']);
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, { STATUS: status, ATUALIZADO_EM: now_() });
  if (status !== 'ATIVO') closeAllUserSessions_(user.ID_USUARIO, 'USUARIO_' + status);
  audit_(context, 'usuarios', 'ALTERAR_STATUS', user.ID_USUARIO, { STATUS: user.STATUS }, { STATUS: status }, 'SUCESSO', payload.justification || '');
  return omitSensitiveUser_(saved);
}

function resetUserPassword_(context, payload) {
  requirePermission_(context, 'usuarios.redefinir_senha');
  requireFields_(payload, ['id']);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.id);
  if (!user) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  const temporary = generateTemporaryPassword_();
  const passwordRecord = makePasswordRecord_(temporary);
  repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, Object.assign(passwordRecord, {
    TROCAR_SENHA: true,
    TENTATIVAS: 0,
    BLOQUEADO_ATE: '',
    ATUALIZADO_EM: now_()
  }));
  closeAllUserSessions_(user.ID_USUARIO, 'SENHA_REDEFINIDA_ADMIN');
  audit_(context, 'usuarios', 'REDEFINIR_SENHA', user.ID_USUARIO, null, null, 'SUCESSO', payload.justification || '');
  return { temporaryPassword: temporary };
}
