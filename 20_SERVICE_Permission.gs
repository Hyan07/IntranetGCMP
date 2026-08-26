/** Catálogo e validação granular de permissões. */

function activeCanonicalPermissions_(rows) {
  const legacyPatrimonio = {
    'patrimonio.visualizar': true,
    'patrimonio.cadastrar': true,
    'patrimonio.editar': true,
    'patrimonio.excluir': true,
    'patrimonio.realizar_cautela': true,
    'patrimonio.receber_devolucao': true,
    'patrimonio.consultar_historico': true
  };
  const seen = {};
  return (rows || []).filter(function (permission) {
    const code = String(permission.CODIGO || '');
    if (!normalizeBoolean_(permission.ATIVA) || legacyPatrimonio[code] || seen[code]) return false;
    seen[code] = true;
    return true;
  });
}

function listPermissionCatalog_(context) {
  requirePermission_(context, 'usuarios.gerenciar_permissoes');
  return activeCanonicalPermissions_(repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES'))
    .map(function (permission) { delete permission._row; return permission; });
}

function getUserPermissionCodes_(userId) {
  const cacheKey = 'permissions:' + String(userId || '');
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    // Cache de permissões é otimização; a planilha continua sendo a fonte oficial.
  }
  const catalog = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  const byId = {};
  catalog.forEach(function (permission) {
    if (normalizeBoolean_(permission.ATIVA)) byId[permission.ID_PERMISSAO] = permission.CODIGO;
  });
  const permissions = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES')
    .filter(function (item) { return String(item.ID_USUARIO) === String(userId) && normalizeBoolean_(item.PERMITIDO); })
    .map(function (item) { return byId[item.ID_PERMISSAO]; })
    .filter(Boolean)
    .sort();
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(permissions), 300);
  } catch (error) {
    // A próxima chamada recalcula sem impedir o acesso.
  }
  return permissions;
}

function hasPermission_(context, code) {
  if (!code) return true;
  return Boolean(context && context.permissions && context.permissions.indexOf(code) >= 0);
}

function requirePermission_(context, code) {
  if (!hasPermission_(context, code)) {
    audit_(context, code.split('.')[0], 'ACESSO_NEGADO', '', null, null, 'NEGADO', '', 'Permissão requerida: ' + code);
    throw appError_('FORBIDDEN', 'Você não possui permissão para realizar esta ação.', { permission: code });
  }
  return true;
}

function setUserPermissions_(context, payload) {
  requirePermission_(context, 'usuarios.gerenciar_permissoes');
  requireFields_(payload, ['userId']);
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', payload.userId);
  if (!user) throw appError_('USER_NOT_FOUND', 'Usuário não encontrado.');
  const requestedCodes = Array.isArray(payload.permissions) ? payload.permissions.map(normalizeText_) : [];
  const catalog = activeCanonicalPermissions_(repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES'));
  const knownCodes = catalog.map(function (item) { return item.CODIGO; });
  const unknown = requestedCodes.filter(function (code) { return knownCodes.indexOf(code) < 0; });
  if (unknown.length) throw appError_('INVALID_PERMISSION', 'Uma ou mais permissões são inválidas.', { permissions: unknown });
  const before = getUserPermissionCodes_(payload.userId);

  return withScriptLock_(function () {
    const assignments = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
    const byPermission = {};
    assignments.filter(function (item) { return String(item.ID_USUARIO) === String(payload.userId); })
      .forEach(function (item) { byPermission[item.ID_PERMISSAO] = item; });
    catalog.forEach(function (permission) {
      const allowed = requestedCodes.indexOf(permission.CODIGO) >= 0;
      const existing = byPermission[permission.ID_PERMISSAO];
      const record = {
        ID: existing ? existing.ID : uuid_(),
        ID_USUARIO: payload.userId,
        ID_PERMISSAO: permission.ID_PERMISSAO,
        PERMITIDO: allowed,
        CONCEDIDO_POR: context.user.ID_USUARIO,
        CONCEDIDO_EM: now_()
      };
      if (existing) repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', existing._row, record);
      else repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', record);
    });
    CacheService.getScriptCache().remove('permissions:' + payload.userId);
    audit_(context, 'usuarios', 'ALTERAR_PERMISSOES', payload.userId, before, requestedCodes, 'SUCESSO', payload.justification || '');
    return { userId: payload.userId, permissions: requestedCodes.sort() };
  });
}

/** Dados necessários para a tela administrativa de concessão em massa. */
function getBulkPermissionData_(context) {
  requirePermission_(context, 'configuracoes.gerenciar');
  requirePermission_(context, 'usuarios.gerenciar_permissoes');
  const users = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS')
    .sort(function (a, b) { return String(a.NOME || '').localeCompare(String(b.NOME || ''), 'pt-BR'); })
    .map(function (user) {
      return {
        id: user.ID_USUARIO, name: user.NOME, masp: formatMasp_(user.MASP), email: user.EMAIL || '',
        sector: user.SETOR || '', functionName: user.FUNCAO || user.CARGO || '', status: user.STATUS
      };
    });
  const permissions = activeCanonicalPermissions_(repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES'))
    .sort(function (a, b) {
      return String(a.MODULO || '').localeCompare(String(b.MODULO || ''), 'pt-BR') || String(a.DESCRICAO || '').localeCompare(String(b.DESCRICAO || ''), 'pt-BR');
    })
    .map(function (permission) {
      return { code: permission.CODIGO, module: permission.MODULO, action: permission.ACAO, description: permission.DESCRICAO };
    });
  return { users: users, permissions: permissions };
}

/**
 * Concede as permissões selecionadas a vários usuários sem retirar acessos já existentes.
 * Registros anteriormente negados são reativados e novas combinações são inseridas em lote.
 */
function grantBulkPermissions_(context, payload) {
  requirePermission_(context, 'configuracoes.gerenciar');
  requirePermission_(context, 'usuarios.gerenciar_permissoes');
  const userIds = bulkPermissionUnique_(payload && payload.userIds);
  const requestedCodes = bulkPermissionUnique_(payload && payload.permissions);
  if (!userIds.length || !requestedCodes.length) throw appError_('BULK_PERMISSION_EMPTY', 'Selecione ao menos um usuário e uma permissão.');
  if (userIds.length > 500 || requestedCodes.length > 250) throw appError_('BULK_PERMISSION_LIMIT', 'A seleção ultrapassa o limite permitido para uma operação.');
  if (userIds.length * requestedCodes.length > 25000) throw appError_('BULK_PERMISSION_LIMIT', 'Selecione no máximo 25.000 combinações de usuário e permissão por operação.');

  const users = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS');
  const usersById = {};
  users.forEach(function (user) { usersById[String(user.ID_USUARIO)] = user; });
  const missingUsers = userIds.filter(function (id) { return !usersById[id]; });
  if (missingUsers.length) throw appError_('USER_NOT_FOUND', 'Um ou mais usuários selecionados não foram encontrados.', { quantidade: missingUsers.length });

  const catalog = activeCanonicalPermissions_(repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES'));
  const permissionByCode = {};
  catalog.forEach(function (permission) { permissionByCode[String(permission.CODIGO)] = permission; });
  const unknown = requestedCodes.filter(function (code) { return !permissionByCode[code]; });
  if (unknown.length) throw appError_('INVALID_PERMISSION', 'Uma ou mais permissões selecionadas são inválidas.', { permissions: unknown });

  return withScriptLock_(function () {
    const assignments = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES');
    const byKey = {};
    assignments.forEach(function (item) { byKey[String(item.ID_USUARIO) + '|' + String(item.ID_PERMISSAO)] = item; });
    const timestamp = now_();
    const pending = [];
    const detailsByUser = {};
    let reactivated = 0;
    let alreadyGranted = 0;

    userIds.forEach(function (userId) {
      detailsByUser[userId] = { userId: userId, name: usersById[userId].NOME || '', masp: formatMasp_(usersById[userId].MASP), created: 0, reactivated: 0, alreadyGranted: 0 };
      requestedCodes.forEach(function (code) {
        const permission = permissionByCode[code];
        const existing = byKey[userId + '|' + permission.ID_PERMISSAO];
        if (existing && normalizeBoolean_(existing.PERMITIDO)) {
          alreadyGranted += 1;
          detailsByUser[userId].alreadyGranted += 1;
          return;
        }
        const record = {
          ID: existing ? existing.ID : uuid_(), ID_USUARIO: userId, ID_PERMISSAO: permission.ID_PERMISSAO,
          PERMITIDO: true, CONCEDIDO_POR: context.user.ID_USUARIO, CONCEDIDO_EM: timestamp
        };
        if (existing) {
          repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', existing._row, record);
          reactivated += 1;
          detailsByUser[userId].reactivated += 1;
        } else {
          pending.push(record);
          detailsByUser[userId].created += 1;
        }
      });
    });

    if (pending.length) repositoryAppendMany_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', pending);
    userIds.forEach(function (userId) { CacheService.getScriptCache().remove('permissions:' + userId); });

    let verified = userIds.length * requestedCodes.length;
    if (typeof repositoryFlush_ === 'function') {
      repositoryFlush_();
      const permissionIdByCode = {};
      requestedCodes.forEach(function (code) { permissionIdByCode[code] = String(permissionByCode[code].ID_PERMISSAO); });
      const allowedKeys = {};
      repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES').forEach(function (item) {
        if (normalizeBoolean_(item.PERMITIDO)) allowedKeys[String(item.ID_USUARIO) + '|' + String(item.ID_PERMISSAO)] = true;
      });
      const missing = [];
      userIds.forEach(function (userId) { requestedCodes.forEach(function (code) {
        if (!allowedKeys[userId + '|' + permissionIdByCode[code]]) missing.push({ userId: userId, permission: code });
      }); });
      verified -= missing.length;
      if (missing.length) throw appError_('BULK_PERMISSION_VERIFY_FAILED', 'Algumas permissões não foram confirmadas após a gravação. Tente novamente.', { faltantes: missing.slice(0, 30), quantidade: missing.length });
    }

    const result = {
      usuariosAtualizados: userIds.length, permissoesSelecionadas: requestedCodes.length,
      concessoesCriadas: pending.length, concessoesReativadas: reactivated,
      jaConcedidas: alreadyGranted, totalCombinacoes: userIds.length * requestedCodes.length,
      concessoesVerificadas: verified, detalhesUsuarios: userIds.map(function (userId) { return detailsByUser[userId]; })
    };
    audit_(context, 'usuarios', 'CONCEDER_PERMISSOES_EM_MASSA', 'LOTE_' + uuid_(), null, {
      usuarios: userIds.length, permissoes: requestedCodes, resultado: result
    }, 'SUCESSO', normalizeText_(payload && payload.justification) || 'Concessão administrativa em massa');
    return result;
  });
}

function bulkPermissionUnique_(values) {
  const output = [];
  (Array.isArray(values) ? values : []).forEach(function (value) {
    const normalized = normalizeText_(value);
    if (normalized && output.indexOf(normalized) < 0) output.push(normalized);
  });
  return output;
}

function getVisibleModules_(permissions) {
  return MODULE_DEFINITIONS.filter(function (module) {
    return !module.permission || permissions.indexOf(module.permission) >= 0;
  });
}
