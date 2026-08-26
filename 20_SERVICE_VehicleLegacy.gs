/** Cadastro de viaturas. */

function cleanVehicle_(vehicle) {
  const copy = Object.assign({}, vehicle);
  delete copy._row;
  copy.KM_ATUAL = Number(copy.KM_ATUAL || 0);
  return copy;
}

function canReadVehicles_(context) {
  return hasPermission_(context, 'viaturas.visualizar') ||
    hasPermission_(context, 'FROTA_ACESSAR') ||
    hasPermission_(context, 'FROTA_VISUALIZAR_VEICULOS') ||
    hasPermission_(context, 'FROTA_VISUALIZAR_GERENCIAMENTO');
}

function requireVehicleRead_(context) {
  if (canReadVehicles_(context)) return true;
  audit_(context, 'viaturas', 'ACESSO_NEGADO', '', null, null, 'NEGADO', '', 'Permissão requerida: viaturas.visualizar ou FROTA_VISUALIZAR_VEICULOS');
  throw appError_('FORBIDDEN', 'Você não possui permissão para realizar esta ação.', { permission: 'FROTA_VISUALIZAR_VEICULOS' });
}

function modernFleetAvailable_() {
  try {
    return Boolean(getScriptProperties_().getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY));
  } catch (error) {
    return false;
  }
}

function legacyVehicleStatusFromFrota_(status) {
  const normalized = normalizeUpper_(status);
  const map = { EM_USO: 'EM_SERVICO', EM_MANUTENCAO: 'MANUTENCAO', INATIVA: 'BAIXADA' };
  return map[normalized] || normalized;
}

function vehicleFromModernFleet_(vehicle) {
  return {
    _row: vehicle._row,
    ID_VIATURA: vehicle.ID_VIATURA,
    PREFIXO: vehicle.PREFIXO,
    PLACA: vehicle.PLACA,
    TIPO: vehicle.TIPO,
    MARCA: vehicle.MARCA,
    MODELO: vehicle.MODELO,
    ANO_FABRICACAO: vehicle.ANO,
    ANO_MODELO: vehicle.ANO,
    COR: vehicle.COR,
    RENAVAM: vehicle.RENAVAM,
    CHASSI: vehicle.CHASSI,
    COMBUSTIVEL: vehicle.COMBUSTIVEL,
    CAPACIDADE: '',
    SETOR: vehicle.SETOR,
    STATUS: legacyVehicleStatusFromFrota_(vehicle.STATUS),
    KM_ATUAL: vehicle.KM_ATUAL,
    KM_ATUALIZADO_EM: vehicle.ATUALIZADO_EM || vehicle.ULTIMA_MOVIMENTACAO,
    DATA_AQUISICAO: vehicle.DATA_AQUISICAO,
    NUMERO_PATRIMONIAL: '',
    SEGURADORA: vehicle.SEGURO_SEGURADORA,
    APOLICE: vehicle.SEGURO_APOLICE,
    SEGURO_VENCIMENTO: vehicle.SEGURO_VENCIMENTO,
    LICENCIAMENTO_VENCIMENTO: vehicle.LICENCIAMENTO_VENCIMENTO,
    PROXIMA_REVISAO_KM: vehicle.REVISAO_PROXIMA_KM,
    PROXIMA_REVISAO_DATA: vehicle.REVISAO_PROXIMA_DATA,
    OBSERVACOES: vehicle.OBSERVACAO_ATUAL,
    FOTO_URL: '',
    PASTA_DRIVE_ID: vehicle.ID_PASTA_DRIVE,
    CRIADO_EM: vehicle.CRIADO_EM,
    CRIADO_POR: vehicle.CRIADO_POR_MASP,
    ATUALIZADO_EM: vehicle.ATUALIZADO_EM,
    ATUALIZADO_POR: vehicle.ATUALIZADO_POR_MASP
  };
}

function listVehicles_(context, payload) {
  requireVehicleRead_(context);
  const options = payload || {};
  let rows = modernFleetAvailable_()
    ? FrotaRepository_().readAll('VIATURAS')
        .filter(function (vehicle) { return frotaUpper_(vehicle.ATIVO || 'SIM') !== 'NAO'; })
        .map(vehicleFromModernFleet_)
    : repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS');
  rows = searchRows_(rows, options.query, ['PREFIXO', 'PLACA', 'TIPO', 'MARCA', 'MODELO', 'RENAVAM', 'CHASSI', 'SETOR']);
  if (options.status) rows = rows.filter(function (v) { return v.STATUS === normalizeUpper_(options.status); });
  rows.sort(function (a, b) { return String(a.PREFIXO).localeCompare(String(b.PREFIXO), 'pt-BR', { numeric: true }); });
  const page = paginate_(rows, options);
  page.items = page.items.map(cleanVehicle_);
  return page;
}

function getVehicle_(context, payload) {
  requireVehicleRead_(context);
  requireFields_(payload, ['id']);
  if (modernFleetAvailable_()) {
    const modern = FrotaRepository_().findOne('VIATURAS', 'ID_VIATURA', payload.id);
    if (!modern) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
    const vehicle = vehicleFromModernFleet_(frotaEnriquecerViaturas_([modern])[0]);
    return {
      vehicle: cleanVehicle_(vehicle),
      shifts: FrotaRepository_().readAll('MOVIMENTACOES_KM').filter(function (item) { return String(item.ID_VIATURA) === String(modern.ID_VIATURA); }).slice(0, 50),
      maintenance: FrotaRepository_().readAll('MANUTENCOES').filter(function (item) { return String(item.ID_VIATURA) === String(modern.ID_VIATURA); }).slice(0, 50),
      fuelings: []
    };
  }
  const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.id);
  if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
  return {
    vehicle: cleanVehicle_(vehicle),
    shifts: sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', function (s) { return String(s.ID_VIATURA) === String(vehicle.ID_VIATURA); }), 'INICIO_EM').slice(0, 50),
    maintenance: sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'MANUTENCOES', function (m) { return String(m.ID_VIATURA) === String(vehicle.ID_VIATURA); }), 'DATA_ENTRADA').slice(0, 50),
    fuelings: sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'ABASTECIMENTOS', function (f) { return String(f.ID_VIATURA) === String(vehicle.ID_VIATURA); }), 'DATA_HORA').slice(0, 50)
  };
}

function saveVehicle_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_VIATURA);
  requirePermission_(context, isEdit ? 'viaturas.editar' : 'viaturas.cadastrar');
  requireFields_(payload, ['PREFIXO', 'PLACA', 'TIPO', 'MARCA', 'MODELO', 'STATUS', 'KM_ATUAL']);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.ID_VIATURA) : null;
  if (isEdit && !current) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
  const plate = normalizePlate_(payload.PLACA);
  if (plate.length !== 7) throw appError_('INVALID_PLATE', 'Informe uma placa válida.');
  validateUnique_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'PLACA', plate, 'ID_VIATURA', payload.ID_VIATURA, normalizePlate_);
  validateUnique_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'PREFIXO', payload.PREFIXO, 'ID_VIATURA', payload.ID_VIATURA, normalizeUpper_);
  if (payload.CHASSI) validateUnique_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'CHASSI', payload.CHASSI, 'ID_VIATURA', payload.ID_VIATURA, normalizeUpper_);
  const km = validatePositiveNumber_(payload.KM_ATUAL, 'Quilometragem', true);
  if (isEdit && km < Number(current.KM_ATUAL || 0) && !hasPermission_(context, 'viaturas.gerenciar_frota')) {
    throw appError_('KM_REGRESSION', 'A quilometragem não pode ser reduzida.');
  }
  const timestamp = now_();
  const record = {
    ID_VIATURA: isEdit ? current.ID_VIATURA : uuid_(), PREFIXO: normalizeUpper_(payload.PREFIXO), PLACA: plate,
    TIPO: normalizeText_(payload.TIPO), MARCA: normalizeText_(payload.MARCA), MODELO: normalizeText_(payload.MODELO),
    ANO_FABRICACAO: normalizeText_(payload.ANO_FABRICACAO), ANO_MODELO: normalizeText_(payload.ANO_MODELO), COR: normalizeText_(payload.COR),
    RENAVAM: normalizeText_(payload.RENAVAM), CHASSI: normalizeUpper_(payload.CHASSI), COMBUSTIVEL: normalizeText_(payload.COMBUSTIVEL),
    CAPACIDADE: normalizeText_(payload.CAPACIDADE), SETOR: normalizeText_(payload.SETOR),
    STATUS: validateStatus_(payload.STATUS, ['DISPONIVEL', 'EM_SERVICO', 'MANUTENCAO', 'INDISPONIVEL', 'RESERVADA', 'BAIXADA', 'SINISTRADA']),
    KM_ATUAL: km, KM_ATUALIZADO_EM: timestamp, DATA_AQUISICAO: payload.DATA_AQUISICAO ? toDate_(payload.DATA_AQUISICAO) : '',
    NUMERO_PATRIMONIAL: normalizeText_(payload.NUMERO_PATRIMONIAL), SEGURADORA: normalizeText_(payload.SEGURADORA),
    APOLICE: normalizeText_(payload.APOLICE), SEGURO_VENCIMENTO: payload.SEGURO_VENCIMENTO ? toDate_(payload.SEGURO_VENCIMENTO) : '',
    LICENCIAMENTO_VENCIMENTO: payload.LICENCIAMENTO_VENCIMENTO ? toDate_(payload.LICENCIAMENTO_VENCIMENTO) : '',
    PROXIMA_REVISAO_KM: payload.PROXIMA_REVISAO_KM === '' || payload.PROXIMA_REVISAO_KM === undefined ? '' : validatePositiveNumber_(payload.PROXIMA_REVISAO_KM, 'Próxima revisão', true),
    PROXIMA_REVISAO_DATA: payload.PROXIMA_REVISAO_DATA ? toDate_(payload.PROXIMA_REVISAO_DATA) : '',
    OBSERVACOES: normalizeText_(payload.OBSERVACOES), FOTO_URL: normalizeText_(payload.FOTO_URL),
    ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
  };
  if (isEdit) {
    record.PASTA_DRIVE_ID = current.PASTA_DRIVE_ID; record.CRIADO_EM = current.CRIADO_EM; record.CRIADO_POR = current.CRIADO_POR;
  } else {
    record.CRIADO_EM = timestamp; record.CRIADO_POR = context.user.ID_USUARIO;
    try { record.PASTA_DRIVE_ID = ensureEntityFolder_('VIATURA', plate).getId(); } catch (error) { record.PASTA_DRIVE_ID = ''; }
  }
  const saved = isEdit
    ? repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', current._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', record);
  if (isEdit && Number(current.KM_ATUAL || 0) !== km) {
    repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'HISTORICO_KM', {
      ID: uuid_(), ID_VIATURA: saved.ID_VIATURA, PREFIXO: saved.PREFIXO, DATA_HORA: timestamp,
      KM_ANTERIOR: Number(current.KM_ATUAL || 0), KM_NOVO: km, ORIGEM: 'CADASTRO', ID_ORIGEM: saved.ID_VIATURA,
      ID_USUARIO: context.user.ID_USUARIO, JUSTIFICATIVA: normalizeText_(payload.JUSTIFICATIVA_KM)
    });
  }
  audit_(context, 'viaturas', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_VIATURA, current, saved, 'SUCESSO', payload.JUSTIFICATIVA_KM || '');
  return cleanVehicle_(saved);
}

function changeVehicleStatus_(context, payload) {
  requirePermission_(context, 'viaturas.gerenciar_frota');
  requireFields_(payload, ['id', 'status']);
  const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.id);
  if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
  const open = repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', function (s) { return String(s.ID_VIATURA) === String(vehicle.ID_VIATURA) && s.STATUS === 'ABERTO'; });
  if (open.length) throw appError_('OPEN_SHIFT', 'Encerre o turno aberto antes de alterar a situação da viatura.');
  const status = validateStatus_(payload.status, ['DISPONIVEL', 'MANUTENCAO', 'INDISPONIVEL', 'RESERVADA', 'BAIXADA', 'SINISTRADA']);
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, { STATUS: status, ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  audit_(context, 'viaturas', 'ALTERAR_STATUS', vehicle.ID_VIATURA, { STATUS: vehicle.STATUS }, { STATUS: status }, 'SUCESSO', payload.justification || '');
  return cleanVehicle_(saved);
}
