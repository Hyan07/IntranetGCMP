/** Registro imutável de auditoria. */

function audit_(context, module, action, recordId, before, after, result, justification, technicalNote) {
  try {
    const user = context && context.user ? context.user : {};
    const session = context && context.session ? context.session : {};
    return repositoryAppend_(APP_CONFIG.DATABASES.CONFIG, 'AUDITORIA', {
      ID: uuid_(),
      DATA_HORA: now_(),
      ID_USUARIO: user.ID_USUARIO || '',
      MASP: user.MASP || (context && context.masp) || '',
      MODULO: module || '',
      ACAO: action || '',
      ID_REGISTRO: recordId || '',
      VALOR_ANTERIOR: before === undefined || before === null ? '' : JSON.stringify(sanitizeForClient_(before)).slice(0, 45000),
      VALOR_NOVO: after === undefined || after === null ? '' : JSON.stringify(sanitizeForClient_(after)).slice(0, 45000),
      TOKEN_SESSAO: session.TOKEN || '',
      RESULTADO: result || 'SUCESSO',
      JUSTIFICATIVA: justification || '',
      OBSERVACAO_TECNICA: technicalNote || ''
    });
  } catch (error) {
    console.error('Falha ao registrar auditoria: ' + error.message);
    return null;
  }
}

function listAudit_(context, payload) {
  requirePermission_(context, 'auditoria.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'AUDITORIA');
  rows = searchRows_(rows, options.query, ['MASP', 'MODULO', 'ACAO', 'ID_REGISTRO', 'RESULTADO', 'JUSTIFICATIVA']);
  if (options.module) rows = rows.filter(function (row) { return row.MODULO === options.module; });
  if (options.action) rows = rows.filter(function (row) { return row.ACAO === options.action; });
  if (options.startDate) rows = rows.filter(function (row) { return new Date(row.DATA_HORA) >= toDate_(options.startDate); });
  if (options.endDate) rows = rows.filter(function (row) { return new Date(row.DATA_HORA) <= addHours_(toDate_(options.endDate), 24); });
  return paginate_(sortByDateDesc_(rows, 'DATA_HORA'), options);
}
