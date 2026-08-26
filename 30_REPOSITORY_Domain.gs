/** Repositories por domínio. Inicialmente são fachadas compatíveis com a camada atual. */

function ConfigRepository_() {
  return {
    settings: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'CONFIGURACOES'); },
    findSetting: function (key) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'CONFIGURACOES', 'CHAVE', key); },
    users: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS'); },
    permissions: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES'); },
    userPermissions: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES'); },
    notifications: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES'); },
    audit: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'AUDITORIA'); },
    appendAudit: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'AUDITORIA', record); }
  };
}

function AuthRepository_() {
  return {
    findUserByMasp: function (masp) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_); },
    findUserById: function (id) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', id); },
    updateUser: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', rowNumber, patch); },
    createSession: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', record); },
    findSession: function (token) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', 'TOKEN', token); },
    updateSession: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', rowNumber, patch); },
    recoveryRequests: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'RECUPERACAO_SENHA'); },
    createRecoveryRequest: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'RECUPERACAO_SENHA', record); }
  };
}

function UserRepository_() {
  return {
    list: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS'); },
    findById: function (id) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', id); },
    findByPersonId: function (id) { return repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_PESSOA', id); },
    append: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', record); },
    update: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', rowNumber, patch); }
  };
}

function PessoalRepository_() {
  return {
    people: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS'); },
    findPersonById: function (id) { return repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', id); },
    documents: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'DOCUMENTOS_PESSOAS'); },
    history: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'HISTORICO_FUNCIONAL'); },
    appendPerson: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', record); },
    updatePerson: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', rowNumber, patch); }
  };
}

function PatrimonioRepository_() {
  return {
    assets: function () { return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS'); },
    findAssetById: function (id) { return repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', id); },
    custodies: function () { return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS'); },
    returns: function () { return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'DEVOLUCOES'); },
    history: function () { return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'HISTORICO_PATRIMONIO'); },
    audit: function () { return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'AUDITORIA_PATRIMONIO'); },
    append: function (sheetName, record) { return repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, sheetName, record); },
    update: function (sheetName, rowNumber, patch) { return repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, sheetName, rowNumber, patch); }
  };
}

function FrotaRepository_() {
  return {
    readAll: function (sheetName) { return repositoryReadAll_(SCHEMA_DATABASE_FROTA_, sheetName); },
    findOne: function (sheetName, field, value, normalizer) { return repositoryFindOne_(SCHEMA_DATABASE_FROTA_, sheetName, field, value, normalizer); },
    append: function (sheetName, record) { return repositoryAppend_(SCHEMA_DATABASE_FROTA_, sheetName, record); },
    appendMany: function (sheetName, records) { return repositoryAppendMany_(SCHEMA_DATABASE_FROTA_, sheetName, records); },
    update: function (sheetName, rowNumber, patch) { return repositoryUpdate_(SCHEMA_DATABASE_FROTA_, sheetName, rowNumber, patch); },
    reversePage: function (sheetName, options, predicate) { return frotaPaginarReversoEmLotes_(sheetName, options, predicate); },
    reverseReport: function (sheetName, options, predicate) { return frotaRelatorioReversoEmLotes_(sheetName, options, predicate); }
  };
}

function EscalaRepository_() {
  return {
    shifts: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS'); },
    members: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'INTEGRANTES_TURNO'); },
    appendShift: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', record); },
    updateShift: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', rowNumber, patch); }
  };
}

function MensagemRepository_() {
  return {
    notifications: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES'); },
    appendNotification: function (record) { return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', record); },
    updateNotification: function (rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', rowNumber, patch); }
  };
}

function EquipamentosRepository_() {
  return PatrimonioRepository_();
}

function DocumentoRepository_() {
  return {
    documents: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS'); },
    files: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_ARQUIVOS'); },
    versions: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VERSOES'); },
    append: function (sheetName, record) { return repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, sheetName, record); },
    update: function (sheetName, rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.DOCUMENTS, sheetName, rowNumber, patch); }
  };
}

function RecompensaRepository_() {
  return {
    requests: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS'); },
    people: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDO_PESSOAS'); },
    opinions: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PARECERES'); },
    history: function () { return repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'HISTORICO_RECOMPENSA'); },
    append: function (sheetName, record) { return repositoryAppend_(APP_CONFIG.DATABASES.REWARDS, sheetName, record); },
    update: function (sheetName, rowNumber, patch) { return repositoryUpdate_(APP_CONFIG.DATABASES.REWARDS, sheetName, rowNumber, patch); }
  };
}
