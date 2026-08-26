/** Consulta paginada e detalhamento do histórico da Frota. */

function frotaHistoricoListar_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_HISTORICO');
  const options = payload || {};
  return FrotaRepository_().reversePage('HISTORICO_FROTA', options, frotaHistoricoCriarFiltro_(options));
}

/**
 * Monta os dados de impressão em uma única leitura da planilha. O limite evita
 * respostas grandes demais para o Web App sem alterar a consulta paginada da tela.
 */
function frotaHistoricoRelatorio_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_HISTORICO');
  const options = payload || {};
  const report = FrotaRepository_().reverseReport('HISTORICO_FROTA', options, frotaHistoricoCriarFiltro_(options));
  return Object.assign({}, report, {
    geradoEm: new Date(),
    geradoPor: frotaUsuario_(context)
  });
}

function frotaHistoricoCriarFiltro_(options) {
  options = options || {};
  const query = frotaTexto_(options.query).toLocaleLowerCase('pt-BR');
  const start = options.startDate ? frotaDiaInicio_(options.startDate).getTime() : null;
  const end = options.endDate ? frotaDiaFim_(options.endDate).getTime() : null;
  const type = frotaUpper_(options.type);
  const prefix = frotaUpper_(options.prefix);
  const plate = options.plate ? frotaPlaca_(options.plate) : '';
  const masp = frotaMasp_(options.masp);
  const driver = frotaTexto_(options.driver).toLocaleLowerCase('pt-BR');
  const category = frotaUpper_(options.category);
  const gravity = frotaUpper_(options.gravity);
  const status = frotaUpper_(options.status);
  const kmDivergent = options.kmDivergent === '' || options.kmDivergent === undefined ? null : frotaBoolean_(options.kmDivergent);
  return function (row) {
    const date = new Date(row.DATA_HORA || 0).getTime();
    if (start !== null && date < start) return false;
    if (end !== null && date > end) return false;
    if (type && frotaUpper_(row.TIPO_ACAO) !== type) return false;
    if (prefix && frotaUpper_(row.PREFIXO).indexOf(prefix) < 0) return false;
    if (plate && String(row.PLACA || '') !== plate) return false;
    if (masp && frotaMasp_(row.USUARIO_MASP) !== masp) return false;
    if (driver && String(row.USUARIO_NOME || '').toLocaleLowerCase('pt-BR').indexOf(driver) < 0) return false;
    const serialized = [row.TIPO_ACAO, row.CAMPO_ALTERADO, row.VALOR_ANTERIOR, row.VALOR_NOVO, row.JUSTIFICATIVA, row.USUARIO_MASP, row.USUARIO_NOME, row.PREFIXO, row.PLACA].join(' ').toLocaleLowerCase('pt-BR');
    if (query && serialized.indexOf(query) < 0 && !maspMatches_(row.USUARIO_MASP, options.query)) return false;
    if (category && frotaUpper_(serialized).indexOf(category) < 0) return false;
    if (gravity && frotaUpper_(serialized).indexOf(gravity) < 0) return false;
    if (status && frotaUpper_(serialized).indexOf(status) < 0) return false;
    if (kmDivergent !== null) {
      const hasDivergence = /KM_DIVERGENTE[^A-Z0-9]*(TRUE|SIM|1)/i.test(serialized) || /"KM_DIVERGENTE":true/i.test(serialized);
      if (hasDivergence !== kmDivergent) return false;
    }
    return true;
  };
}

function frotaHistoricoObter_(context, payload) {
  frotaExigirAcesso_(context, 'FROTA_VISUALIZAR_HISTORICO');
  frotaExigir_(payload, ['id']);
  const record = FrotaRepository_().findOne('HISTORICO_FROTA', 'ID_HISTORICO', payload.id);
  if (!record) throw appError_('FROTA_HISTORICO_NAO_ENCONTRADO', 'Registro de histórico não encontrado.');
  return frotaSemLinha_(record);
}
