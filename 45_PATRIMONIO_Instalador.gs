/** Preparação interna e migração não destrutiva do módulo Patrimônio e Cautelas. */

function patrimonioGarantirModuloSistema_() {
  const spreadsheet = getSpreadsheet_(PATRIMONIO_CONFIG.DATABASE);
  Object.keys(PATRIMONIO_CONFIG.SHEETS).forEach(function (sheetName) {
    ensureSheetSchema_(spreadsheet, sheetName, PATRIMONIO_CONFIG.SHEETS[sheetName]);
  });
  patrimonioSemearPermissoes_();
  patrimonioMigrarPermissoes_();
  const permissionCleanup = patrimonioConsolidarPermissoes_();
  patrimonioSemearConfiguracoes_();
  patrimonioSemearCategorias_();
  const migration = patrimonioMigrarDadosLegados_();
  migration.tiposCautelaNormalizados = patrimonioNormalizarTiposCautela_();
  getScriptProperties_().setProperty('PATRIMONIO_MODULE_VERSION', PATRIMONIO_CONFIG.VERSION);
  const result = {
    status: 'INSTALADO',
    version: PATRIMONIO_CONFIG.VERSION,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheets: Object.keys(PATRIMONIO_CONFIG.SHEETS),
    permissions: permissionCleanup,
    migration: migration
  };
  console.log('MÓDULO PATRIMÔNIO INSTALADO\n' + JSON.stringify(result, null, 2));
  return result;
}

function patrimonioSemearPermissoes_() {
  PATRIMONIO_CONFIG.PERMISSIONS.forEach(function (definition) {
    const code = definition[0];
    const current = findOne_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', 'CODIGO', code);
    const record = {
      ID_PERMISSAO: current ? current.ID_PERMISSAO : uuid_(),
      CODIGO: code,
      MODULO: 'patrimonio',
      ACAO: definition[1],
      DESCRICAO: definition[2],
      ATIVA: true
    };
    if (current) updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', current._row, record);
    else appendObject_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', record);
  });
}

function patrimonioMigrarPermissoes_() {
  const catalog = readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const catalogByCode = {};
  catalog.forEach(function (permission) { catalogByCode[permission.CODIGO] = permission; });
  const assignments = readAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
  const allowedByUser = {};
  assignments.filter(function (item) { return normalizeBoolean_(item.PERMITIDO); }).forEach(function (item) {
    const permission = catalog.find(function (candidate) { return String(candidate.ID_PERMISSAO) === String(item.ID_PERMISSAO); });
    if (!permission) return;
    if (!allowedByUser[item.ID_USUARIO]) allowedByUser[item.ID_USUARIO] = [];
    allowedByUser[item.ID_USUARIO].push(permission.CODIGO);
  });
  const legacyMap = {
    'patrimonio.visualizar': ['PATRIMONIO_VISUALIZAR', 'CAUTELA_VISUALIZAR_ATIVAS'],
    'patrimonio.cadastrar': ['PATRIMONIO_CADASTRAR'],
    'patrimonio.editar': ['PATRIMONIO_EDITAR', 'PATRIMONIO_MANUTENCAO', 'CAUTELA_PRORROGAR'],
    'patrimonio.excluir': ['PATRIMONIO_EXCLUIR', 'PATRIMONIO_BAIXAR', 'CAUTELA_CANCELAR'],
    'patrimonio.realizar_cautela': ['CAUTELA_REALIZAR', 'CAUTELA_MULTIPLA'],
    'patrimonio.receber_devolucao': ['DESCAUTELA_REALIZAR'],
    'patrimonio.consultar_historico': ['HISTORICO_VISUALIZAR', 'PATRIMONIO_EXPORTAR'],
    'auditoria.visualizar': ['AUDITORIA_VISUALIZAR'],
    'configuracoes.gerenciar': PATRIMONIO_CONFIG.PERMISSIONS.map(function (item) { return item[0]; })
  };
  Object.keys(allowedByUser).forEach(function (userId) {
    let requested = [];
    allowedByUser[userId].forEach(function (legacyCode) { requested = requested.concat(legacyMap[legacyCode] || []); });
    requested = requested.filter(function (code, index) { return requested.indexOf(code) === index; });
    requested.forEach(function (code) {
      const permission = catalogByCode[code];
      if (!permission) return;
      const existing = assignments.find(function (item) {
        return String(item.ID_USUARIO) === String(userId) && String(item.ID_PERMISSAO) === String(permission.ID_PERMISSAO);
      });
      const record = {
        ID: existing ? existing.ID : uuid_(), ID_USUARIO: userId, ID_PERMISSAO: permission.ID_PERMISSAO,
        PERMITIDO: true, CONCEDIDO_POR: 'PATRIMONIO_INSTALLER', CONCEDIDO_EM: now_()
      };
      if (existing) updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', existing._row, record);
      else appendObject_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', record);
    });
    CacheService.getScriptCache().remove('permissions:' + userId);
  });
}

/**
 * Remove repetições visuais sem apagar histórico.
 *
 * Os códigos antigos são desativados somente depois que suas concessões são
 * copiadas para os códigos atuais. Se a aba PERMISSOES possuir duas linhas
 * com o mesmo código, as concessões da linha duplicada também são preservadas
 * na linha canônica antes da desativação.
 */
function patrimonioConsolidarPermissoes_() {
  const legacyCodes = [
    'patrimonio.visualizar', 'patrimonio.cadastrar', 'patrimonio.editar', 'patrimonio.excluir',
    'patrimonio.realizar_cautela', 'patrimonio.receber_devolucao', 'patrimonio.consultar_historico'
  ];
  const catalog = readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const assignments = readAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
  const groups = {};
  const changedUsers = {};
  const deactivatedIds = {};
  let duplicatePermissions = 0;
  let legacyPermissions = 0;
  let migratedAssignments = 0;

  catalog.forEach(function (permission) {
    const code = String(permission.CODIGO || '');
    if (!groups[code]) groups[code] = [];
    groups[code].push(permission);
  });

  function grantCanonical_(userId, canonical) {
    let existing = assignments.find(function (item) {
      return String(item.ID_USUARIO) === String(userId) && String(item.ID_PERMISSAO) === String(canonical.ID_PERMISSAO);
    });
    if (existing && normalizeBoolean_(existing.PERMITIDO)) return;
    const record = {
      ID: existing ? existing.ID : uuid_(), ID_USUARIO: userId, ID_PERMISSAO: canonical.ID_PERMISSAO,
      PERMITIDO: true, CONCEDIDO_POR: 'PATRIMONIO_CONSOLIDADOR', CONCEDIDO_EM: now_()
    };
    if (existing) {
      const saved = updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', existing._row, record);
      Object.assign(existing, saved);
    } else {
      existing = appendObject_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', record);
      assignments.push(existing);
    }
    changedUsers[String(userId)] = true;
    migratedAssignments += 1;
  }

  Object.keys(groups).forEach(function (code) {
    const rows = groups[code];
    const canonical = rows.find(function (row) { return normalizeBoolean_(row.ATIVA); }) || rows[0];
    rows.forEach(function (row) {
      if (String(row.ID_PERMISSAO) === String(canonical.ID_PERMISSAO)) return;
      assignments.filter(function (item) {
        return String(item.ID_PERMISSAO) === String(row.ID_PERMISSAO) && normalizeBoolean_(item.PERMITIDO);
      }).forEach(function (item) { grantCanonical_(item.ID_USUARIO, canonical); });
      if (normalizeBoolean_(row.ATIVA)) {
        updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', row._row, { ATIVA: false });
        deactivatedIds[String(row.ID_PERMISSAO)] = true;
        duplicatePermissions += 1;
      }
    });
  });

  catalog.forEach(function (permission) {
    if (legacyCodes.indexOf(String(permission.CODIGO)) < 0 || !normalizeBoolean_(permission.ATIVA) || deactivatedIds[String(permission.ID_PERMISSAO)]) return;
    updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', permission._row, { ATIVA: false });
    deactivatedIds[String(permission.ID_PERMISSAO)] = true;
    legacyPermissions += 1;
  });

  Object.keys(changedUsers).forEach(function (userId) { CacheService.getScriptCache().remove('permissions:' + userId); });
  return {
    legacyDeactivated: legacyPermissions,
    duplicatesDeactivated: duplicatePermissions,
    assignmentsMigrated: migratedAssignments
  };
}

function patrimonioSemearConfiguracoes_() {
  PATRIMONIO_CONFIG.DEFAULTS.forEach(function (item) {
    if (!findOne_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', 'Chave', item[0])) {
      appendObject_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', {
        Chave: item[0], Valor: item[1], Descrição: item[2], 'Atualizado em': now_(), 'Atualizado por': 'INSTALLER'
      });
    }
  });
}

function patrimonioSemearCategorias_() {
  const defaults = [
    ['Armamento e proteção', ''], ['Comunicação', ''], ['Informática', ''], ['Uniforme', ''],
    ['Sinalização', ''], ['Ferramentas', ''], ['Mobiliário', ''], ['Outros', '']
  ];
  defaults.forEach(function (item) {
    const exists = readAll_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO').some(function (row) {
      return normalizeUpper_(row.Categoria) === normalizeUpper_(item[0]) && normalizeUpper_(row.Subcategoria) === normalizeUpper_(item[1]);
    });
    if (!exists) appendObject_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO', {
      ID: uuid_(), Categoria: item[0], Subcategoria: item[1], Ativo: true, 'Criado em': now_(), 'Criado por': 'INSTALLER'
    });
  });
  try {
    readAll_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS').filter(function (row) { return normalizeBoolean_(row.ATIVA); }).forEach(function (legacy) {
      const exists = readAll_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO').some(function (row) { return normalizeUpper_(row.Categoria) === normalizeUpper_(legacy.NOME); });
      if (!exists) appendObject_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO', { ID: uuid_(), Categoria: legacy.NOME, Subcategoria: '', Ativo: true, 'Criado em': legacy.CRIADO_EM || now_(), 'Criado por': 'MIGRACAO' });
    });
  } catch (error) { console.warn('Categorias legadas não migradas: ' + error.message); }
}

function patrimonioNormalizarTiposCautela_() {
  let updated = 0;
  readAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').forEach(function (row) {
    if (!row.ID || normalizeText_(row['Tipo de Cautela'])) return;
    updateObjectAtRow_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', row._row, { 'Tipo de Cautela': 'COMUM' });
    updated += 1;
  });
  return updated;
}

function patrimonioMigrarDadosLegados_() {
  const result = { patrimonios: 0, cautelas: 0, devolucoes: 0 };
  readAll_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS').forEach(function (row) {
    if (row.ID || !row.ID_PATRIMONIO) return;
    updateObjectAtRow_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', row._row, {
      ID: row.ID_PATRIMONIO, Código: row.NUMERO_PATRIMONIAL, Patrimônio: row.NUMERO_PATRIMONIAL,
      Nome: row.DESCRICAO, Descrição: row.DESCRICAO, Categoria: row.CATEGORIA, Marca: row.MARCA,
      Modelo: row.MODELO, 'Número de Série': row.NUMERO_SERIE, 'Tipo de Controle': 'INDIVIDUAL',
      'Quantidade Total': 1, 'Quantidade Disponível': row.STATUS === 'CAUTELADO' ? 0 : 1,
      'Quantidade Cautelada': row.STATUS === 'CAUTELADO' ? 1 : 0, Unidade: row.UNIDADE || 'UN',
      Cautelável: row.STATUS === 'BAIXADO' ? 'NAO' : 'SIM', Situação: row.STATUS || 'DISPONIVEL',
      'Estado de Conservação': row.ESTADO_CONSERVACAO, Setor: row.SETOR_RESPONSAVEL,
      Localização: row.LOCALIZACAO_ATUAL, 'Data de Aquisição': row.DATA_AQUISICAO, Valor: row.VALOR,
      Fornecedor: row.FORNECEDOR, 'Nota Fiscal': row.NOTA_FISCAL, 'Vencimento da Garantia': row.GARANTIA_ATE,
      Observações: row.OBSERVACOES, Foto: row.FOTO_URL, Anexo: row.PASTA_DRIVE_ID, Ativo: row.STATUS !== 'BAIXADO',
      'Criado em': row.CRIADO_EM, 'Criado por': row.CRIADO_POR, 'Atualizado em': row.ATUALIZADO_EM,
      'Atualizado por': row.ATUALIZADO_POR
    });
    result.patrimonios += 1;
  });
  readAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').forEach(function (row) {
    if (row.ID || !row.ID_CAUTELA) return;
    const issued = toDate_(row.ENTREGUE_EM, true) || now_();
    updateObjectAtRow_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', row._row, {
      ID: row.ID_CAUTELA, 'Número da Cautela': 'LEG-' + String(row.ID_CAUTELA).slice(0, 8).toUpperCase(),
      'ID do Patrimônio': row.ID_PATRIMONIO, Patrimônio: row.NUMERO_PATRIMONIAL,
      Equipamento: row.DESCRICAO_PATRIMONIO, Quantidade: 1, Unidade: 'UN', 'GCM Recebedor': row.NOME_PESSOA,
      'Matrícula do Recebedor': row.MASP, Intendente: row.ENTREGUE_POR_NOME, 'Matrícula do Intendente': '',
      'Data da Cautela': issued, 'Hora da Cautela': Utilities.formatDate(issued, APP_CONFIG.TIME_ZONE, 'HH:mm:ss'),
      'Previsão de Devolução': row.PREVISAO_DEVOLUCAO, Finalidade: row.FINALIDADE, Setor: row.SETOR,
      'Estado na Entrega': row.ESTADO_ENTREGA, Observações: row.OBSERVACOES,
      Status: row.STATUS === 'ABERTA' ? 'ATIVA' : 'DEVOLVIDA', 'Data da Autenticação': issued,
      Sessão: '', 'Grupo da Cautela': row.ID_CAUTELA, 'Tipo de Cautela': 'COMUM'
    });
    result.cautelas += 1;
  });
  readAll_(PATRIMONIO_CONFIG.DATABASE, 'DEVOLUCOES').forEach(function (row) {
    if (row.ID || !row.ID_DEVOLUCAO) return;
    const returned = toDate_(row.DEVOLVIDO_EM, true) || now_();
    const custody = findOne_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', 'ID_CAUTELA', row.ID_CAUTELA);
    updateObjectAtRow_(PATRIMONIO_CONFIG.DATABASE, 'DEVOLUCOES', row._row, {
      ID: row.ID_DEVOLUCAO, 'Número da Cautela': custody ? custody['Número da Cautela'] : '',
      'ID da Cautela': row.ID_CAUTELA, 'ID do Patrimônio': row.ID_PATRIMONIO,
      Equipamento: custody ? custody.Equipamento : '', 'Quantidade Devolvida': 1,
      'GCM que Devolveu': row.DEVOLVIDO_POR, Matrícula: custody ? custody['Matrícula do Recebedor'] : '',
      'Intendente que Recebeu': row.RECEBIDO_POR_NOME, 'Matrícula do Intendente': '', Data: returned,
      Hora: Utilities.formatDate(returned, APP_CONFIG.TIME_ZONE, 'HH:mm:ss'), 'Estado na Devolução': row.ESTADO_RECEBIMENTO,
      Avaria: normalizeBoolean_(row.POSSUI_AVARIA) ? row.DESCRICAO_DANO || 'SIM' : 'NAO',
      Observações: row.OBSERVACOES, Foto: row.FOTOS_IDS, Resultado: row.STATUS_PATRIMONIO, Sessão: ''
    });
    result.devolucoes += 1;
  });
  return result;
}

function diagnosticarModuloPatrimonio() {
  const spreadsheet = getSpreadsheet_(PATRIMONIO_CONFIG.DATABASE);
  const sheets = {};
  Object.keys(PATRIMONIO_CONFIG.SHEETS).forEach(function (name) {
    const sheet = spreadsheet.getSheetByName(name);
    const headers = sheet ? getHeaders_(sheet) : [];
    sheets[name] = { exists: Boolean(sheet), rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0, missingHeaders: PATRIMONIO_CONFIG.SHEETS[name].filter(function (header) { return headers.indexOf(header) < 0; }) };
  });
  return { installedVersion: getScriptProperties_().getProperty('PATRIMONIO_MODULE_VERSION') || '', spreadsheetId: spreadsheet.getId(), sheets: sheets };
}
