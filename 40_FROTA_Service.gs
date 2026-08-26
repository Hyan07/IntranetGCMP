/** Integração do módulo com sessão, permissões, auditoria e histórico globais. */

function frotaExigirAcesso_(context, permission) {
  requirePermission_(context, 'FROTA_ACESSAR');
  if (Array.isArray(permission) && permission.length) {
    if (!permission.some(function (code) { return hasPermission_(context, code); })) {
      audit_(context, 'frota', 'ACESSO_NEGADO', '', null, null, 'NEGADO', '', 'Permissões aceitas: ' + permission.join(', '));
      throw appError_('FORBIDDEN', 'Você não possui permissão para acessar esta área da Frota.', { permissions: permission });
    }
  } else if (permission && permission !== 'FROTA_ACESSAR') {
    requirePermission_(context, permission);
  }
  return context;
}

function frotaUsuario_(context) {
  const user = context && context.user ? context.user : {};
  return {
    id: user.ID_USUARIO || '',
    masp: frotaMasp_(user.MASP),
    maspFormatado: formatMasp_(user.MASP),
    nome: frotaTexto_(user.NOME || user.NOME_COMPLETO || 'Usuário', 160)
  };
}

function frotaObterBootstrap_(context) {
  frotaExigirAcesso_(context);
  const permissions = (context.permissions || []).filter(function (code) { return String(code).indexOf('FROTA_') === 0; });
  const vehicles = FrotaRepository_().readAll('VIATURAS').filter(function (vehicle) { return frotaUpper_(vehicle.ATIVO || 'SIM') !== 'NAO'; });
  const movements = FrotaRepository_().readAll('MOVIMENTACOES_KM').filter(function (movement) { return frotaUpper_(movement.STATUS) === 'ABERTA'; });
  const defects = FrotaRepository_().readAll('DEFEITOS_VIATURAS').filter(function (defect) {
    return frotaUpper_(defect.ATIVO || 'SIM') !== 'NAO' && ['RESOLVIDO', 'CANCELADO'].indexOf(frotaUpper_(defect.STATUS_DEFEITO)) < 0;
  });
  return {
    versao: FROTA_CONFIG.VERSION,
    usuario: frotaUsuario_(context),
    agora: new Date(),
    permissoes: permissions,
    opcoes: {
      statusViatura: FROTA_CONFIG.STATUS_VIATURA,
      tiposOcorrencia: FROTA_CONFIG.TIPOS_OCORRENCIA,
      categoriasOcorrencia: FROTA_CONFIG.CATEGORIAS_OCORRENCIA,
      gravidades: FROTA_CONFIG.GRAVIDADES,
      posicoesPneus: frotaListaPropriedade_(FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS, FROTA_CONFIG.POSICOES_PNEUS),
      estadosPneus: FROTA_CONFIG.ESTADOS_PNEUS,
      categoriasArquivos: FROTA_CONFIG.CATEGORIAS_ARQUIVOS,
      maxUploadBytes: FROTA_CONFIG.MAX_UPLOAD_BYTES
    },
    resumo: {
      viaturas: vehicles.length,
      disponiveis: vehicles.filter(function (vehicle) { return frotaUpper_(vehicle.STATUS) === 'DISPONIVEL'; }).length,
      movimentacoesAbertas: movements.length,
      defeitosPendentes: defects.length
    }
  };
}

function frotaRegistrarHistorico_(context, data) {
  const user = frotaUsuario_(context);
  return FrotaRepository_().append('HISTORICO_FROTA', {
    ID_HISTORICO: Utilities.getUuid(),
    ID_VIATURA: data.ID_VIATURA || '',
    PREFIXO: data.PREFIXO || '',
    PLACA: data.PLACA || '',
    TIPO_ACAO: frotaUpper_(data.TIPO_ACAO || 'ATUALIZACAO'),
    CAMPO_ALTERADO: frotaTexto_(data.CAMPO_ALTERADO, 160),
    VALOR_ANTERIOR: frotaSerializar_(data.VALOR_ANTERIOR),
    VALOR_NOVO: frotaSerializar_(data.VALOR_NOVO),
    JUSTIFICATIVA: frotaTexto_(data.JUSTIFICATIVA, 2000),
    USUARIO_MASP: user.masp,
    USUARIO_NOME: user.nome,
    DATA_HORA: new Date()
  });
}

function frotaAuditar_(context, action, recordId, before, after, justification) {
  return audit_(context, 'frota', action, recordId || '', before, after, 'SUCESSO', justification || '');
}

function frotaObterViaturaObrigatoria_(id) {
  const vehicle = FrotaRepository_().findOne('VIATURAS', 'ID_VIATURA', frotaTexto_(id));
  if (!vehicle) throw appError_('FROTA_VIATURA_NAO_ENCONTRADA', 'Viatura não encontrada.');
  return vehicle;
}

function frotaTemMovimentacaoAberta_(vehicleId) {
  return FrotaRepository_().readAll('MOVIMENTACOES_KM').some(function (movement) {
    return String(movement.ID_VIATURA) === String(vehicleId) && frotaUpper_(movement.STATUS) === 'ABERTA';
  });
}

function frotaConfiguracaoObter_(context) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_GERENCIAMENTO');
  const properties = PropertiesService.getScriptProperties();
  return {
    REVISAO_KM: Number(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.REVISAO_KM) || FROTA_CONFIG.DEFAULT_ALERTS.REVISAO_KM),
    OLEO_KM: Number(properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.OLEO_KM) || FROTA_CONFIG.DEFAULT_ALERTS.OLEO_KM),
    SEGURO_DIAS: properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.SEGURO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.SEGURO_DIAS,
    LICENCIAMENTO_DIAS: properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.LICENCIAMENTO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.LICENCIAMENTO_DIAS,
    MANUTENCAO_DIAS: properties.getProperty(FROTA_CONFIG.PROPERTY_KEYS.MANUTENCAO_DIAS) || FROTA_CONFIG.DEFAULT_ALERTS.MANUTENCAO_DIAS,
    POSICOES_PNEUS: frotaListaPropriedade_(FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS, FROTA_CONFIG.POSICOES_PNEUS)
  };
}

function frotaConfiguracaoSalvar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_GERENCIAMENTO');
  frotaExigirAcesso_(context, 'FROTA_ALTERAR_STATUS');
  const input = payload || {};
  const before = frotaConfiguracaoObter_(context);
  const normalizeDays = function (value, label) {
    const items = String(value || '').split(',').map(function (item) { return Number(item.trim()); })
      .filter(function (item) { return Number.isFinite(item) && item >= 0; });
    if (!items.length) throw appError_('FROTA_CONFIGURACAO_INVALIDA', 'Informe ao menos um prazo para ' + label + '.');
    return items.filter(function (item, index) { return items.indexOf(item) === index; }).sort(function (a, b) { return b - a; }).join(',');
  };
  const positions = input.POSICOES_PNEUS === undefined
    ? before.POSICOES_PNEUS.slice()
    : (Array.isArray(input.POSICOES_PNEUS)
      ? input.POSICOES_PNEUS.map(frotaUpper_).filter(Boolean)
      : String(input.POSICOES_PNEUS || '').split(/[\n,;]/).map(frotaUpper_).filter(Boolean));
  const next = {
    REVISAO_KM: frotaNumero_(input.REVISAO_KM, 'Alerta de revisão por KM'),
    OLEO_KM: frotaNumero_(input.OLEO_KM, 'Alerta de troca de óleo por KM'),
    SEGURO_DIAS: normalizeDays(input.SEGURO_DIAS, 'seguro'),
    LICENCIAMENTO_DIAS: normalizeDays(input.LICENCIAMENTO_DIAS, 'licenciamento'),
    MANUTENCAO_DIAS: normalizeDays(input.MANUTENCAO_DIAS, 'manutenção'),
    POSICOES_PNEUS: positions.filter(function (item, index) { return positions.indexOf(item) === index; })
  };
  const values = {};
  values[FROTA_CONFIG.PROPERTY_KEYS.REVISAO_KM] = String(next.REVISAO_KM);
  values[FROTA_CONFIG.PROPERTY_KEYS.OLEO_KM] = String(next.OLEO_KM);
  values[FROTA_CONFIG.PROPERTY_KEYS.SEGURO_DIAS] = next.SEGURO_DIAS;
  values[FROTA_CONFIG.PROPERTY_KEYS.LICENCIAMENTO_DIAS] = next.LICENCIAMENTO_DIAS;
  values[FROTA_CONFIG.PROPERTY_KEYS.MANUTENCAO_DIAS] = next.MANUTENCAO_DIAS;
  values[FROTA_CONFIG.PROPERTY_KEYS.POSICOES_PNEUS] = JSON.stringify(next.POSICOES_PNEUS);
  PropertiesService.getScriptProperties().setProperties(values, false);
  frotaAuditar_(context, 'CONFIGURAR_ALERTAS_FROTA', '', before, next, '');
  return next;
}
