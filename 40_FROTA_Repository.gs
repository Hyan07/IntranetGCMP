/** Acesso em lote ao banco de dados do módulo Frota. */

function frotaPlanilha_() {
  if (DATA_ACCESS_RUNTIME_CACHE_.spreadsheets.FROTA) return DATA_ACCESS_RUNTIME_CACHE_.spreadsheets.FROTA;
  const id = APP_CONFIG.ENVIRONMENT === 'DEVELOPMENT'
    ? DEVELOPMENT_CONFIG.FROTA_SPREADSHEET_ID
    : PropertiesService.getScriptProperties().getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY);
  if (!id) throw appError_('FROTA_NAO_INSTALADA', 'A planilha da Frota não está configurada. Execute o instalador geral ou a migração estrutural no ambiente DEV.');
  try {
    const spreadsheet = SpreadsheetApp.openById(id);
    DATA_ACCESS_RUNTIME_CACHE_.spreadsheets.FROTA = spreadsheet;
    return spreadsheet;
  } catch (error) {
    throw appError_('FROTA_PLANILHA_INDISPONIVEL', 'A planilha da Frota não foi encontrada ou não está acessível.');
  }
}

function frotaAba_(sheetName) {
  if (!FROTA_CONFIG.SHEETS[sheetName]) throw appError_('FROTA_ABA_INVALIDA', 'Aba do módulo Frota inválida: ' + sheetName);
  const cacheKey = 'FROTA:' + sheetName;
  if (DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey]) return DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey];
  const sheet = frotaPlanilha_().getSheetByName(sheetName);
  if (!sheet) throw appError_('FROTA_ABA_AUSENTE', 'Aba não encontrada: ' + sheetName + '. Execute o reparo estrutural controlado no ambiente DEV.');
  DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey] = sheet;
  return sheet;
}

function frotaCabecalhos_(sheet) {
  const cacheKey = 'FROTA:' + String(sheet.getSheetId());
  if (DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey]) return DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey].slice();
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(frotaTexto_) : [];
  DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey] = headers;
  return headers.slice();
}

function frotaLinhaObjeto_(headers, values, rowNumber) {
  const output = { _row: rowNumber };
  headers.forEach(function (header, index) {
    const value = values[index];
    output[header] = value instanceof Date ? value.toISOString() : value;
  });
  return output;
}

function frotaAplicarEstruturaCanonica_(sheetName, row, values) {
  FROTA_CONFIG.SHEETS[sheetName].forEach(function (header, index) {
    const value = values[index];
    row[header] = value instanceof Date ? value.toISOString() : value;
  });
  return row;
}

function frotaLinhaCanonica_(sheetName, headers, values, rowNumber) {
  return frotaAplicarEstruturaCanonica_(sheetName, frotaLinhaObjeto_(headers, values, rowNumber), values);
}

function frotaObjetoLinha_(headers, object) {
  return headers.map(function (header) {
    const value = object && object[header];
    return value === undefined || value === null ? '' : value;
  });
}

function frotaLerTodos_(sheetName) {
  const cacheKey = dataRowsCacheKey_('FROTA', sheetName);
  if (DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey]) return cloneDataRows_(DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey]);
  const cached = getDataRowsCache_(cacheKey);
  if (cached) {
    DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = cached;
    return cloneDataRows_(cached);
  }
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  const lastRow = sheet.getLastRow();
  if (!headers.length || lastRow < 2) {
    DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = [];
    putDataRowsCache_(cacheKey, []);
    return [];
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .map(function (values, index) {
      return frotaLinhaCanonica_(sheetName, headers, values, index + 2);
    })
    .filter(function (row) { return headers.some(function (header) { return row[header] !== '' && row[header] !== null; }); });
  DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = rows;
  putDataRowsCache_(cacheKey, rows);
  return cloneDataRows_(rows);
}

function frotaInvalidarCache_(sheetName) {
  invalidateDataRowsCache_('FROTA', sheetName);
}

function frotaEncontrar_(sheetName, field, value, normalizer) {
  const normalize = normalizer || function (item) { return String(item); };
  const expected = normalize(value);
  const rows = frotaLerTodos_(sheetName);
  for (let index = 0; index < rows.length; index += 1) {
    if (normalize(rows[index][field]) === expected) return rows[index];
  }
  return null;
}

function frotaAcrescentar_(sheetName, object) {
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  const row = frotaObjetoLinha_(headers, object);
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  frotaInvalidarCache_(sheetName);
  return frotaLinhaCanonica_(sheetName, headers, row, rowNumber);
}

function frotaAcrescentarMuitos_(sheetName, objects) {
  if (!objects || !objects.length) return [];
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  const rows = objects.map(function (object) { return frotaObjetoLinha_(headers, object); });
  const start = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
  frotaInvalidarCache_(sheetName);
  return rows.map(function (row, index) { return frotaLinhaCanonica_(sheetName, headers, row, start + index); });
}

function frotaAtualizar_(sheetName, rowNumber, patch) {
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  if (Number(rowNumber) < 2 || Number(rowNumber) > sheet.getLastRow()) throw appError_('FROTA_REGISTRO_NAO_ENCONTRADO', 'Registro não encontrado.');
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const current = frotaLinhaCanonica_(sheetName, headers, values, rowNumber);
  const next = Object.assign({}, current, patch || {});
  const row = frotaObjetoLinha_(headers, next);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  frotaInvalidarCache_(sheetName);
  return frotaLinhaCanonica_(sheetName, headers, row, rowNumber);
}

function frotaPaginar_(rows, options) {
  const opts = options || {};
  const pageSize = Math.min(100, Math.max(5, Number(opts.pageSize) || 20));
  const page = Math.max(1, Number(opts.page) || 1);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize).map(frotaSemLinha_), page: safePage, pageSize: pageSize, total: total, pages: pages };
}

function frotaPesquisar_(rows, query, fields) {
  const term = frotaTexto_(query).toLocaleLowerCase('pt-BR');
  if (!term) return rows;
  return rows.filter(function (row) {
    return fields.some(function (field) {
      return String(row[field] || '').toLocaleLowerCase('pt-BR').indexOf(term) >= 0 ||
        (isMaspField_(field) && maspMatches_(row[field], query));
    });
  });
}

/**
 * Paginação reversa em lotes. Mantém somente a página solicitada na memória e
 * evita carregar o histórico completo em uma única leitura.
 */
function frotaPaginarReversoEmLotes_(sheetName, options, predicate) {
  const opts = options || {};
  const pageSize = Math.min(100, Math.max(5, Number(opts.pageSize) || 20));
  const page = Math.max(1, Number(opts.page) || 1);
  const offset = (page - 1) * pageSize;
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  const lastRow = sheet.getLastRow();
  const items = [];
  let matched = 0;
  const chunkSize = 500;
  for (let end = lastRow; end >= 2; end -= chunkSize) {
    const start = Math.max(2, end - chunkSize + 1);
    const values = sheet.getRange(start, 1, end - start + 1, headers.length).getValues();
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const row = frotaLinhaCanonica_(sheetName, headers, values[index], start + index);
      if (!predicate(row)) continue;
      if (matched >= offset && items.length < pageSize) items.push(frotaSemLinha_(row));
      matched += 1;
    }
  }
  const pages = Math.max(1, Math.ceil(matched / pageSize));
  return { items: items, page: Math.min(page, pages), pageSize: pageSize, total: matched, pages: pages };
}

function frotaRelatorioReversoEmLotes_(sheetName, options, predicate) {
  const opts = options || {};
  const limit = Math.min(2000, Math.max(100, Number(opts.limit) || 2000));
  const sheet = frotaAba_(sheetName);
  const headers = frotaCabecalhos_(sheet);
  const lastRow = sheet.getLastRow();
  const items = [];
  let total = 0;
  const chunkSize = 500;
  const filter = predicate || function () { return true; };

  for (let end = lastRow; end >= 2; end -= chunkSize) {
    const start = Math.max(2, end - chunkSize + 1);
    const values = sheet.getRange(start, 1, end - start + 1, headers.length).getValues();
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const row = frotaLinhaCanonica_(sheetName, headers, values[index], start + index);
      if (!filter(row)) continue;
      total += 1;
      if (items.length < limit) items.push(frotaSemLinha_(row));
    }
  }

  return { items: items, total: total, limit: limit, limited: total > limit };
}
