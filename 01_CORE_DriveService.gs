/** Pastas institucionais e uploads centralizados. */

function getRootFolder_() {
  const id = getProperty_(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID, true);
  try {
    return DriveApp.getFolderById(id);
  } catch (error) {
    throw appError_('DRIVE_UNAVAILABLE', 'A pasta institucional não está acessível.');
  }
}

function getOrCreateChildFolder_(parent, name) {
  const safeName = normalizeText_(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'SEM_NOME';
  const iterator = parent.getFoldersByName(safeName);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(safeName);
}

function ensureEntityFolder_(type, entityKey) {
  const root = getRootFolder_();
  const mapping = {
    PESSOA: { parent: 'PESSOAL', children: ['DOCUMENTOS_PESSOAIS', 'DOCUMENTOS_FUNCIONAIS', 'CERTIFICADOS', 'OUTROS'] },
    PATRIMONIO: { parent: 'PATRIMONIO', children: ['DOCUMENTOS', 'FOTOGRAFIAS', 'MANUTENCOES', 'OUTROS'] },
    VIATURA: { parent: 'VIATURAS', children: ['Documentos', 'Licenciamento', 'Seguro', 'Manutencoes', 'Abastecimentos', 'Notas Fiscais', 'Fotografias', 'Sinistros', 'Multas', 'Vistorias', 'Outros'] },
    RECOMPENSA: { parent: 'RECOMPENSAS', children: ['DOCUMENTOS', 'PARECERES', 'OUTROS'] }
  };
  const definition = mapping[normalizeUpper_(type)];
  if (!definition) throw appError_('INVALID_FOLDER_TYPE', 'Tipo de pasta não reconhecido.');
  const parent = getOrCreateChildFolder_(root, definition.parent);
  const entity = getOrCreateChildFolder_(parent, entityKey);
  definition.children.forEach(function (name) { getOrCreateChildFolder_(entity, name); });
  return entity;
}

function decodeDataUrl_(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw appError_('INVALID_FILE', 'Conteúdo de arquivo inválido.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > APP_CONFIG.MAX_UPLOAD_BYTES) throw appError_('FILE_TOO_LARGE', 'O arquivo excede o limite de 5 MB.');
  return { mimeType: match[1], bytes: bytes };
}

function uploadFileToFolder_(folderId, file) {
  requireFields_(file, ['name', 'dataUrl']);
  const decoded = decodeDataUrl_(file.dataUrl);
  const safeName = normalizeText_(file.name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
  const blob = Utilities.newBlob(decoded.bytes, decoded.mimeType, safeName);
  const folder = assertDevelopmentDriveItem_(DriveApp.getFolderById(folderId));
  const created = folder.createFile(blob);
  return { id: created.getId(), name: created.getName(), mimeType: created.getMimeType(), size: created.getSize(), url: created.getUrl() };
}

function getAuthorizedFileUrl_(context, fileId, permissionCode) {
  requirePermission_(context, permissionCode);
  try {
    const file = DriveApp.getFileById(fileId);
    return { id: file.getId(), name: file.getName(), url: file.getUrl(), mimeType: file.getMimeType() };
  } catch (error) {
    throw appError_('FILE_NOT_FOUND', 'Arquivo não localizado ou sem acesso.');
  }
}
