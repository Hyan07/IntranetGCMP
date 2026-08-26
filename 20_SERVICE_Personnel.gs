/** Cadastro de pessoas e ficha integrada. */

function sanitizePersonForContext_(context, person) {
  const copy = Object.assign({}, person);
  delete copy._row;
  if (!hasPermission_(context, 'pessoal.visualizar_dados_sensiveis')) {
    ['CPF', 'RG', 'ENDERECO', 'OBSERVACOES', 'DATA_NASCIMENTO', 'NOME_PAI', 'NOME_MAE',
      'PAIS_NASCIMENTO', 'MUNICIPIO_NASCIMENTO', 'UF_NASCIMENTO', 'ESTADO_CIVIL',
      'RG_DATA_EMISSAO', 'RG_ORGAO_EXPEDIDOR', 'RG_UF', 'TITULO_ELEITOR',
      'MUNICIPIO_ENDERECO', 'UF_ENDERECO', 'CEP', 'BAIRRO', 'MASP_ANTIGO', 'DATA_BAIXA',
      'TIPO_SANGUINEO', 'PORTE_ARMA_NUMERO', 'ARMA_INSTITUCIONAL_NUMERO',
      'PORTE_ARMA_VALIDADE', 'CPF_PENDENTE_CONFERENCIA'].forEach(function (field) { copy[field] = copy[field] ? 'RESTRITO' : ''; });
  }
  copy.MASP_FORMATADO = formatMasp_(copy.MASP);
  return copy;
}

function listPersonnel_(context, payload) {
  requirePermission_(context, 'pessoal.visualizar');
  const options = payload || {};
  const rows = filterPersonnel_(options);
  const page = paginate_(rows, options);
  page.items = page.items.map(function (person) { return sanitizePersonForContext_(context, person); });
  return page;
}

function filterPersonnel_(options) {
  options = options || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS');
  rows = searchRows_(rows, options.query, ['NOME_COMPLETO', 'NOME_SOCIAL', 'MASP', 'MASP_ANTIGO', 'CPF', 'CARGO', 'FUNCAO', 'SETOR', 'EQUIPE']);
  if (options.status) rows = rows.filter(function (p) { return p.STATUS === normalizeUpper_(options.status); });
  if (options.sector) rows = rows.filter(function (p) { return p.SETOR === options.sector; });
  rows.sort(function (a, b) { return String(a.NOME_COMPLETO).localeCompare(String(b.NOME_COMPLETO), 'pt-BR'); });
  return rows;
}

function exportPersonnel_(context, payload) {
  requirePermission_(context, 'pessoal.visualizar');
  payload = payload || {};
  const definitions = [
    ['NOME_COMPLETO', 'Nome completo'], ['NOME_SOCIAL', 'Nome social'], ['MASP', 'MASP'], ['MASP_ANTIGO', 'MASP anterior'],
    ['CPF', 'CPF'], ['RG', 'RG'], ['RG_DATA_EMISSAO', 'Emissão do RG'], ['RG_ORGAO_EXPEDIDOR', 'Órgão expedidor'], ['RG_UF', 'UF do RG'],
    ['DATA_NASCIMENTO', 'Data de nascimento'], ['SEXO', 'Sexo'], ['ESTADO_CIVIL', 'Estado civil'], ['TITULO_ELEITOR', 'Título de eleitor'],
    ['NOME_PAI', 'Nome do pai'], ['NOME_MAE', 'Nome da mãe'], ['PAIS_NASCIMENTO', 'País de nascimento'],
    ['MUNICIPIO_NASCIMENTO', 'Município de nascimento'], ['UF_NASCIMENTO', 'UF de nascimento'],
    ['TELEFONE', 'Telefone'], ['EMAIL', 'E-mail'], ['ENDERECO', 'Endereço'], ['BAIRRO', 'Bairro'],
    ['MUNICIPIO_ENDERECO', 'Município'], ['UF_ENDERECO', 'UF'], ['CEP', 'CEP'],
    ['CARGO', 'Cargo'], ['FUNCAO', 'Função'], ['SETOR', 'Setor'], ['EQUIPE', 'Equipe'], ['DATA_ADMISSAO', 'Data de admissão'],
    ['TIPO_VINCULO', 'Tipo de vínculo'], ['STATUS', 'Situação'], ['DATA_BAIXA', 'Data de baixa'], ['TIPO_SANGUINEO', 'Tipo sanguíneo'],
    ['PORTE_ARMA_NUMERO', 'Número do porte de arma'], ['PORTE_ARMA_VALIDADE', 'Validade do porte de arma'],
    ['ARMA_INSTITUCIONAL_NUMERO', 'Arma institucional'], ['CPF_PENDENTE_CONFERENCIA', 'CPF pendente de conferência'],
    ['OBSERVACOES', 'Observações'], ['CRIADO_EM', 'Criado em'], ['ATUALIZADO_EM', 'Atualizado em']
  ];
  const allowed = definitions.map(function (definition) { return definition[0]; });
  let selected = Array.isArray(payload.fields) ? payload.fields : (payload.fields ? [payload.fields] : ['NOME_COMPLETO', 'NOME_SOCIAL', 'MASP', 'CARGO', 'FUNCAO', 'SETOR', 'EQUIPE', 'TIPO_VINCULO', 'STATUS']);
  selected = selected.map(String).filter(function (field, index, values) { return allowed.indexOf(field) >= 0 && values.indexOf(field) === index; });
  if (!selected.length) throw appError_('EXPORT_FIELDS_REQUIRED', 'Selecione pelo menos um dado para exportar.');
  const labels = {};
  definitions.forEach(function (definition) { labels[definition[0]] = definition[1]; });
  const rows = filterPersonnel_(payload).map(function (person) {
    const item = sanitizePersonForContext_(context, person);
    const row = {};
    selected.forEach(function (field) {
      row[labels[field]] = field === 'MASP' ? (item.MASP_FORMATADO || formatMasp_(item.MASP)) : (field === 'MASP_ANTIGO' && item[field] ? formatMasp_(item[field]) : (item[field] || ''));
    });
    return row;
  });
  audit_(context, 'pessoal', 'EXPORTAR', '', null, { quantidade: rows.length, filtros: payload, campos: selected }, 'SUCESSO');
  return { filename: 'pessoal_gcmp_' + Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd_HH-mm') + '.csv', rows: rows };
}

function preparePersonnelExport_(context, payload) {
  const exported = exportPersonnel_(context, payload || {});
  if (!exported.rows.length) throw appError_('EXPORT_EMPTY', 'Nenhuma pessoa corresponde aos filtros aplicados.');
  const headers = Object.keys(exported.rows[0]);
  const csv = '\ufeff' + [headers].concat(exported.rows.map(function (row) {
    return headers.map(function (header) { return row[header] === null || row[header] === undefined ? '' : row[header]; });
  })).map(function (line) {
    return line.map(function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; }).join(';');
  }).join('\r\n');
  const folder = getOrCreateChildFolder_(getRootFolder_(), 'TEMPORARIOS');
  const file = folder.createFile(Utilities.newBlob(csv, 'text/csv', exported.filename));
  const token = randomToken_(32);
  CacheService.getScriptCache().put('personnel-export:' + token, JSON.stringify({
    fileId: file.getId(), filename: exported.filename, userId: context.user.ID_USUARIO
  }), 300);
  const serviceUrl = ScriptApp.getService().getUrl();
  if (!serviceUrl) throw appError_('EXPORT_URL_UNAVAILABLE', 'Publique uma nova versão do aplicativo da Web para habilitar a exportação.');
  return { url: serviceUrl + '?downloadPersonnel=' + encodeURIComponent(token), filename: exported.filename, count: exported.rows.length, expiresInSeconds: 300 };
}

function servePreparedPersonnelExport_(token) {
  const normalized = normalizeText_(token);
  const cache = CacheService.getScriptCache();
  const raw = normalized ? cache.get('personnel-export:' + normalized) : '';
  if (!raw) return ContentService.createTextOutput('O link de exportação expirou ou já foi utilizado.').setMimeType(ContentService.MimeType.TEXT);
  cache.remove('personnel-export:' + normalized);
  try {
    const data = JSON.parse(raw);
    const file = DriveApp.getFileById(data.fileId);
    const content = file.getBlob().getDataAsString('UTF-8');
    try { file.setTrashed(true); } catch (error) { console.warn('Não foi possível remover o CSV temporário de Pessoal: ' + error.message); }
    return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.CSV).downloadAsFile(data.filename || 'pessoal_gcmp.csv');
  } catch (error) {
    return ContentService.createTextOutput('Não foi possível gerar o arquivo de exportação.').setMimeType(ContentService.MimeType.TEXT);
  }
}

function savePerson_(context, payload) {
  const isEdit = Boolean(payload && payload.ID_PESSOA);
  requirePermission_(context, isEdit ? 'pessoal.editar' : 'pessoal.criar');
  requireFields_(payload, ['NOME_COMPLETO', 'TIPO_VINCULO', 'STATUS']);
  const current = isEdit ? repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', payload.ID_PESSOA) : null;
  if (isEdit && !current) throw appError_('PERSON_NOT_FOUND', 'Pessoa não encontrada.');
  const canHandleSensitive = hasPermission_(context, 'pessoal.visualizar_dados_sensiveis');
  const sensitiveText = function (field) {
    return isEdit && !canHandleSensitive ? current[field] : normalizeText_(payload[field]);
  };
  const sensitiveDate = function (field) {
    return isEdit && !canHandleSensitive ? current[field] : (payload[field] ? toDate_(payload[field]) : '');
  };
  const masp = payload.MASP ? validateMasp_(payload.MASP) : '';
  const cpf = isEdit && !canHandleSensitive ? current.CPF : (payload.CPF ? validateCpf_(payload.CPF, false) : '');
  if (masp) validateUnique_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'MASP', masp, 'ID_PESSOA', payload.ID_PESSOA, normalizeMasp_);
  if (cpf) validateUnique_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'CPF', cpf, 'ID_PESSOA', payload.ID_PESSOA, normalizeCpf_);
  const timestamp = now_();
  const record = {
    ID_PESSOA: isEdit ? current.ID_PESSOA : uuid_(),
    NOME_COMPLETO: normalizeText_(payload.NOME_COMPLETO),
    NOME_SOCIAL: normalizeText_(payload.NOME_SOCIAL),
    MASP: masp,
    CPF: cpf,
    RG: sensitiveText('RG'),
    DATA_NASCIMENTO: sensitiveDate('DATA_NASCIMENTO'),
    SEXO: normalizeText_(payload.SEXO),
    TELEFONE: normalizeText_(payload.TELEFONE),
    EMAIL: payload.EMAIL ? validateEmail_(payload.EMAIL, false) : '',
    ENDERECO: sensitiveText('ENDERECO'),
    CARGO: normalizeText_(payload.CARGO),
    FUNCAO: normalizeText_(payload.FUNCAO),
    SETOR: normalizeText_(payload.SETOR),
    EQUIPE: normalizeText_(payload.EQUIPE),
    DATA_ADMISSAO: payload.DATA_ADMISSAO ? toDate_(payload.DATA_ADMISSAO) : '',
    STATUS: validateStatus_(payload.STATUS, ['ATIVO', 'INATIVO', 'AFASTADO', 'DESLIGADO']),
    TIPO_VINCULO: normalizeText_(payload.TIPO_VINCULO),
    FOTO_URL: normalizeText_(payload.FOTO_URL),
    OBSERVACOES: sensitiveText('OBSERVACOES'),
    ID_USUARIO: Object.prototype.hasOwnProperty.call(payload, 'ID_USUARIO') ? normalizeText_(payload.ID_USUARIO) : (current ? current.ID_USUARIO : ''),
    NOME_PAI: sensitiveText('NOME_PAI'),
    NOME_MAE: sensitiveText('NOME_MAE'),
    PAIS_NASCIMENTO: sensitiveText('PAIS_NASCIMENTO'),
    MUNICIPIO_NASCIMENTO: sensitiveText('MUNICIPIO_NASCIMENTO'),
    UF_NASCIMENTO: sensitiveText('UF_NASCIMENTO'),
    ESTADO_CIVIL: sensitiveText('ESTADO_CIVIL'),
    RG_DATA_EMISSAO: sensitiveDate('RG_DATA_EMISSAO'),
    RG_ORGAO_EXPEDIDOR: sensitiveText('RG_ORGAO_EXPEDIDOR'),
    RG_UF: sensitiveText('RG_UF'),
    TITULO_ELEITOR: sensitiveText('TITULO_ELEITOR'),
    MUNICIPIO_ENDERECO: sensitiveText('MUNICIPIO_ENDERECO'),
    UF_ENDERECO: sensitiveText('UF_ENDERECO'),
    CEP: sensitiveText('CEP'),
    BAIRRO: sensitiveText('BAIRRO'),
    MASP_ANTIGO: sensitiveText('MASP_ANTIGO'),
    DATA_BAIXA: sensitiveDate('DATA_BAIXA'),
    TIPO_SANGUINEO: sensitiveText('TIPO_SANGUINEO'),
    PORTE_ARMA_NUMERO: sensitiveText('PORTE_ARMA_NUMERO'),
    ARMA_INSTITUCIONAL_NUMERO: sensitiveText('ARMA_INSTITUCIONAL_NUMERO'),
    PORTE_ARMA_VALIDADE: sensitiveDate('PORTE_ARMA_VALIDADE'),
    CPF_PENDENTE_CONFERENCIA: isEdit && !canHandleSensitive ? current.CPF_PENDENTE_CONFERENCIA : (normalizeBoolean_(payload.CPF_PENDENTE_CONFERENCIA) ? 'SIM' : 'NAO'),
    ATUALIZADO_EM: timestamp
  };
  if (!isEdit) {
    record.CRIADO_EM = timestamp;
    try { record.PASTA_DRIVE_ID = ensureEntityFolder_('PESSOA', record.ID_PESSOA + '_' + record.NOME_COMPLETO).getId(); } catch (error) { record.PASTA_DRIVE_ID = ''; }
  } else {
    record.PASTA_DRIVE_ID = current.PASTA_DRIVE_ID;
    record.CRIADO_EM = current.CRIADO_EM;
  }
  const saved = isEdit
    ? repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', current._row, record)
    : repositoryAppend_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', record);
  if (isEdit) {
    repositoryAppend_(APP_CONFIG.DATABASES.PERSONNEL, 'HISTORICO_FUNCIONAL', {
      ID: uuid_(), ID_PESSOA: saved.ID_PESSOA, DATA_HORA: timestamp, TIPO: 'ATUALIZACAO',
      VALOR_ANTERIOR: JSON.stringify(sanitizeForClient_(current)), VALOR_NOVO: JSON.stringify(sanitizeForClient_(saved)),
      ID_USUARIO: context.user.ID_USUARIO, OBSERVACOES: normalizeText_(payload.JUSTIFICATIVA)
    });
  }
  audit_(context, 'pessoal', isEdit ? 'EDITAR' : 'CADASTRAR', saved.ID_PESSOA, current, saved, 'SUCESSO');
  return sanitizePersonForContext_(context, saved);
}

function getPersonnelProfile_(context, payload) {
  requirePermission_(context, 'pessoal.visualizar');
  requireFields_(payload, ['id']);
  const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', payload.id);
  if (!person) throw appError_('PERSON_NOT_FOUND', 'Pessoa não encontrada.');
  const account = person.ID_USUARIO
    ? repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_USUARIO', person.ID_USUARIO)
    : repositoryFindOne_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', 'ID_PESSOA', person.ID_PESSOA);
  const profile = {
    person: sanitizePersonForContext_(context, person),
    account: account ? omitSensitiveUser_(account) : null,
    custodies: [], shifts: [], documents: [], rewards: [], history: [], updateRequests: []
  };
  const canViewCustodies = ['PATRIMONIO_VISUALIZAR', 'CAUTELA_VISUALIZAR_ATIVAS', 'HISTORICO_VISUALIZAR', 'AUDITORIA_VISUALIZAR', 'patrimonio.consultar_historico']
    .some(function (code) { return hasPermission_(context, code); });
  if (canViewCustodies) {
    const personMasp = normalizeMasp_(person.MASP);
    const canViewAdministrative = hasPermission_(context, 'CAUTELA_ADMINISTRATIVA_GERENCIAR') || hasPermission_(context, 'AUDITORIA_VISUALIZAR');
    const allCustodies = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS');
    const modern = allCustodies.filter(function (custody) {
      return custody.ID && normalizeMasp_(custody['Matrícula do Recebedor']) === personMasp &&
        (canViewAdministrative || patrimonioTipoCautela_(custody) !== 'ADMINISTRATIVA');
    }).map(patrimonioCustodyClient_);
    const legacy = allCustodies.filter(function (custody) {
      return !custody.ID && String(custody.ID_PESSOA) === String(person.ID_PESSOA);
    }).map(function (custody) {
      return {
        id: custody.ID_CAUTELA, number: custody.ID_CAUTELA, type: 'COMUM', patrimony: custody.NUMERO_PATRIMONIAL,
        equipment: custody.DESCRICAO_PATRIMONIO, quantity: 1, pending: normalizeUpper_(custody.STATUS) === 'ABERTA' ? 1 : 0,
        unit: 'UN', issuedDate: custody.ENTREGUE_EM, dueDate: custody.PREVISAO_DEVOLUCAO,
        deliveryCondition: custody.ESTADO_ENTREGA, status: normalizeUpper_(custody.STATUS) === 'ABERTA' ? 'ATIVA' : custody.STATUS
      };
    });
    profile.custodies = modern.concat(legacy).sort(function (a, b) {
      return new Date(b.issuedDate || 0).getTime() - new Date(a.issuedDate || 0).getTime();
    }).slice(0, 50);
  }
  const canViewFleet = ['FROTA_ACESSAR', 'FROTA_VISUALIZAR_HISTORICO', 'FROTA_VISUALIZAR_GERENCIAMENTO', 'viaturas.visualizar']
    .some(function (code) { return hasPermission_(context, code); });
  if (canViewFleet) {
    const legacyShifts = sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS', function (shift) {
      return String(shift.ID_PESSOA_RESPONSAVEL) === String(person.ID_PESSOA);
    }), 'INICIO_EM').map(function (shift) {
      return {
        id: shift.ID_TURNO, prefix: shift.PREFIXO, plate: shift.PLACA, startedAt: shift.INICIO_EM,
        endedAt: shift.FIM_EM, initialKm: shift.KM_INICIAL, finalKm: shift.KM_FINAL,
        distance: shift.KM_PERCORRIDO, status: shift.STATUS, notes: shift.OBSERVACOES
      };
    });
    let modernMovements = [];
    try {
      if (getScriptProperties_().getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY)) {
        const personMasp = normalizeMasp_(person.MASP);
        modernMovements = FrotaRepository_().readAll('MOVIMENTACOES_KM').filter(function (movement) {
          return normalizeMasp_(movement.CONDUTOR_MASP) === personMasp;
        }).map(function (movement) {
          return {
            id: movement.ID_MOVIMENTACAO, prefix: movement.PREFIXO, plate: movement.PLACA,
            startedAt: movement.DATA_HORA_ABERTURA, endedAt: movement.DATA_HORA_ENCERRAMENTO,
            initialKm: movement.KM_INICIAL_INFORMADO, finalKm: movement.KM_FINAL,
            distance: movement.KM_PERCORRIDO, status: movement.STATUS,
            notes: movement.OBSERVACAO_ENCERRAMENTO || movement.OBSERVACAO_SAIDA
          };
        });
      }
    } catch (error) {
      console.warn('Não foi possível carregar as movimentações modernas da Frota na ficha de Pessoal: ' + error.message);
    }
    profile.shifts = modernMovements.concat(legacyShifts).sort(function (a, b) {
      return new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime();
    }).slice(0, 50);
  }
  if (hasPermission_(context, 'pessoal.visualizar_documentos')) {
    profile.documents = sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.PERSONNEL, 'DOCUMENTOS_PESSOAS', function (document) {
      return String(document.ID_PESSOA) === String(person.ID_PESSOA);
    }), 'DATA_DOCUMENTO').slice(0, 50).map(function (document) {
      const copy = Object.assign({}, document); delete copy._row; return copy;
    });
  }
  if (hasPermission_(context, 'recompensas.visualizar')) {
    const related = repositoryFindMany_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDO_PESSOAS', function (p) { return String(p.ID_PESSOA) === String(person.ID_PESSOA); });
    const ids = related.map(function (r) { return r.ID_PEDIDO; });
    profile.rewards = repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS').filter(function (r) { return ids.indexOf(r.ID_PEDIDO) >= 0; }).slice(0, 50);
  }
  const canViewSensitive = hasPermission_(context, 'pessoal.visualizar_dados_sensiveis');
  profile.history = sortByDateDesc_(repositoryFindMany_(APP_CONFIG.DATABASES.PERSONNEL, 'HISTORICO_FUNCIONAL', function (entry) {
    return String(entry.ID_PESSOA) === String(person.ID_PESSOA);
  }), 'DATA_HORA').slice(0, 50).map(function (entry) {
    const copy = Object.assign({}, entry); delete copy._row;
    if (!canViewSensitive) { delete copy.VALOR_ANTERIOR; delete copy.VALOR_NOVO; }
    return copy;
  });
  if (account) {
    profile.updateRequests = profileUpdateRequestsSafe_(account.ID_USUARIO).slice(0, 20).map(profileUpdateRequestForClient_);
    if (!canViewSensitive && !hasPermission_(context, 'pessoal.editar')) {
      profile.updateRequests.forEach(function (request) { delete request.requestedData; delete request.previousData; });
    }
  }
  audit_(context, 'pessoal', 'VISUALIZAR_PERFIL', person.ID_PESSOA, null, null, 'SUCESSO');
  return profile;
}

function changePersonStatus_(context, payload) {
  requirePermission_(context, 'pessoal.excluir');
  requireFields_(payload, ['id', 'status']);
  const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', payload.id);
  if (!person) throw appError_('PERSON_NOT_FOUND', 'Pessoa não encontrada.');
  const status = validateStatus_(payload.status, ['ATIVO', 'INATIVO', 'AFASTADO', 'DESLIGADO']);
  const saved = repositoryUpdate_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', person._row, { STATUS: status, ATUALIZADO_EM: now_() });
  audit_(context, 'pessoal', 'ALTERAR_STATUS', person.ID_PESSOA, { STATUS: person.STATUS }, { STATUS: status }, 'SUCESSO', payload.justification || '');
  return sanitizePersonForContext_(context, saved);
}
