/** Sessões persistentes, expiração e inatividade. */

function createSession_(user) {
  const created = now_();
  const hours = getRuntimeNumber_('SESSAO_HORAS', APP_CONFIG.DEFAULT_SESSION_HOURS);
  const session = {
    TOKEN: randomToken_(32),
    ID_USUARIO: user.ID_USUARIO,
    MASP: user.MASP,
    CRIADO_EM: created,
    EXPIRA_EM: addHours_(created, hours),
    ULTIMA_ATIVIDADE: created,
    ATIVA: true,
    ENCERRADA_EM: '',
    MOTIVO: ''
  };
  repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', session);
  return session;
}

function requireSession_(token) {
  const normalized = normalizeText_(token);
  if (!normalized) throw appError_('UNAUTHENTICATED', 'Sua sessão não foi encontrada. Entre novamente.');
  const session = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', 'TOKEN', normalized);
  if (!session || !normalizeBoolean_(session.ATIVA)) throw appError_('SESSION_INVALID', 'Sua sessão foi encerrada. Entre novamente.');
  const now = now_();
  const expires = toDate_(session.EXPIRA_EM, true);
  const lastActivity = toDate_(session.ULTIMA_ATIVIDADE, true);
  const idleMinutes = getRuntimeNumber_('SESSAO_INATIVIDADE_MINUTOS', APP_CONFIG.DEFAULT_IDLE_MINUTES);
  if (!expires || expires.getTime() <= now.getTime()) {
    closeSessionRow_(session, 'EXPIRADA');
    throw appError_('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  }
  if (lastActivity && addMinutes_(lastActivity, idleMinutes).getTime() <= now.getTime()) {
    closeSessionRow_(session, 'INATIVIDADE');
    throw appError_('SESSION_IDLE', 'Sua sessão foi encerrada por inatividade. Entre novamente.');
  }
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', session.ID_USUARIO);
  if (!user || normalizeUpper_(user.STATUS) !== APP_CONFIG.STATUS.ACTIVE) {
    closeSessionRow_(session, 'USUARIO_INATIVO');
    throw appError_('USER_INACTIVE', 'Seu acesso não está ativo.');
  }
  // Pesquisas digitadas rapidamente geram várias chamadas em sequência. A
  // sessão continua validada em todas elas, mas a planilha só precisa receber
  // a marca de atividade periodicamente, preservando corretamente a expiração
  // por inatividade sem transformar cada filtro em uma operação de escrita.
  const activityWriteInterval = Math.min(5 * 60000, Math.max(30000, idleMinutes * 60000 / 4));
  if (!lastActivity || now.getTime() - lastActivity.getTime() >= activityWriteInterval) {
    repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', session._row, { ULTIMA_ATIVIDADE: now });
    session.ULTIMA_ATIVIDADE = now;
  }
  const permissions = getUserPermissionCodes_(user.ID_USUARIO);
  return { session: session, user: user, permissions: permissions };
}

function closeSessionRow_(session, reason) {
  if (!session || !session._row) return;
  repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES', session._row, {
    ATIVA: false,
    ENCERRADA_EM: now_(),
    MOTIVO: reason || 'ENCERRADA'
  });
}

function logout_(context) {
  closeSessionRow_(context.session, 'LOGOUT');
  audit_(context, 'autenticacao', 'LOGOUT', context.user.ID_USUARIO, null, null, 'SUCESSO');
  return { loggedOut: true };
}

function listOwnSessions_(context) {
  return sortByDateDesc_(repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES')
    .filter(function (item) { return String(item.ID_USUARIO) === String(context.user.ID_USUARIO); })
    .map(function (item) {
      return {
        tokenSuffix: String(item.TOKEN || '').slice(-8),
        createdAt: item.CRIADO_EM,
        expiresAt: item.EXPIRA_EM,
        lastActivity: item.ULTIMA_ATIVIDADE,
        active: normalizeBoolean_(item.ATIVA),
        current: item.TOKEN === context.session.TOKEN,
        reason: item.MOTIVO || ''
      };
    }), 'createdAt').slice(0, 20);
}

function closeOtherSessions_(context) {
  let closed = 0;
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES').forEach(function (item) {
    if (String(item.ID_USUARIO) === String(context.user.ID_USUARIO) && item.TOKEN !== context.session.TOKEN && normalizeBoolean_(item.ATIVA)) {
      closeSessionRow_(item, 'ENCERRADA_PELO_USUARIO');
      closed += 1;
    }
  });
  audit_(context, 'perfil', 'ENCERRAR_OUTRAS_SESSOES', context.user.ID_USUARIO, null, { quantidade: closed }, 'SUCESSO');
  return { closed: closed };
}

function cleanupExpiredSessions_() {
  const current = now_();
  let count = 0;
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES').forEach(function (session) {
    if (normalizeBoolean_(session.ATIVA) && toDate_(session.EXPIRA_EM, true) && toDate_(session.EXPIRA_EM).getTime() <= current.getTime()) {
      closeSessionRow_(session, 'EXPIRADA');
      count += 1;
    }
  });
  return count;
}
