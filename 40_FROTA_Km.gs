/** Abertura e encerramento seguro das movimentações de KM. */

function frotaKmEstado_(context) {
  frotaExigirAcesso_(context, ['FROTA_VISUALIZAR_KM', 'FROTA_KM_ABRIR', 'FROTA_KM_ENCERRAR']);
  const user = frotaUsuario_(context);
  const movement = FrotaRepository_().readAll('MOVIMENTACOES_KM').filter(function (row) {
    return frotaUpper_(row.STATUS) === 'ABERTA' && frotaMasp_(row.CONDUTOR_MASP) === user.masp;
  })[0] || null;
  return {
    usuario: user,
    agora: new Date(),
    movimentacao: movement ? frotaSemLinha_(movement) : null,
    viatura: movement ? frotaSemLinha_(frotaEnriquecerViaturas_([frotaObterViaturaObrigatoria_(movement.ID_VIATURA)])[0]) : null
  };
}

function frotaKmAbrir_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_KM_ABRIR');
  const input = payload || {};
  frotaExigir_(input, ['vehicleId']);
  const occurrence = frotaValidarOcorrencia_(input.occurrence);
  const user = frotaUsuario_(context);
  return withScriptLock_(function () {
    const vehicle = frotaObterViaturaObrigatoria_(input.vehicleId);
    if (frotaUpper_(vehicle.ATIVO || 'SIM') === 'NAO') throw appError_('FROTA_VIATURA_INATIVA', 'Esta viatura está desativada.');
    if (frotaUpper_(vehicle.STATUS) !== 'DISPONIVEL') throw appError_('FROTA_VIATURA_INDISPONIVEL', 'A viatura não está disponível para uso. Status atual: ' + vehicle.STATUS + '.');
    const openMovements = FrotaRepository_().readAll('MOVIMENTACOES_KM').filter(function (row) { return frotaUpper_(row.STATUS) === 'ABERTA'; });
    if (vehicle.MOVIMENTACAO_ATIVA_ID || openMovements.some(function (row) { return String(row.ID_VIATURA) === String(vehicle.ID_VIATURA); })) {
      throw appError_('FROTA_VIATURA_EM_USO', 'Já existe uma movimentação aberta para esta viatura.');
    }
    if (openMovements.some(function (row) { return frotaMasp_(row.CONDUTOR_MASP) === user.masp; })) {
      throw appError_('FROTA_CONDUTOR_EM_USO', 'Você já possui uma movimentação aberta. Encerre-a antes de utilizar outra viatura.');
    }
    const kmSystem = frotaNumero_(vehicle.KM_ATUAL || 0, 'KM do sistema');
    const divergent = frotaBoolean_(input.kmDivergent);
    const kmReported = divergent ? frotaNumero_(input.initialKm, 'KM inicial informado') : kmSystem;
    const justification = frotaTexto_(input.divergenceJustification, 2000);
    if (divergent && !justification) throw appError_('FROTA_DIVERGENCIA_SEM_JUSTIFICATIVA', 'A justificativa é obrigatória quando o KM estiver divergente.');
    const timestamp = new Date();
    const movement = FrotaRepository_().append('MOVIMENTACOES_KM', {
      ID_MOVIMENTACAO: Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
      CONDUTOR_MASP: user.masp, CONDUTOR_NOME: user.nome, DATA_HORA_ABERTURA: timestamp,
      KM_SISTEMA_ABERTURA: kmSystem, KM_INICIAL_INFORMADO: kmReported, KM_DIVERGENTE: divergent ? 'SIM' : 'NAO',
      JUSTIFICATIVA_DIVERGENCIA: justification, OBSERVACAO_SAIDA: frotaTexto_(input.departureObservation, 3000),
      DATA_HORA_ENCERRAMENTO: '', KM_FINAL: '', KM_PERCORRIDO: '', OBSERVACAO_ENCERRAMENTO: '', STATUS: 'ABERTA',
      ENCERRADO_POR_MASP: '', ENCERRADO_POR_NOME: '', CRIADO_EM: timestamp, ATUALIZADO_EM: timestamp
    });
    FrotaRepository_().update('VIATURAS', vehicle._row, {
      STATUS: 'EM_USO', MOVIMENTACAO_ATIVA_ID: movement.ID_MOVIMENTACAO, ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp
    });
    let occurrenceResult = null;
    if (occurrence) occurrenceResult = frotaRegistrarOcorrenciaInterna_(context, vehicle, movement.ID_MOVIMENTACAO, occurrence);
    frotaRegistrarHistorico_(context, {
      ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'ABERTURA_UTILIZACAO',
      CAMPO_ALTERADO: divergent ? 'KM_DIVERGENTE' : 'MOVIMENTACAO', VALOR_ANTERIOR: { KM_SISTEMA: kmSystem },
      VALOR_NOVO: { ID_MOVIMENTACAO: movement.ID_MOVIMENTACAO, KM_INICIAL: kmReported, KM_DIVERGENTE: divergent, CONDUTOR_MASP: user.masp },
      JUSTIFICATIVA: justification || input.departureObservation || ''
    });
    if (input.departureObservation) {
      frotaCriarNotificacao_(context, {
        tipo: 'OBSERVACAO_SAIDA', titulo: vehicle.PREFIXO + ' — observação na saída', mensagem: input.departureObservation,
        gravidade: 'BAIXA', referenciaId: movement.ID_MOVIMENTACAO, chave: 'FROTA:SAIDA:' + movement.ID_MOVIMENTACAO
      });
    }
    frotaAuditar_(context, 'ABRIR_MOVIMENTACAO_KM', movement.ID_MOVIMENTACAO, null, movement, justification);
    return { movimentacao: frotaSemLinha_(movement), ocorrencia: occurrenceResult };
  });
}

function frotaKmEncerrar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_KM_ENCERRAR');
  const input = payload || {};
  frotaExigir_(input, ['movementId', 'finalKm']);
  const occurrence = frotaValidarOcorrencia_(input.occurrence);
  const user = frotaUsuario_(context);
  return withScriptLock_(function () {
    const movement = FrotaRepository_().findOne('MOVIMENTACOES_KM', 'ID_MOVIMENTACAO', input.movementId);
    if (!movement || frotaUpper_(movement.STATUS) !== 'ABERTA') throw appError_('FROTA_MOVIMENTACAO_NAO_ABERTA', 'A movimentação não existe ou já foi encerrada.');
    if (frotaMasp_(movement.CONDUTOR_MASP) !== user.masp && !hasPermission_(context, 'FROTA_ENCERRAR_MOVIMENTACAO_OUTRO_USUARIO')) {
      throw appError_('FORBIDDEN', 'Somente o condutor ou um gestor autorizado pode encerrar esta movimentação.');
    }
    const vehicle = frotaObterViaturaObrigatoria_(movement.ID_VIATURA);
    const initialKm = frotaNumero_(movement.KM_INICIAL_INFORMADO, 'KM inicial');
    const finalKm = frotaNumero_(input.finalKm, 'KM final');
    if (finalKm < initialKm) throw appError_('FROTA_KM_FINAL_MENOR', 'O KM final não pode ser menor que o KM inicial (' + initialKm + ').');
    const timestamp = new Date();
    const updatedMovement = FrotaRepository_().update('MOVIMENTACOES_KM', movement._row, {
      DATA_HORA_ENCERRAMENTO: timestamp,
      KM_FINAL: finalKm,
      KM_PERCORRIDO: finalKm - initialKm,
      OBSERVACAO_ENCERRAMENTO: frotaTexto_(input.closingObservation, 3000),
      STATUS: 'ENCERRADA',
      ENCERRADO_POR_MASP: user.masp,
      ENCERRADO_POR_NOME: user.nome,
      ATUALIZADO_EM: timestamp
    });
    let updatedVehicle = FrotaRepository_().update('VIATURAS', vehicle._row, {
      KM_ATUAL: finalKm,
      STATUS: 'DISPONIVEL',
      MOVIMENTACAO_ATIVA_ID: '',
      ULTIMO_CONDUTOR: movement.CONDUTOR_NOME,
      ULTIMO_CONDUTOR_MASP: movement.CONDUTOR_MASP,
      ULTIMA_MOVIMENTACAO: timestamp,
      ATUALIZADO_EM: timestamp,
      ATUALIZADO_POR_MASP: user.masp
    });
    let occurrenceResult = null;
    if (occurrence) {
      updatedVehicle._row = vehicle._row;
      occurrenceResult = frotaRegistrarOcorrenciaInterna_(context, updatedVehicle, movement.ID_MOVIMENTACAO, occurrence);
      if (occurrenceResult && occurrenceResult.indisponivel) updatedVehicle.STATUS = 'INDISPONIVEL';
    }
    const blockingDefect = FrotaRepository_().readAll('DEFEITOS_VIATURAS').some(function (defect) {
      return String(defect.ID_VIATURA) === String(vehicle.ID_VIATURA) && frotaUpper_(defect.ATIVO || 'SIM') !== 'NAO' &&
        ['RESOLVIDO', 'CANCELADO'].indexOf(frotaUpper_(defect.STATUS_DEFEITO)) < 0 &&
        (frotaUpper_(defect.GRAVIDADE) === 'VIATURA_SEM_CONDICOES_DE_USO' || frotaUpper_(defect.SOLICITOU_RETIRADA) === 'SIM');
    });
    if (blockingDefect) {
      FrotaRepository_().update('VIATURAS', vehicle._row, { STATUS: 'INDISPONIVEL', ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp });
      updatedVehicle.STATUS = 'INDISPONIVEL';
    }
    frotaRegistrarHistorico_(context, {
      ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'ENCERRAMENTO_UTILIZACAO',
      CAMPO_ALTERADO: 'MOVIMENTACAO', VALOR_ANTERIOR: { ID_MOVIMENTACAO: movement.ID_MOVIMENTACAO, KM_INICIAL: initialKm },
      VALOR_NOVO: { KM_FINAL: finalKm, KM_PERCORRIDO: finalKm - initialKm, STATUS: 'ENCERRADA' }, JUSTIFICATIVA: input.closingObservation || ''
    });
    if (Number(vehicle.KM_ATUAL || 0) !== finalKm) {
      frotaRegistrarHistorico_(context, {
        ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'ALTERACAO_KM',
        CAMPO_ALTERADO: 'KM_ATUAL', VALOR_ANTERIOR: vehicle.KM_ATUAL, VALOR_NOVO: finalKm, JUSTIFICATIVA: 'Encerramento da movimentação ' + movement.ID_MOVIMENTACAO
      });
    }
    if (input.closingObservation) {
      frotaCriarNotificacao_(context, {
        tipo: 'OBSERVACAO_ENCERRAMENTO', titulo: vehicle.PREFIXO + ' — observação no encerramento', mensagem: input.closingObservation,
        gravidade: 'MEDIA', referenciaId: movement.ID_MOVIMENTACAO, chave: 'FROTA:ENCERRAMENTO:' + movement.ID_MOVIMENTACAO
      });
    }
    frotaAuditar_(context, 'ENCERRAR_MOVIMENTACAO_KM', movement.ID_MOVIMENTACAO, movement, updatedMovement, input.closingObservation || '');
    return {
      movimentacao: frotaSemLinha_(updatedMovement),
      viatura: frotaSemLinha_(updatedVehicle),
      ocorrencia: occurrenceResult,
      kmPercorrido: finalKm - initialKm
    };
  });
}
