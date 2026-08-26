/** Preparação interna e diagnóstico do módulo Viaturas/Frota. */

function frotaGarantirModuloSistema_() {
  const root = frotaValidarPastaRaiz_();
  const spreadsheet = frotaGarantirPlanilha_(root);
  Object.keys(FROTA_CONFIG.SHEETS).forEach(function (sheetName) {
    frotaGarantirEstruturaAba_(spreadsheet, sheetName, FROTA_CONFIG.SHEETS[sheetName]);
  });
  ['Página1', 'Sheet1'].forEach(function (defaultName) {
    const sheet = spreadsheet.getSheetByName(defaultName);
    if (sheet && spreadsheet.getSheets().length > 1 && sheet.getLastRow() <= 1) spreadsheet.deleteSheet(sheet);
  });
  frotaConfigurarPropriedadesPadrao_();
  frotaGarantirEstruturaNotificacoes_();
  const permissions = frotaGarantirPermissoes_();
  const trigger = frotaGarantirTrigger_();
  return {
    versao: FROTA_CONFIG.VERSION,
    planilhaId: spreadsheet.getId(),
    planilhaUrl: spreadsheet.getUrl(),
    pastaRaizId: root.getId(),
    abas: spreadsheet.getSheets().map(function (sheet) { return sheet.getName(); }),
    permissoesCriadas: permissions.created,
    atribuicoesMigradas: permissions.assignments,
    permissoesLegadasDesativadas: permissions.legacyDeactivated,
    triggerCriado: trigger.created
  };
}

function frotaValidarPastaRaiz_() {
  const properties = PropertiesService.getScriptProperties();
  const configured = properties.getProperty(FROTA_CONFIG.ROOT_FOLDER_PROPERTY) || FROTA_CONFIG.ROOT_FOLDER_ID;
  try {
    const root = DriveApp.getFolderById(configured);
    root.getName();
    properties.setProperty(FROTA_CONFIG.ROOT_FOLDER_PROPERTY, root.getId());
    return root;
  } catch (error) {
    throw appError_('FROTA_PASTA_RAIZ_INVALIDA', 'A pasta raiz da Frota não existe ou o projeto não possui acesso: ' + configured);
  }
}

function frotaGarantirPlanilha_(rootFolder) {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY);
  let spreadsheet = null;
  if (savedId) {
    try { spreadsheet = SpreadsheetApp.openById(savedId); } catch (error) { spreadsheet = null; }
  }
  if (!spreadsheet) {
    const files = rootFolder.getFilesByName(FROTA_CONFIG.SPREADSHEET_NAME);
    while (files.hasNext() && !spreadsheet) {
      const file = files.next();
      if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
      try { spreadsheet = SpreadsheetApp.openById(file.getId()); } catch (error) { spreadsheet = null; }
    }
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(FROTA_CONFIG.SPREADSHEET_NAME);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(rootFolder);
  }
  spreadsheet.rename(FROTA_CONFIG.SPREADSHEET_NAME);
  spreadsheet.setSpreadsheetTimeZone(FROTA_CONFIG.TIME_ZONE);
  properties.setProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY, spreadsheet.getId());
  return spreadsheet;
}

function frotaGarantirEstruturaAba_(spreadsheet, sheetName, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const current = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(frotaTexto_)
    : [];
  if (!current.some(Boolean)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    const missing = requiredHeaders.filter(function (header) { return current.indexOf(header) < 0; });
    if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  const columns = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 40);
  sheet.getRange(1, 1, 1, columns)
    .setBackground('#173c36')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  for (let column = 1; column <= columns; column += 1) {
    sheet.setColumnWidth(column, column <= 6 ? 155 : 135);
  }
  try {
    const currentFilter = sheet.getFilter();
    if (currentFilter && currentFilter.getRange().getNumColumns() < columns) currentFilter.remove();
    if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), columns).createFilter();
  } catch (error) {
    console.warn('Filtro não aplicado em ' + sheetName + ': ' + error.message);
  }
  return sheet;
}

function frotaConfigurarPropriedadesPadrao_() {
  const properties = PropertiesService.getScriptProperties();
  const defaults = {};
  Object.keys(FROTA_CONFIG.DEFAULT_ALERTS).forEach(function (key) {
    const propertyKey = FROTA_CONFIG.PROPERTY_KEYS[key];
    if (!properties.getProperty(propertyKey)) defaults[propertyKey] = String(FROTA_CONFIG.DEFAULT_ALERTS[key]);
  });
  if (!properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS)) {
    defaults[FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS] = JSON.stringify(FROTA_CONFIG.POSICOES_PNEUS);
  }
  if (Object.keys(defaults).length) properties.setProperties(defaults, false);
}

function frotaGarantirEstruturaNotificacoes_() {
  try {
    const configId = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.PROPERTY_KEYS.DB_CONFIG);
    if (!configId) return false;
    const spreadsheet = SpreadsheetApp.openById(configId);
    frotaGarantirEstruturaAbaGenerica_(spreadsheet, 'NOTIFICACOES', FROTA_NOTIFICATION_HEADERS);
    return true;
  } catch (error) {
    console.warn('Não foi possível atualizar NOTIFICACOES: ' + error.message);
    return false;
  }
}

function frotaGarantirEstruturaAbaGenerica_(spreadsheet, sheetName, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const current = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(frotaTexto_)
    : [];
  if (!current.some(Boolean)) sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  else {
    const missing = requiredHeaders.filter(function (header) { return current.indexOf(header) < 0; });
    if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  const columns = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columns).setBackground('#173c36').setFontColor('#ffffff').setFontWeight('bold');
  return sheet;
}

function frotaGarantirPermissoes_() {
  const output = { created: 0, assignments: 0, legacyDeactivated: 0 };
  const configId = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.PROPERTY_KEYS.DB_CONFIG);
  if (!configId) return output;
  const existing = readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const byCode = {};
  existing.forEach(function (permission) { byCode[permission.CODIGO] = permission; });
  FROTA_CONFIG.PERMISSIONS.forEach(function (definition) {
    const current = byCode[definition[0]];
    const record = { ID_PERMISSAO: current ? current.ID_PERMISSAO : Utilities.getUuid(), CODIGO: definition[0], MODULO: 'frota', ACAO: definition[1], DESCRICAO: definition[2], ATIVA: true };
    if (current) byCode[definition[0]] = updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', current._row, record);
    else {
      byCode[definition[0]] = appendObject_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', record);
      output.created += 1;
    }
  });
  output.assignments = frotaMigrarPermissoesLegadas_(byCode);
  readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES').filter(function (permission) {
    return String(permission.CODIGO || '').indexOf('viaturas.') === 0 && normalizeBoolean_(permission.ATIVA);
  }).forEach(function (permission) {
    updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', permission._row, { ATIVA: false, DESCRICAO: '[LEGADA] ' + String(permission.DESCRICAO || '') });
    output.legacyDeactivated += 1;
  });
  return output;
}

function frotaMigrarPermissoesLegadas_(catalogByCode) {
  const users = readAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS');
  const catalog = readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const codeById = {};
  catalog.forEach(function (permission) { codeById[permission.ID_PERMISSAO] = permission.CODIGO; });
  const assignments = readAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
  const byUserAndPermission = {};
  const codesByUser = {};
  assignments.forEach(function (assignment) {
    byUserAndPermission[assignment.ID_USUARIO + ':' + assignment.ID_PERMISSAO] = assignment;
    if (!normalizeBoolean_(assignment.PERMITIDO)) return;
    if (!codesByUser[assignment.ID_USUARIO]) codesByUser[assignment.ID_USUARIO] = [];
    if (codeById[assignment.ID_PERMISSAO]) codesByUser[assignment.ID_USUARIO].push(codeById[assignment.ID_PERMISSAO]);
  });
  const legacyMap = {
    'viaturas.visualizar': ['FROTA_ACESSAR', 'FROTA_VISUALIZAR_VEICULOS'],
    'viaturas.iniciar_turno': ['FROTA_VISUALIZAR_KM', 'FROTA_KM_ABRIR'],
    'viaturas.encerrar_turno': ['FROTA_VISUALIZAR_KM', 'FROTA_KM_ENCERRAR'],
    'viaturas.gerenciar_frota': ['FROTA_VISUALIZAR_GERENCIAMENTO', 'FROTA_VISUALIZAR_VEICULOS', 'FROTA_VISUALIZAR_DEFEITOS', 'FROTA_EDITAR_OBSERVACOES', 'FROTA_ALTERAR_STATUS', 'FROTA_TRATAR_DEFEITOS', 'FROTA_RECEBER_NOTIFICACOES'],
    'viaturas.cadastrar': ['FROTA_CADASTRAR_VIATURA'],
    'viaturas.editar': ['FROTA_EDITAR_VIATURA'],
    'viaturas.registrar_manutencao': ['FROTA_VISUALIZAR_MANUTENCOES', 'FROTA_GERENCIAR_MANUTENCOES'],
    'viaturas.visualizar_documentos': ['FROTA_VISUALIZAR_ARQUIVOS'],
    'viaturas.enviar_documentos': ['FROTA_ENVIAR_ARQUIVOS']
  };
  let created = 0;
  users.forEach(function (user) {
    const currentCodes = codesByUser[user.ID_USUARIO] || [];
    const isAdmin = frotaMasp_(user.MASP) === '00000000' || /ADMINISTRADOR/i.test(String(user.CARGO || '') + ' ' + String(user.FUNCAO || ''));
    let desired = [];
    if (isAdmin) desired = FROTA_CONFIG.PERMISSIONS.map(function (definition) { return definition[0]; });
    else Object.keys(legacyMap).forEach(function (legacy) {
      if (currentCodes.indexOf(legacy) >= 0) desired = desired.concat(legacyMap[legacy]);
    });
    desired.filter(function (code, index) { return desired.indexOf(code) === index; }).forEach(function (code) {
      const permission = catalogByCode[code];
      if (!permission) return;
      const key = user.ID_USUARIO + ':' + permission.ID_PERMISSAO;
      if (byUserAndPermission[key]) return;
      appendObject_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', {
        ID: Utilities.getUuid(), ID_USUARIO: user.ID_USUARIO, ID_PERMISSAO: permission.ID_PERMISSAO,
        PERMITIDO: true, CONCEDIDO_POR: 'FROTA_INSTALLER', CONCEDIDO_EM: new Date()
      });
      created += 1;
    });
  });
  return created;
}

function frotaGarantirTrigger_() {
  const handler = 'rotinaDiariaFrota';
  const existing = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === handler; });
  if (existing.length) return { created: false, count: existing.length };
  ScriptApp.newTrigger(handler).timeBased().atHour(5).everyDays(1).inTimezone(FROTA_CONFIG.TIME_ZONE).create();
  return { created: true, count: 1 };
}

function diagnosticarModuloFrota() {
  const report = { versao: FROTA_CONFIG.VERSION, planilhaId: '', planilhaUrl: '', abas: {}, pastaRaiz: null, triggers: [], erros: [] };
  try {
    const properties = PropertiesService.getScriptProperties();
    report.planilhaId = properties.getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY) || '';
    if (!report.planilhaId) report.erros.push('Propriedade FROTA_SPREADSHEET_ID não configurada.');
    else {
      const spreadsheet = SpreadsheetApp.openById(report.planilhaId);
      report.planilhaUrl = spreadsheet.getUrl();
      Object.keys(FROTA_CONFIG.SHEETS).forEach(function (sheetName) {
        const sheet = spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
          report.abas[sheetName] = { existe: false, colunas: [], faltantes: FROTA_CONFIG.SHEETS[sheetName] };
          report.erros.push('Aba ausente: ' + sheetName);
          return;
        }
        const columns = frotaCabecalhos_(sheet);
        const missing = FROTA_CONFIG.SHEETS[sheetName].filter(function (header) { return columns.indexOf(header) < 0; });
        report.abas[sheetName] = { existe: true, colunas: columns, faltantes: missing };
        if (missing.length) report.erros.push(sheetName + ' possui colunas ausentes: ' + missing.join(', '));
      });
    }
    try {
      const root = frotaValidarPastaRaiz_();
      report.pastaRaiz = { id: root.getId(), nome: root.getName(), url: root.getUrl() };
    } catch (rootError) {
      report.erros.push(rootError.message);
    }
    report.triggers = ScriptApp.getProjectTriggers().map(function (trigger) {
      return { funcao: trigger.getHandlerFunction(), evento: String(trigger.getEventType()), origem: String(trigger.getTriggerSource()) };
    });
    if (!report.triggers.some(function (trigger) { return trigger.funcao === 'rotinaDiariaFrota'; })) report.erros.push('Trigger diário rotinaDiariaFrota não encontrado.');
    return frotaOk_(report, report.erros.length ? 'Diagnóstico concluído com pendências.' : 'Módulo Frota configurado corretamente.');
  } catch (error) {
    report.erros.push(error.message);
    return frotaOk_(report, 'Diagnóstico concluído com erros de configuração.');
  }
}
