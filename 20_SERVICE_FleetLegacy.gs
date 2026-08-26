/** Manutenções, abastecimentos e alertas da frota. */

function listMaintenance_(context, payload) {
  requirePermission_(context, 'viaturas.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'MANUTENCOES');
  rows = searchRows_(rows, options.query, ['PREFIXO', 'TIPO', 'OFICINA', 'FORNECEDOR', 'DESCRICAO', 'STATUS']);
  if (options.status) rows = rows.filter(function (m) { return m.STATUS === normalizeUpper_(options.status); });
  return paginate_(sortByDateDesc_(rows, 'DATA_ENTRADA'), options);
}

function saveMaintenance_(context, payload) {
  requirePermission_(context, 'viaturas.registrar_manutencao');
  requireFields_(payload, ['ID_VIATURA', 'TIPO', 'DATA_ENTRADA', 'KM', 'DESCRICAO', 'STATUS']);
  const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.ID_VIATURA);
  if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
  const record = {
    ID_MANUTENCAO: payload.ID_MANUTENCAO || uuid_(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO,
    KM: validatePositiveNumber_(payload.KM, 'KM', true), DATA_ENTRADA: toDate_(payload.DATA_ENTRADA),
    TIPO: normalizeText_(payload.TIPO), OFICINA: normalizeText_(payload.OFICINA), FORNECEDOR: normalizeText_(payload.FORNECEDOR),
    DESCRICAO: normalizeText_(payload.DESCRICAO), PECAS: normalizeText_(payload.PECAS),
    VALOR: payload.VALOR === '' || payload.VALOR === undefined ? '' : validatePositiveNumber_(payload.VALOR, 'Valor', true),
    NOTA_FISCAL: normalizeText_(payload.NOTA_FISCAL), PREVISAO_CONCLUSAO: payload.PREVISAO_CONCLUSAO ? toDate_(payload.PREVISAO_CONCLUSAO) : '',
    DATA_CONCLUSAO: payload.DATA_CONCLUSAO ? toDate_(payload.DATA_CONCLUSAO) : '', RESPONSAVEL: context.user.NOME,
    ANEXOS_IDS: Array.isArray(payload.ANEXOS_IDS) ? payload.ANEXOS_IDS.join(',') : normalizeText_(payload.ANEXOS_IDS),
    STATUS: validateStatus_(payload.STATUS, ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']), OBSERVACOES: normalizeText_(payload.OBSERVACOES),
    CRIADO_EM: now_(), CRIADO_POR: context.user.ID_USUARIO
  };
  const current = payload.ID_MANUTENCAO ? repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'MANUTENCOES', 'ID_MANUTENCAO', payload.ID_MANUTENCAO) : null;
  const saved = current
    ? repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'MANUTENCOES', current._row, Object.assign(record, { CRIADO_EM: current.CRIADO_EM, CRIADO_POR: current.CRIADO_POR }))
    : repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'MANUTENCOES', record);
  if (saved.STATUS === 'ABERTA' || saved.STATUS === 'EM_ANDAMENTO') {
    repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, { STATUS: 'MANUTENCAO', ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  } else if (saved.STATUS === 'CONCLUIDA' && vehicle.STATUS === 'MANUTENCAO') {
    repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, { STATUS: 'DISPONIVEL', ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  }
  audit_(context, 'viaturas', current ? 'EDITAR_MANUTENCAO' : 'REGISTRAR_MANUTENCAO', saved.ID_MANUTENCAO, current, saved, 'SUCESSO');
  return saved;
}

function listFuelings_(context, payload) {
  requirePermission_(context, 'viaturas.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'ABASTECIMENTOS');
  rows = searchRows_(rows, options.query, ['PREFIXO', 'CONDUTOR', 'COMBUSTIVEL', 'POSTO']);
  return paginate_(sortByDateDesc_(rows, 'DATA_HORA'), options);
}

function saveFueling_(context, payload) {
  requirePermission_(context, 'viaturas.registrar_abastecimento');
  requireFields_(payload, ['ID_VIATURA', 'DATA_HORA', 'KM', 'COMBUSTIVEL', 'QUANTIDADE', 'VALOR_TOTAL', 'POSTO']);
  const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.ID_VIATURA);
  if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
  const km = validatePositiveNumber_(payload.KM, 'KM', true);
  if (km < Number(vehicle.KM_ATUAL || 0)) throw appError_('KM_REGRESSION', 'O KM do abastecimento não pode ser menor que o KM atual.');
  const quantity = validatePositiveNumber_(payload.QUANTIDADE, 'Quantidade');
  const total = validatePositiveNumber_(payload.VALOR_TOTAL, 'Valor total', true);
  const previous = sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'ABASTECIMENTOS', function (f) { return String(f.ID_VIATURA) === String(vehicle.ID_VIATURA); }), 'DATA_HORA')[0];
  const average = previous && Number(previous.KM) < km ? (km - Number(previous.KM)) / quantity : '';
  const record = {
    ID_ABASTECIMENTO: uuid_(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO,
    ID_CONDUTOR: context.user.ID_PESSOA || '', CONDUTOR: context.user.NOME, DATA_HORA: toDate_(payload.DATA_HORA), KM: km,
    COMBUSTIVEL: normalizeText_(payload.COMBUSTIVEL), QUANTIDADE: quantity, VALOR_TOTAL: total,
    VALOR_LITRO: quantity ? total / quantity : '', POSTO: normalizeText_(payload.POSTO), COMPROVANTE_ID: normalizeText_(payload.COMPROVANTE_ID),
    MEDIA_CONSUMO: average, OBSERVACOES: normalizeText_(payload.OBSERVACOES), CRIADO_EM: now_(), CRIADO_POR: context.user.ID_USUARIO
  };
  repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'ABASTECIMENTOS', record);
  if (km > Number(vehicle.KM_ATUAL || 0)) repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, { KM_ATUAL: km, KM_ATUALIZADO_EM: now_(), ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  audit_(context, 'viaturas', 'REGISTRAR_ABASTECIMENTO', record.ID_ABASTECIMENTO, null, record, 'SUCESSO');
  return record;
}

function listFleetAlerts_(context) {
  requirePermission_(context, 'viaturas.visualizar');
  const alerts = [];
  const today = now_();
  const inThirtyDays = addHours_(today, 24 * 30);
  repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS').forEach(function (vehicle) {
    const km = Number(vehicle.KM_ATUAL || 0);
    if (vehicle.PROXIMA_REVISAO_KM !== '' && Number(vehicle.PROXIMA_REVISAO_KM) - km <= 500) alerts.push({ type: 'REVISAO_KM', severity: Number(vehicle.PROXIMA_REVISAO_KM) <= km ? 'danger' : 'warning', vehicleId: vehicle.ID_VIATURA, prefix: vehicle.PREFIXO, message: 'Revisão por KM: ' + vehicle.PROXIMA_REVISAO_KM + ' km' });
    [['SEGURO_VENCIMENTO', 'Seguro'], ['LICENCIAMENTO_VENCIMENTO', 'Licenciamento'], ['PROXIMA_REVISAO_DATA', 'Revisão']].forEach(function (item) {
      const date = toDate_(vehicle[item[0]], true);
      if (date && date.getTime() <= inThirtyDays.getTime()) alerts.push({ type: item[0], severity: date.getTime() < today.getTime() ? 'danger' : 'warning', vehicleId: vehicle.ID_VIATURA, prefix: vehicle.PREFIXO, message: item[1] + ': ' + Utilities.formatDate(date, APP_CONFIG.TIME_ZONE, 'dd/MM/yyyy') });
    });
  });
  repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS').filter(function (s) { return s.STATUS === 'ABERTO'; }).forEach(function (shift) {
    const hours = (today.getTime() - new Date(shift.INICIO_EM).getTime()) / 3600000;
    if (hours >= 12) alerts.push({ type: 'TURNO_ABERTO', severity: hours >= 18 ? 'danger' : 'warning', vehicleId: shift.ID_VIATURA, prefix: shift.PREFIXO, message: 'Turno aberto há ' + Math.floor(hours) + 'h' });
  });
  return alerts;
}
