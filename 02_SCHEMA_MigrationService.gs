/** Serviço de migrações estruturais. Nenhuma migração é aplicada automaticamente. */

const MIGRATION_REGISTRY = Object.freeze([
  Object.freeze({
    version: '2026.07.20-dev-schema-001',
    name: 'Fundação arquitetural DEV',
    description: 'Cria versionamento, schema registry, repositories base, diagnóstico e logger central.',
    destructive: false,
    automatic: false
  }),
  Object.freeze({
    version: '2026.07.20-dev-performance-003',
    name: 'Normalização segura de schema DEV',
    description: 'Planeja e aplica normalização de cabeçalhos com backup oculto por aba, sem execução automática.',
    destructive: false,
    automatic: false
  }),
  Object.freeze({
    version: '2026.07.20-dev-layer-prefix-004',
    name: 'Organização por prefixo e camada',
    description: 'Reorganiza os arquivos do Apps Script em blocos prefixados sem criar pastas reais e sem alterar regras de negócio.',
    destructive: false,
    automatic: false
  }),
  Object.freeze({
    version: '2026.07.20-dev-cleanup-005',
    name: 'Remoção de instaladores específicos e importadores',
    description: 'Remove funções públicas manuais de instalação por módulo e importação de dados legados, preservando apenas a preparação interna do instalador geral.',
    destructive: false,
    automatic: false
  })
]);

function migrationServiceStructurePlan_() {
  const registry = schemaRegistry_();
  const sheets = [];
  Object.keys(registry.databases).forEach(function (databaseKey) {
    const definition = registry.databases[databaseKey];
    try {
      migrationRepositoryPlanDatabase_(databaseKey, definition).forEach(function (sheetPlan) {
        sheets.push(sheetPlan);
      });
    } catch (error) {
      sheets.push({
        databaseKey: databaseKey,
        sheetName: '',
        exists: false,
        action: 'DATABASE_UNAVAILABLE',
        needsRepair: true,
        error: { code: error.code || 'MIGRATION_PLAN_ERROR', message: error.message }
      });
    }
  });
  return {
    generatedAt: nowIso_(),
    totalSheets: sheets.length,
    needsRepair: sheets.filter(function (sheet) { return sheet.needsRepair; }).length,
    sheets: sheets
  };
}

function migrationServiceStatus_() {
  return {
    versionInfo: getVersionInfo_(),
    registered: MIGRATION_REGISTRY.map(function (migration) { return Object.assign({}, migration); }),
    pending: [],
    automaticExecution: false
  };
}

function migrationServiceDryRun_() {
  return {
    status: 'DRY_RUN',
    versionInfo: getVersionInfo_(),
    schema: schemaValidateRegistry_(),
    structurePlan: migrationServiceStructurePlan_(),
    migrations: migrationServiceStatus_().registered,
    message: 'Nenhuma alteração estrutural será aplicada sem confirmação explícita.'
  };
}

function migrationServiceApply_(payload) {
  const input = payload || {};
  if (APP_CONFIG.ENVIRONMENT === 'PRODUCTION') {
    throw appError_('MIGRATION_PRODUCTION_BLOCKED', 'Migrações automáticas estão bloqueadas em produção.');
  }
  if (input.confirmation !== 'APLICAR_MIGRACOES_DEV') {
    throw appError_('MIGRATION_CONFIRMATION_REQUIRED', 'Informe a confirmação APLICAR_MIGRACOES_DEV para executar migrações no DEV.');
  }
  if (input.operation !== 'NORMALIZAR_SCHEMA_DEV') {
    return {
      status: 'NO_OP',
      applied: [],
      skipped: MIGRATION_REGISTRY.map(function (migration) { return migration.version; }),
      message: 'Informe operation=NORMALIZAR_SCHEMA_DEV para normalizar cabeçalhos no DEV.'
    };
  }

  const registry = schemaRegistry_();
  const applied = [];
  Object.keys(registry.databases).forEach(function (databaseKey) {
    const definition = registry.databases[databaseKey];
    Object.keys(definition.sheets).forEach(function (sheetName) {
      const result = migrationRepositoryApplySheet_(databaseKey, sheetName, definition.sheets[sheetName]);
      if (result.action !== 'UNCHANGED') applied.push(result);
    });
  });
  return {
    status: 'APPLIED',
    operation: input.operation,
    applied: applied,
    backupsCreated: applied.filter(function (item) { return item.backup; }).map(function (item) {
      return { databaseKey: item.databaseKey, sheetName: item.sheetName, backup: item.backup };
    }),
    message: 'Normalização estrutural concluída no DEV. Confira os backups ocultos e rode diagnosticarArquiteturaDev().'
  };
}

function MigrationService_() {
  return {
    status: migrationServiceStatus_,
    dryRun: migrationServiceDryRun_,
    apply: migrationServiceApply_
  };
}
