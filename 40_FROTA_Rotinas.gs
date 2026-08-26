/** Alertas automáticos e trigger diário da Frota. */

function rotinaDiariaFrota() {
  try {
    const data = withScriptLock_(function () { return frotaExecutarRotinaDiaria_(); });
    return frotaOk_(data, 'Rotina diária da Frota concluída.');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return frotaFalha_(error);
  }
}

function frotaExecutarRotinaDiaria_() {
  frotaPlanilha_();
  frotaIniciarLoteNotificacoes_();
  const properties = PropertiesService.getScriptProperties();
  const revisionThreshold = Number(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.REVISAO_KM) || FROTA_CONFIG.DEFAULT_ALERTS.REVISAO_KM);
  const oilThreshold = Number(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.OLEO_KM) || FROTA_CONFIG.DEFAULT_ALERTS.OLEO_KM);
  const insuranceDays = frotaListaNumeros_(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.SEGURO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.SEGURO_DIAS);
  const licensingDays = frotaListaNumeros_(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.LICENCIAMENTO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.LICENCIAMENTO_DIAS);
  const maintenanceDays = frotaListaNumeros_(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.MANUTENCAO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.MANUTENCAO_DIAS);
  const vehicles = FrotaRepository_().readAll('VIATURAS').filter(function (vehicle) { return frotaUpper_(vehicle.ATIVO || 'SIM') !== 'NAO'; });
  const byId = {};
  vehicles.forEach(function (vehicle) { byId[vehicle.ID_VIATURA] = vehicle; });
  let generated = 0;
  vehicles.forEach(function (vehicle) {
    generated += frotaRotinaAlertaKm_(vehicle, 'REVISAO', vehicle.REVISAO_PROXIMA_KM, revisionThreshold, 'revisão').criadas || 0;
    generated += frotaRotinaAlertaKm_(vehicle, 'OLEO', vehicle.OLEO_PROXIMA_TROCA_KM, oilThreshold, 'troca de óleo').criadas || 0;
    generated += frotaRotinaAlertaData_(vehicle, 'SEGURO', vehicle.SEGURO_VENCIMENTO, insuranceDays, 'seguro').criadas || 0;
    generated += frotaRotinaAlertaData_(vehicle, 'LICENCIAMENTO', vehicle.LICENCIAMENTO_VENCIMENTO, licensingDays, 'licenciamento').criadas || 0;
    generated += frotaRotinaAlertaData_(vehicle, 'REVISAO_DATA', vehicle.REVISAO_PROXIMA_DATA, maintenanceDays, 'revisão por data').criadas || 0;
    generated += frotaRotinaAlertaData_(vehicle, 'OLEO_DATA', vehicle.OLEO_PROXIMA_TROCA_DATA, maintenanceDays, 'troca de óleo por data').criadas || 0;
    generated += frotaRotinaAlertaData_(vehicle, 'MANUTENCAO_DATA', vehicle.MANUTENCAO_PROXIMA_DATA, maintenanceDays, 'próxima manutenção').criadas || 0;
  });
  FrotaRepository_().readAll('MANUTENCOES').filter(function (maintenance) {
    return ['CONCLUIDA', 'CANCELADA'].indexOf(frotaUpper_(maintenance.STATUS)) < 0 && maintenance.DATA_PREVISTA;
  }).forEach(function (maintenance) {
    const vehicle = byId[maintenance.ID_VIATURA];
    if (!vehicle) return;
    const result = frotaRotinaAlertaData_(vehicle, 'MANUTENCAO', maintenance.DATA_PREVISTA, maintenanceDays, 'manutenção ' + maintenance.CLASSIFICACAO, maintenance.ID_MANUTENCAO);
    generated += result.criadas || 0;
  });
  FrotaRepository_().readAll('PNEUS').filter(function (tire) {
    return frotaUpper_(tire.ATIVO || 'SIM') !== 'NAO' && ['RUIM', 'CRITICO'].indexOf(frotaUpper_(tire.ESTADO)) >= 0;
  }).forEach(function (tire) {
    const vehicle = byId[tire.ID_VIATURA];
    if (!vehicle) return;
    const result = frotaCriarNotificacao_(null, {
      tipo: 'PNEU_' + frotaUpper_(tire.ESTADO), titulo: vehicle.PREFIXO + ' — pneu ' + String(tire.ESTADO).toLowerCase(),
      mensagem: 'Pneu da posição ' + String(tire.POSICAO).replace(/_/g, ' ').toLowerCase() + ' requer atenção.',
      gravidade: frotaUpper_(tire.ESTADO) === 'CRITICO' ? 'ALTA' : 'MEDIA', referenciaId: tire.ID_PNEU,
      chave: frotaIdempotencyKey_(['PNEU', tire.ID_PNEU, frotaUpper_(tire.ESTADO)])
    });
    generated += result.criadas || 0;
  });
  FrotaRepository_().readAll('DEFEITOS_VIATURAS').filter(function (defect) {
    return frotaUpper_(defect.ATIVO || 'SIM') !== 'NAO' && ['RESOLVIDO', 'CANCELADO'].indexOf(frotaUpper_(defect.STATUS_DEFEITO)) < 0;
  }).forEach(function (defect) {
    const vehicle = byId[defect.ID_VIATURA];
    if (!vehicle) return;
    const result = frotaCriarNotificacao_(null, {
      tipo: 'DEFEITO_PENDENTE', titulo: vehicle.PREFIXO + ' — defeito pendente', mensagem: defect.DESCRICAO,
      gravidade: defect.GRAVIDADE || 'MEDIA', referenciaId: defect.ID_DEFEITO,
      chave: frotaIdempotencyKey_(['OCORRENCIA', defect.ID_DEFEITO])
    });
    generated += result.criadas || 0;
  });
  const flushed = frotaFinalizarLoteNotificacoes_();
  return { executadaEm: new Date(), viaturasVerificadas: vehicles.length, notificacoesCriadas: flushed || generated };
}

function frotaListaNumeros_(value) {
  return String(value || '').split(',').map(function (item) { return Number(item.trim()); })
    .filter(function (item) { return Number.isFinite(item) && item >= 0; })
    .sort(function (a, b) { return a - b; });
}

function frotaRotinaAlertaKm_(vehicle, type, dueKm, threshold, label) {
  if (dueKm === '' || dueKm === null || dueKm === undefined) return { criadas: 0 };
  const current = Number(vehicle.KM_ATUAL || 0);
  const due = Number(dueKm);
  if (!Number.isFinite(due)) return { criadas: 0 };
  const remaining = due - current;
  if (remaining > Number(threshold || 0)) return { criadas: 0 };
  const overdue = remaining <= 0;
  return frotaCriarNotificacao_(null, {
    tipo: type + (overdue ? '_VENCIDA' : '_PROXIMA'),
    titulo: vehicle.PREFIXO + ' — ' + label + (overdue ? ' vencida' : ' próxima'),
    mensagem: overdue
      ? 'A ' + label + ' estava prevista para ' + due.toLocaleString('pt-BR') + ' km. KM atual: ' + current.toLocaleString('pt-BR') + '.'
      : 'Faltam ' + remaining.toLocaleString('pt-BR') + ' km para a ' + label + '.',
    gravidade: overdue ? 'ALTA' : 'MEDIA', referenciaId: vehicle.ID_VIATURA,
    chave: frotaIdempotencyKey_([type, vehicle.ID_VIATURA, due, overdue ? 'VENCIDA' : 'PROXIMA'])
  });
}

function frotaRotinaAlertaData_(vehicle, type, dueDate, thresholds, label, referenceId) {
  if (!dueDate) return { criadas: 0 };
  const days = frotaDiasAte_(dueDate, new Date());
  let bucket = '';
  if (days < 0) bucket = 'VENCIDO';
  else if (days === 0) bucket = 'HOJE';
  else {
    const match = (thresholds || []).filter(function (threshold) { return days <= threshold; })[0];
    if (match === undefined) return { criadas: 0 };
    bucket = String(match) + 'D';
  }
  const overdue = days < 0;
  return frotaCriarNotificacao_(null, {
    tipo: type + '_' + bucket,
    titulo: vehicle.PREFIXO + ' — ' + label + (overdue ? ' vencido(a)' : ' próximo(a)'),
    mensagem: overdue ? 'O prazo venceu há ' + Math.abs(days) + ' dia(s).' : (days === 0 ? 'O prazo vence hoje.' : 'O prazo vence em ' + days + ' dia(s).'),
    gravidade: overdue || days === 0 ? 'ALTA' : (days <= 7 ? 'MEDIA' : 'BAIXA'),
    referenciaId: referenceId || vehicle.ID_VIATURA,
    chave: frotaIdempotencyKey_([type, referenceId || vehicle.ID_VIATURA, frotaDataSomente_(dueDate), bucket])
  });
}
