/** Criação de notificações globais destinadas por permissão. */

var FROTA_NOTIFICATION_BATCH_ = null;

function frotaIniciarLoteNotificacoes_() {
  const keys = {};
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES').forEach(function (item) {
    if (item.CHAVE_UNICA) keys[item.CHAVE_UNICA] = true;
  });
  FROTA_NOTIFICATION_BATCH_ = { keys: keys, records: [], recipients: {} };
}

function frotaFinalizarLoteNotificacoes_() {
  if (!FROTA_NOTIFICATION_BATCH_) return 0;
  const records = FROTA_NOTIFICATION_BATCH_.records;
  FROTA_NOTIFICATION_BATCH_ = null;
  frotaAcrescentarNotificacoesGlobais_(records);
  return records.length;
}

function frotaUsuariosComPermissao_(permissionCode) {
  if (FROTA_NOTIFICATION_BATCH_ && FROTA_NOTIFICATION_BATCH_.recipients[permissionCode]) {
    return FROTA_NOTIFICATION_BATCH_.recipients[permissionCode];
  }
  const catalog = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const permission = catalog.filter(function (item) { return item.CODIGO === permissionCode && normalizeBoolean_(item.ATIVA); })[0];
  if (!permission) return [];
  const allowedUserIds = {};
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES').forEach(function (assignment) {
    if (String(assignment.ID_PERMISSAO) === String(permission.ID_PERMISSAO) && normalizeBoolean_(assignment.PERMITIDO)) {
      allowedUserIds[assignment.ID_USUARIO] = true;
    }
  });
  const users = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS').filter(function (user) {
    return allowedUserIds[user.ID_USUARIO] && frotaUpper_(user.STATUS) === 'ATIVO';
  });
  if (FROTA_NOTIFICATION_BATCH_) FROTA_NOTIFICATION_BATCH_.recipients[permissionCode] = users;
  return users;
}

function frotaCriarNotificacao_(context, data) {
  try {
    const permission = data.permissao || 'FROTA_RECEBER_NOTIFICACOES';
    const users = frotaUsuariosComPermissao_(permission);
    if (!users.length) return { criadas: 0, motivo: 'Nenhum destinatário com a permissão ' + permission };
    const existingKeys = FROTA_NOTIFICATION_BATCH_ ? FROTA_NOTIFICATION_BATCH_.keys : {};
    if (!FROTA_NOTIFICATION_BATCH_) {
      repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES').forEach(function (item) { if (item.CHAVE_UNICA) existingKeys[item.CHAVE_UNICA] = true; });
    }
    const creator = context ? frotaUsuario_(context) : { masp: 'ROTINA_FROTA', nome: 'Rotina automática da Frota' };
    const baseKey = frotaTexto_(data.chave, 400) || frotaIdempotencyKey_([data.tipo, data.referenciaId, data.titulo]);
    const pending = [];
    users.forEach(function (user) {
      const key = baseKey + ':' + user.ID_USUARIO;
      if (existingKeys[key]) return;
      pending.push({
        ID: Utilities.getUuid(),
        ID_USUARIO: user.ID_USUARIO,
        TIPO: frotaUpper_(data.tipo || 'FROTA'),
        TITULO: frotaTexto_(data.titulo, 220),
        MENSAGEM: frotaTexto_(data.mensagem, 2000),
        GRAVIDADE: frotaUpper_(data.gravidade || 'MEDIA'),
        MODULO: 'FROTA',
        ID_REGISTRO: frotaTexto_(data.referenciaId, 160),
        DESTINATARIO: user.ID_USUARIO,
        PERMISSAO_DESTINATARIA: permission,
        LIDA: false,
        LIDA_EM: '',
        RESOLVIDA: false,
        DATA_RESOLUCAO: '',
        CRIADO_EM: new Date(),
        CRIADA_POR: creator.masp || creator.nome,
        CHAVE_UNICA: key
      });
      existingKeys[key] = true;
    });
    if (FROTA_NOTIFICATION_BATCH_) FROTA_NOTIFICATION_BATCH_.records = FROTA_NOTIFICATION_BATCH_.records.concat(pending);
    else frotaAcrescentarNotificacoesGlobais_(pending);
    return { criadas: pending.length };
  } catch (error) {
    console.error('Falha ao criar notificação da Frota: ' + error.message);
    return { criadas: 0, erro: error.message };
  }
}

function frotaAcrescentarNotificacoesGlobais_(records) {
  if (!records || !records.length) return [];
  return repositoryAppendMany_(APP_CONFIG.DATABASES.CONFIG, 'NOTIFICACOES', records);
}

function frotaNotificarOcorrencia_(context, vehicle, occurrence, referenceId) {
  const type = frotaUpper_(occurrence.tipo || 'DEFEITO');
  const gravity = frotaUpper_(occurrence.gravidade || 'MEDIA');
  return frotaCriarNotificacao_(context, {
    tipo: type,
    titulo: vehicle.PREFIXO + ' — ' + type.replace(/_/g, ' '),
    mensagem: frotaTexto_(occurrence.descricao || occurrence.observacao || 'Nova ocorrência registrada na viatura.', 1800),
    gravidade: gravity,
    referenciaId: referenceId,
    chave: frotaIdempotencyKey_(['OCORRENCIA', referenceId]),
    permissao: 'FROTA_RECEBER_NOTIFICACOES'
  });
}
