/** Agrega dados de apoio usados pelas telas. */

function getLookups_(context) {
  const result = {};
  const pessoalRepository = PessoalRepository_();

  if (hasPermission_(context, 'pessoal.visualizar') || hasPermission_(context, 'usuarios.visualizar') ||
      hasPermission_(context, 'patrimonio.realizar_cautela') || hasPermission_(context, 'documentos.criar') ||
      hasPermission_(context, 'recompensas.criar') || hasPermission_(context, 'viaturas.iniciar_turno')) {
    result.people = pessoalRepository.people()
      .filter(function (p) { return p.STATUS === 'ATIVO'; })
      .map(function (p) { return { id: p.ID_PESSOA, name: p.NOME_COMPLETO, masp: formatMasp_(p.MASP), sector: p.SETOR }; });
    result.sectors = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'SETORES').filter(function (s) { return normalizeBoolean_(s.ATIVO); });
    result.functions = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'FUNCOES').filter(function (s) { return normalizeBoolean_(s.ATIVA); });
    result.teams = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'EQUIPES').filter(function (s) { return normalizeBoolean_(s.ATIVA); });
  }
  if (hasPermission_(context, 'patrimonio.visualizar') || hasPermission_(context, 'documentos.criar')) {
    result.assets = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS').map(function (a) {
      return { id: a.ID_PATRIMONIO, number: a.NUMERO_PATRIMONIAL, description: a.DESCRICAO, status: a.STATUS };
    });
    result.assetCategories = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'CATEGORIAS').filter(function (c) { return normalizeBoolean_(c.ATIVA); });
  }
  if (hasPermission_(context, 'FROTA_ACESSAR') || hasPermission_(context, 'viaturas.visualizar') || hasPermission_(context, 'documentos.criar')) {
    const frotaInstalled = Boolean(getScriptProperties_().getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY));
    const source = frotaInstalled ? FrotaRepository_().readAll('VIATURAS') : repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS');
    result.vehicles = source.filter(function (v) { return !frotaInstalled || frotaUpper_(v.ATIVO || 'SIM') !== 'NAO'; }).map(function (v) {
      return { id: v.ID_VIATURA, prefix: v.PREFIXO, plate: v.PLACA, model: v.MODELO, km: Number(v.KM_ATUAL || 0), status: v.STATUS };
    });
  }
  return result;
}
