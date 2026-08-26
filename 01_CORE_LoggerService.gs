/** Logger centralizado. Persistencia em auditoria e opcional para evitar duplicidade. */

function loggerUserInfo_(context) {
  const user = context && context.user ? context.user : context || {};
  return {
    id: user.ID_USUARIO || user.id || '',
    masp: user.MASP || user.masp || '',
    name: user.NOME || user.nome || user.name || ''
  };
}

function loggerStringify_(value) {
  try {
    return JSON.stringify(value || {});
  } catch (error) {
    return String(value || '');
  }
}

function logError_(context, source, error, metadata) {
  const user = loggerUserInfo_(context);
  const entry = {
    level: 'ERROR',
    source: normalizeText_(source || 'SISTEMA'),
    userId: user.id,
    masp: user.masp,
    userName: user.name,
    message: error && error.message ? error.message : String(error || ''),
    code: error && error.code ? error.code : '',
    stack: error && error.stack ? String(error.stack) : '',
    metadata: metadata || {},
    timestamp: nowIso_()
  };

  console.error(entry.stack || entry.message || loggerStringify_(entry));

  if (metadata && metadata.persist === false) return entry;
  try {
    if (getProperty_(APP_CONFIG.PROPERTY_KEYS.INSTALLED, false) !== 'true') return entry;
    repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'AUDITORIA', {
      ID: uuid_(),
      DATA_HORA: now_(),
      ID_USUARIO: entry.userId,
      MASP: entry.masp,
      MODULO: 'SISTEMA',
      ACAO: 'ERRO',
      ID_REGISTRO: entry.source,
      VALOR_ANTERIOR: '',
      VALOR_NOVO: '',
      TOKEN_SESSAO: context && context.session ? context.session.TOKEN : '',
      RESULTADO: 'ERRO',
      JUSTIFICATIVA: entry.message,
      OBSERVACAO_TECNICA: loggerStringify_(entry).slice(0, 45000)
    });
  } catch (loggingError) {
    console.error(loggingError && loggingError.stack ? loggingError.stack : loggingError);
  }
  return entry;
}

function logInfo_(context, source, message, metadata) {
  const user = loggerUserInfo_(context);
  const entry = {
    level: 'INFO',
    source: normalizeText_(source || 'SISTEMA'),
    userId: user.id,
    masp: user.masp,
    userName: user.name,
    message: normalizeText_(message),
    metadata: metadata || {},
    timestamp: nowIso_()
  };
  console.log(loggerStringify_(entry));
  return entry;
}
