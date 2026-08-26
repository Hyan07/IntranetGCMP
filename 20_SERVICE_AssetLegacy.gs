/** Cadastro e consulta de patrimônio. */

function cleanAsset_(asset) {
  const copy = Object.assign({}, asset);
  delete copy._row;
  return copy;
}

function listAssets_(context, payload) {
  requirePermission_(context, 'patrimonio.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS');
  rows = searchRows_(rows, options.query, ['NUMERO_PATRIMONIAL', 'DESCRICAO', 'CATEGORIA', 'MARCA', 'MODELO', 'NUMERO_SERIE', 'SETOR_RESPONSAVEL', 'LOCALIZACAO_ATUAL']);
  if (options.status) rows = rows.filter(function (a) { return a.STATUS === normalizeUpper_(options.status); });
  if (options.category) rows = rows.filter(function (a) { return a.CATEGORIA === options.category; });
  rows.sort(function (a, b) { return String(a.NUMERO_PATRIMONIAL).localeCompare(String(b.NUMERO_PATRIMONIAL), 'pt-BR', { numeric: true }); });
  const page = paginate_(rows, options);
  page.items = page.items.map(cleanAsset_);
  return page;
}

function getAsset_(context, payload) {
  requirePermission_(context, 'patrimonio.visualizar');
  requireFields_(payload, ['id']);
  const asset = repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'ID_PATRIMONIO', payload.id);
  if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  const history = hasPermission_(context, 'patrimonio.consultar_historico')
    ? sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', function (c) { return String(c.ID_PATRIMONIO) === String(asset.ID_PATRIMONIO); }), 'ENTREGUE_EM')
    : [];
  return { asset: cleanAsset_(asset), history: history };
}

function saveAsset_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_PATRIMONIO);
  requirePermission_(context, isEdit ? 'patrimonio.editar' : 'patrimonio.cadastrar');
  requireFields_(payload, ['NUMERO_PATRIMONIAL', 'DESCRICAO', 'CATEGORIA', 'STATUS', 'ESTADO_CONSERVACAO']);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'ID_PATRIMONIO', payload.ID_PATRIMONIO) : null;
  if (isEdit && !current) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  const number = normalizeUpper_(payload.NUMERO_PATRIMONIAL);
  validateUnique_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'NUMERO_PATRIMONIAL', number, 'ID_PATRIMONIO', payload.ID_PATRIMONIO, normalizeUpper_);
  if (payload.NUMERO_SERIE) validateUnique_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'NUMERO_SERIE', payload.NUMERO_SERIE, 'ID_PATRIMONIO', payload.ID_PATRIMONIO, normalizeUpper_);
  const status = validateStatus_(payload.STATUS, ['DISPONIVEL', 'CAUTELADO', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'BAIXADO', 'RESERVADO', 'INDISPONIVEL']);
  if (isEdit && current.STATUS === 'CAUTELADO' && status !== 'CAUTELADO') {
    const open = repositoryFindMany_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', function (c) { return String(c.ID_PATRIMONIO) === String(current.ID_PATRIMONIO) && c.STATUS === 'ABERTA'; });
    if (open.length) throw appError_('OPEN_CUSTODY', 'Registre a devolução antes de alterar a situação deste patrimônio.');
  }
  const timestamp = now_();
  const record = {
    ID_PATRIMONIO: isEdit ? current.ID_PATRIMONIO : uuid_(),
    NUMERO_PATRIMONIAL: number,
    DESCRICAO: normalizeText_(payload.DESCRICAO),
    CATEGORIA: normalizeText_(payload.CATEGORIA),
    MARCA: normalizeText_(payload.MARCA),
    MODELO: normalizeText_(payload.MODELO),
    NUMERO_SERIE: normalizeUpper_(payload.NUMERO_SERIE),
    STATUS: status,
    ESTADO_CONSERVACAO: normalizeText_(payload.ESTADO_CONSERVACAO),
    UNIDADE: normalizeText_(payload.UNIDADE),
    SETOR_RESPONSAVEL: normalizeText_(payload.SETOR_RESPONSAVEL),
    LOCALIZACAO_ATUAL: normalizeText_(payload.LOCALIZACAO_ATUAL),
    DATA_AQUISICAO: payload.DATA_AQUISICAO ? toDate_(payload.DATA_AQUISICAO) : '',
    VALOR: payload.VALOR === '' || payload.VALOR === undefined ? '' : validatePositiveNumber_(payload.VALOR, 'Valor', true),
    FORNECEDOR: normalizeText_(payload.FORNECEDOR),
    NOTA_FISCAL: normalizeText_(payload.NOTA_FISCAL),
    GARANTIA_ATE: payload.GARANTIA_ATE ? toDate_(payload.GARANTIA_ATE) : '',
    OBSERVACOES: normalizeText_(payload.OBSERVACOES),
    FOTO_URL: normalizeText_(payload.FOTO_URL),
    ATUALIZADO_EM: timestamp,
    ATUALIZADO_POR: context.user.ID_USUARIO
  };
  if (isEdit) {
    record.PASTA_DRIVE_ID = current.PASTA_DRIVE_ID;
    record.CRIADO_EM = current.CRIADO_EM;
    record.CRIADO_POR = current.CRIADO_POR;
  } else {
    record.CRIADO_EM = timestamp;
    record.CRIADO_POR = context.user.ID_USUARIO;
    try { record.PASTA_DRIVE_ID = ensureEntityFolder_('PATRIMONIO', number).getId(); } catch (error) { record.PASTA_DRIVE_ID = ''; }
  }
  const saved = isEdit
    ? repositoryUpdate_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', current._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', record);
  audit_(context, 'patrimonio', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_PATRIMONIO, current, saved, 'SUCESSO');
  return cleanAsset_(saved);
}

function changeAssetStatus_(context, payload) {
  requirePermission_(context, payload && payload.status === 'BAIXADO' ? 'patrimonio.excluir' : 'patrimonio.editar');
  requireFields_(payload, ['id', 'status']);
  const asset = repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'ID_PATRIMONIO', payload.id);
  if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  const status = validateStatus_(payload.status, ['DISPONIVEL', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'BAIXADO', 'RESERVADO', 'INDISPONIVEL']);
  const open = repositoryFindMany_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', function (c) { return String(c.ID_PATRIMONIO) === String(asset.ID_PATRIMONIO) && c.STATUS === 'ABERTA'; });
  if (open.length) throw appError_('OPEN_CUSTODY', 'O item possui cautela aberta e não pode ter a situação alterada diretamente.');
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', asset._row, { STATUS: status, ATUALIZADO_EM: now_(), ATUALIZADO_POR: context.user.ID_USUARIO });
  audit_(context, 'patrimonio', 'ALTERAR_STATUS', asset.ID_PATRIMONIO, { STATUS: asset.STATUS }, { STATUS: status }, 'SUCESSO', payload.justification || '');
  return cleanAsset_(saved);
}
