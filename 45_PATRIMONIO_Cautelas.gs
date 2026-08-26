/** Cautelas, autenticação transacional e devoluções. */

function patrimonioAutenticarUsuario_(context, maspValue, password, action, metadata) {
  const masp = normalizeMasp_(maspValue);
  const safeContext = { masp: masp, session: context && context.session };
  const user = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', masp, normalizeMasp_);
  if (!user) {
    patrimonioAuditar_(safeContext, action + '_AUTENTICACAO', 'NEGADO', 'Usuário não localizado', '', null, null, metadata || {});
    throw appError_('INVALID_TRANSACTION_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }
  safeContext.user = user;
  if (normalizeUpper_(user.STATUS) !== APP_CONFIG.STATUS.ACTIVE) {
    patrimonioAuditar_(safeContext, action + '_AUTENTICACAO', 'NEGADO', 'Usuário não está ativo', user.ID_USUARIO, null, null, metadata || {});
    throw appError_('USER_INACTIVE', 'O GCM selecionado não possui acesso ativo.');
  }
  const blockedUntil = toDate_(user.BLOQUEADO_ATE, true);
  if (blockedUntil && blockedUntil.getTime() > now_().getTime()) {
    patrimonioAuditar_(safeContext, action + '_AUTENTICACAO', 'NEGADO', 'Bloqueio temporário ativo', user.ID_USUARIO, null, null, metadata || {});
    throw appError_('TEMPORARILY_BLOCKED', 'Autenticação temporariamente bloqueada até ' + formatDateTime_(blockedUntil) + '.');
  }
  if (!verifyPassword_(password, user)) {
    registerFailedLogin_(user, patrimonioConfigValor_('MAX_TENTATIVAS_AUTENTICACAO', 5), patrimonioConfigValor_('BLOQUEIO_AUTENTICACAO_MINUTOS', 15));
    patrimonioAuditar_(safeContext, action + '_AUTENTICACAO', 'NEGADO', 'Senha inválida', user.ID_USUARIO, null, null, metadata || {});
    throw appError_('INVALID_TRANSACTION_CREDENTIALS', 'Matrícula/MASP ou senha incorretos.');
  }
  repositoryUpdate_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', user._row, { TENTATIVAS: 0, BLOQUEADO_ATE: '', ATUALIZADO_EM: now_() });
  patrimonioAuditar_(safeContext, action + '_AUTENTICACAO', 'SUCESSO', '', user.ID_USUARIO, null, { masp: masp }, metadata || {});
  return user;
}

function patrimonioTipoCautela_(rowOrValue) {
  const value = rowOrValue && typeof rowOrValue === 'object' ? rowOrValue['Tipo de Cautela'] : rowOrValue;
  return normalizeUpper_(value) === 'ADMINISTRATIVA' ? 'ADMINISTRATIVA' : 'COMUM';
}

function patrimonioPodeGerenciarCautelaAdministrativa_(context) {
  return patrimonioTemPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
}

function patrimonioExigirAcessoTipoCautela_(context, custody, regularPermission, regularLegacy) {
  if (patrimonioTipoCautela_(custody) === 'ADMINISTRATIVA') {
    return patrimonioExigirPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
  }
  return patrimonioExigirPermissao_(context, regularPermission, regularLegacy);
}

function patrimonioProximoNumeroCautela_(custodyType) {
  const row = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', 'Chave', 'NUMERO_CAUTELA_SEQUENCIAL');
  const sequence = Math.max(1, Number(row ? row.Valor : 1) || 1);
  if (row) repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CONFIG_PATRIMONIO', row._row, { Valor: String(sequence + 1), 'Atualizado em': now_(), 'Atualizado por': 'SISTEMA' });
  const year = Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyy');
  return (custodyType === 'ADMINISTRATIVA' ? 'CAD-' : 'CAU-') + year + '-' + String(sequence).padStart(6, '0');
}

function patrimonioCombinarObservacoesCautela_(itemNotes, generalNotes) {
  const notes = [];
  const delivery = normalizeText_(itemNotes);
  const general = normalizeText_(generalNotes);
  if (delivery) notes.push('Observações da entrega: ' + delivery);
  if (general) notes.push('Observações gerais: ' + general);
  return notes.join(' | ');
}

function patrimonioRealizarCautela_(context, payload) {
  const custodyType = validateStatus_(payload && payload.type || 'COMUM', ['COMUM', 'ADMINISTRATIVA']);
  const administrative = custodyType === 'ADMINISTRATIVA';
  if (administrative) patrimonioExigirPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
  else patrimonioExigirPermissao_(context, 'CAUTELA_REALIZAR', 'patrimonio.realizar_cautela');
  requireFields_(payload, ['receiverMasp', 'receiverPassword']);
  if (!normalizeBoolean_(payload.confirmation)) throw appError_('CONFIRMATION_REQUIRED', 'Confirme a conferência dos dados e itens.');
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw appError_('ITEMS_REQUIRED', 'Adicione pelo menos um patrimônio à cautela.');
  if (items.length > 1 && !administrative) patrimonioExigirPermissao_(context, 'CAUTELA_MULTIPLA', 'patrimonio.realizar_cautela');
  const ids = items.map(function (item) { return String(item.assetId); });
  if (ids.some(function (id, index) { return ids.indexOf(id) !== index; })) throw appError_('DUPLICATE_ITEM', 'O mesmo patrimônio foi informado mais de uma vez.');
  const metadata = payload.metadata || {};
  const result = withScriptLock_(function () {
    const receiver = patrimonioAutenticarUsuario_(context, payload.receiverMasp, payload.receiverPassword, administrative ? 'CAUTELA_ADMINISTRATIVA' : 'CAUTELA', metadata);
    if (payload.receiverId && String(payload.receiverId) !== String(receiver.ID_USUARIO)) {
      patrimonioAuditar_(context, 'CAUTELA', 'NEGADO', 'Usuário selecionado diferente do autenticado', '', null, { selectedUserId: payload.receiverId, authenticatedUserId: receiver.ID_USUARIO }, metadata);
      throw appError_('RECEIVER_MISMATCH', 'A senha informada não corresponde ao GCM selecionado.');
    }
    const allowOverdue = normalizeUpper_(patrimonioConfigValor_('PERMITIR_CAUTELA_VENCIDA', 'NAO')) === 'SIM';
    if (!administrative && !allowOverdue) {
      const hasOverdue = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').some(function (row) {
        if (normalizeMasp_(row['Matrícula do Recebedor']) !== normalizeMasp_(receiver.MASP) || ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(row.Status)) < 0) return false;
        const due = toDate_(row['Previsão de Devolução'], true);
        return due && due.getTime() < now_().getTime();
      });
      if (hasOverdue) throw appError_('RECEIVER_HAS_OVERDUE', 'O GCM possui cautela vencida e não pode receber novos itens.');
    }
    const dueRequired = normalizeUpper_(patrimonioConfigValor_('EXIGIR_PREVISAO_DEVOLUCAO', 'SIM')) === 'SIM';
    const indefinite = normalizeBoolean_(payload.indefinite);
    if (dueRequired && !payload.dueDate && !indefinite) throw appError_('DUE_DATE_REQUIRED', 'Informe a previsão de devolução ou marque prazo indeterminado.');
    const dueDate = indefinite ? 'INDETERMINADO' : (payload.dueDate ? toDate_(payload.dueDate) : '');
    const stamp = patrimonioDataHora_();
    const number = patrimonioProximoNumeroCautela_(custodyType);
    const group = uuid_();
    const saved = [];
    items.forEach(function (item) {
      const asset = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', item.assetId);
      if (!asset || !normalizeBoolean_(asset.Ativo)) throw appError_('ASSET_NOT_FOUND', 'Um dos patrimônios selecionados não foi encontrado ou está inativo.');
      if (!administrative && normalizeUpper_(asset.Cautelável) === 'NAO') throw appError_('ASSET_NOT_CUSTODIAL', asset.Nome + ' não está marcado como cautelável.');
      if (!administrative && ['DISPONIVEL', 'PARCIALMENTE_CAUTELADO'].indexOf(normalizeUpper_(asset.Situação)) < 0) throw appError_('ASSET_UNAVAILABLE', asset.Nome + ' não está disponível para cautela.');
      const quantityValue = asset['Tipo de Controle'] === 'INDIVIDUAL' ? 1 : Number(item.quantity || 1);
      if (!Number.isFinite(quantityValue) || quantityValue < 1 || Math.floor(quantityValue) !== quantityValue) throw appError_('INVALID_QUANTITY', 'Informe uma quantidade inteira válida para ' + asset.Nome + '.');
      const quantity = quantityValue;
      const available = Number(asset['Quantidade Disponível'] || 0);
      if (quantity > available) throw appError_('INSUFFICIENT_STOCK', 'Quantidade indisponível para ' + asset.Nome + '. Disponível: ' + available + ' ' + (asset.Unidade || 'UN') + '.');
      const custody = repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', {
        ID: uuid_(), 'Número da Cautela': number, 'ID do Patrimônio': asset.ID, Patrimônio: asset.Patrimônio || '',
        Equipamento: asset.Nome, Categoria: asset.Categoria, Quantidade: quantity, Unidade: asset.Unidade || 'UN',
        'GCM Recebedor': receiver.NOME, 'Matrícula do Recebedor': receiver.MASP, Intendente: context.user.NOME,
        'Matrícula do Intendente': context.user.MASP, 'Data da Cautela': stamp.date, 'Hora da Cautela': stamp.time,
        'Previsão de Devolução': dueDate, Finalidade: '', Setor: receiver.SETOR || normalizeText_(payload.sector),
        'Estado na Entrega': normalizeUpper_(item.condition || asset['Estado de Conservação']), Observações: patrimonioCombinarObservacoesCautela_(item.notes, payload.notes),
        Status: 'ATIVA', 'Data da Autenticação': stamp.value, Sessão: context.session.TOKEN, 'Grupo da Cautela': group,
        'Tipo de Cautela': custodyType
      });
      const nextAvailable = available - quantity;
      const nextCautioned = Number(asset['Quantidade Cautelada'] || 0) + quantity;
      const nextStatus = nextAvailable > 0 ? 'PARCIALMENTE_CAUTELADO' : 'CAUTELADO';
      repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', asset._row, {
        'Quantidade Disponível': nextAvailable, 'Quantidade Cautelada': nextCautioned, Situação: nextStatus,
        Localização: 'Com ' + receiver.NOME, 'Atualizado em': stamp.value, 'Atualizado por': context.user.ID_USUARIO
      });
      patrimonioHistorico_(context, administrative ? 'CAUTELA_ADMINISTRATIVA' : 'CAUTELA', asset, quantity, receiver.NOME, receiver.MASP, asset.Situação, nextStatus, patrimonioCombinarObservacoesCautela_(item.notes, payload.notes), number);
      saved.push(Object.assign(patrimonioCustodyClient_(custody), {
        patrimony: asset.Patrimônio || '', description: asset.Descrição || '', subcategory: asset.Subcategoria || '',
        brand: asset.Marca || '', model: asset.Modelo || '', serial: asset['Número de Série'] || '', assetNotes: asset.Observações || ''
      }));
    });
    patrimonioAuditar_(context, administrative ? 'CAUTELA_ADMINISTRATIVA_REALIZAR' : 'CAUTELA_REALIZAR', 'SUCESSO', '', number, null, { type: custodyType, receiver: receiver.MASP, items: saved.map(function (item) { return { assetId: item.assetId, quantity: item.quantity }; }) }, metadata);
    return { number: number, group: group, type: custodyType, receiver: receiver.NOME, receiverMasp: formatMasp_(receiver.MASP), receiverEmail: receiver.EMAIL || '', quartermaster: context.user.NOME, quartermasterMasp: formatMasp_(context.user.MASP), issuedAt: stamp.value, dueDate: dueDate, indefinite: indefinite, sector: receiver.SETOR || '', items: saved, verificationCode: sha256_(number + ':' + group).slice(0, 12).toUpperCase() };
  });
  result.email = { pending: true, available: Boolean(result.receiverEmail) };
  return result;
}

function patrimonioCautelasListar_(context, payload) {
  const canRegular = patrimonioTemPermissao_(context, 'CAUTELA_VISUALIZAR_ATIVAS', 'patrimonio.visualizar') || patrimonioTemPermissao_(context, 'DESCAUTELA_REALIZAR', 'patrimonio.receber_devolucao');
  const canAdministrative = patrimonioPodeGerenciarCautelaAdministrativa_(context);
  if (!canRegular && !canAdministrative) {
    throw appError_('FORBIDDEN', 'Você não possui permissão para consultar cautelas ativas.');
  }
  const options = payload || {};
  let rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) { return row.ID; });
  rows = rows.filter(function (row) { return patrimonioTipoCautela_(row) === 'ADMINISTRATIVA' ? canAdministrative : canRegular; });
  if (!normalizeBoolean_(options.includeClosed)) rows = rows.filter(function (row) { return ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(row.Status)) >= 0; });
  rows = searchRows_(rows, options.query, ['Número da Cautela', 'Patrimônio', 'Equipamento', 'Categoria', 'GCM Recebedor', 'Matrícula do Recebedor', 'Intendente', 'Setor']);
  if (options.status) rows = rows.filter(function (row) { return normalizeUpper_(row.Status) === normalizeUpper_(options.status); });
  if (options.receiverMasp) rows = rows.filter(function (row) { return normalizeMasp_(row['Matrícula do Recebedor']) === normalizeMasp_(options.receiverMasp); });
  rows.sort(function (a, b) { return String(b['Data da Cautela'] + ' ' + b['Hora da Cautela']).localeCompare(String(a['Data da Cautela'] + ' ' + a['Hora da Cautela'])); });
  const page = paginate_(rows, options); page.items = page.items.map(patrimonioCustodyClient_); return page;
}

function patrimonioEnviarTermoCautelaEmail_(context, term, metadata) {
  if (APP_CONFIG.ENVIRONMENT === 'DEVELOPMENT') {
    patrimonioAuditar_(context, 'CAUTELA_EMAIL', 'SUPRIMIDO_DEV', 'Envio desativado no ambiente de desenvolvimento', term.number, null, { receiver: term.receiverMasp }, metadata || {});
    return { sent: false, suppressed: true, message: 'Envio de e-mail desativado no ambiente de desenvolvimento.' };
  }
  const email = normalizeText_(term && term.receiverEmail).toLowerCase();
  if (!email) {
    patrimonioAuditar_(context, 'CAUTELA_EMAIL', 'ERRO', 'Recebedor sem e-mail cadastrado', term.number, null, { receiver: term.receiverMasp }, metadata || {});
    return { sent: false, message: 'O recebedor não possui e-mail cadastrado.' };
  }
  try {
    const institution = getRuntimeConfig_('NOME_INSTITUICAO', 'Guarda Civil Municipal de Passos');
    const systemName = getRuntimeConfig_('NOME_SISTEMA', APP_CONFIG.NAME);
    const termLabel = term.type === 'ADMINISTRATIVA' ? 'Termo de Cautela Administrativa' : 'Termo de Cautela';
    let logoBlob = null;
    try { logoBlob = institutionLogoBlob_(); } catch (brandingError) { console.warn('Brasão não incorporado ao e-mail: ' + brandingError.message); }
    const logoHtml = logoBlob
      ? '<img src="cid:brasao" alt="Brasão da GCMP" style="display:block;width:58px;height:58px;object-fit:contain;background:#fff;border-radius:50%;padding:3px">'
      : '<div style="display:grid;place-items:center;width:54px;height:54px;color:#fff;font-weight:900;border:3px double #c99b3b;border-radius:50%;background:#0c2948">GCMP</div>';
    const dueLabel = term.indefinite || normalizeUpper_(term.dueDate) === 'INDETERMINADO' ? 'Prazo indeterminado' : formatDateTime_(term.dueDate);
    const rows = (term.items || []).map(function (item) {
      const details = [item.category, item.subcategory, [item.brand, item.model].filter(Boolean).join(' '), item.serial ? 'Série ' + item.serial : '', item.description].filter(Boolean).join(' · ');
      const observations = [item.assetNotes ? 'Cadastro: ' + item.assetNotes : '', item.notes || ''].filter(Boolean).join(' | ');
      return '<tr><td style="padding:8px;border:1px solid #cbd5d1">' + escapeHtmlServer_(item.patrimony || 'Sem nº patrimonial') + '</td>' +
        '<td style="padding:8px;border:1px solid #cbd5d1"><strong>' + escapeHtmlServer_(item.equipment) + '</strong>' + (details ? '<br><span style="color:#667570;font-size:10px">' + escapeHtmlServer_(details) + '</span>' : '') + '</td>' +
        '<td style="padding:8px;border:1px solid #cbd5d1">' + escapeHtmlServer_(item.quantity + ' ' + (item.unit || 'UN')) + '</td>' +
        '<td style="padding:8px;border:1px solid #cbd5d1">' + escapeHtmlServer_(item.deliveryCondition || '—') + '</td>' +
        '<td style="padding:8px;border:1px solid #cbd5d1">' + escapeHtmlServer_(observations || '—') + '</td></tr>';
    }).join('');
    const plainItems = (term.items || []).map(function (item) {
      const details = [item.category, item.subcategory, [item.brand, item.model].filter(Boolean).join(' '), item.serial ? 'Série ' + item.serial : ''].filter(Boolean).join(' · ');
      const observations = [item.assetNotes ? 'Cadastro: ' + item.assetNotes : '', item.notes || ''].filter(Boolean).join(' | ');
      return '- ' + (item.patrimony || 'Sem nº patrimonial') + ' — ' + item.equipment + (details ? ' — ' + details : '') + ' — ' + item.quantity + ' ' + (item.unit || 'UN') + ' — Estado: ' + (item.deliveryCondition || '—') + (observations ? ' — Obs.: ' + observations : '');
    }).join('\n');
    const plain = [normalizeUpper_(termLabel) + ' ' + term.number, institution, '', 'Recebedor: ' + term.receiver + ' — MASP ' + term.receiverMasp, 'Intendente: ' + term.quartermaster + ' — MASP ' + term.quartermasterMasp, 'Emissão: ' + formatDateTime_(term.issuedAt), 'Devolução: ' + dueLabel, '', plainItems, '', 'Código de verificação: ' + term.verificationCode].join('\n');
    const html = '<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;color:#172033">' +
      '<div style="display:flex;align-items:center;gap:16px;padding:20px 24px;color:#fff;background:#0c2948">' + logoHtml + '<div><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase">Documento institucional · ' + escapeHtmlServer_(term.type === 'ADMINISTRATIVA' ? 'Cautela administrativa' : 'Cautela comum') + '</div><h2 style="margin:5px 0 0">' + escapeHtmlServer_(termLabel) + ' ' + escapeHtmlServer_(term.number) + '</h2></div></div>' +
      '<div style="padding:22px;border:1px solid #d6dfdc;border-top:0"><p><strong>' + escapeHtmlServer_(institution) + '</strong><br><span style="color:#667570">' + escapeHtmlServer_(systemName) + '</span></p>' +
      '<div style="padding:13px;border-left:4px solid #c99b3b;background:#f7faf9"><strong>GCM recebedor: ' + escapeHtmlServer_(term.receiver) + '</strong><br>MASP ' + escapeHtmlServer_(term.receiverMasp) + '</div>' +
      '<p><strong>Intendente:</strong> ' + escapeHtmlServer_(term.quartermaster) + ' — MASP ' + escapeHtmlServer_(term.quartermasterMasp) + '<br><strong>Emissão:</strong> ' + escapeHtmlServer_(formatDateTime_(term.issuedAt)) + '<br><strong>Devolução:</strong> ' + escapeHtmlServer_(dueLabel) + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:#fff;background:#0c2948"><th style="padding:8px;text-align:left">Nº patrimonial</th><th style="padding:8px;text-align:left">Equipamento e identificação</th><th style="padding:8px;text-align:left">Quantidade</th><th style="padding:8px;text-align:left">Estado</th><th style="padding:8px;text-align:left">Observações</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p style="margin-top:20px">Este termo confirma o recebimento e a responsabilidade pela guarda dos itens relacionados.</p><p style="font-family:monospace;text-align:center">Verificação: <strong>' + escapeHtmlServer_(term.verificationCode) + '</strong></p></div></div>';
    const mailOptions = { to: email, subject: institution + ' — ' + termLabel + ' ' + term.number, body: plain, htmlBody: html, name: systemName };
    if (logoBlob) mailOptions.inlineImages = { brasao: logoBlob };
    MailApp.sendEmail(mailOptions);
    patrimonioAuditar_(context, 'CAUTELA_EMAIL', 'SUCESSO', '', term.number, null, { email: email }, metadata || {});
    return { sent: true, address: email };
  } catch (error) {
    patrimonioAuditar_(context, 'CAUTELA_EMAIL', 'ERRO', error.message, term.number, null, null, metadata || {});
    return { sent: false, message: 'A cautela foi registrada, mas o e-mail não pôde ser enviado.' };
  }
}

function patrimonioEnviarTermoCautelaSolicitado_(context, payload) {
  requireFields_(payload, ['number']);
  const rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) {
    return String(row['Número da Cautela']) === String(payload.number);
  });
  if (!rows.length) throw appError_('CUSTODY_NOT_FOUND', 'Cautela não encontrada para envio do termo.');
  patrimonioExigirAcessoTipoCautela_(context, rows[0], 'CAUTELA_REALIZAR', 'patrimonio.realizar_cautela');
  const term = patrimonioMontarTermoCautela_(rows);
  const receiver = repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'MASP', rows[0]['Matrícula do Recebedor'], normalizeMasp_);
  term.receiverEmail = receiver ? receiver.EMAIL || '' : '';
  term.issuedAt = toDate_(String(term.issuedDate || '') + 'T' + String(term.issuedTime || '00:00:00'), true) || term.issuedDate;
  return patrimonioEnviarTermoCautelaEmail_(context, term, payload.metadata || {});
}

function patrimonioCautelasPorRecebedor_(context, payload) {
  const canRegular = patrimonioTemPermissao_(context, 'DESCAUTELA_REALIZAR', 'patrimonio.receber_devolucao');
  const canAdministrative = patrimonioPodeGerenciarCautelaAdministrativa_(context);
  if (!canRegular && !canAdministrative) throw appError_('FORBIDDEN', 'Você não possui permissão para registrar descautelamentos.');
  requireFields_(payload, ['receiverMasp']);
  const masp = normalizeMasp_(payload.receiverMasp);
  const rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) {
    if (!row.ID || normalizeMasp_(row['Matrícula do Recebedor']) !== masp || ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(row.Status)) < 0) return false;
    return patrimonioTipoCautela_(row) === 'ADMINISTRATIVA' ? canAdministrative : canRegular;
  }).sort(function (a, b) {
    return String(b['Data da Cautela'] + ' ' + b['Hora da Cautela']).localeCompare(String(a['Data da Cautela'] + ' ' + a['Hora da Cautela']));
  });
  return {
    receiver: rows.length ? rows[0]['GCM Recebedor'] : '',
    receiverMasp: formatMasp_(masp),
    items: rows.map(patrimonioCustodyClient_)
  };
}

function patrimonioRegistrarDevolucao_(context, payload) {
  const canRegular = patrimonioTemPermissao_(context, 'DESCAUTELA_REALIZAR', 'patrimonio.receber_devolucao');
  const canAdministrative = patrimonioPodeGerenciarCautelaAdministrativa_(context);
  if (!canRegular && !canAdministrative) throw appError_('FORBIDDEN', 'Você não possui permissão para registrar descautelamentos.');
  requireFields_(payload, ['quartermasterMasp', 'quartermasterPassword']);
  if (normalizeMasp_(payload.quartermasterMasp) !== normalizeMasp_(context.user.MASP)) throw appError_('QUARTERMASTER_MISMATCH', 'O MASP do intendente deve ser o mesmo usuário que está logado.');
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw appError_('RETURN_ITEMS_REQUIRED', 'Selecione pelo menos um equipamento para devolver.');
  if (items.length > 100) throw appError_('RETURN_ITEMS_LIMIT', 'Selecione no máximo 100 itens por devolução.');
  const ids = items.map(function (item) { return String(item.custodyId || ''); });
  if (ids.some(function (id, index) { return !id || ids.indexOf(id) !== index; })) throw appError_('DUPLICATE_RETURN_ITEM', 'Há cautelas repetidas ou inválidas na devolução.');
  const metadata = payload.metadata || {};
  return withScriptLock_(function () {
    const quartermaster = patrimonioAutenticarUsuario_(context, payload.quartermasterMasp, payload.quartermasterPassword, 'DESCAUTELA_INTENDENTE', metadata);
    const receiverMasps = [];
    items.forEach(function (item) {
      requireFields_(item, ['custodyId', 'condition', 'result']);
      const custody = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', 'ID', item.custodyId);
      if (!custody || ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(custody.Status)) < 0) throw appError_('CUSTODY_NOT_OPEN', 'Uma das cautelas selecionadas não está mais ativa.');
      if (patrimonioTipoCautela_(custody) === 'ADMINISTRATIVA' ? !canAdministrative : !canRegular) throw appError_('FORBIDDEN', 'Você não possui permissão para descautelar um dos itens selecionados.');
      const receiverMasp = normalizeMasp_(custody['Matrícula do Recebedor']);
      if (receiverMasps.indexOf(receiverMasp) < 0) receiverMasps.push(receiverMasp);
      const asset = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', custody['ID do Patrimônio']);
      if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio relacionado não encontrado: ' + custody.Equipamento + '.');
      const pending = Number(custody.Quantidade || 0) - patrimonioQuantidadeDevolvida_(custody.ID);
      const quantity = asset['Tipo de Controle'] === 'INDIVIDUAL' ? 1 : Number(item.quantity || pending);
      if (!Number.isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity || quantity > pending) throw appError_('INVALID_RETURN_QUANTITY', 'Quantidade inválida para ' + asset.Nome + '. Saldo: ' + pending + '.');
      validateStatus_(item.result, ['DISPONIVEL', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'INDISPONIVEL']);
    });
    if (receiverMasps.length > 1) throw appError_('MULTIPLE_RETURN_RECEIVERS', 'Todos os itens do descautelamento devem pertencer ao mesmo GCM.');
    const stamp = patrimonioDataHora_();
    const results = items.map(function (item) {
      return patrimonioRegistrarDevolucaoItem_(context, item, quartermaster, stamp, payload.notes, metadata);
    });
    patrimonioAuditar_(context, 'DESCAUTELA_LOTE', 'SUCESSO', '', '', null, {
      quartermaster: quartermaster.MASP,
      custodies: results.map(function (item) { return item.custodyNumber; })
    }, metadata);
    return { count: results.length, items: results, receivedBy: quartermaster.NOME, receivedByMasp: formatMasp_(quartermaster.MASP), returnedAt: stamp.value };
  });
}

function patrimonioRegistrarDevolucaoItem_(context, input, quartermaster, stamp, generalNotes, metadata) {
  requireFields_(input, ['custodyId', 'condition', 'result']);
  const custody = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', 'ID', input.custodyId);
  if (!custody || ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(custody.Status)) < 0) throw appError_('CUSTODY_NOT_OPEN', 'Uma das cautelas selecionadas não está mais ativa.');
  patrimonioExigirAcessoTipoCautela_(context, custody, 'DESCAUTELA_REALIZAR', 'patrimonio.receber_devolucao');
  const asset = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', custody['ID do Patrimônio']);
  if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio relacionado não encontrado: ' + custody.Equipamento + '.');
  const alreadyReturned = patrimonioQuantidadeDevolvida_(custody.ID);
  const pending = Number(custody.Quantidade || 0) - alreadyReturned;
  const quantityValue = asset['Tipo de Controle'] === 'INDIVIDUAL' ? 1 : Number(input.quantity || pending);
  if (!Number.isFinite(quantityValue) || quantityValue < 1 || Math.floor(quantityValue) !== quantityValue || quantityValue > pending) {
    throw appError_('INVALID_RETURN_QUANTITY', 'Quantidade inválida para ' + asset.Nome + '. Saldo: ' + pending + '.');
  }
  const quantity = quantityValue;
  const result = validateStatus_(input.result, ['DISPONIVEL', 'EM_MANUTENCAO', 'DANIFICADO', 'EXTRAVIADO', 'INDISPONIVEL']);
  const receipt = repositoryAppend_(PATRIMONIO_CONFIG.DATABASE, 'DEVOLUCOES', {
    ID: uuid_(), 'Número da Cautela': custody['Número da Cautela'], 'ID da Cautela': custody.ID,
    'ID do Patrimônio': asset.ID, Equipamento: asset.Nome, 'Quantidade Devolvida': quantity,
    'GCM que Devolveu': custody['GCM Recebedor'], Matrícula: custody['Matrícula do Recebedor'],
    'Intendente que Recebeu': quartermaster.NOME, 'Matrícula do Intendente': quartermaster.MASP,
    Data: stamp.date, Hora: stamp.time, 'Estado na Devolução': normalizeUpper_(input.condition),
    Avaria: normalizeText_(input.damage || (result === 'DANIFICADO' ? 'SIM' : 'NAO')),
    Observações: normalizeText_([input.missingAccessories, input.notes, generalNotes].filter(Boolean).join(' | ')),
    Foto: '', Resultado: result, Sessão: context.session.TOKEN
  });
  const totalReturned = alreadyReturned + quantity;
  const custodyStatus = totalReturned >= Number(custody.Quantidade || 0) ? 'DEVOLVIDA' : 'PARCIAL';
  repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', custody._row, { Status: custodyStatus });
  const nextCautioned = Math.max(0, Number(asset['Quantidade Cautelada'] || 0) - quantity);
  const reusable = result === 'DISPONIVEL' ? quantity : 0;
  const nextAvailable = Math.min(Number(asset['Quantidade Total'] || 0), Number(asset['Quantidade Disponível'] || 0) + reusable);
  let nextStatus = result;
  if (nextCautioned > 0) nextStatus = nextAvailable > 0 ? 'PARCIALMENTE_CAUTELADO' : 'CAUTELADO';
  else if (result === 'DISPONIVEL' && nextAvailable <= 0) nextStatus = 'INDISPONIVEL';
  repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', asset._row, {
    'Quantidade Disponível': nextAvailable, 'Quantidade Cautelada': nextCautioned, Situação: nextStatus,
    'Estado de Conservação': normalizeUpper_(input.condition), Localização: normalizeText_(input.location || asset.Setor),
    'Atualizado em': stamp.value, 'Atualizado por': quartermaster.ID_USUARIO
  });
  patrimonioHistorico_(context, 'DEVOLUCAO_' + (custodyStatus === 'PARCIAL' ? 'PARCIAL' : 'TOTAL'), asset, quantity, custody['GCM Recebedor'], custody['Matrícula do Recebedor'], asset.Situação, nextStatus, input.notes || generalNotes, custody['Número da Cautela']);
  patrimonioAuditar_(context, 'DESCAUTELA_REALIZAR', 'SUCESSO', '', receipt.ID, { custodyId: custody.ID, pending: pending }, { quantity: quantity, result: result, status: custodyStatus, quartermaster: quartermaster.MASP }, metadata);
  return { id: receipt.ID, custodyNumber: custody['Número da Cautela'], custodyStatus: custodyStatus, equipment: asset.Nome, quantity: quantity, pending: Math.max(0, pending - quantity), result: result };
}

function patrimonioProrrogarCautela_(context, payload) {
  patrimonioExigirPermissao_(context, 'CAUTELA_PRORROGAR', 'patrimonio.editar');
  requireFields_(payload, ['id', 'dueDate', 'justification']);
  const custody = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', 'ID', payload.id);
  if (!custody || ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(custody.Status)) < 0) throw appError_('CUSTODY_NOT_OPEN', 'Cautela ativa não encontrada.');
  if (patrimonioTipoCautela_(custody) === 'ADMINISTRATIVA') patrimonioExigirPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
  const before = custody['Previsão de Devolução'];
  const saved = repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', custody._row, { 'Previsão de Devolução': toDate_(payload.dueDate), Observações: [custody.Observações, 'Prorrogação: ' + payload.justification].filter(Boolean).join(' | ') });
  patrimonioAuditar_(context, 'CAUTELA_PRORROGAR', 'SUCESSO', payload.justification, custody.ID, { dueDate: before }, { dueDate: saved['Previsão de Devolução'] }, payload.metadata || {});
  return patrimonioCustodyClient_(saved);
}

function patrimonioCancelarCautela_(context, payload) {
  patrimonioExigirPermissao_(context, 'CAUTELA_CANCELAR', 'patrimonio.excluir');
  requireFields_(payload, ['id', 'justification']);
  return withScriptLock_(function () {
    const custody = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', 'ID', payload.id);
    if (!custody || normalizeUpper_(custody.Status) !== 'ATIVA' || patrimonioQuantidadeDevolvida_(custody.ID) > 0) throw appError_('CUSTODY_CANNOT_CANCEL', 'Somente cautela ativa sem devolução pode ser cancelada.');
    if (patrimonioTipoCautela_(custody) === 'ADMINISTRATIVA') patrimonioExigirPermissao_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR');
    const asset = repositoryFindOne_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', 'ID', custody['ID do Patrimônio']);
    repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS', custody._row, { Status: 'CANCELADA', Observações: [custody.Observações, 'Cancelamento: ' + payload.justification].filter(Boolean).join(' | ') });
    if (asset) {
      const quantity = Number(custody.Quantidade || 0);
      const available = Number(asset['Quantidade Disponível'] || 0) + quantity;
      const cautioned = Math.max(0, Number(asset['Quantidade Cautelada'] || 0) - quantity);
      const nextStatus = cautioned > 0 ? (available > 0 ? 'PARCIALMENTE_CAUTELADO' : 'CAUTELADO') : 'DISPONIVEL';
      repositoryUpdate_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS', asset._row, { 'Quantidade Disponível': available, 'Quantidade Cautelada': cautioned, Situação: nextStatus, 'Atualizado em': now_(), 'Atualizado por': context.user.ID_USUARIO });
      patrimonioHistorico_(context, 'CAUTELA_CANCELADA', asset, quantity, custody['GCM Recebedor'], custody['Matrícula do Recebedor'], asset.Situação, nextStatus, payload.justification, custody['Número da Cautela']);
    }
    patrimonioAuditar_(context, 'CAUTELA_CANCELAR', 'SUCESSO', payload.justification, custody.ID, { status: custody.Status }, { status: 'CANCELADA' }, payload.metadata || {});
    return { id: custody.ID, status: 'CANCELADA' };
  });
}

function patrimonioTermoCautela_(context, payload) {
  if (!patrimonioTemPermissao_(context, 'CAUTELA_VISUALIZAR_ATIVAS', 'patrimonio.visualizar') && !patrimonioTemPermissao_(context, 'AUDITORIA_VISUALIZAR', 'auditoria.visualizar') && !patrimonioPodeGerenciarCautelaAdministrativa_(context)) {
    throw appError_('FORBIDDEN', 'Você não possui permissão para visualizar termos de cautela.');
  }
  requireFields_(payload, ['number']);
  const rows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) { return String(row['Número da Cautela']) === String(payload.number); });
  if (!rows.length) throw appError_('CUSTODY_NOT_FOUND', 'Cautela não encontrada.');
  if (patrimonioTipoCautela_(rows[0]) === 'ADMINISTRATIVA' && !patrimonioPodeGerenciarCautelaAdministrativa_(context) && !patrimonioTemPermissao_(context, 'AUDITORIA_VISUALIZAR', 'auditoria.visualizar')) throw appError_('FORBIDDEN', 'Você não possui permissão para visualizar cautelas administrativas.');
  return patrimonioMontarTermoCautela_(rows);
}

function patrimonioIndexarPatrimoniosTermo_() {
  const assetsById = {};
  repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'PATRIMONIOS').forEach(function (asset) {
    if (asset.ID) assetsById[String(asset.ID)] = asset;
  });
  return assetsById;
}

function patrimonioMontarTermoCautela_(rows, assetsIndex) {
  const first = rows[0];
  const assetsById = assetsIndex || patrimonioIndexarPatrimoniosTermo_();
  return {
    number: first['Número da Cautela'], type: patrimonioTipoCautela_(first), receiver: first['GCM Recebedor'], receiverMasp: formatMasp_(first['Matrícula do Recebedor']),
    quartermaster: first.Intendente, quartermasterMasp: formatMasp_(first['Matrícula do Intendente']), issuedDate: first['Data da Cautela'],
    issuedTime: first['Hora da Cautela'], dueDate: first['Previsão de Devolução'], indefinite: normalizeUpper_(first['Previsão de Devolução']) === 'INDETERMINADO', sector: first.Setor,
    status: rows.every(function (row) { return normalizeUpper_(row.Status) === 'DEVOLVIDA'; }) ? 'DEVOLVIDA' : rows.some(function (row) { return normalizeUpper_(row.Status) === 'PARCIAL'; }) ? 'PARCIAL' : first.Status,
    items: rows.map(function (row) {
      const asset = assetsById[String(row['ID do Patrimônio'])] || {};
      return {
        id: row.ID, assetId: row['ID do Patrimônio'], patrimony: asset.Patrimônio || row.Patrimônio || '', equipment: row.Equipamento,
        description: asset.Descrição || '', category: row.Categoria, subcategory: asset.Subcategoria || '', brand: asset.Marca || '',
        model: asset.Modelo || '', serial: asset['Número de Série'] || '', quantity: Number(row.Quantidade || 0), unit: row.Unidade || 'UN',
        deliveryCondition: row['Estado na Entrega'], assetNotes: asset.Observações || '', notes: row.Observações, status: row.Status
      };
    }), verificationCode: sha256_(first['Número da Cautela'] + ':' + first['Grupo da Cautela']).slice(0, 12).toUpperCase()
  };
}

function patrimonioTermosFiltrarAgrupar_(query) {
  const allRows = repositoryReadAll_(PATRIMONIO_CONFIG.DATABASE, 'CAUTELAS').filter(function (row) { return row.ID && row['Número da Cautela']; });
  const assetsById = patrimonioIndexarPatrimoniosTermo_();
  const matched = searchRows_(allRows, query, ['Número da Cautela', 'Tipo de Cautela', 'Patrimônio', 'Equipamento', 'GCM Recebedor', 'Matrícula do Recebedor', 'Intendente', 'Matrícula do Intendente', 'Setor', 'Status']);
  const matchedNumbers = matched.map(function (row) { return String(row['Número da Cautela']); });
  const rows = query ? allRows.filter(function (row) { return matchedNumbers.indexOf(String(row['Número da Cautela'])) >= 0; }) : allRows;
  const groups = {};
  rows.forEach(function (row) {
    const number = String(row['Número da Cautela']);
    if (!groups[number]) groups[number] = [];
    groups[number].push(row);
  });
  return Object.keys(groups).map(function (number) { return patrimonioMontarTermoCautela_(groups[number], assetsById); }).sort(function (a, b) {
    return String(b.issuedDate + ' ' + b.issuedTime).localeCompare(String(a.issuedDate + ' ' + a.issuedTime));
  });
}

function patrimonioTermosListar_(context, payload) {
  patrimonioExigirPermissao_(context, 'AUDITORIA_VISUALIZAR', 'auditoria.visualizar');
  const options = payload || {};
  const terms = patrimonioTermosFiltrarAgrupar_(options.query);
  const page = paginate_(terms, options);
  page.items = page.items.map(function (term) {
    return { number: term.number, type: term.type, receiver: term.receiver, receiverMasp: term.receiverMasp, quartermaster: term.quartermaster, issuedDate: term.issuedDate, issuedTime: term.issuedTime, dueDate: term.dueDate, indefinite: term.indefinite, status: term.status, itemCount: term.items.length, itemsSummary: term.items.map(function (item) { return item.equipment; }).join(', ') };
  });
  return page;
}

function patrimonioTermosImpressao_(context, payload) {
  patrimonioExigirPermissao_(context, 'AUDITORIA_VISUALIZAR', 'auditoria.visualizar');
  const limit = 200;
  const terms = patrimonioTermosFiltrarAgrupar_(payload && payload.query);
  return { terms: terms.slice(0, limit), total: terms.length, limited: terms.length > limit, limit: limit, generatedAt: now_(), generatedBy: context.user.NOME };
}
