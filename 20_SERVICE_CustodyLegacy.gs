/** Entrega, devolução e histórico de cautelas. */

function issueCustody_(context, payload) {
  requirePermission_(context, 'patrimonio.realizar_cautela');
  requireFields_(payload, ['ID_PATRIMONIO', 'ID_PESSOA', 'ESTADO_ENTREGA', 'FINALIDADE']);
  return withScriptLock_(function () {
    const asset = repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'ID_PATRIMONIO', payload.ID_PATRIMONIO);
    if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio não encontrado.');
    if (asset.STATUS !== 'DISPONIVEL') throw appError_('ASSET_UNAVAILABLE', 'Este patrimônio não está disponível para cautela.');
    const open = repositoryFindMany_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', function (c) { return String(c.ID_PATRIMONIO) === String(asset.ID_PATRIMONIO) && c.STATUS === 'ABERTA'; });
    if (open.length) throw appError_('DUPLICATE_CUSTODY', 'Já existe uma cautela aberta para este patrimônio.');
    const person = repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', payload.ID_PESSOA);
    if (!person || person.STATUS !== 'ATIVO') throw appError_('PERSON_UNAVAILABLE', 'Selecione uma pessoa ativa.');
    const timestamp = now_();
    const custody = {
      ID_CAUTELA: uuid_(), ID_PATRIMONIO: asset.ID_PATRIMONIO, NUMERO_PATRIMONIAL: asset.NUMERO_PATRIMONIAL,
      DESCRICAO_PATRIMONIO: asset.DESCRICAO, ID_PESSOA: person.ID_PESSOA, NOME_PESSOA: person.NOME_COMPLETO,
      MASP: person.MASP, SETOR: normalizeText_(payload.SETOR || person.SETOR), ENTREGUE_EM: timestamp,
      PREVISAO_DEVOLUCAO: payload.PREVISAO_DEVOLUCAO ? toDate_(payload.PREVISAO_DEVOLUCAO) : '',
      ESTADO_ENTREGA: normalizeText_(payload.ESTADO_ENTREGA), ACESSORIOS_ENTREGUES: normalizeText_(payload.ACESSORIOS_ENTREGUES),
      FINALIDADE: normalizeText_(payload.FINALIDADE), ENTREGUE_POR_ID: context.user.ID_USUARIO, ENTREGUE_POR_NOME: context.user.NOME,
      TERMO_ARQUIVO_ID: normalizeText_(payload.TERMO_ARQUIVO_ID), CONFIRMACAO: normalizeBoolean_(payload.CONFIRMACAO) ? 'CONFIRMADO' : normalizeText_(payload.CONFIRMACAO || 'CONFIRMADO'),
      OBSERVACOES: normalizeText_(payload.OBSERVACOES), STATUS: 'ABERTA', DEVOLVIDO_EM: '', RECEBIDO_POR_ID: '', CRIADO_EM: timestamp
    };
    repositoryAppend_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', custody);
    repositoryAppend_(APP_CONFIG.DATABASES.ASSETS, 'ITENS_CAUTELA', {
      ID: uuid_(), ID_CAUTELA: custody.ID_CAUTELA, ID_PATRIMONIO: asset.ID_PATRIMONIO,
      QUANTIDADE: 1, ESTADO_ENTREGA: custody.ESTADO_ENTREGA, ACESSORIOS: custody.ACESSORIOS_ENTREGUES, OBSERVACOES: custody.OBSERVACOES
    });
    repositoryUpdate_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', asset._row, {
      STATUS: 'CAUTELADO', LOCALIZACAO_ATUAL: 'Com ' + person.NOME_COMPLETO, ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
    });
    audit_(context, 'patrimonio', 'CAUTELA', custody.ID_CAUTELA, null, custody, 'SUCESSO');
    return custody;
  });
}

function returnCustody_(context, payload) {
  requirePermission_(context, 'patrimonio.receber_devolucao');
  requireFields_(payload, ['ID_CAUTELA', 'ESTADO_RECEBIMENTO', 'STATUS_PATRIMONIO']);
  return withScriptLock_(function () {
    const custody = repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', 'ID_CAUTELA', payload.ID_CAUTELA);
    if (!custody || custody.STATUS !== 'ABERTA') throw appError_('CUSTODY_NOT_OPEN', 'Cautela aberta não encontrada.');
    const asset = repositoryFindOne_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', 'ID_PATRIMONIO', custody.ID_PATRIMONIO);
    if (!asset) throw appError_('ASSET_NOT_FOUND', 'Patrimônio relacionado não encontrado.');
    const nextStatus = validateStatus_(payload.STATUS_PATRIMONIO, ['DISPONIVEL', 'EM_MANUTENCAO', 'DANIFICADO', 'INDISPONIVEL']);
    const timestamp = now_();
    const receipt = {
      ID_DEVOLUCAO: uuid_(), ID_CAUTELA: custody.ID_CAUTELA, ID_PATRIMONIO: custody.ID_PATRIMONIO,
      ID_PESSOA: custody.ID_PESSOA, DEVOLVIDO_EM: timestamp, DEVOLVIDO_POR: normalizeText_(payload.DEVOLVIDO_POR || custody.NOME_PESSOA),
      RECEBIDO_POR_ID: context.user.ID_USUARIO, RECEBIDO_POR_NOME: context.user.NOME,
      ESTADO_RECEBIMENTO: normalizeText_(payload.ESTADO_RECEBIMENTO), ACESSORIOS_DEVOLVIDOS: normalizeText_(payload.ACESSORIOS_DEVOLVIDOS),
      POSSUI_AVARIA: normalizeBoolean_(payload.POSSUI_AVARIA), DESCRICAO_DANO: normalizeText_(payload.DESCRICAO_DANO),
      FOTOS_IDS: Array.isArray(payload.FOTOS_IDS) ? payload.FOTOS_IDS.join(',') : normalizeText_(payload.FOTOS_IDS),
      PROVIDENCIAS: normalizeText_(payload.PROVIDENCIAS), OBSERVACOES: normalizeText_(payload.OBSERVACOES),
      STATUS_PATRIMONIO: nextStatus, CRIADO_EM: timestamp
    };
    repositoryAppend_(APP_CONFIG.DATABASES.ASSETS, 'DEVOLUCOES', receipt);
    repositoryUpdate_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS', custody._row, {
      STATUS: 'DEVOLVIDA', DEVOLVIDO_EM: timestamp, RECEBIDO_POR_ID: context.user.ID_USUARIO
    });
    repositoryUpdate_(APP_CONFIG.DATABASES.ASSETS, 'PATRIMONIOS', asset._row, {
      STATUS: nextStatus, ESTADO_CONSERVACAO: receipt.ESTADO_RECEBIMENTO,
      LOCALIZACAO_ATUAL: normalizeText_(payload.LOCALIZACAO_ATUAL || asset.SETOR_RESPONSAVEL),
      ATUALIZADO_EM: timestamp, ATUALIZADO_POR: context.user.ID_USUARIO
    });
    audit_(context, 'patrimonio', 'DEVOLUCAO', custody.ID_CAUTELA, custody, receipt, 'SUCESSO');
    return receipt;
  });
}

function listOpenCustodies_(context, payload) {
  requirePermission_(context, 'patrimonio.visualizar');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS').filter(function (c) { return c.STATUS === 'ABERTA'; });
  rows = searchRows_(rows, options.query, ['NUMERO_PATRIMONIAL', 'DESCRICAO_PATRIMONIO', 'NOME_PESSOA', 'MASP', 'SETOR']);
  if (options.overdue) rows = rows.filter(function (c) { return c.PREVISAO_DEVOLUCAO && new Date(c.PREVISAO_DEVOLUCAO).getTime() < now_().getTime(); });
  return paginate_(sortByDateDesc_(rows, 'ENTREGUE_EM'), options);
}

function listCustodyHistory_(context, payload) {
  requirePermission_(context, 'patrimonio.consultar_historico');
  const options = payload || {};
  let rows = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS');
  rows = searchRows_(rows, options.query, ['NUMERO_PATRIMONIAL', 'DESCRICAO_PATRIMONIO', 'NOME_PESSOA', 'MASP', 'SETOR', 'ENTREGUE_POR_NOME']);
  if (options.personId) rows = rows.filter(function (c) { return String(c.ID_PESSOA) === String(options.personId); });
  if (options.assetId) rows = rows.filter(function (c) { return String(c.ID_PATRIMONIO) === String(options.assetId); });
  if (options.status) rows = rows.filter(function (c) { return c.STATUS === normalizeUpper_(options.status); });
  return paginate_(sortByDateDesc_(rows, 'ENTREGUE_EM'), options);
}
