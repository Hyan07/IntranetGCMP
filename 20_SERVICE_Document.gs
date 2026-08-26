/** Documentos institucionais, vínculos, versionamento e acesso ao Drive. */

function canAccessDocument_(context, document) {
  if (!hasPermission_(context, 'documentos.visualizar')) return false;
  if (String(document.CRIADO_POR || '') === String(context.user.ID_USUARIO)) return true;
  const level = normalizeUpper_(document.NIVEL_ACESSO || 'PUBLICO_INTERNO');
  if (level === 'PUBLICO_INTERNO') return true;
  if (hasPermission_(context, 'documentos.visualizar_restritos')) return true;
  if (level === 'RESTRITO_SETOR') return normalizeUpper_(document.SETOR) === normalizeUpper_(context.user.SETOR);
  if (level === 'USUARIOS_SELECIONADOS') {
    return String(document.USUARIOS_AUTORIZADOS || '').split(',').map(normalizeText_).indexOf(context.user.ID_USUARIO) >= 0;
  }
  return false;
}

function cleanDocument_(document) {
  const copy = Object.assign({}, document);
  delete copy._row;
  return copy;
}

function listDocuments_(context, payload) {
  requirePermission_(context, 'documentos.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS').filter(function (d) { return canAccessDocument_(context, d); });
  rows = searchRows_(rows, options.query, ['NUMERO', 'TIPO', 'ASSUNTO', 'DESCRICAO', 'ORIGEM', 'DESTINO', 'SETOR', 'RESPONSAVEL', 'SITUACAO']);
  if (options.type) rows = rows.filter(function (d) { return d.TIPO === options.type; });
  if (options.status) rows = rows.filter(function (d) { return d.SITUACAO === normalizeUpper_(options.status); });
  if (options.level) rows = rows.filter(function (d) { return d.NIVEL_ACESSO === normalizeUpper_(options.level); });
  const page = paginate_(sortByDateDesc_(rows, 'DATA_DOCUMENTO'), options);
  page.items = page.items.map(cleanDocument_);
  return page;
}

function getDocument_(context, payload) {
  requirePermission_(context, 'documentos.visualizar');
  requireFields_(payload, ['id']);
  const document = repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', 'ID_DOCUMENTO', payload.id);
  if (!document || !canAccessDocument_(context, document)) throw appError_('DOCUMENT_NOT_FOUND', 'Documento não encontrado ou sem acesso.');
  const files = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_ARQUIVOS')
    .filter(function (f) { return String(f.ID_DOCUMENTO) === String(document.ID_DOCUMENTO) && f.STATUS !== 'EXCLUIDO'; })
    .map(function (f) { delete f._row; delete f.ARQUIVO_URL; return f; });
  const links = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VINCULOS').filter(function (v) { return String(v.ID_DOCUMENTO) === String(document.ID_DOCUMENTO); });
  const versions = hasPermission_(context, 'documentos.editar')
    ? sortByDateDesc_(repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VERSOES').filter(function (v) { return String(v.ID_DOCUMENTO) === String(document.ID_DOCUMENTO); }), 'CRIADO_EM')
    : [];
  audit_(context, 'documentos', document.NIVEL_ACESSO === 'PUBLICO_INTERNO' ? 'VISUALIZAR' : 'CONSULTAR_RESTRITO', document.ID_DOCUMENTO, null, null, 'SUCESSO');
  return { document: cleanDocument_(document), files: files, links: links, versions: versions };
}

function getDocumentCategoryFolder_(type) {
  const root = getRootFolder_();
  const general = getOrCreateChildFolder_(root, 'DOCUMENTOS_GERAIS');
  const mapping = {
    'ORDEM DE SERVICO': 'ORDENS_DE_SERVICO', OFICIO: 'OFICIOS', MEMORANDO: 'MEMORANDOS',
    PORTARIA: 'PORTARIAS', RELATORIO: 'RELATORIOS'
  };
  return getOrCreateChildFolder_(general, mapping[normalizeUpper_(type)] || 'OUTROS');
}

function saveDocument_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_DOCUMENTO);
  requirePermission_(context, isEdit ? 'documentos.editar' : 'documentos.criar');
  requireFields_(payload, ['TIPO', 'ASSUNTO', 'DATA_DOCUMENTO', 'NIVEL_ACESSO', 'SITUACAO']);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', 'ID_DOCUMENTO', payload.ID_DOCUMENTO) : null;
  if (isEdit && (!current || !canAccessDocument_(context, current))) throw appError_('DOCUMENT_NOT_FOUND', 'Documento não encontrado ou sem acesso.');
  const level = validateStatus_(payload.NIVEL_ACESSO, ['PUBLICO_INTERNO', 'RESTRITO_SETOR', 'USUARIOS_SELECIONADOS', 'CONFIDENCIAL', 'SIGILOSO_ADMINISTRATIVO'], 'Nível de acesso');
  if (['CONFIDENCIAL', 'SIGILOSO_ADMINISTRATIVO'].indexOf(level) >= 0 && !hasPermission_(context, 'documentos.gerenciar_sigilo')) {
    throw appError_('FORBIDDEN', 'Você não possui permissão para classificar documentos confidenciais ou sigilosos.');
  }
  const timestamp = now_();
  const record = {
    ID_DOCUMENTO: isEdit ? current.ID_DOCUMENTO : uuid_(), NUMERO: normalizeText_(payload.NUMERO), TIPO: normalizeText_(payload.TIPO),
    ASSUNTO: normalizeText_(payload.ASSUNTO), DESCRICAO: normalizeText_(payload.DESCRICAO), DATA_DOCUMENTO: toDate_(payload.DATA_DOCUMENTO),
    ORIGEM: normalizeText_(payload.ORIGEM), DESTINO: normalizeText_(payload.DESTINO), SETOR: normalizeText_(payload.SETOR || context.user.SETOR),
    RESPONSAVEL: normalizeText_(payload.RESPONSAVEL || context.user.NOME), ID_PESSOA: normalizeText_(payload.ID_PESSOA),
    ID_VIATURA: normalizeText_(payload.ID_VIATURA), ID_PATRIMONIO: normalizeText_(payload.ID_PATRIMONIO), ID_RECOMPENSA: normalizeText_(payload.ID_RECOMPENSA),
    DOCUMENTO_RELACIONADO_ID: normalizeText_(payload.DOCUMENTO_RELACIONADO_ID), NIVEL_ACESSO: level,
    USUARIOS_AUTORIZADOS: Array.isArray(payload.USUARIOS_AUTORIZADOS) ? payload.USUARIOS_AUTORIZADOS.join(',') : normalizeText_(payload.USUARIOS_AUTORIZADOS),
    SITUACAO: validateStatus_(payload.SITUACAO, ['ATIVO', 'ARQUIVADO', 'EM_TRAMITACAO', 'VENCIDO', 'CANCELADO']),
    PRAZO: payload.PRAZO ? toDate_(payload.PRAZO) : '', VENCIMENTO: payload.VENCIMENTO ? toDate_(payload.VENCIMENTO) : '',
    OBSERVACOES: normalizeText_(payload.OBSERVACOES), ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
  };
  if (isEdit) {
    record.PASTA_DRIVE_ID = current.PASTA_DRIVE_ID; record.CRIADO_EM = current.CRIADO_EM; record.CRIADO_POR = current.CRIADO_POR;
  } else {
    const parent = getDocumentCategoryFolder_(record.TIPO);
    const folder = getOrCreateChildFolder_(parent, (record.NUMERO || record.ID_DOCUMENTO.slice(0, 8)) + '_' + record.ASSUNTO);
    record.PASTA_DRIVE_ID = folder.getId(); record.CRIADO_EM = timestamp; record.CRIADO_POR = context.user.ID_USUARIO;
  }
  const saved = isEdit
    ? repositoryUpdate_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', current._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', record);
  if (isEdit) {
    repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VERSOES', {
      ID_VERSAO: uuid_(), ID_DOCUMENTO: saved.ID_DOCUMENTO, NUMERO_VERSAO: nextDocumentVersion_(saved.ID_DOCUMENTO),
      DADOS_JSON: JSON.stringify(sanitizeForClient_(saved)), ID_ARQUIVO: '', MOTIVO: normalizeText_(payload.MOTIVO_ALTERACAO || 'Atualização de metadados'),
      CRIADO_EM: timestamp, CRIADO_POR: context.user.ID_USUARIO
    });
  }
  saveDocumentLinks_(saved.ID_DOCUMENTO, record);
  audit_(context, 'documentos', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_DOCUMENTO, current, saved, 'SUCESSO');
  return cleanDocument_(saved);
}

function saveDocumentLinks_(documentId, record) {
  const links = [
    ['PESSOA', record.ID_PESSOA], ['VIATURA', record.ID_VIATURA], ['PATRIMONIO', record.ID_PATRIMONIO],
    ['RECOMPENSA', record.ID_RECOMPENSA], ['DOCUMENTO', record.DOCUMENTO_RELACIONADO_ID]
  ];
  const existing = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VINCULOS').filter(function (v) { return String(v.ID_DOCUMENTO) === String(documentId); });
  links.forEach(function (link) {
    if (!link[1]) return;
    if (!existing.some(function (v) { return v.TIPO_ENTIDADE === link[0] && String(v.ID_ENTIDADE) === String(link[1]); })) {
      repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VINCULOS', { ID: uuid_(), ID_DOCUMENTO: documentId, TIPO_ENTIDADE: link[0], ID_ENTIDADE: link[1], CRIADO_EM: now_() });
    }
  });
}

function nextDocumentVersion_(documentId) {
  const versions = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VERSOES').filter(function (v) { return String(v.ID_DOCUMENTO) === String(documentId); });
  return versions.reduce(function (max, item) { return Math.max(max, Number(item.NUMERO_VERSAO || 0)); }, 0) + 1;
}

function uploadDocumentFile_(context, payload) {
  requirePermission_(context, 'documentos.criar');
  requireFields_(payload, ['ID_DOCUMENTO', 'file']);
  const document = repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', 'ID_DOCUMENTO', payload.ID_DOCUMENTO);
  if (!document || !canAccessDocument_(context, document)) throw appError_('DOCUMENT_NOT_FOUND', 'Documento não encontrado ou sem acesso.');
  const uploaded = uploadFileToFolder_(document.PASTA_DRIVE_ID, payload.file);
  const existing = repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_ARQUIVOS').filter(function (f) { return String(f.ID_DOCUMENTO) === String(document.ID_DOCUMENTO) && f.STATUS !== 'EXCLUIDO'; });
  const fileRecord = {
    ID: uuid_(), ID_DOCUMENTO: document.ID_DOCUMENTO, ID_ARQUIVO_DRIVE: uploaded.id, NOME_ARQUIVO: uploaded.name,
    MIME_TYPE: uploaded.mimeType, TAMANHO: uploaded.size, CATEGORIA: normalizeText_(payload.category || 'PRINCIPAL'),
    VERSAO: existing.length + 1, PRINCIPAL: payload.principal === undefined ? existing.length === 0 : normalizeBoolean_(payload.principal),
    STATUS: 'ATIVO', ENVIADO_EM: now_(), ENVIADO_POR: context.user.ID_USUARIO, ARQUIVO_URL: uploaded.url
  };
  repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_ARQUIVOS', fileRecord);
  repositoryAppend_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_VERSOES', {
    ID_VERSAO: uuid_(), ID_DOCUMENTO: document.ID_DOCUMENTO, NUMERO_VERSAO: nextDocumentVersion_(document.ID_DOCUMENTO),
    DADOS_JSON: '', ID_ARQUIVO: uploaded.id, MOTIVO: normalizeText_(payload.reason || 'Envio de arquivo'),
    CRIADO_EM: now_(), CRIADO_POR: context.user.ID_USUARIO
  });
  audit_(context, 'documentos', 'UPLOAD', document.ID_DOCUMENTO, null, { fileId: uploaded.id, name: uploaded.name }, 'SUCESSO');
  delete fileRecord.ARQUIVO_URL;
  return fileRecord;
}

function openDocumentFile_(context, payload) {
  requirePermission_(context, payload && payload.download ? 'documentos.baixar' : 'documentos.visualizar');
  requireFields_(payload, ['fileId']);
  const fileRecord = repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS_ARQUIVOS', 'ID_ARQUIVO_DRIVE', payload.fileId);
  if (!fileRecord || fileRecord.STATUS === 'EXCLUIDO') throw appError_('FILE_NOT_FOUND', 'Arquivo não encontrado.');
  const document = repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', 'ID_DOCUMENTO', fileRecord.ID_DOCUMENTO);
  if (!document || !canAccessDocument_(context, document)) throw appError_('FORBIDDEN', 'Você não possui acesso a este arquivo.');
  const info = getAuthorizedFileUrl_(context, payload.fileId, payload.download ? 'documentos.baixar' : 'documentos.visualizar');
  audit_(context, 'documentos', payload.download ? 'DOWNLOAD' : 'VISUALIZAR_ARQUIVO', document.ID_DOCUMENTO, null, { fileId: payload.fileId }, 'SUCESSO');
  return info;
}

function changeDocumentStatus_(context, payload) {
  requirePermission_(context, payload && payload.status === 'INATIVO' ? 'documentos.excluir' : 'documentos.editar');
  requireFields_(payload, ['id', 'status']);
  const document = repositoryFindOne_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', 'ID_DOCUMENTO', payload.id);
  if (!document || !canAccessDocument_(context, document)) throw appError_('DOCUMENT_NOT_FOUND', 'Documento não encontrado ou sem acesso.');
  const status = validateStatus_(payload.status, ['ATIVO', 'ARQUIVADO', 'EM_TRAMITACAO', 'VENCIDO', 'CANCELADO', 'INATIVO']);
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS', document._row, { SITUACAO: status, ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  audit_(context, 'documentos', 'ALTERAR_STATUS', document.ID_DOCUMENTO, { SITUACAO: document.SITUACAO }, { SITUACAO: status }, 'SUCESSO', payload.justification || '');
  return cleanDocument_(saved);
}
