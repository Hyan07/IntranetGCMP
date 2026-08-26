/** Login, recuperação e alteração de senha. */

function login_(payload) {
  requireFields_(payload, ['masp', 'password']);
  const masp = validateMasp_(payload.masp);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_);
  const publicContext = { masp: masp };
  if (!user) {
    audit_(publicContext, 'autenticacao', 'FALHA_LOGIN', '', null, null, 'NEGADO', '', 'Usuário não localizado');
    throw appError_('INVALID_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }
  const status = normalizeUpper_(user.STATUS);
  if (status !== APP_CONFIG.STATUS.ACTIVE) {
    audit_({ user: user }, 'autenticacao', 'FALHA_LOGIN', user.ID_USUARIO, null, null, 'NEGADO', '', 'Status: ' + status);
    throw appError_('USER_INACTIVE', 'Este acesso não está ativo. Procure o administrador.');
  }
  const blockedUntil = toDate_(user.BLOQUEADO_ATE, true);
  if (blockedUntil && blockedUntil.getTime() > now_().getTime()) {
    throw appError_('TEMPORARILY_BLOCKED', 'Acesso temporariamente bloqueado. Tente novamente após ' + formatDateTime_(blockedUntil) + '.');
  }
  if (!verifyPassword_(payload.password, user)) {
    registerFailedLogin_(user);
    audit_({ user: user }, 'autenticacao', 'FALHA_LOGIN', user.ID_USUARIO, null, null, 'NEGADO', '', 'Senha inválida');
    throw appError_('INVALID_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }
  const permissions = getUserPermissionCodes_(user.ID_USUARIO);
  if (!permissions.length) {
    audit_({ user: user }, 'autenticacao', 'FALHA_LOGIN', user.ID_USUARIO, null, null, 'NEGADO', '', 'Sem permissões');
    throw appError_('NO_PERMISSIONS', 'Seu usuário ainda não possui permissões de acesso.');
  }
  const updatedUser = repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, {
    TENTATIVAS: 0,
    BLOQUEADO_ATE: '',
    ULTIMO_ACESSO: now_(),
    ATUALIZADO_EM: now_()
  });
  const session = createSession_(updatedUser);
  const context = { user: updatedUser, session: session, permissions: permissions };
  audit_(context, 'autenticacao', 'LOGIN', user.ID_USUARIO, null, null, 'SUCESSO');
  return {
    token: session.TOKEN,
    expiresAt: session.EXPIRA_EM,
    mustChangePassword: normalizeBoolean_(updatedUser.TROCAR_SENHA),
    user: omitSensitiveUser_(updatedUser),
    permissions: permissions
  };
}

function registerFailedLogin_(user, maxAttemptsOverride, lockMinutesOverride) {
  const attempts = Number(user.TENTATIVAS || 0) + 1;
  const maxAttempts = Number(maxAttemptsOverride) > 0 ? Number(maxAttemptsOverride) : getRuntimeNumber_('MAX_TENTATIVAS_LOGIN', APP_CONFIG.DEFAULT_MAX_LOGIN_ATTEMPTS);
  const lockMinutes = Number(lockMinutesOverride) > 0 ? Number(lockMinutesOverride) : getRuntimeNumber_('BLOQUEIO_MINUTOS', APP_CONFIG.DEFAULT_LOCK_MINUTES);
  repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, {
    TENTATIVAS: attempts >= maxAttempts ? 0 : attempts,
    BLOQUEADO_ATE: attempts >= maxAttempts ? addMinutes_(now_(), lockMinutes) : '',
    ATUALIZADO_EM: now_()
  });
}

function requestPasswordRecovery_(payload) {
  requireFields_(payload, ['masp', 'email']);
  const masp = normalizeMasp_(payload.masp);
  const email = normalizeText_(payload.email).toLowerCase();
  const generic = { message: 'Caso os dados estejam corretos, as instruções serão enviadas ao e-mail cadastrado.' };
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_);
  if (!user || normalizeText_(user.EMAIL).toLowerCase() !== email || normalizeUpper_(user.STATUS) !== APP_CONFIG.STATUS.ACTIVE) {
    audit_({ masp: masp }, 'autenticacao', 'RECUPERACAO_SOLICITADA', '', null, null, 'IGNORADO', '', 'Dados não coincidem');
    return generic;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const created = now_();
  const expires = addMinutes_(created, getRuntimeNumber_('RECUPERACAO_MINUTOS', APP_CONFIG.DEFAULT_RECOVERY_MINUTES));
  repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'RECUPERACAO_SENHA', {
    ID: uuid_(),
    ID_USUARIO: user.ID_USUARIO,
    CODIGO_HASH: hashRecoveryCode_(code, user.ID_USUARIO),
    CRIADO_EM: created,
    EXPIRA_EM: expires,
    UTILIZADO: false,
    UTILIZADO_EM: ''
  });
  try {
    sendRecoveryEmail_(user, code, expires);
    audit_({ user: user }, 'autenticacao', 'RECUPERACAO_SOLICITADA', user.ID_USUARIO, null, null, 'SUCESSO');
  } catch (error) {
    audit_({ user: user }, 'autenticacao', 'RECUPERACAO_SOLICITADA', user.ID_USUARIO, null, null, 'ERRO', '', error.message);
    console.error(error);
  }
  return generic;
}

function confirmPasswordRecovery_(payload) {
  requireFields_(payload, ['masp', 'email', 'code', 'newPassword']);
  const masp = validateMasp_(payload.masp);
  const email = validateEmail_(payload.email, true);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_);
  if (!user || normalizeText_(user.EMAIL).toLowerCase() !== email) throw appError_('INVALID_RECOVERY', 'Código inválido ou expirado.');
  const candidates = sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.CONFIG, 'RECUPERACAO_SENHA', function (row) {
    return String(row.ID_USUARIO) === String(user.ID_USUARIO) && !normalizeBoolean_(row.UTILIZADO);
  }), 'CRIADO_EM');
  const expectedHash = hashRecoveryCode_(normalizeText_(payload.code), user.ID_USUARIO);
  const record = candidates.find(function (item) {
    const expiry = toDate_(item.EXPIRA_EM, true);
    return expiry && expiry.getTime() > now_().getTime() && safeEqual_(item.CODIGO_HASH, expectedHash);
  });
  if (!record) {
    audit_({ user: user }, 'autenticacao', 'RECUPERACAO_FALHOU', user.ID_USUARIO, null, null, 'NEGADO');
    throw appError_('INVALID_RECOVERY', 'Código inválido ou expirado.');
  }
  const passwordRecord = makePasswordRecord_(payload.newPassword);
  return withScriptLock_(function () {
    repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, Object.assign(passwordRecord, {
      TROCAR_SENHA: false,
      TENTATIVAS: 0,
      BLOQUEADO_ATE: '',
      ATUALIZADO_EM: now_()
    }));
    repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'RECUPERACAO_SENHA', record._row, { UTILIZADO: true, UTILIZADO_EM: now_() });
    closeAllUserSessions_(user.ID_USUARIO, 'SENHA_REDEFINIDA');
    audit_({ user: user }, 'autenticacao', 'SENHA_REDEFINIDA', user.ID_USUARIO, null, null, 'SUCESSO');
    return { message: 'Senha redefinida. Você já pode entrar.' };
  });
}

function changeOwnPassword_(context, payload) {
  requireFields_(payload, ['currentPassword', 'newPassword']);
  if (!verifyPassword_(payload.currentPassword, context.user)) throw appError_('INVALID_CURRENT_PASSWORD', 'A senha atual está incorreta.');
  if (safeEqual_(hashPassword_(payload.newPassword, context.user.SENHA_SALT), context.user.SENHA_HASH)) {
    throw appError_('SAME_PASSWORD', 'A nova senha deve ser diferente da senha atual.');
  }
  const record = makePasswordRecord_(payload.newPassword);
  repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', context.user._row, Object.assign(record, {
    TROCAR_SENHA: false,
    ATUALIZADO_EM: now_()
  }));
  audit_(context, 'perfil', 'ALTERAR_SENHA', context.user.ID_USUARIO, null, null, 'SUCESSO');
  return { changed: true };
}

function closeAllUserSessions_(userId, reason) {
  repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'SESSOES').forEach(function (session) {
    if (String(session.ID_USUARIO) === String(userId) && normalizeBoolean_(session.ATIVA)) closeSessionRow_(session, reason);
  });
}
