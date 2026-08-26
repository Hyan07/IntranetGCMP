/** Registro e tratamento de observações, defeitos e irregularidades. */

function frotaValidarOcorrencia_(occurrence) {
  if (!occurrence || !frotaBoolean_(occurrence.enabled)) return null;
  const normalized = {
    enabled: true,
    tipo: frotaValorPermitido_(occurrence.tipo || 'DEFEITO', FROTA_CONFIG.TIPOS_OCORRENCIA, 'Tipo da ocorrência'),
    categoria: frotaValorPermitido_(occurrence.categoria || 'OUTRO', FROTA_CONFIG.CATEGORIAS_OCORRENCIA, 'Categoria da ocorrência'),
    gravidade: frotaValorPermitido_(occurrence.gravidade || 'MEDIA', FROTA_CONFIG.GRAVIDADES, 'Gravidade da ocorrência'),
    descricao: frotaTexto_(occurrence.descricao, 3000),
    local: frotaTexto_(occurrence.local, 500),
    retirada: frotaBoolean_(occurrence.retirada),
    complemento: frotaTexto_(occurrence.complemento, 1500)
  };
  if (!normalized.descricao) throw appError_('FROTA_OCORRENCIA_SEM_DESCRICAO', 'Descreva a observação, defeito ou irregularidade.');
  return normalized;
}

function frotaRegistrarOcorrenciaInterna_(context, vehicle, movementId, occurrence) {
  const normalized = frotaValidarOcorrencia_(occurrence);
  if (!normalized) return null;
  const user = frotaUsuario_(context);
  const timestamp = new Date();
  const isObservation = ['OBSERVACAO', 'LIMPEZA', 'DOCUMENTACAO'].indexOf(normalized.tipo) >= 0;
  let saved;
  if (isObservation) {
    saved = FrotaRepository_().append('OBSERVACOES_VIATURAS', {
      ID_OBSERVACAO: Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, ID_MOVIMENTACAO: movementId || '', PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
      TIPO: normalized.tipo, CATEGORIA: normalized.categoria, GRAVIDADE: normalized.gravidade,
      OBSERVACAO_ANTERIOR: vehicle.OBSERVACAO_ATUAL || '', OBSERVACAO_NOVA: normalized.descricao,
      MOTIVO: normalized.complemento, INFORMADO_POR_MASP: user.masp, INFORMADO_POR_NOME: user.nome,
      DATA_HORA: timestamp, ATIVO: 'SIM', ID_MANUTENCAO_VINCULADA: ''
    });
    FrotaRepository_().update('VIATURAS', vehicle._row, {
      OBSERVACAO_ATUAL: normalized.descricao, ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp
    });
  } else {
    saved = FrotaRepository_().append('DEFEITOS_VIATURAS', {
      ID_DEFEITO: Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, ID_MOVIMENTACAO: movementId || '', PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
      CATEGORIA: normalized.categoria, GRAVIDADE: normalized.gravidade,
      DESCRICAO: (normalized.tipo === 'DEFEITO' ? '' : '[' + normalized.tipo.replace(/_/g, ' ') + '] ') + normalized.descricao + (normalized.complemento ? '\n' + normalized.complemento : ''),
      LOCAL_DEFEITO: normalized.local, SOLICITOU_RETIRADA: normalized.retirada ? 'SIM' : 'NAO', STATUS_DEFEITO: 'PENDENTE',
      INFORMADO_POR_MASP: user.masp, INFORMADO_POR_NOME: user.nome, DATA_HORA_REGISTRO: timestamp,
      PROVIDENCIA_ADOTADA: '', RESPONSAVEL_TRATAMENTO_MASP: '', RESPONSAVEL_TRATAMENTO_NOME: '',
      DATA_HORA_VISUALIZACAO: '', DATA_HORA_RESOLUCAO: '', OBSERVACAO_RESOLUCAO: '', ATIVO: 'SIM', ID_MANUTENCAO_VINCULADA: ''
    });
  }
  const referenceId = saved.ID_DEFEITO || saved.ID_OBSERVACAO;
  if (normalized.gravidade === 'VIATURA_SEM_CONDICOES_DE_USO' || normalized.retirada) {
    FrotaRepository_().update('VIATURAS', vehicle._row, { STATUS: 'INDISPONIVEL', ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp });
  }
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
    TIPO_ACAO: isObservation ? 'OBSERVACAO' : 'DEFEITO', CAMPO_ALTERADO: normalized.categoria,
    VALOR_ANTERIOR: '', VALOR_NOVO: Object.assign({ ID_REFERENCIA: referenceId, ID_MOVIMENTACAO: movementId || '' }, normalized),
    JUSTIFICATIVA: normalized.complemento
  });
  frotaNotificarOcorrencia_(context, vehicle, normalized, referenceId);
  return { tipo: isObservation ? 'OBSERVACAO' : 'DEFEITO', registro: frotaSemLinha_(saved), indisponivel: normalized.gravidade === 'VIATURA_SEM_CONDICOES_DE_USO' || normalized.retirada };
}

function frotaDefeitosListar_(context, payload) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_DEFEITOS', 'FROTA_TRATAR_DEFEITOS']);
  const options = payload || {};
  const maintenancesById = {};
  FrotaRepository_().readAll('MANUTENCOES').forEach(function (maintenance) {
    maintenancesById[String(maintenance.ID_MANUTENCAO)] = maintenance;
  });
  let rows = FrotaRepository_().readAll('DEFEITOS_VIATURAS').map(function (row) {
    return frotaOcorrenciaComManutencao_(Object.assign(row, { REGISTRO_TIPO: 'DEFEITO', ID_REGISTRO_OCORRENCIA: row.ID_DEFEITO }), maintenancesById);
  });
  if (frotaBoolean_(options.includeObservations)) {
    rows = rows.concat(FrotaRepository_().readAll('OBSERVACOES_VIATURAS').map(function (row) {
      return frotaOcorrenciaComManutencao_(Object.assign({}, row, {
        REGISTRO_TIPO: 'OBSERVACAO', ID_REGISTRO_OCORRENCIA: row.ID_OBSERVACAO,
        ID_DEFEITO: row.ID_OBSERVACAO, CATEGORIA: row.CATEGORIA || row.TIPO,
        DESCRICAO: row.OBSERVACAO_NOVA, LOCAL_DEFEITO: '', SOLICITOU_RETIRADA: 'NAO',
        STATUS_DEFEITO: 'REGISTRADA', DATA_HORA_REGISTRO: row.DATA_HORA,
        PROVIDENCIA_ADOTADA: row.MOTIVO, RESPONSAVEL_TRATAMENTO_MASP: '', RESPONSAVEL_TRATAMENTO_NOME: '',
        DATA_HORA_RESOLUCAO: '', OBSERVACAO_RESOLUCAO: ''
      }), maintenancesById);
    }));
  }
  if (!frotaBoolean_(options.includeInactive)) rows = rows.filter(function (row) { return frotaUpper_(row.ATIVO || 'SIM') !== 'NAO'; });
  if (options.recordId) rows = rows.filter(function (row) { return String(row.ID_REGISTRO_OCORRENCIA || row.ID_DEFEITO) === String(options.recordId); });
  if (options.vehicleId) rows = rows.filter(function (row) { return String(row.ID_VIATURA) === String(options.vehicleId); });
  if (options.status) rows = rows.filter(function (row) { return frotaUpper_(row.STATUS_DEFEITO) === frotaUpper_(options.status); });
  if (options.gravity) rows = rows.filter(function (row) { return frotaUpper_(row.GRAVIDADE) === frotaUpper_(options.gravity); });
  if (options.category) rows = rows.filter(function (row) { return frotaUpper_(row.CATEGORIA) === frotaUpper_(options.category); });
  rows = frotaPesquisar_(rows, options.query, ['PREFIXO', 'PLACA', 'CATEGORIA', 'GRAVIDADE', 'DESCRICAO', 'LOCAL_DEFEITO', 'INFORMADO_POR_NOME', 'INFORMADO_POR_MASP', 'STATUS_DEFEITO', 'MANUTENCAO_STATUS', 'MANUTENCAO_CLASSIFICACAO', 'MANUTENCAO_OFICINA']);
  rows.sort(function (a, b) { return new Date(b.DATA_HORA_REGISTRO || 0).getTime() - new Date(a.DATA_HORA_REGISTRO || 0).getTime(); });
  return frotaPaginar_(rows, options);
}

function frotaDefeitoSalvar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_TRATAR_DEFEITOS');
  frotaExigir_(payload, ['vehicleId']);
  const vehicle = frotaObterViaturaObrigatoria_(payload.vehicleId);
  const occurrence = Object.assign({}, payload.occurrence || payload, { enabled: true });
  const result = frotaRegistrarOcorrenciaInterna_(context, vehicle, payload.movementId || '', occurrence);
  frotaAuditar_(context, 'REGISTRAR_DEFEITO', result.registro.ID_DEFEITO || result.registro.ID_OBSERVACAO, null, result.registro, '');
  return result;
}

function frotaDefeitoVisualizar_(context, payload) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_DEFEITOS', 'FROTA_TRATAR_DEFEITOS']);
  frotaExigir_(payload, ['id']);
  const defect = FrotaRepository_().findOne('DEFEITOS_VIATURAS', 'ID_DEFEITO', payload.id);
  if (!defect) throw appError_('FROTA_DEFEITO_NAO_ENCONTRADO', 'Defeito não encontrado.');
  if (defect.DATA_HORA_VISUALIZACAO) return frotaSemLinha_(defect);
  const user = frotaUsuario_(context);
  return frotaSemLinha_(FrotaRepository_().update('DEFEITOS_VIATURAS', defect._row, {
    DATA_HORA_VISUALIZACAO: new Date(), RESPONSAVEL_TRATAMENTO_MASP: user.masp, RESPONSAVEL_TRATAMENTO_NOME: user.nome, STATUS_DEFEITO: 'EM_ANALISE'
  }));
}

function frotaDefeitoTratar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_TRATAR_DEFEITOS');
  frotaExigir_(payload, ['id', 'status', 'action']);
  const defect = FrotaRepository_().findOne('DEFEITOS_VIATURAS', 'ID_DEFEITO', payload.id);
  if (!defect) throw appError_('FROTA_DEFEITO_NAO_ENCONTRADO', 'Defeito não encontrado.');
  const status = frotaValorPermitido_(payload.status, ['PENDENTE', 'EM_ANALISE', 'EM_REPARO', 'RESOLVIDO', 'CANCELADO'], 'Status do defeito');
  const linkedMaintenance = defect.ID_MANUTENCAO_VINCULADA
    ? FrotaRepository_().findOne('MANUTENCOES', 'ID_MANUTENCAO', defect.ID_MANUTENCAO_VINCULADA)
    : null;
  if (linkedMaintenance && frotaUpper_(linkedMaintenance.STATUS) !== 'CANCELADA') {
    throw appError_('FROTA_DEFEITO_COM_MANUTENCAO_VINCULADA', 'Este defeito está integrado a uma manutenção. Edite os detalhes, a providência e o status no atendimento de manutenção vinculado.');
  }
  const user = frotaUsuario_(context);
  const timestamp = new Date();
  const patch = {
    STATUS_DEFEITO: status,
    PROVIDENCIA_ADOTADA: frotaTexto_(payload.action, 2500),
    RESPONSAVEL_TRATAMENTO_MASP: user.masp,
    RESPONSAVEL_TRATAMENTO_NOME: user.nome,
    DATA_HORA_VISUALIZACAO: defect.DATA_HORA_VISUALIZACAO || timestamp,
    OBSERVACAO_RESOLUCAO: frotaTexto_(payload.resolution, 2500)
  };
  if (['RESOLVIDO', 'CANCELADO'].indexOf(status) >= 0) patch.DATA_HORA_RESOLUCAO = timestamp;
  else patch.DATA_HORA_RESOLUCAO = '';
  const updated = FrotaRepository_().update('DEFEITOS_VIATURAS', defect._row, patch);
  const vehicle = frotaObterViaturaObrigatoria_(defect.ID_VIATURA);
  const restoreRequested = status === 'RESOLVIDO' && frotaBoolean_(payload.restoreVehicle);
  let vehicleRestored = false;
  let restoreBlockedReason = '';
  if (restoreRequested) {
    restoreBlockedReason = frotaMotivoBloqueioRestauracao_(vehicle, defect.ID_DEFEITO);
    if (!restoreBlockedReason) {
      FrotaRepository_().update('VIATURAS', vehicle._row, {
        STATUS: 'DISPONIVEL', MOVIMENTACAO_ATIVA_ID: '', ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp
      });
      vehicleRestored = true;
    }
  }
  if (['RESOLVIDO', 'CANCELADO'].indexOf(status) >= 0) frotaResolverNotificacoesReferencia_(defect.ID_DEFEITO);
  else frotaReabrirNotificacoesReferencia_(defect.ID_DEFEITO);
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'DEFEITO', CAMPO_ALTERADO: 'STATUS_DEFEITO',
    VALOR_ANTERIOR: defect.STATUS_DEFEITO, VALOR_NOVO: status, JUSTIFICATIVA: payload.action + (payload.resolution ? ' — ' + payload.resolution : '')
  });
  frotaAuditar_(context, 'TRATAR_DEFEITO', defect.ID_DEFEITO, defect, {
    defeito: frotaSemLinha_(updated), viaturaRestaurada: vehicleRestored, motivoBloqueio: restoreBlockedReason
  }, payload.action);
  const response = frotaSemLinha_(updated);
  response.RESTAURACAO_SOLICITADA = restoreRequested;
  response.VIATURA_RESTAURADA = vehicleRestored;
  response.VIATURA_STATUS = vehicleRestored ? 'DISPONIVEL' : vehicle.STATUS;
  response.MOTIVO_NAO_RESTAURADA = restoreBlockedReason;
  return response;
}

function frotaMotivoBloqueioRestauracao_(vehicle, resolvedDefectId, completedMaintenanceId) {
  const currentStatus = frotaUpper_(vehicle && vehicle.STATUS);
  if (['BAIXADA', 'INATIVA', 'SINISTRADA'].indexOf(currentStatus) >= 0) {
    return 'A viatura está com status ' + currentStatus.replace(/_/g, ' ') + ' e não pode voltar automaticamente para disponível.';
  }
  const hasOpenMovement = frotaTemMovimentacaoAberta_(vehicle.ID_VIATURA);
  if (hasOpenMovement) return 'Existe uma movimentação de KM aberta para esta viatura.';
  const blockingDefect = FrotaRepository_().readAll('DEFEITOS_VIATURAS').some(function (item) {
    if (String(item.ID_VIATURA) !== String(vehicle.ID_VIATURA) || String(item.ID_DEFEITO) === String(resolvedDefectId)) return false;
    if (frotaUpper_(item.ATIVO || 'SIM') === 'NAO' || ['RESOLVIDO', 'CANCELADO'].indexOf(frotaUpper_(item.STATUS_DEFEITO)) >= 0) return false;
    return frotaUpper_(item.GRAVIDADE) === 'VIATURA_SEM_CONDICOES_DE_USO' || frotaBoolean_(item.SOLICITOU_RETIRADA);
  });
  if (blockingDefect) return 'Ainda existe outro defeito impeditivo pendente para esta viatura.';
  const activeMaintenance = FrotaRepository_().readAll('MANUTENCOES').some(function (item) {
    if (String(item.ID_VIATURA) !== String(vehicle.ID_VIATURA) || String(item.ID_MANUTENCAO) === String(completedMaintenanceId || '')) return false;
    return ['EM_MANUTENCAO', 'AGUARDANDO_PECA'].indexOf(frotaUpper_(item.STATUS)) >= 0;
  });
  return activeMaintenance ? 'Ainda existe outra manutenção ativa para esta viatura.' : '';
}

function frotaOcorrenciaComManutencao_(row, maintenancesById) {
  const output = Object.assign({}, row);
  const maintenance = maintenancesById[String(output.ID_MANUTENCAO_VINCULADA || '')];
  if (!maintenance) return output;
  output.MANUTENCAO_ID = maintenance.ID_MANUTENCAO;
  output.MANUTENCAO_STATUS = maintenance.STATUS;
  output.MANUTENCAO_CLASSIFICACAO = maintenance.CLASSIFICACAO;
  output.MANUTENCAO_DATA_PREVISTA = maintenance.DATA_PREVISTA;
  output.MANUTENCAO_OFICINA = maintenance.OFICINA_FORNECEDOR;
  output.MANUTENCAO_ATIVA = ['CONCLUIDA', 'CANCELADA'].indexOf(frotaUpper_(maintenance.STATUS)) < 0;
  return output;
}

function frotaResolverNotificacoesReferencia_(referenceId) {
  try {
    const timestamp = new Date();
    const changed = [];
    repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES').forEach(function (row) {
      if (String(row.ID_REGISTRO) !== String(referenceId) || normalizeBoolean_(row.RESOLVIDA)) return;
      const next = Object.assign({}, row, {
        RESOLVIDA: true,
        DATA_RESOLUCAO: timestamp
      });
      changed.push(next);
    });
    if (changed.length) repositoryUpdateMany_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', changed);
  } catch (error) {
    console.warn('Falha ao resolver notificações: ' + error.message);
  }
}

function frotaReabrirNotificacoesReferencia_(referenceId) {
  try {
    const changed = [];
    repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES').forEach(function (row) {
      if (String(row.ID_REGISTRO) !== String(referenceId) || !normalizeBoolean_(row.RESOLVIDA)) return;
      const next = Object.assign({}, row, {
        RESOLVIDA: false,
        DATA_RESOLUCAO: ''
      });
      changed.push(next);
    });
    if (changed.length) repositoryUpdateMany_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', changed);
  } catch (error) {
    console.warn('Falha ao reabrir notificações: ' + error.message);
  }
}
