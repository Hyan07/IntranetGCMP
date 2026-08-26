/** Serviço de diagnóstico estrutural do banco. Leitura apenas, sem migração. */

function diagnosticarEstruturaSistema_() {
  resetDataAccessRuntimeCache_();
  const registry = schemaRegistry_();
  const databases = Object.keys(registry.databases).map(function (databaseKey) {
    try {
      return diagnosticRepositoryReadDatabase_(databaseKey, registry.databases[databaseKey]);
    } catch (error) {
      return {
        databaseKey: databaseKey,
        name: registry.databases[databaseKey].name,
        ok: false,
        error: {
          code: error.code || 'DIAGNOSTIC_ERROR',
          message: error.message
        },
        sheets: []
      };
    }
  });
  const schema = schemaValidateRegistry_();
  return {
    ok: schema.ok && databases.every(function (database) { return database.ok; }),
    generatedAt: nowIso_(),
    versionInfo: registry.versionInfo,
    schema: schema,
    databases: databases
  };
}

function diagnosticarArquiteturaDev() {
  if (APP_CONFIG.ENVIRONMENT !== 'DEVELOPMENT') {
    throw appError_('DEV_ONLY', 'Este diagnóstico completo deve ser executado apenas no ambiente DEV.');
  }
  return diagnosticarEstruturaSistema_();
}
