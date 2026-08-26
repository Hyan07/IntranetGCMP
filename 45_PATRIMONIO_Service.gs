/** Serviços de cadastro, painel, histórico, auditoria e configurações patrimoniais. */

function patrimonioLimparRegistro_(row) {
  const copy = Object.assign({}, row || {});
  delete copy._row;
  return copy;
}

function patrimonioConfigValor_(key, fallback) {
  const row = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', 'Chave', key);
  return row && row.Valor !== '' ? row.Valor : fallback;
}

function patrimonioDataHora_() {
  const value = now_();
  return { value: value, date: Utilities.formatDate(value, APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd'), time: Utilities.formatDate(value, APP_CONFIG.TIME_ZONE, 'HH:mm:ss') };
}

function patrimonioAssetClient_(row) {
  return {
    id: row.ID, code: row.Código, patrimony: row.Patrimônio, name: row.Nome, description: row.Descrição,
    category: row.Categoria, subcategory: row.Subcategoria, brand: row.Marca, model: row.Modelo, serial: row['Número de Série'],
    controlType: row['Tipo de Controle'] || 'INDIVIDUAL', total: Number(row['Quantidade Total'] || 0),
    available: Number(row['Quantidade Disponível'] || 0), custody: Number(row['Quantidade Cautelada'] || 0),
    unit: row.Unidade || 'UN', custodial: normalizeUpper_(row.Cautelável || 'SIM') !== 'NAO', status: row.Situação,
    condition: row['Estado de Conservação'], sector: row.Setor, location: row.Localização,
    acquisitionDate: row['Data de Aquisição'], value: row.Valor, supplier: row.Fornecedor, invoice: row['Nota Fiscal'],
    warranty: row.Garantia, warrantyExpires: row['Vencimento da Garantia'], notes: row.Observações, photo: row.Foto,
    attachment: row.Anexo, active: normalizeBoolean_(row.Ativo), createdAt: row['Criado em'], updatedAt: row['Atualizado em']
  };
}

function patrimonioCustodyClient_(row) {
  const returned = patrimonioQuantidadeDevolvida_(row.ID);
  const quantity = Number(row.Quantidade || 0);
  return {
    id: row.ID, number: row['Número da Cautela'], group: row['Grupo da Cautela'], type: patrimonioTipoCautela_(row), assetId: row['ID do Patrimônio'],
    patrimony: row.Patrimônio, equipment: row.Equipamento, category: row.Categoria, quantity: quantity,
    returned: returned, pending: Math.max(0, quantity - returned), unit: row.Unidade, receiver: row['GCM Recebedor'],
    receiverMasp: formatMasp_(row['Matrícula do Recebedor']), quartermaster: row.Intendente, quartermasterMasp: formatMasp_(row['Matrícula do Intendente']),
    issuedDate: row['Data da Cautela'], issuedTime: row['Hora da Cautela'], dueDate: row['Previsão de Devolução'],
    indefinite: normalizeUpper_(row['Previsão de Devolução']) === 'INDETERMINADO', sector: row.Setor, deliveryCondition: row['Estado na Entrega'], notes: row.Observações,
    status: row.Status, authenticatedAt: row['Data da Autenticação']
  };
}

function patrimonioQuantidadeDevolvida_(custodyId) {
  return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'DEVOLUCOES').filter(function (row) {
    return String(row['ID da Cautela']) === String(custodyId);
  }).reduce(function (total, row) { return total + Number(row['Quantidade Devolvida'] || 0); }, 0);
}

function patrimonioAuditar_(context, action, result, reason, recordId, before, after, metadata) {
  try {
    const stamp = patrimonioDataHora_();
    const user = context && context.user ? context.user : {};
    const session = context && context.session ? context.session : {};
    return repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'AUDITORIA_PATRIMONIO', {
      ID: uuid_(), Data: stamp.date, Hora: stamp.time, Usuário: user.NOME || '', Matrícula: user.MASP || (context && context.masp) || '',
      Ação: action || '', Resultado: result || 'SUCESSO', Motivo: reason || '', Registro: recordId || '',
      'Valor Anterior': before == null ? '' : JSON.stringify(sanitizeForClient_(before)).slice(0, 45000),
      'Valor Novo': after == null ? '' : JSON.stringify(sanitizeForClient_(after)).slice(0, 45000), Sessão: session.TOKEN || '',
      'User Agent': normalizeText_(metadata && metadata.userAgent).slice(0, 500), IP: normalizeText_(metadata && metadata.ip).slice(0, 80),
      Observação: normalizeText_(metadata && metadata.observation).slice(0, 2000)
    });
  } catch (error) {
    console.error('Falha na auditoria patrimonial: ' + error.message);
    return null;
  }
}

function patrimonioHistorico_(context, type, asset, quantity, responsible, masp, before, after, observation, reference) {
  const stamp = patrimonioDataHora_();
  return repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'HISTORICO_PATRIMONIO', {
    ID: uuid_(), Data: stamp.date, Hora: stamp.time, Tipo: type, Patrimônio: asset ? asset.Patrimônio : '',
    Equipamento: asset ? asset.Nome : '', Categoria: asset ? asset.Categoria : '', Quantidade: quantity || '',
    Responsável: responsible || '', Matrícula: masp || '', Operador: context.user.NOME, 'Matrícula do Operador': context.user.MASP,
    'Situação Anterior': before || '', 'Situação Nova': after || '', Observação: observation || '', Referência: reference || '',
    Sessão: context.session ? context.session.TOKEN : ''
  });
}

function patrimonioBootstrap_(context) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  return {
    version: PATRIMONIO_CONFIG.VERSION,
    permissions: context.permissions,
    user: { id: context.user.ID_USUARIO, name: context.user.NOME, masp: formatMasp_(context.user.MASP), sector: context.user.SETOR || '' },
    dashboard: patrimonioPainel_(context),
    categories: patrimonioCategoriasListar_(context, { activeOnly: true }),
    configuration: patrimonioConfiguracaoListar_(context),
    receivers: patrimonioRecebedores_(context, { query: '', limit: 200 })
  };
}

function patrimonioPainel_(context) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  const assets = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS').filter(function (row) { return row.ID && normalizeBoolean_(row.Ativo); });
  const canAdministrative = patrimonioPodeGerenciarCautelaAdministrativa_(context);
  const custodies = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) {
    return row.ID && ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(row.Status)) >= 0 && (patrimonioTipoCautela_(row) !== 'ADMINISTRATIVA' || canAdministrative);
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const warningDays = Number(patrimonioConfigValor_('AVISO_VENCIMENTO_DIAS', 5));
  const warningLimit = addHours_(today, 24 * warningDays).getTime();
  const overdue = custodies.filter(function (row) { const due = toDate_(row['Previsão de Devolução'], true); return due && due.getTime() < today.getTime(); });
  const nearing = custodies.filter(function (row) { const due = toDate_(row['Previsão de Devolução'], true); return due && due.getTime() >= today.getTime() && due.getTime() <= warningLimit; });
  const byCategory = {};
  assets.forEach(function (row) { const key = row.Categoria || 'Sem categoria'; byCategory[key] = (byCategory[key] || 0) + Number(row['Quantidade Total'] || 1); });
  return {
    cards: {
      assets: assets.length,
      totalUnits: assets.reduce(function (sum, row) { return sum + Number(row['Quantidade Total'] || 0); }, 0),
      available: assets.reduce(function (sum, row) { return sum + Number(row['Quantidade Disponível'] || 0); }, 0),
      cautioned: assets.reduce(function (sum, row) { return sum + Number(row['Quantidade Cautelada'] || 0); }, 0),
      activeCustodies: custodies.length,
      overdue: overdue.length,
      maintenance: assets.filter(function (row) { return normalizeUpper_(row.Situação) === 'EM_MANUTENCAO'; }).length,
      damaged: assets.filter(function (row) { return ['DANIFICADO', 'EXTRAVIADO'].indexOf(normalizeUpper_(row.Situação)) >= 0; }).length
    },
    byCategory: Object.keys(byCategory).sort().map(function (name) { return { label: name, value: byCategory[name] }; }),
    alerts: overdue.slice(0, 10).map(patrimonioCustodyClient_).concat(nearing.slice(0, 10).map(patrimonioCustodyClient_))
  };
}

function patrimonioListar_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  const options = payload || {};
  const administrative = normalizeBoolean_(options.administrative);
  const searchFields = normalizeBoolean_(options.excludeInternalCode)
    ? ['Patrimônio', 'Nome', 'Descrição', 'Categoria', 'Subcategoria', 'Marca', 'Modelo', 'Número de Série', 'Setor', 'Localização', 'Observações']
    : ['Código', 'Patrimônio', 'Nome', 'Descrição', 'Categoria', 'Subcategoria', 'Marca', 'Modelo', 'Número de Série', 'Setor', 'Localização', 'Observações'];
  if (administrative) patrimonioExigirPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
  let rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS').filter(function (row) { return row.ID; });
  rows = searchRows_(rows, options.query, searchFields);
  if (!normalizeBoolean_(options.includeInactive)) rows = rows.filter(function (row) { return normalizeBoolean_(row.Ativo); });
  if (options.status) rows = rows.filter(function (row) { return normalizeUpper_(row.Situação) === normalizeUpper_(options.status); });
  if (options.category) rows = rows.filter(function (row) { return normalizeUpper_(row.Categoria) === normalizeUpper_(options.category); });
  if (options.availableOnly) rows = rows.filter(function (row) { return normalizeBoolean_(row.Ativo) && Number(row['Quantidade Disponível'] || 0) > 0 && (administrative || normalizeUpper_(row.Cautelável) !== 'NAO'); });
  rows.sort(function (a, b) { return String(a.Patrimônio || a.Código).localeCompare(String(b.Patrimônio || b.Código), 'pt-BR', { numeric: true }); });
  const page = paginate_(rows, options);
  page.items = page.items.map(patrimonioAssetClient_);
  return page;
}

function patrimonioObter_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  requireFields_(payload, ['id']);
  const row = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', payload.id);
  if (!row) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  const history = patrimonioTemPermissao_(context, 'HISTORICO_VISUALIZAR', 'patrimonio.consultar_historico')
    ? repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'HISTORICO_PATRIMONIO').filter(function (item) {
      return String(item.Referência) === String(row.ID) || (row.Patrimônio && String(item.Patrimônio) === String(row.Patrimônio));
    }).slice(-100).reverse().map(patrimonioLimparRegistro_)
    : [];
  return { asset: patrimonioAssetClient_(row), history: history };
}

function patrimonioSalvar_(context, payload) {
  const isEdit = Boolean(payload && payload.id);
  patrimonioExigirPermissao_(context, isEdit ? 'PATRIMONIO_EDITAR' : 'PATRIMONIO_CADASTRAR', isEdit ? 'patrimonio.editar' : 'patrimonio.cadastrar');
  requireFields_(payload, ['name', 'category', 'controlType', 'condition']);
  const current = isEdit ? repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', payload.id) : null;
  if (isEdit && !current) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  const controlType = validateStatus_(payload.controlType, ['INDIVIDUAL', 'QUANTIDADE']);
  const total = controlType === 'INDIVIDUAL' ? 1 : Math.max(1, Math.floor(validatePositiveNumber_(payload.total, 'Quantidade total')));
  const currentCautioned = current ? Number(current['Quantidade Cautelada'] || 0) : 0;
  if (total < currentCautioned) throw appError_('INVALID_QUANTITY', 'A quantidade total não pode ser menor que a quantidade atualmente cautelada.');
  const patrimony = normalizeUpper_(payload.patrimony);
  const recordId = current ? current.ID : uuid_();
  const code = current ? normalizeUpper_(current.Código || current.ID) : recordId;
  validateUnique_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'Código', code, 'ID', payload.id, normalizeUpper_);
  if (patrimony) validateUnique_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'Patrimônio', patrimony, 'ID', payload.id, normalizeUpper_);
  if (payload.serial) validateUnique_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'Número de Série', payload.serial, 'ID', payload.id, normalizeUpper_);
  const stamp = now_();
  const status = validateStatus_(payload.status || (current ? current.Situação : 'DISPONIVEL'), ['DISPONIVEL', 'CAUTELADO', 'PARCIALMENTE_CAUTELADO', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'BAIXADO', 'RESERVADO', 'INDISPONIVEL']);
  const record = {
    ID: recordId, Código: code, Patrimônio: patrimony, Nome: normalizeText_(payload.name),
    Descrição: normalizeText_(payload.description), Categoria: normalizeText_(payload.category), Subcategoria: normalizeText_(payload.subcategory),
    Marca: normalizeText_(payload.brand), Modelo: normalizeText_(payload.model), 'Número de Série': normalizeUpper_(payload.serial),
    'Tipo de Controle': controlType, 'Quantidade Total': total, 'Quantidade Disponível': total - currentCautioned,
    'Quantidade Cautelada': currentCautioned, Unidade: normalizeUpper_(payload.unit || 'UN'), Cautelável: normalizeBoolean_(payload.custodial) ? 'SIM' : 'NAO',
    Situação: status, 'Estado de Conservação': normalizeUpper_(payload.condition), Setor: normalizeText_(payload.sector),
    Localização: normalizeText_(payload.location), 'Data de Aquisição': payload.acquisitionDate ? toDate_(payload.acquisitionDate) : '',
    Valor: payload.value === '' || payload.value == null ? '' : validatePositiveNumber_(payload.value, 'Valor', true), Fornecedor: normalizeText_(payload.supplier),
    'Nota Fiscal': normalizeText_(payload.invoice), Garantia: normalizeText_(payload.warranty),
    'Vencimento da Garantia': payload.warrantyExpires ? toDate_(payload.warrantyExpires) : '', Observações: normalizeText_(payload.notes),
    Foto: normalizeText_(payload.photo), Anexo: normalizeText_(payload.attachment), Ativo: payload.active === undefined ? true : normalizeBoolean_(payload.active),
    'Criado em': current ? current['Criado em'] : stamp, 'Criado por': current ? current['Criado por'] : context.user.ID_USUARIO,
    'Atualizado em': stamp, 'Atualizado por': context.user.ID_USUARIO
  };
  const saved = current ? repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', current._row, record) : repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', record);
  patrimonioHistorico_(context, isEdit ? 'EDICAO' : 'CADASTRO', saved, total, '', '', current ? current.Situação : '', saved.Situação, payload.notes, saved.ID);
  patrimonioAuditar_(context, isEdit ? 'PATRIMONIO_EDITAR' : 'PATRIMONIO_CADASTRAR', 'SUCESSO', '', saved.ID, current && patrimonioLimparRegistro_(current), patrimonioLimparRegistro_(saved), payload.metadata || {});
  return patrimonioAssetClient_(saved);
}

function patrimonioAlterarStatus_(context, payload) {
  requireFields_(payload, ['id', 'status']);
  const requested = normalizeUpper_(payload.status);
  const permission = requested === 'BAIXADO' ? 'PATRIMONIO_BAIXAR' : requested === 'EM_MANUTENCAO' ? 'PATRIMONIO_MANUTENCAO' : 'PATRIMONIO_EDITAR';
  patrimonioExigirPermissao_(context, permission, requested === 'BAIXADO' ? 'patrimonio.excluir' : 'patrimonio.editar');
  const row = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', payload.id);
  if (!row) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
  if (Number(row['Quantidade Cautelada'] || 0) > 0 && ['BAIXADO', 'INATIVO'].indexOf(requested) >= 0) throw appError_('OPEN_CUSTODY', 'Devolva todas as unidades cauteladas antes desta alteração.');
  const saved = repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', row._row, {
    Situação: requested, Ativo: requested === 'BAIXADO' ? false : row.Ativo, 'Atualizado em': now_(), 'Atualizado por': context.user.ID_USUARIO
  });
  patrimonioHistorico_(context, 'ALTERACAO_STATUS', saved, '', '', '', row.Situação, requested, payload.justification, saved.ID);
  patrimonioAuditar_(context, 'PATRIMONIO_STATUS', 'SUCESSO', payload.justification, saved.ID, { status: row.Situação }, { status: requested }, payload.metadata || {});
  return patrimonioAssetClient_(saved);
}

function patrimonioRecebedores_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  const options = payload || {};
  let users = repositoryReadAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS').filter(function (user) { return normalizeUpper_(user.STATUS) === 'ATIVO'; });
  users = searchRows_(users, options.query, ['NOME', 'MASP', 'SETOR', 'FUNCAO']);
  const canAdministrative = patrimonioPodeGerenciarCautelaAdministrativa_(context);
  const active = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) {
    return ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(row.Status)) >= 0 && (patrimonioTipoCautela_(row) !== 'ADMINISTRATIVA' || canAdministrative);
  });
  return users.slice(0, Math.min(500, Number(options.limit || 100))).map(function (user) {
    const rows = active.filter(function (row) { return normalizeMasp_(row['Matrícula do Recebedor']) === normalizeMasp_(user.MASP); });
    return { id: user.ID_USUARIO, name: user.NOME, masp: user.MASP, maspFormatted: formatMasp_(user.MASP), email: user.EMAIL || '', sector: user.SETOR || '', functionName: user.FUNCAO || user.CARGO || '', activeCustodies: rows.length, overdue: rows.filter(function (row) { const due = toDate_(row['Previsão de Devolução'], true); return due && due.getTime() < now_().getTime(); }).length };
  });
}

function patrimonioHistoricoListar_(context, payload) {
  patrimonioExigirPermissao_(context, 'HISTORICO_VISUALIZAR', 'patrimonio.consultar_historico');
  const options = payload || {};
  let rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'HISTORICO_PATRIMONIO');
  rows = searchRows_(rows, options.query, ['Tipo', 'Patrimônio', 'Equipamento', 'Categoria', 'Responsável', 'Matrícula', 'Operador', 'Observação', 'Referência']);
  if (options.type) rows = rows.filter(function (row) { return normalizeUpper_(row.Tipo) === normalizeUpper_(options.type); });
  if (options.startDate) rows = rows.filter(function (row) { return new Date(row.Data) >= toDate_(options.startDate); });
  if (options.endDate) rows = rows.filter(function (row) { return new Date(row.Data) <= addHours_(toDate_(options.endDate), 24); });
  rows.sort(function (a, b) { return String(b.Data + ' ' + b.Hora).localeCompare(String(a.Data + ' ' + a.Hora)); });
  const page = paginate_(rows, options); page.items = page.items.map(patrimonioLimparRegistro_); return page;
}

function patrimonioAuditoriaListar_(context, payload) {
  patrimonioExigirPermissao_(context, 'AUDITORIA_VISUALIZAR', 'auditoria.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'AUDITORIA_PATRIMONIO');
  rows = searchRows_(rows, options.query, ['Usuário', 'Matrícula', 'Ação', 'Resultado', 'Motivo', 'Registro', 'Observação']);
  if (options.result) rows = rows.filter(function (row) { return normalizeUpper_(row.Resultado) === normalizeUpper_(options.result); });
  rows.sort(function (a, b) { return String(b.Data + ' ' + b.Hora).localeCompare(String(a.Data + ' ' + a.Hora)); });
  const page = paginate_(rows, options); page.items = page.items.map(patrimonioLimparRegistro_); return page;
}

function patrimonioCategoriasListar_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  let rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO');
  if (payload && payload.activeOnly) rows = rows.filter(function (row) { return normalizeBoolean_(row.Ativo); });
  return rows.map(patrimonioLimparRegistro_).sort(function (a, b) { return String(a.Categoria + a.Subcategoria).localeCompare(String(b.Categoria + b.Subcategoria), 'pt-BR'); });
}

function patrimonioCategoriaSalvar_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_CONFIGURAR', 'configuracoes.gerenciar');
  requireFields_(payload, ['category']);
  const current = payload.id ? repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO', 'ID', payload.id) : null;
  const record = { ID: current ? current.ID : uuid_(), Categoria: normalizeText_(payload.category), Subcategoria: normalizeText_(payload.subcategory), Ativo: payload.active === undefined ? true : normalizeBoolean_(payload.active), 'Criado em': current ? current['Criado em'] : now_(), 'Criado por': current ? current['Criado por'] : context.user.ID_USUARIO };
  const saved = current ? repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO', current._row, record) : repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'CATEGORIAS_PATRIMONIO', record);
  patrimonioAuditar_(context, 'CATEGORIA_SALVAR', 'SUCESSO', '', saved.ID, current, saved, payload.metadata || {});
  return patrimonioLimparRegistro_(saved);
}

function patrimonioConfiguracaoListar_(context) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_VISUALIZAR', 'patrimonio.visualizar');
  return repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO').map(patrimonioLimparRegistro_);
}

function patrimonioConfiguracaoSalvar_(context, payload) {
  patrimonioExigirPermissao_(context, 'PATRIMONIO_CONFIGURAR', 'configuracoes.gerenciar');
  requireFields_(payload, ['key']);
  const current = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', 'Chave', payload.key);
  if (!current) throw appError_('CONFIG_NOT_FOUND', 'Configuração patrimonial não encontrada.');
  const saved = repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', current._row, { Valor: normalizeText_(payload.value), 'Atualizado em': now_(), 'Atualizado por': context.user.ID_USUARIO });
  patrimonioAuditar_(context, 'CONFIGURACAO_SALVAR', 'SUCESSO', '', payload.key, { value: current.Valor }, { value: saved.Valor }, payload.metadata || {});
  return patrimonioLimparRegistro_(saved);
}
