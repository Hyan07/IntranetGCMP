/** Início, encerramento e histórico de turnos de viaturas. */

function startShift_(context, payload) {
  requirePermission_(context, 'viaturas.iniciar_turno');
  requireFields_(payload, ['ID_VIATURA', 'KM_INICIAL', 'NIVEL_COMBUSTIVEL', 'CONDICOES_GERAIS']);
  return withScriptLock_(function () {
    const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', payload.ID_VIATURA);
    if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
    if (['DISPONIVEL', 'RESERVADA'].indexOf(vehicle.STATUS) < 0) throw appError_('VEHICLE_UNAVAILABLE', 'A viatura não está disponível para iniciar turno.');
    const shifts = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS').filter(function (s) { return s.STATUS === 'ABERTO'; });
    if (shifts.some(function (s) { return String(s.ID_VIATURA) === String(vehicle.ID_VIATURA); })) throw appError_('VEHICLE_SHIFT_OPEN', 'Esta viatura já possui um turno aberto.');
    if (shifts.some(function (s) { return String(s.ID_USUARIO_RESPONSAVEL) === String(context.user.ID_USUARIO); })) throw appError_('USER_SHIFT_OPEN', 'Você já possui um turno aberto.');
    const selectedParticipantIds = Array.isArray(payload.INTEGRANTES_IDS) ? payload.INTEGRANTES_IDS : (payload.INTEGRANTES_IDS ? [payload.INTEGRANTES_IDS] : []);
    const openShiftIds = shifts.map(function (s) { return String(s.ID_TURNO); });
    const openMembers = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'INTEGRANTES_TURNO').filter(function (member) { return openShiftIds.indexOf(String(member.ID_TURNO)) >= 0; });
    const responsiblePersonId = context.user.ID_PESSOA || payload.ID_PESSOA_RESPONSAVEL || '';
    if (responsiblePersonId && openMembers.some(function (member) { return String(member.ID_PESSOA) === String(responsiblePersonId); })) {
      throw appError_('PERSON_SHIFT_OPEN', 'O responsável já integra outro turno aberto.');
    }
    const conflictingParticipant = selectedParticipantIds.find(function (personId) {
      return shifts.some(function (s) { return String(s.ID_PESSOA_RESPONSAVEL) === String(personId); }) ||
        openMembers.some(function (member) { return String(member.ID_PESSOA) === String(personId); });
    });
    if (conflictingParticipant) throw appError_('PARTICIPANT_SHIFT_OPEN', 'Um dos integrantes selecionados já possui outro turno aberto.');
    const km = validatePositiveNumber_(payload.KM_INICIAL, 'KM inicial', true);
    const expectedKm = Number(vehicle.KM_ATUAL || 0);
    const divergent = km !== expectedKm;
    if (divergent && !normalizeText_(payload.JUSTIFICATIVA_KM)) throw appError_('KM_JUSTIFICATION_REQUIRED', 'Justifique a divergência da quilometragem inicial.');
    if (divergent && !hasPermission_(context, 'viaturas.gerenciar_frota')) throw appError_('KM_OVERRIDE_FORBIDDEN', 'A divergência de KM requer autorização de gestão da frota.');
    const personId = responsiblePersonId;
    const selectedPeople = selectedParticipantIds.map(function (personIdItem) {
      return repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', personIdItem);
    }).filter(Boolean);
    const timestamp = now_();
    const shift = {
      ID_TURNO: uuid_(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
      ID_USUARIO_RESPONSAVEL: context.user.ID_USUARIO, ID_PESSOA_RESPONSAVEL: personId, NOME_RESPONSAVEL: context.user.NOME,
      MASP_RESPONSAVEL: context.user.MASP, INTEGRANTES: selectedPeople.length ? selectedPeople.map(function (p) { return p.NOME_COMPLETO; }).join(', ') : (Array.isArray(payload.INTEGRANTES) ? payload.INTEGRANTES.join(', ') : normalizeText_(payload.INTEGRANTES)),
      SETOR: normalizeText_(payload.SETOR || context.user.SETOR), EQUIPE: normalizeText_(payload.EQUIPE), INICIO_EM: timestamp,
      FIM_EM: '', KM_INICIAL: km, KM_FINAL: '', KM_PERCORRIDO: '', COMBUSTIVEL_INICIAL: normalizeText_(payload.NIVEL_COMBUSTIVEL),
      COMBUSTIVEL_FINAL: '', CONDICOES_INICIAIS: normalizeText_(payload.CONDICOES_GERAIS), AVARIAS_INICIAIS: normalizeText_(payload.AVARIAS_EXISTENTES),
      EQUIPAMENTOS_INICIAIS: normalizeText_(payload.EQUIPAMENTOS), OBSERVACOES_INICIO: normalizeText_(payload.OBSERVACOES),
      FOTOS_INICIO_IDS: Array.isArray(payload.FOTOS_IDS) ? payload.FOTOS_IDS.join(',') : normalizeText_(payload.FOTOS_IDS),
      DIVERGENCIA_KM: divergent, JUSTIFICATIVA_KM: normalizeText_(payload.JUSTIFICATIVA_KM), STATUS: 'ABERTO',
      OCORRENCIAS: '', AVARIAS_FINAIS: '', FALHAS_MECANICAS: '', MULTAS: '', LIMPEZA: '', EQUIPAMENTOS_AUSENTES: '',
      NECESSITA_MANUTENCAO: false, OBSERVACOES_FIM: '', FOTOS_FIM_IDS: '', CRIADO_EM: timestamp, ATUALIZADO_EM: timestamp
    };
    repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', shift);
    selectedPeople.forEach(function (person) {
      repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'INTEGRANTES_TURNO', { ID: uuid_(), ID_TURNO: shift.ID_TURNO, ID_PESSOA: person.ID_PESSOA, NOME: person.NOME_COMPLETO, MASP: person.MASP, FUNCAO: person.FUNCAO });
    });
    repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, { STATUS: 'EM_SERVICO', ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO });
    audit_(context, 'viaturas', 'INICIAR_TURNO', shift.ID_TURNO, null, shift, 'SUCESSO', shift.JUSTIFICATIVA_KM);
    return shift;
  });
}

function endShift_(context, payload) {
  requirePermission_(context, 'viaturas.encerrar_turno');
  requireFields_(payload, ['ID_TURNO', 'KM_FINAL', 'COMBUSTIVEL_FINAL', 'STATUS_VIATURA']);
  return withScriptLock_(function () {
    const shift = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', 'ID_TURNO', payload.ID_TURNO);
    if (!shift || shift.STATUS !== 'ABERTO') throw appError_('SHIFT_NOT_OPEN', 'Turno aberto não encontrado.');
    const ownsShift = String(shift.ID_USUARIO_RESPONSAVEL) === String(context.user.ID_USUARIO);
    if (!ownsShift && !hasPermission_(context, 'viaturas.gerenciar_frota')) throw appError_('FORBIDDEN_SHIFT', 'Somente o responsável ou a gestão da frota pode encerrar este turno.');
    const vehicle = repositoryFindOne_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', 'ID_VIATURA', shift.ID_VIATURA);
    if (!vehicle) throw appError_('VEHICLE_NOT_FOUND', 'Viatura do turno não encontrada.');
    const finalKm = validatePositiveNumber_(payload.KM_FINAL, 'KM final', true);
    const initialKm = Number(shift.KM_INICIAL || 0);
    if (finalKm < initialKm) throw appError_('INVALID_FINAL_KM', 'O KM final não pode ser menor que o KM inicial.');
    if (finalKm < Number(vehicle.KM_ATUAL || 0)) throw appError_('KM_REGRESSION', 'O KM final não pode ser menor que o último KM registrado para a viatura.');
    const nextStatus = validateStatus_(payload.STATUS_VIATURA, ['DISPONIVEL', 'MANUTENCAO', 'INDISPONIVEL']);
    const timestamp = now_();
    const patch = {
      FIM_EM: timestamp, KM_FINAL: finalKm, KM_PERCORRIDO: finalKm - initialKm,
      COMBUSTIVEL_FINAL: normalizeText_(payload.COMBUSTIVEL_FINAL), OCORRENCIAS: normalizeText_(payload.OCORRENCIAS),
      AVARIAS_FINAIS: normalizeText_(payload.AVARIAS), FALHAS_MECANICAS: normalizeText_(payload.FALHAS_MECANICAS),
      MULTAS: normalizeText_(payload.MULTAS), LIMPEZA: normalizeText_(payload.LIMPEZA), EQUIPAMENTOS_AUSENTES: normalizeText_(payload.EQUIPAMENTOS_AUSENTES),
      NECESSITA_MANUTENCAO: normalizeBoolean_(payload.NECESSITA_MANUTENCAO), OBSERVACOES_FIM: normalizeText_(payload.OBSERVACOES),
      FOTOS_FIM_IDS: Array.isArray(payload.FOTOS_IDS) ? payload.FOTOS_IDS.join(',') : normalizeText_(payload.FOTOS_IDS), STATUS: 'ENCERRADO', ATUALIZADO_EM: timestamp
    };
    const saved = repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', shift._row, patch);
    repositoryUpdate_(APP_CONFIG.DATABASES.VEHICLES, 'VIATURAS', vehicle._row, {
      KM_ATUAL: finalKm, KM_ATUALIZADO_EM: timestamp, STATUS: normalizeBoolean_(payload.NECESSITA_MANUTENCAO) ? 'MANUTENCAO' : nextStatus,
      ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
    });
    repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'HISTORICO_KM', {
      ID: uuid_(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, DATA_HORA: timestamp,
      KM_ANTERIOR: Number(vehicle.KM_ATUAL || 0), KM_NOVO: finalKm, ORIGEM: 'ENCERRAMENTO_TURNO', ID_ORIGEM: shift.ID_TURNO,
      ID_USUARIO: context.user.ID_USUARIO, JUSTIFICATIVA: normalizeText_(payload.JUSTIFICATIVA_KM)
    });
    if (patch.AVARIAS_FINAIS || patch.FALHAS_MECANICAS) {
      repositoryAppend_(APP_CONFIG.DATABASES.VEHICLES, 'AVARIAS', {
        ID_AVARIA: uuid_(), ID_VIATURA: vehicle.ID_VIATURA, ID_TURNO: shift.ID_TURNO, DATA_HORA: timestamp,
        DESCRICAO: [patch.AVARIAS_FINAIS, patch.FALHAS_MECANICAS].filter(Boolean).join(' | '), GRAVIDADE: normalizeText_(payload.GRAVIDADE || 'A_AVALIAR'),
        STATUS: 'ABERTA', REGISTRADO_POR: context.user.ID_USUARIO, RESOLVIDO_EM: '', OBSERVACOES: patch.OBSERVACOES_FIM
      });
    }
    audit_(context, 'viaturas', 'ENCERRAR_TURNO', shift.ID_TURNO, shift, saved, 'SUCESSO');
    return saved;
  });
}

function listOpenShifts_(context, payload) {
  requirePermission_(context, 'viaturas.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS').filter(function (s) { return s.STATUS === 'ABERTO'; });
  rows = searchRows_(rows, options.query, ['PREFIXO', 'PLACA', 'NOME_RESPONSAVEL', 'MASP_RESPONSAVEL', 'SETOR', 'EQUIPE']);
  rows.forEach(function (s) { s.DURACAO_MINUTOS = Math.floor((now_().getTime() - new Date(s.INICIO_EM).getTime()) / 60000); });
  return paginate_(sortByDateDesc_(rows, 'INICIO_EM'), options);
}

function listShiftHistory_(context, payload) {
  requirePermission_(context, 'viaturas.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS');
  rows = searchRows_(rows, options.query, ['PREFIXO', 'PLACA', 'NOME_RESPONSAVEL', 'MASP_RESPONSAVEL', 'SETOR', 'EQUIPE']);
  if (options.vehicleId) rows = rows.filter(function (s) { return String(s.ID_VIATURA) === String(options.vehicleId); });
  if (options.status) rows = rows.filter(function (s) { return s.STATUS === normalizeUpper_(options.status); });
  return paginate_(sortByDateDesc_(rows, 'INICIO_EM'), options);
}
