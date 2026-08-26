/**
 * Ambiente isolado de desenvolvimento.
 * Este arquivo pertence somente ao pacote DEV e não deve ser enviado à produção.
 */

const DEVELOPMENT_PRODUCTION_IDS_ = Object.freeze([
  '1F7MLWPxX1WVMJ8kW0SdFfNfG1nMlqTyvpY6s0gGqWAk',
  '1N7lcmsYhjmj7ObyrkT_-tSMF9Sx2Fi4HFvVMwvg95cw',
  '1JQNA9sQ_eRv8TmTjvEZT1HsUYLJ13sbj0rpqgc9VDf4',
  '1CYIzbs8fbGR2iJAXmSyyzZqxQ3ETnWMuoZe574tU5hY',
  '19hAH2gbWanBJsHsS_KBBmDAi1tI9ueyUzZQXJibtn1M',
  '1UfpMGntx3gM5dIpkm_dW4sXuHNfYtj3HWiEJhv8b2m4',
  '1iKY1OjV1-agiIslGuygA5K-bwHYHQmFUhis4MXYXbkw'
]);

function developmentPropertyValues_() {
  return {
    APP_ENVIRONMENT: 'DEVELOPMENT',
    APP_INSTALLED: 'true',
    ROOT_FOLDER_ID: DEVELOPMENT_CONFIG.ROOT_FOLDER_ID,
    CONFIG_FOLDER_ID: DEVELOPMENT_CONFIG.CONFIG_FOLDER_ID,
    DB_CONFIG_ID: DEVELOPMENT_CONFIG.DB_CONFIG_ID,
    DB_PERSONNEL_ID: DEVELOPMENT_CONFIG.DB_PERSONNEL_ID,
    DB_ASSETS_ID: DEVELOPMENT_CONFIG.DB_ASSETS_ID,
    DB_VEHICLES_ID: DEVELOPMENT_CONFIG.DB_VEHICLES_ID,
    DB_DOCUMENTS_ID: DEVELOPMENT_CONFIG.DB_DOCUMENTS_ID,
    DB_REWARDS_ID: DEVELOPMENT_CONFIG.DB_REWARDS_ID,
    FROTA_SPREADSHEET_ID: DEVELOPMENT_CONFIG.FROTA_SPREADSHEET_ID,
    FROTA_ROOT_FOLDER_ID: DEVELOPMENT_CONFIG.FROTA_ROOT_FOLDER_ID,
    DEV_BACKUP_FOLDER_ID: DEVELOPMENT_CONFIG.BACKUP_FOLDER_ID
  };
}

function assertDevelopmentPackage_() {
  if (APP_CONFIG.ENVIRONMENT !== 'DEVELOPMENT') {
    throw appError_('DEV_PACKAGE_INVALID', 'Este pacote deve ser executado somente como ambiente de desenvolvimento.');
  }
  const expected = developmentPropertyValues_();
  Object.keys(expected).forEach(function (key) {
    const value = String(expected[key] || '');
    if (DEVELOPMENT_PRODUCTION_IDS_.indexOf(value) >= 0) {
      throw appError_('PRODUCTION_ID_BLOCKED', 'Um ID de produção foi bloqueado na configuração DEV: ' + key + '.');
    }
  });
  const actual = getScriptProperties_().getProperties();
  const productionReferences = Object.keys(actual).filter(function (key) {
    return DEVELOPMENT_PRODUCTION_IDS_.indexOf(String(actual[key] || '')) >= 0;
  });
  if (productionReferences.length) {
    throw appError_('PRODUCTION_REFERENCE_FOUND', 'O projeto DEV contém referências de produção nas propriedades: ' + productionReferences.join(', ') + '. Remova-as antes de continuar.');
  }
  return true;
}

function assertDevelopmentConfigured_() {
  assertDevelopmentPackage_();
  const expected = developmentPropertyValues_();
  const actual = getScriptProperties_().getProperties();
  const missing = Object.keys(expected).filter(function (key) { return String(actual[key] || '') !== String(expected[key]); });
  if (missing.length) {
    throw appError_('DEV_NOT_CONFIGURED', 'Execute configurarAmbienteDesenvolvimento() antes de continuar. Propriedades pendentes: ' + missing.join(', ') + '.');
  }
  return true;
}

function configurarAmbienteDesenvolvimento() {
  assertDevelopmentPackage_();
  const properties = getScriptProperties_();
  const values = developmentPropertyValues_();
  properties.setProperties(values, false);
  if (!properties.getProperty(APP_CONFIG.PROPERTY_KEYS.PASSWORD_PEPPER)) getPasswordPepper_();
  resetDataAccessRuntimeCache_();
  try { CacheService.getScriptCache().removeAll(['app-bootstrap', 'permissions-catalog']); } catch (error) { console.warn(error.message); }
  const administrator = criarAcessoAdministradorDev_();
  const report = diagnosticarAmbienteDesenvolvimento();
  report.administrator = administrator;
  console.log('AMBIENTE DEV CONFIGURADO\n' + JSON.stringify(report, null, 2));
  if (administrator.temporaryPassword) {
    console.log('ACESSO DEV — MASP: ' + formatMasp_(administrator.masp) + ' | SENHA TEMPORÁRIA: ' + administrator.temporaryPassword);
  }
  return report;
}

function limparCachesDesenvolvimento() {
  assertDevelopmentConfigured_();
  resetDataAccessRuntimeCache_();
  const sheetGroups = {};
  sheetGroups[APP_CONFIG.DATABASES.CONFIG] = Object.keys(INSTALLATION_SCHEMA.CONFIG || {});
  sheetGroups[APP_CONFIG.DATABASES.PERSONNEL] = Object.keys(INSTALLATION_SCHEMA.PERSONNEL || {});
  sheetGroups[APP_CONFIG.DATABASES.ASSETS] = Object.keys(INSTALLATION_SCHEMA.ASSETS || {});
  sheetGroups[APP_CONFIG.DATABASES.VEHICLES] = Object.keys(INSTALLATION_SCHEMA.VEHICLES || {});
  sheetGroups[APP_CONFIG.DATABASES.DOCUMENTS] = Object.keys(INSTALLATION_SCHEMA.DOCUMENTS || {});
  sheetGroups[APP_CONFIG.DATABASES.REWARDS] = Object.keys(INSTALLATION_SCHEMA.REWARDS || {});
  sheetGroups.FROTA = Object.keys(FROTA_CONFIG.SHEETS || {});

  const keys = ['app-bootstrap', 'permissions-catalog'];
  const prefixes = ['rows-v380:', DATA_ROWS_CACHE_PREFIX_];
  Object.keys(sheetGroups).forEach(function (namespace) {
    sheetGroups[namespace].forEach(function (sheetName) {
      prefixes.forEach(function (prefix) {
        const cacheKey = prefix + String(namespace) + ':' + String(sheetName);
        keys.push(cacheKey);
        for (let index = 0; index < DATA_ROWS_CACHE_MAX_CHUNKS_; index += 1) keys.push(cacheKey + ':' + index);
      });
    });
  });
  try {
    CacheService.getScriptCache().removeAll(keys);
  } catch (error) {
    console.warn(error.message);
  }
  return { ok: true, cachesRemovidos: keys.length, executadoEm: new Date() };
}

function criarAcessoAdministradorDev_() {
  const masp = '99999999';
  const temporaryPassword = generateTemporaryPassword_();
  const passwordRecord = makePasswordRecord_(temporaryPassword);
  const timestamp = now_();
  let user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_);
  const record = Object.assign({
    ID_PESSOA: '', MASP: masp, NOME: 'Administrador DEV', EMAIL: 'dev@instituicao.local', TELEFONE: '',
    CARGO: 'Administrador', FUNCAO: 'Administrador do Sistema', SETOR: 'Desenvolvimento', STATUS: 'ATIVO',
    TROCAR_SENHA: true, TENTATIVAS: 0, BLOQUEADO_ATE: '', ULTIMO_ACESSO: '',
    OBSERVACOES: 'Conta exclusiva do ambiente de desenvolvimento.', ATUALIZADO_EM: timestamp
  }, passwordRecord);
  if (user) {
    user = repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, record);
  } else {
    record.ID_USUARIO = uuid_();
    record.CRIADO_EM = timestamp;
    user = repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', record);
  }
  const permissions = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES').filter(function (item) { return normalizeBoolean_(item.ATIVA); });
  const assignments = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
  const byPermission = {};
  assignments.forEach(function (item) {
    if (String(item.ID_USUARIO) === String(user.ID_USUARIO)) byPermission[String(item.ID_PERMISSAO)] = item;
  });
  permissions.forEach(function (permission) {
    const current = byPermission[String(permission.ID_PERMISSAO)];
    const assignment = { PERMITIDO: true, CONCEDIDO_POR: 'DEV_SETUP', CONCEDIDO_EM: timestamp };
    if (current) repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', current._row, assignment);
    else repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', Object.assign({
      ID: uuid_(), ID_USUARIO: user.ID_USUARIO, ID_PERMISSAO: permission.ID_PERMISSAO
    }, assignment));
  });
  return { userId: user.ID_USUARIO, masp: masp, temporaryPassword: temporaryPassword, permissions: permissions.length };
}

function diagnosticarAmbienteDesenvolvimento() {
  assertDevelopmentPackage_();
  const configured = developmentPropertyValues_();
  const actual = getScriptProperties_().getProperties();
  const checks = {};
  Object.keys(configured).forEach(function (key) {
    checks[key] = { expected: configured[key], actual: actual[key] || '', ok: String(actual[key] || '') === String(configured[key]) };
  });
  const productionReferences = Object.keys(actual).filter(function (key) {
    return DEVELOPMENT_PRODUCTION_IDS_.indexOf(String(actual[key] || '')) >= 0;
  });
  if (productionReferences.length) {
    throw appError_('PRODUCTION_REFERENCE_FOUND', 'O projeto DEV contém referências de produção nas propriedades: ' + productionReferences.join(', ') + '.');
  }
  return {
    environment: APP_CONFIG.ENVIRONMENT,
    safe: Object.keys(checks).every(function (key) { return checks[key].ok; }) && !productionReferences.length,
    emailsSuppressed: true,
    developmentRoot: DEVELOPMENT_CONFIG.ROOT_FOLDER_ID,
    checks: checks,
    productionReferences: productionReferences
  };
}

function developmentDriveItemAllowed_(item) {
  if (APP_CONFIG.ENVIRONMENT !== 'DEVELOPMENT') return true;
  const rootId = DEVELOPMENT_CONFIG.ROOT_FOLDER_ID;
  try {
    if (item.getId && item.getId() === rootId) return true;
    let parents = item.getParents();
    let depth = 0;
    while (parents.hasNext() && depth < 12) {
      const parent = parents.next();
      if (parent.getId() === rootId) return true;
      parents = parent.getParents();
      depth += 1;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function assertDevelopmentDriveItem_(item) {
  if (!developmentDriveItemAllowed_(item)) {
    throw appError_('PRODUCTION_DRIVE_ITEM_BLOCKED', 'O ambiente DEV bloqueou uma pasta ou arquivo que não pertence à estrutura de desenvolvimento.');
  }
  return item;
}
