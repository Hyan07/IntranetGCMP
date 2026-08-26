/** Controle individual de pneus por viatura e posição. */

function frotaPneusListar_(context, payload) {
  frotaExigirAcesso_(context);
  const options = payload || {};
  let rows = FrotaRepository_().readAll('PNEUS');
  if (!frotaBoolean_(options.includeInactive)) rows = rows.filter(function (row) { return frotaUpper_(row.ATIVO || 'SIM') !== 'NAO'; });
  if (options.vehicleId) rows = rows.filter(function (row) { return String(row.ID_VIATURA) === String(options.vehicleId); });
  if (options.state) rows = rows.filter(function (row) { return frotaUpper_(row.ESTADO) === frotaUpper_(options.state); });
  if (options.position) rows = rows.filter(function (row) { return frotaUpper_(row.POSICAO) === frotaUpper_(options.position); });
  rows = frotaPesquisar_(rows, options.query, ['PREFIXO', 'PLACA', 'POSICAO', 'MARCA', 'MODELO', 'MEDIDA', 'NUMERO_SERIE', 'ESTADO', 'OBSERVACAO']);
  rows.sort(function (a, b) { return String(a.PREFIXO || '').localeCompare(String(b.PREFIXO || ''), 'pt-BR', { numeric: true }) || String(a.POSICAO || '').localeCompare(String(b.POSICAO || ''), 'pt-BR'); });
  return frotaPaginar_(rows, options);
}

function frotaPneuObter_(context, payload) {
  frotaExigirAcesso_(context);
  frotaExigir_(payload, ['id']);
  const row = FrotaRepository_().findOne('PNEUS', 'ID_PNEU', payload.id);
  if (!row) throw appError_('FROTA_PNEU_NAO_ENCONTRADO', 'Pneu não encontrado.');
  return frotaSemLinha_(row);
}

function frotaPneuSalvar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_GERENCIAR_PNEUS');
  const input = payload || {};
  frotaExigir_(input, ['ID_VIATURA', 'POSICAO', 'MARCA', 'MODELO', 'MEDIDA', 'NUMERO_SERIE', 'ESTADO']);
  const id = frotaTexto_(input.ID_PNEU || input.id);
  const current = id ? FrotaRepository_().findOne('PNEUS', 'ID_PNEU', id) : null;
  if (id && !current) throw appError_('FROTA_PNEU_NAO_ENCONTRADO', 'Pneu não encontrado.');
  const vehicle = frotaObterViaturaObrigatoria_(input.ID_VIATURA);
  const positions = frotaListaPropriedade_(FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS, FROTA_CONFIG.POSICOES_PNEUS);
  const position = frotaValorPermitido_(input.POSICAO, positions, 'Posição do pneu');
  const state = frotaValorPermitido_(input.ESTADO, FROTA_CONFIG.ESTADOS_PNEUS, 'Estado do pneu');
  const active = state === 'RETIRADO' || frotaUpper_(input.ATIVO) === 'NAO' ? 'NAO' : 'SIM';
  const serial = frotaTexto_(input.NUMERO_SERIE, 100).toUpperCase();
  const duplicateSerial = FrotaRepository_().readAll('PNEUS').filter(function (row) {
    return String(row.ID_PNEU) !== String(id) && frotaUpper_(row.NUMERO_SERIE) === frotaUpper_(serial);
  })[0];
  if (duplicateSerial) throw appError_('FROTA_PNEU_SERIE_DUPLICADA', 'Já existe um pneu cadastrado com este número de série.');
  if (active === 'SIM') {
    const occupied = FrotaRepository_().readAll('PNEUS').filter(function (row) {
      return String(row.ID_PNEU) !== String(id) && String(row.ID_VIATURA) === String(vehicle.ID_VIATURA) &&
        frotaUpper_(row.POSICAO) === position && frotaUpper_(row.ATIVO || 'SIM') !== 'NAO';
    })[0];
    if (occupied) throw appError_('FROTA_POSICAO_PNEU_OCUPADA', 'Esta posição já possui um pneu ativo. Retire ou edite o pneu atual primeiro.');
  }
  const timestamp = new Date();
  const record = {
    ID_PNEU: id || Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
    POSICAO: position, MARCA: frotaTexto_(input.MARCA, 100).toUpperCase(), MODELO: frotaTexto_(input.MODELO, 100).toUpperCase(),
    MEDIDA: frotaTexto_(input.MEDIDA, 80).toUpperCase(), NUMERO_SERIE: serial,
    DATA_INSTALACAO: frotaDataSomente_(input.DATA_INSTALACAO, true),
    KM_INSTALACAO: input.KM_INSTALACAO === '' || input.KM_INSTALACAO === undefined ? '' : frotaNumero_(input.KM_INSTALACAO, 'KM de instalação'),
    DATA_RETIRADA: frotaDataSomente_(input.DATA_RETIRADA, true),
    KM_RETIRADA: input.KM_RETIRADA === '' || input.KM_RETIRADA === undefined ? '' : frotaNumero_(input.KM_RETIRADA, 'KM de retirada'),
    ESTADO: state, PREVISAO_TROCA: frotaDataSomente_(input.PREVISAO_TROCA, true),
    MOTIVO_RETIRADA: frotaTexto_(input.MOTIVO_RETIRADA, 1000), OBSERVACAO: frotaTexto_(input.OBSERVACAO, 2000),
    ATIVO: active, CRIADO_EM: current ? current.CRIADO_EM : timestamp, ATUALIZADO_EM: timestamp
  };
  return withScriptLock_(function () {
    const saved = current ? FrotaRepository_().update('PNEUS', current._row, record) : FrotaRepository_().append('PNEUS', record);
    frotaAtualizarResumoPneus_(vehicle, context);
    if (['RUIM', 'CRITICO'].indexOf(state) >= 0 && active === 'SIM') {
      frotaCriarNotificacao_(context, {
        tipo: 'PNEU_' + state, titulo: vehicle.PREFIXO + ' — pneu ' + state.toLowerCase(),
        mensagem: 'Pneu ' + position.replace(/_/g, ' ').toLowerCase() + ' em estado ' + state + '. Série: ' + serial + '.',
        gravidade: state === 'CRITICO' ? 'ALTA' : 'MEDIA', referenciaId: saved.ID_PNEU,
        chave: frotaIdempotencyKey_(['PNEU', saved.ID_PNEU, state])
      });
    }
    frotaRegistrarHistorico_(context, {
      ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'PNEU',
      CAMPO_ALTERADO: position, VALOR_ANTERIOR: current ? frotaSemLinha_(current) : '', VALOR_NOVO: frotaSemLinha_(saved), JUSTIFICATIVA: input.OBSERVACAO || input.MOTIVO_RETIRADA || ''
    });
    frotaAuditar_(context, current ? 'EDITAR_PNEU' : 'CADASTRAR_PNEU', saved.ID_PNEU, current, saved, input.OBSERVACAO || '');
    return frotaSemLinha_(saved);
  });
}

function frotaAtualizarResumoPneus_(vehicle, context) {
  const weights = { NOVO: 0, BOM: 1, ATENCAO: 2, RUIM: 3, CRITICO: 4 };
  const tires = FrotaRepository_().readAll('PNEUS').filter(function (row) {
    return String(row.ID_VIATURA) === String(vehicle.ID_VIATURA) && frotaUpper_(row.ATIVO || 'SIM') !== 'NAO';
  });
  let worst = 'SEM_REGISTRO';
  let weight = -1;
  tires.forEach(function (tire) {
    const state = frotaUpper_(tire.ESTADO);
    const currentWeight = Object.prototype.hasOwnProperty.call(weights, state) ? weights[state] : 0;
    if (currentWeight > weight) { worst = state; weight = currentWeight; }
  });
  const summary = tires.length + ' pneu(s) — ' + worst.replace(/_/g, ' ');
  FrotaRepository_().update('VIATURAS', vehicle._row, {
    PNEUS_RESUMO: summary, ATUALIZADO_EM: new Date(), ATUALIZADO_POR_MASP: context ? frotaUsuario_(context).masp : 'ROTINA_FROTA'
  });
  return summary;
}
