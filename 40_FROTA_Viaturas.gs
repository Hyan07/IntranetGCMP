/** Cadastro, cards, status e observação principal das viaturas. */

function frotaViaturasListar_(context, payload) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_VEICULOS', 'FROTA_VISUALIZAR_GERENCIAMENTO', 'FROTA_CADASTRAR_VIATURA', 'FROTA_EDITAR_VIATURA', 'FROTA_ALTERAR_STATUS']);
  const options = payload || {};
  let vehicles = FrotaRepository_().readAll('VIATURAS');
  if (!frotaBoolean_(options.includeInactive)) {
    vehicles = vehicles.filter(function (vehicle) { return frotaUpper_(vehicle.ATIVO || 'SIM') !== 'NAO'; });
  }
  if (options.status) vehicles = vehicles.filter(function (vehicle) { return frotaUpper_(vehicle.STATUS) === frotaUpper_(options.status); });
  if (options.sector) vehicles = vehicles.filter(function (vehicle) { return frotaUpper_(vehicle.SETOR) === frotaUpper_(options.sector); });
  vehicles = frotaPesquisar_(vehicles, options.query, ['PREFIXO', 'PLACA', 'MARCA', 'MODELO', 'TIPO', 'STATUS', 'SETOR', 'OBSERVACAO_ATUAL', 'ULTIMO_CONDUTOR']);
  vehicles.sort(function (a, b) { return String(a.PREFIXO || '').localeCompare(String(b.PREFIXO || ''), 'pt-BR', { numeric: true }); });
  const enriched = frotaEnriquecerViaturas_(vehicles);
  return frotaPaginar_(enriched, options);
}

function frotaViaturasOpcoes_(context, payload) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_KM', 'FROTA_KM_ABRIR', 'FROTA_KM_ENCERRAR', 'FROTA_VISUALIZAR_MANUTENCOES', 'FROTA_GERENCIAR_MANUTENCOES', 'FROTA_VISUALIZAR_ARQUIVOS', 'FROTA_ENVIAR_ARQUIVOS', 'FROTA_VISUALIZAR_DEFEITOS', 'FROTA_TRATAR_DEFEITOS']);
  const options = payload || {};
  let vehicles = FrotaRepository_().readAll('VIATURAS').filter(function (vehicle) {
    return frotaUpper_(vehicle.ATIVO || 'SIM') !== 'NAO';
  });
  if (frotaBoolean_(options.onlyAvailable)) vehicles = vehicles.filter(function (vehicle) { return frotaUpper_(vehicle.STATUS) === 'DISPONIVEL'; });
  vehicles = frotaPesquisar_(vehicles, options.query, ['PREFIXO', 'PLACA', 'MARCA', 'MODELO', 'TIPO', 'SETOR']);
  return frotaEnriquecerViaturas_(vehicles.slice(0, 50)).map(frotaSemLinha_);
}

function frotaEnriquecerViaturas_(vehicles) {
  const ids = {};
  vehicles.forEach(function (vehicle) { ids[vehicle.ID_VIATURA] = true; });
  const defectCounts = {};
  FrotaRepository_().readAll('DEFEITOS_VIATURAS').forEach(function (defect) {
    if (!ids[defect.ID_VIATURA] || frotaUpper_(defect.ATIVO || 'SIM') === 'NAO') return;
    if (['RESOLVIDO', 'CANCELADO'].indexOf(frotaUpper_(defect.STATUS_DEFEITO)) >= 0) return;
    defectCounts[defect.ID_VIATURA] = (defectCounts[defect.ID_VIATURA] || 0) + 1;
  });
  const tireStates = {};
  const tireWeight = { NOVO: 0, BOM: 1, ATENCAO: 2, RUIM: 3, CRITICO: 4, RETIRADO: -1 };
  FrotaRepository_().readAll('PNEUS').forEach(function (tire) {
    if (!ids[tire.ID_VIATURA] || frotaUpper_(tire.ATIVO || 'SIM') === 'NAO') return;
    const state = frotaUpper_(tire.ESTADO || 'BOM');
    const current = tireStates[tire.ID_VIATURA] || { state: 'SEM_REGISTRO', weight: -1, count: 0 };
    current.count += 1;
    if ((tireWeight[state] || 0) > current.weight) { current.state = state; current.weight = tireWeight[state] || 0; }
    tireStates[tire.ID_VIATURA] = current;
  });
  const nextMaintenance = {};
  FrotaRepository_().readAll('MANUTENCOES').forEach(function (maintenance) {
    if (!ids[maintenance.ID_VIATURA] || ['CONCLUIDA', 'CANCELADA'].indexOf(frotaUpper_(maintenance.STATUS)) >= 0) return;
    const current = nextMaintenance[maintenance.ID_VIATURA];
    const date = new Date(maintenance.DATA_PREVISTA || maintenance.DATA_ABERTURA || '2999-12-31').getTime();
    if (!current || date < current.date) nextMaintenance[maintenance.ID_VIATURA] = { date: date, record: maintenance };
  });
  return vehicles.map(function (vehicle) {
    const copy = Object.assign({}, vehicle);
    copy.DEFEITOS_PENDENTES = defectCounts[vehicle.ID_VIATURA] || 0;
    copy.PNEUS_SITUACAO = tireStates[vehicle.ID_VIATURA] ? tireStates[vehicle.ID_VIATURA].state : (vehicle.PNEUS_RESUMO || 'SEM_REGISTRO');
    copy.PNEUS_QUANTIDADE = tireStates[vehicle.ID_VIATURA] ? tireStates[vehicle.ID_VIATURA].count : 0;
    const maintenance = nextMaintenance[vehicle.ID_VIATURA] && nextMaintenance[vehicle.ID_VIATURA].record;
    copy.PROXIMA_MANUTENCAO = maintenance ? {
      id: maintenance.ID_MANUTENCAO,
      data: maintenance.DATA_PREVISTA,
      km: maintenance.PROXIMA_MANUTENCAO_KM || maintenance.KM_ABERTURA,
      descricao: maintenance.DESCRICAO_PROBLEMA,
      status: maintenance.STATUS
    } : null;
    return copy;
  });
}

function frotaViaturaObter_(context, payload) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_VEICULOS', 'FROTA_VISUALIZAR_GERENCIAMENTO', 'FROTA_CADASTRAR_VIATURA', 'FROTA_EDITAR_VIATURA', 'FROTA_ALTERAR_STATUS']);
  frotaExigir_(payload, ['id']);
  const vehicle = frotaObterViaturaObrigatoria_(payload.id);
  return frotaSemLinha_(frotaEnriquecerViaturas_([vehicle])[0]);
}

function frotaViaturaSalvar_(context, payload) {
  const input = payload || {};
  const id = frotaTexto_(input.ID_VIATURA || input.id);
  frotaExigirAcesso_(context, id ? 'FROTA_EDITAR_VIATURA' : 'FROTA_CADASTRAR_VIATURA');
  frotaExigir_(input, ['PREFIXO', 'PLACA', 'TIPO', 'MARCA', 'MODELO', 'KM_ATUAL', 'STATUS']);
  const prefix = frotaTexto_(input.PREFIXO, 50).toUpperCase();
  const plate = frotaPlaca_(input.PLACA);
  const current = id ? frotaObterViaturaObrigatoria_(id) : null;
  const duplicate = FrotaRepository_().readAll('VIATURAS').filter(function (vehicle) {
    return String(vehicle.ID_VIATURA) !== String(id) && (frotaUpper_(vehicle.PREFIXO) === frotaUpper_(prefix) || String(vehicle.PLACA) === plate);
  })[0];
  if (duplicate) throw appError_('FROTA_VIATURA_DUPLICADA', 'Já existe uma viatura com este prefixo ou esta placa.');
  const km = frotaNumero_(input.KM_ATUAL, 'KM atual');
  if (current && Number(current.KM_ATUAL || 0) !== km && !frotaTexto_(input.JUSTIFICATIVA_KM)) {
    throw appError_('FROTA_JUSTIFICATIVA_KM', 'Informe a justificativa para alterar o KM atual.');
  }
  const user = frotaUsuario_(context);
  const now = new Date();
  const record = {
    ID_VIATURA: id || Utilities.getUuid(),
    PREFIXO: prefix,
    PLACA: plate,
    TIPO: frotaUpper_(input.TIPO),
    MARCA: frotaTexto_(input.MARCA, 80).toUpperCase(),
    MODELO: frotaTexto_(input.MODELO, 100).toUpperCase(),
    ANO: input.ANO ? Math.round(frotaNumero_(input.ANO, 'Ano')) : '',
    COR: frotaTexto_(input.COR, 50).toUpperCase(),
    CHASSI: frotaTexto_(input.CHASSI, 40).toUpperCase(),
    RENAVAM: frotaTexto_(input.RENAVAM, 30),
    COMBUSTIVEL: frotaUpper_(input.COMBUSTIVEL),
    KM_ATUAL: km,
    STATUS: frotaValorPermitido_(input.STATUS, FROTA_CONFIG.STATUS_VIATURA, 'Status da viatura'),
    SETOR: frotaTexto_(input.SETOR, 100),
    DATA_AQUISICAO: frotaDataSomente_(input.DATA_AQUISICAO, true),
    OBSERVACAO_ATUAL: frotaTexto_(input.OBSERVACAO_ATUAL, 3000),
    REVISAO_PROXIMA_KM: input.REVISAO_PROXIMA_KM === '' || input.REVISAO_PROXIMA_KM === undefined ? '' : frotaNumero_(input.REVISAO_PROXIMA_KM, 'Próxima revisão por KM'),
    REVISAO_PROXIMA_DATA: frotaDataSomente_(input.REVISAO_PROXIMA_DATA, true),
    REVISAO_TIPO: frotaTexto_(input.REVISAO_TIPO, 120),
    REVISAO_OBSERVACAO: frotaTexto_(input.REVISAO_OBSERVACAO, 1500),
    SEGURO_SEGURADORA: frotaTexto_(input.SEGURO_SEGURADORA, 160),
    SEGURO_APOLICE: frotaTexto_(input.SEGURO_APOLICE, 100),
    SEGURO_INICIO: frotaDataSomente_(input.SEGURO_INICIO, true),
    SEGURO_VENCIMENTO: frotaDataSomente_(input.SEGURO_VENCIMENTO, true),
    SEGURO_OBSERVACAO: frotaTexto_(input.SEGURO_OBSERVACAO, 1500),
    LICENCIAMENTO_ANO: input.LICENCIAMENTO_ANO ? Math.round(frotaNumero_(input.LICENCIAMENTO_ANO, 'Ano do licenciamento')) : '',
    LICENCIAMENTO_VENCIMENTO: frotaDataSomente_(input.LICENCIAMENTO_VENCIMENTO, true),
    LICENCIAMENTO_SITUACAO: frotaUpper_(input.LICENCIAMENTO_SITUACAO),
    LICENCIAMENTO_OBSERVACAO: frotaTexto_(input.LICENCIAMENTO_OBSERVACAO, 1500),
    OLEO_ULTIMA_TROCA_KM: input.OLEO_ULTIMA_TROCA_KM === '' || input.OLEO_ULTIMA_TROCA_KM === undefined ? '' : frotaNumero_(input.OLEO_ULTIMA_TROCA_KM, 'KM da última troca de óleo'),
    OLEO_ULTIMA_TROCA_DATA: frotaDataSomente_(input.OLEO_ULTIMA_TROCA_DATA, true),
    OLEO_PROXIMA_TROCA_KM: input.OLEO_PROXIMA_TROCA_KM === '' || input.OLEO_PROXIMA_TROCA_KM === undefined ? '' : frotaNumero_(input.OLEO_PROXIMA_TROCA_KM, 'Próxima troca de óleo por KM'),
    OLEO_PROXIMA_TROCA_DATA: frotaDataSomente_(input.OLEO_PROXIMA_TROCA_DATA, true),
    OLEO_ESPECIFICACAO: frotaTexto_(input.OLEO_ESPECIFICACAO, 160),
    OLEO_OBSERVACAO: frotaTexto_(input.OLEO_OBSERVACAO, 1500),
    MANUTENCAO_PROXIMA_KM: input.MANUTENCAO_PROXIMA_KM === '' || input.MANUTENCAO_PROXIMA_KM === undefined ? '' : frotaNumero_(input.MANUTENCAO_PROXIMA_KM, 'Próxima manutenção por KM'),
    MANUTENCAO_PROXIMA_DATA: frotaDataSomente_(input.MANUTENCAO_PROXIMA_DATA, true),
    MANUTENCAO_PROXIMA_DESCRICAO: frotaTexto_(input.MANUTENCAO_PROXIMA_DESCRICAO, 1000),
    ATIVO: current ? (frotaUpper_(current.ATIVO || 'SIM') === 'NAO' ? 'NAO' : 'SIM') : 'SIM',
    ATUALIZADO_EM: now,
    ATUALIZADO_POR_MASP: user.masp
  };
  return withScriptLock_(function () {
    let saved;
    if (current) {
      record.ID_PASTA_DRIVE = current.ID_PASTA_DRIVE;
      record.NOME_PASTA_DRIVE = current.NOME_PASTA_DRIVE;
      record.CRIADO_EM = current.CRIADO_EM;
      record.CRIADO_POR_MASP = current.CRIADO_POR_MASP;
      record.MOVIMENTACAO_ATIVA_ID = current.MOVIMENTACAO_ATIVA_ID;
      record.ULTIMO_CONDUTOR = current.ULTIMO_CONDUTOR;
      record.ULTIMO_CONDUTOR_MASP = current.ULTIMO_CONDUTOR_MASP;
      record.ULTIMA_MOVIMENTACAO = current.ULTIMA_MOVIMENTACAO;
      record.PNEUS_RESUMO = current.PNEUS_RESUMO;
      frotaAtualizarPastaViatura_(record);
      saved = FrotaRepository_().update('VIATURAS', current._row, record);
    } else {
      const folder = frotaCriarPastaViatura_(record);
      record.ID_PASTA_DRIVE = folder.getId();
      record.NOME_PASTA_DRIVE = folder.getName();
      record.CRIADO_EM = now;
      record.CRIADO_POR_MASP = user.masp;
      record.MOVIMENTACAO_ATIVA_ID = '';
      record.ULTIMO_CONDUTOR = '';
      record.ULTIMO_CONDUTOR_MASP = '';
      record.ULTIMA_MOVIMENTACAO = '';
      record.PNEUS_RESUMO = '';
      saved = FrotaRepository_().append('VIATURAS', record);
    }
    frotaRegistrarHistorico_(context, {
      ID_VIATURA: saved.ID_VIATURA, PREFIXO: saved.PREFIXO, PLACA: saved.PLACA,
      TIPO_ACAO: current ? 'ALTERACAO_CADASTRO' : 'CADASTRO_VIATURA', CAMPO_ALTERADO: 'CADASTRO',
      VALOR_ANTERIOR: current ? frotaSemLinha_(current) : '', VALOR_NOVO: frotaSemLinha_(saved), JUSTIFICATIVA: input.JUSTIFICATIVA_KM || input.JUSTIFICATIVA || ''
    });
    if (current && Number(current.KM_ATUAL || 0) !== km) {
      frotaRegistrarHistorico_(context, {
        ID_VIATURA: saved.ID_VIATURA, PREFIXO: saved.PREFIXO, PLACA: saved.PLACA, TIPO_ACAO: 'ALTERACAO_KM',
        CAMPO_ALTERADO: 'KM_ATUAL', VALOR_ANTERIOR: current.KM_ATUAL, VALOR_NOVO: km, JUSTIFICATIVA: input.JUSTIFICATIVA_KM
      });
    }
    frotaAuditar_(context, current ? 'EDITAR_VIATURA' : 'CADASTRAR_VIATURA', saved.ID_VIATURA, current && frotaSemLinha_(current), frotaSemLinha_(saved), input.JUSTIFICATIVA || input.JUSTIFICATIVA_KM || '');
    return frotaSemLinha_(saved);
  });
}

function frotaCriarPastaViatura_(vehicle) {
  const root = frotaValidarPastaRaiz_();
  const desiredName = frotaPastaNome_(vehicle);
  const existing = root.getFoldersByName(desiredName);
  const folder = existing.hasNext() ? existing.next() : root.createFolder(desiredName);
  ['Arquivos', 'Manutencoes', 'Fotos'].forEach(function (name) {
    if (!folder.getFoldersByName(name).hasNext()) folder.createFolder(name);
  });
  return folder;
}

function frotaAtualizarPastaViatura_(vehicle) {
  const desiredName = frotaPastaNome_(vehicle);
  if (!vehicle.ID_PASTA_DRIVE) {
    const folder = frotaCriarPastaViatura_(vehicle);
    vehicle.ID_PASTA_DRIVE = folder.getId();
    vehicle.NOME_PASTA_DRIVE = folder.getName();
    return;
  }
  try {
    const folder = DriveApp.getFolderById(vehicle.ID_PASTA_DRIVE);
    assertDevelopmentDriveItem_(folder);
    if (folder.getName() !== desiredName) folder.setName(desiredName);
    vehicle.NOME_PASTA_DRIVE = desiredName;
  } catch (error) {
    const replacement = frotaCriarPastaViatura_(vehicle);
    vehicle.ID_PASTA_DRIVE = replacement.getId();
    vehicle.NOME_PASTA_DRIVE = replacement.getName();
  }
}

function frotaViaturaAlterarStatus_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_ALTERAR_STATUS');
  frotaExigir_(payload, ['id', 'status', 'justification']);
  const vehicle = frotaObterViaturaObrigatoria_(payload.id);
  const status = frotaValorPermitido_(payload.status, FROTA_CONFIG.STATUS_VIATURA, 'Status da viatura');
  const hasOpenMovement = frotaTemMovimentacaoAberta_(vehicle.ID_VIATURA);
  if (hasOpenMovement && status !== 'EM_USO') throw appError_('FROTA_MOVIMENTACAO_ATIVA', 'Existe uma movimentação de KM aberta. Encerre-a antes de alterar o status da viatura.');
  if (status === 'DISPONIVEL') {
    const blockedReason = frotaMotivoBloqueioRestauracao_(vehicle, '');
    if (blockedReason) throw appError_('FROTA_RETORNO_DISPONIVEL_BLOQUEADO', blockedReason);
  }
  const updated = FrotaRepository_().update('VIATURAS', vehicle._row, {
    STATUS: status,
    MOVIMENTACAO_ATIVA_ID: hasOpenMovement ? vehicle.MOVIMENTACAO_ATIVA_ID : '',
    ATUALIZADO_EM: new Date(),
    ATUALIZADO_POR_MASP: frotaUsuario_(context).masp
  });
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'ALTERACAO_STATUS',
    CAMPO_ALTERADO: 'STATUS', VALOR_ANTERIOR: vehicle.STATUS, VALOR_NOVO: status, JUSTIFICATIVA: payload.justification
  });
  frotaAuditar_(context, 'ALTERAR_STATUS', vehicle.ID_VIATURA, vehicle.STATUS, status, payload.justification);
  return frotaSemLinha_(updated);
}

function frotaViaturaDesativar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_EXCLUIR_VIATURA');
  frotaExigir_(payload, ['id', 'justification']);
  const vehicle = frotaObterViaturaObrigatoria_(payload.id);
  if (frotaTemMovimentacaoAberta_(vehicle.ID_VIATURA)) throw appError_('FROTA_MOVIMENTACAO_ATIVA', 'Encerre a movimentação antes de desativar a viatura.');
  const updated = FrotaRepository_().update('VIATURAS', vehicle._row, {
    ATIVO: 'NAO', STATUS: 'INATIVA', ATUALIZADO_EM: new Date(), ATUALIZADO_POR_MASP: frotaUsuario_(context).masp
  });
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'DESATIVACAO_VIATURA',
    CAMPO_ALTERADO: 'ATIVO', VALOR_ANTERIOR: vehicle.ATIVO, VALOR_NOVO: 'NAO', JUSTIFICATIVA: payload.justification
  });
  frotaAuditar_(context, 'DESATIVAR_VIATURA', vehicle.ID_VIATURA, vehicle, updated, payload.justification);
  return frotaSemLinha_(updated);
}

function frotaViaturaEditarObservacao_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_EDITAR_OBSERVACOES');
  frotaExigir_(payload, ['id', 'observation', 'reason']);
  const vehicle = frotaObterViaturaObrigatoria_(payload.id);
  const observation = frotaTexto_(payload.observation, 3000);
  const user = frotaUsuario_(context);
  const timestamp = new Date();
  const observationRecord = FrotaRepository_().append('OBSERVACOES_VIATURAS', {
    ID_OBSERVACAO: Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, ID_MOVIMENTACAO: '', PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
    TIPO: 'OBSERVACAO_PRINCIPAL', CATEGORIA: 'OUTRO', GRAVIDADE: 'BAIXA', OBSERVACAO_ANTERIOR: vehicle.OBSERVACAO_ATUAL,
    OBSERVACAO_NOVA: observation, MOTIVO: frotaTexto_(payload.reason, 1500), INFORMADO_POR_MASP: user.masp,
    INFORMADO_POR_NOME: user.nome, DATA_HORA: timestamp, ATIVO: 'SIM'
  });
  const updated = FrotaRepository_().update('VIATURAS', vehicle._row, {
    OBSERVACAO_ATUAL: observation, ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp
  });
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'OBSERVACAO',
    CAMPO_ALTERADO: 'OBSERVACAO_ATUAL', VALOR_ANTERIOR: vehicle.OBSERVACAO_ATUAL, VALOR_NOVO: observation, JUSTIFICATIVA: payload.reason
  });
  frotaNotificarOcorrencia_(context, vehicle, { tipo: 'OBSERVACAO', gravidade: 'BAIXA', descricao: observation }, observationRecord.ID_OBSERVACAO);
  frotaAuditar_(context, 'EDITAR_OBSERVACAO', vehicle.ID_VIATURA, vehicle.OBSERVACAO_ATUAL, observation, payload.reason);
  return frotaSemLinha_(updated);
}
