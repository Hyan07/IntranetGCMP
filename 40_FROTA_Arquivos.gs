/** Upload, catálogo e exclusão lógica dos arquivos das viaturas. */

function frotaArquivosListar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_ARQUIVOS');
  const options = payload || {};
  let rows = FrotaRepository_().readAll('ARQUIVOS_VIATURAS');
  if (!frotaBoolean_(options.includeInactive)) rows = rows.filter(function (row) { return frotaUpper_(row.ATIVO || 'SIM') !== 'NAO'; });
  if (options.vehicleId) rows = rows.filter(function (row) { return String(row.ID_VIATURA) === String(options.vehicleId); });
  if (options.category) rows = rows.filter(function (row) { return frotaUpper_(row.CATEGORIA) === frotaUpper_(options.category); });
  rows = frotaPesquisar_(rows, options.query, ['PREFIXO', 'PLACA', 'NOME_ARQUIVO', 'TIPO_ARQUIVO', 'CATEGORIA', 'DESCRICAO', 'ENVIADO_POR_NOME', 'ENVIADO_POR_MASP']);
  rows.sort(function (a, b) { return new Date(b.DATA_HORA_UPLOAD || 0).getTime() - new Date(a.DATA_HORA_UPLOAD || 0).getTime(); });
  return frotaPaginar_(rows, options);
}

function frotaArquivoUpload_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_ENVIAR_ARQUIVOS');
  const input = payload || {};
  frotaExigir_(input, ['vehicleId', 'category', 'file']);
  const vehicle = frotaObterViaturaObrigatoria_(input.vehicleId);
  const category = frotaValorPermitido_(input.category, FROTA_CONFIG.CATEGORIAS_ARQUIVOS, 'Categoria do arquivo');
  const file = input.file || {};
  frotaExigir_(file, ['name', 'dataUrl']);
  const safeName = frotaTexto_(file.name, 180).replace(/[\\/:*?"<>|]/g, '_');
  const extension = safeName.indexOf('.') >= 0 ? safeName.split('.').pop().toLowerCase() : '';
  if (FROTA_CONFIG.ALLOWED_FILE_EXTENSIONS.indexOf(extension) < 0) {
    throw appError_('FROTA_EXTENSAO_INVALIDA', 'Tipo de arquivo não permitido. Extensões aceitas: ' + FROTA_CONFIG.ALLOWED_FILE_EXTENSIONS.join(', ') + '.');
  }
  const match = String(file.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw appError_('FROTA_ARQUIVO_INVALIDO', 'O conteúdo do arquivo é inválido.');
  const mimeType = frotaTexto_(match[1], 120).toLowerCase();
  if (/html|javascript|x-sh|executable/.test(mimeType)) throw appError_('FROTA_TIPO_ARQUIVO_BLOQUEADO', 'Este tipo de arquivo não é permitido.');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length) throw appError_('FROTA_ARQUIVO_VAZIO', 'O arquivo está vazio.');
  if (bytes.length > FROTA_CONFIG.MAX_UPLOAD_BYTES) throw appError_('FROTA_ARQUIVO_GRANDE', 'O arquivo excede o limite de 8 MB.');
  const user = frotaUsuario_(context);
  const timestamp = new Date();
  return withScriptLock_(function () {
    if (!vehicle.ID_PASTA_DRIVE) {
      frotaAtualizarPastaViatura_(vehicle);
      FrotaRepository_().update('VIATURAS', vehicle._row, {
        ID_PASTA_DRIVE: vehicle.ID_PASTA_DRIVE, NOME_PASTA_DRIVE: vehicle.NOME_PASTA_DRIVE,
        ATUALIZADO_EM: timestamp, ATUALIZADO_POR_MASP: user.masp
      });
    }
    let vehicleFolder;
    try { vehicleFolder = assertDevelopmentDriveItem_(DriveApp.getFolderById(vehicle.ID_PASTA_DRIVE)); }
    catch (error) {
      frotaAtualizarPastaViatura_(vehicle);
      vehicleFolder = assertDevelopmentDriveItem_(DriveApp.getFolderById(vehicle.ID_PASTA_DRIVE));
      FrotaRepository_().update('VIATURAS', vehicle._row, { ID_PASTA_DRIVE: vehicle.ID_PASTA_DRIVE, NOME_PASTA_DRIVE: vehicle.NOME_PASTA_DRIVE });
    }
    const categoryName = category.replace(/_/g, ' ');
    const folders = vehicleFolder.getFoldersByName(categoryName);
    const destination = folders.hasNext() ? folders.next() : vehicleFolder.createFolder(categoryName);
    const blob = Utilities.newBlob(bytes, mimeType, safeName);
    const created = destination.createFile(blob);
    const record = FrotaRepository_().append('ARQUIVOS_VIATURAS', {
      ID_REGISTRO: Utilities.getUuid(), ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA,
      ID_ARQUIVO_DRIVE: created.getId(), NOME_ARQUIVO: created.getName(), TIPO_ARQUIVO: created.getMimeType(), TAMANHO_BYTES: created.getSize(),
      CATEGORIA: category, DESCRICAO: frotaTexto_(input.description, 1500), DATA_DOCUMENTO: frotaDataSomente_(input.documentDate, true),
      LINK_ARQUIVO: created.getUrl(), ENVIADO_POR_MASP: user.masp, ENVIADO_POR_NOME: user.nome, DATA_HORA_UPLOAD: timestamp, ATIVO: 'SIM'
    });
    frotaRegistrarHistorico_(context, {
      ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'UPLOAD_ARQUIVO',
      CAMPO_ALTERADO: category, VALOR_ANTERIOR: '', VALOR_NOVO: frotaSemLinha_(record), JUSTIFICATIVA: input.observation || input.description || ''
    });
    frotaAuditar_(context, 'UPLOAD_ARQUIVO', record.ID_REGISTRO, null, record, input.observation || '');
    return frotaSemLinha_(record);
  });
}

function frotaArquivoEditar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_ENVIAR_ARQUIVOS');
  frotaExigir_(payload, ['id']);
  const current = FrotaRepository_().findOne('ARQUIVOS_VIATURAS', 'ID_REGISTRO', payload.id);
  if (!current || frotaUpper_(current.ATIVO || 'SIM') === 'NAO') throw appError_('FROTA_ARQUIVO_NAO_ENCONTRADO', 'Arquivo não encontrado.');
  const category = payload.category ? frotaValorPermitido_(payload.category, FROTA_CONFIG.CATEGORIAS_ARQUIVOS, 'Categoria do arquivo') : current.CATEGORIA;
  const updated = FrotaRepository_().update('ARQUIVOS_VIATURAS', current._row, {
    CATEGORIA: category, DESCRICAO: frotaTexto_(payload.description, 1500), DATA_DOCUMENTO: frotaDataSomente_(payload.documentDate, true)
  });
  const vehicle = frotaObterViaturaObrigatoria_(current.ID_VIATURA);
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'ALTERACAO_ARQUIVO',
    CAMPO_ALTERADO: 'METADADOS', VALOR_ANTERIOR: frotaSemLinha_(current), VALOR_NOVO: frotaSemLinha_(updated), JUSTIFICATIVA: payload.justification || ''
  });
  frotaAuditar_(context, 'EDITAR_ARQUIVO', current.ID_REGISTRO, current, updated, payload.justification || '');
  return frotaSemLinha_(updated);
}

function frotaArquivoExcluir_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_EXCLUIR_ARQUIVOS');
  frotaExigir_(payload, ['id', 'justification']);
  const current = FrotaRepository_().findOne('ARQUIVOS_VIATURAS', 'ID_REGISTRO', payload.id);
  if (!current || frotaUpper_(current.ATIVO || 'SIM') === 'NAO') throw appError_('FROTA_ARQUIVO_NAO_ENCONTRADO', 'Arquivo não encontrado ou já excluído.');
  try { assertDevelopmentDriveItem_(DriveApp.getFileById(current.ID_ARQUIVO_DRIVE)).setTrashed(true); }
  catch (error) { console.warn('Arquivo do Drive já estava indisponível: ' + error.message); }
  const updated = FrotaRepository_().update('ARQUIVOS_VIATURAS', current._row, { ATIVO: 'NAO' });
  const vehicle = frotaObterViaturaObrigatoria_(current.ID_VIATURA);
  frotaRegistrarHistorico_(context, {
    ID_VIATURA: vehicle.ID_VIATURA, PREFIXO: vehicle.PREFIXO, PLACA: vehicle.PLACA, TIPO_ACAO: 'EXCLUSAO_ARQUIVO',
    CAMPO_ALTERADO: 'ATIVO', VALOR_ANTERIOR: 'SIM', VALOR_NOVO: 'NAO', JUSTIFICATIVA: payload.justification
  });
  frotaAuditar_(context, 'EXCLUIR_ARQUIVO', current.ID_REGISTRO, current, updated, payload.justification);
  return { id: current.ID_REGISTRO, excluido: true };
}

function frotaArquivoAbrir_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_ARQUIVOS');
  frotaExigir_(payload, ['id']);
  const record = FrotaRepository_().findOne('ARQUIVOS_VIATURAS', 'ID_REGISTRO', payload.id);
  if (!record || frotaUpper_(record.ATIVO || 'SIM') === 'NAO') throw appError_('FROTA_ARQUIVO_NAO_ENCONTRADO', 'Arquivo não encontrado.');
  try {
    const file = DriveApp.getFileById(record.ID_ARQUIVO_DRIVE);
    return { id: record.ID_REGISTRO, nome: file.getName(), url: file.getUrl(), mimeType: file.getMimeType() };
  } catch (error) {
    throw appError_('FROTA_ARQUIVO_DRIVE_INDISPONIVEL', 'O arquivo não está mais disponível no Google Drive.');
  }
}
