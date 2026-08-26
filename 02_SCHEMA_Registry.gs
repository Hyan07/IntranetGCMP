/** Registro central de schema e versoes para a refatoracao em camadas. */

const APP_VERSION = '3.15.0';
const DATABASE_VERSION = '2026.07.20-dev-cleanup-005';
const BUILD_NUMBER = 'dev-20260720-cleanup-005';
const RUNTIME_ENVIRONMENT = 'DEVELOPMENT';
const SCHEMA_DATABASE_FROTA_ = 'DB_FROTA';

function getVersionInfo_() {
  return {
    appVersion: typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.VERSION : APP_VERSION,
    databaseVersion: DATABASE_VERSION,
    buildNumber: BUILD_NUMBER,
    environment: typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.ENVIRONMENT : RUNTIME_ENVIRONMENT,
    runtimeEnvironment: RUNTIME_ENVIRONMENT
  };
}

function schemaClone_(value) {
  if (Array.isArray(value)) return value.map(schemaClone_);
  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value).forEach(function (key) {
      output[key] = schemaClone_(value[key]);
    });
    return output;
  }
  return value;
}

function schemaDeepFreeze_(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(function (key) {
    schemaDeepFreeze_(value[key]);
  });
  return Object.freeze(value);
}

function schemaModuleFromDatabase_(databaseKey) {
  const map = {
    DB_CONFIG: 'configuracao',
    DB_PERSONNEL: 'pessoal',
    DB_ASSETS: 'patrimonio',
    DB_VEHICLES: 'viaturas_legado',
    DB_DOCUMENTS: 'documentos',
    DB_REWARDS: 'recompensas'
  };
  return map[databaseKey] || String(databaseKey || '').toLowerCase();
}

function schemaPropertyKey_(databaseKey) {
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return FROTA_CONFIG.SPREADSHEET_PROPERTY;
  return APP_CONFIG.PROPERTY_KEYS[databaseKey] || '';
}

function schemaMergeModuleSheets_(databases, databaseKey, sheets, source) {
  if (!databaseKey || !sheets) return;
  if (!databases[databaseKey]) {
    databases[databaseKey] = {
      key: databaseKey,
      name: databaseKey,
      module: schemaModuleFromDatabase_(databaseKey),
      propertyKey: schemaPropertyKey_(databaseKey),
      sheets: {},
      sources: []
    };
  }
  Object.keys(sheets).forEach(function (sheetName) {
    databases[databaseKey].sheets[sheetName] = schemaClone_(sheets[sheetName]);
  });
  databases[databaseKey].sources.push(source);
}

function schemaRegistry_() {
  const databases = {};
  if (typeof INSTALLER_SCHEMA !== 'undefined') {
    Object.keys(INSTALLER_SCHEMA).forEach(function (databaseKey) {
      const definition = INSTALLER_SCHEMA[databaseKey];
      databases[databaseKey] = {
        key: databaseKey,
        name: definition.name,
        module: schemaModuleFromDatabase_(databaseKey),
        propertyKey: schemaPropertyKey_(databaseKey),
        sheets: schemaClone_(definition.sheets || {}),
        sources: ['INSTALLER_SCHEMA']
      };
    });
  }

  if (typeof PATRIMONIO_CONFIG !== 'undefined') {
    schemaMergeModuleSheets_(
      databases,
      PATRIMONIO_CONFIG.DATABASE || APP_CONFIG.DATABASES.ASSETS,
      PATRIMONIO_CONFIG.SHEETS,
      'PATRIMONIO_CONFIG.SHEETS'
    );
  }

  if (typeof FROTA_CONFIG !== 'undefined') {
    databases[SCHEMA_DATABASE_FROTA_] = {
      key: SCHEMA_DATABASE_FROTA_,
      name: FROTA_CONFIG.SPREADSHEET_NAME,
      module: 'frota',
      propertyKey: FROTA_CONFIG.SPREADSHEET_PROPERTY,
      sheets: schemaClone_(FROTA_CONFIG.SHEETS || {}),
      sources: ['FROTA_CONFIG.SHEETS']
    };
  }

  return schemaDeepFreeze_({
    versionInfo: getVersionInfo_(),
    databases: databases
  });
}

function schemaDatabase_(databaseKey) {
  const database = schemaRegistry_().databases[databaseKey];
  if (!database) throw appError_('SCHEMA_DATABASE_NOT_FOUND', 'Banco não registrado no schema: ' + databaseKey);
  return database;
}

function schemaSheet_(databaseKey, sheetName) {
  const database = schemaDatabase_(databaseKey);
  const headers = database.sheets[sheetName];
  if (!headers) throw appError_('SCHEMA_SHEET_NOT_FOUND', 'Aba não registrada no schema: ' + databaseKey + '.' + sheetName);
  return {
    databaseKey: databaseKey,
    sheetName: sheetName,
    headers: headers.slice(),
    module: database.module,
    propertyKey: database.propertyKey
  };
}

function schemaHeaders_(databaseKey, sheetName) {
  return schemaSheet_(databaseKey, sheetName).headers;
}

function schemaSheetNames_(databaseKey) {
  return Object.keys(schemaDatabase_(databaseKey).sheets);
}

function schemaAllSheetRefs_() {
  const registry = schemaRegistry_();
  const refs = [];
  Object.keys(registry.databases).forEach(function (databaseKey) {
    Object.keys(registry.databases[databaseKey].sheets).forEach(function (sheetName) {
      refs.push({ databaseKey: databaseKey, sheetName: sheetName });
    });
  });
  return refs;
}

function schemaFindDuplicateHeaders_(headers) {
  const seen = {};
  const duplicates = [];
  (headers || []).forEach(function (header) {
    const key = normalizeUpper_(header);
    if (!key) return;
    if (seen[key] && duplicates.indexOf(header) < 0) duplicates.push(header);
    seen[key] = true;
  });
  return duplicates;
}

function schemaValidateRegistry_() {
  const registry = schemaRegistry_();
  const issues = [];
  Object.keys(registry.databases).forEach(function (databaseKey) {
    const database = registry.databases[databaseKey];
    Object.keys(database.sheets).forEach(function (sheetName) {
      const headers = database.sheets[sheetName] || [];
      const duplicates = schemaFindDuplicateHeaders_(headers);
      if (duplicates.length) {
        issues.push({
          type: 'DUPLICATE_SCHEMA_HEADERS',
          databaseKey: databaseKey,
          sheetName: sheetName,
          headers: duplicates
        });
      }
      if (!headers.length) {
        issues.push({
          type: 'EMPTY_SCHEMA_HEADERS',
          databaseKey: databaseKey,
          sheetName: sheetName
        });
      }
    });
  });
  return {
    ok: issues.length === 0,
    generatedAt: nowIso_(),
    versionInfo: registry.versionInfo,
    databaseCount: Object.keys(registry.databases).length,
    sheetCount: schemaAllSheetRefs_().length,
    issues: issues
  };
}
