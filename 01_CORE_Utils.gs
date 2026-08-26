/** Utilitários, respostas padronizadas e camada simples de acesso às planilhas. */

function appError_(code, message, details) {
  const error = new Error(message || 'Ocorreu um erro inesperado.');
  error.name = 'AppError';
  error.code = code || 'INTERNAL_ERROR';
  error.details = details || null;
  return error;
}

function apiSuccess_(data) {
  return { ok: true, data: data === undefined ? null : sanitizeForClient_(data) };
}

function apiFailure_(error) {
  if (typeof logError_ === 'function') logError_(null, 'apiFailure_', error, { persist: false });
  else console.error(error && error.stack ? error.stack : error);
  const isAppError = error && error.name === 'AppError';
  return {
    ok: false,
    error: {
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      message: isAppError ? error.message : 'Não foi possível concluir a operação. Tente novamente.',
      details: isAppError ? sanitizeForClient_(error.details) : null
    }
  };
}

function sanitizeForClient_(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForClient_);
  if (typeof value === 'object') {
    const output = {};
    Object.keys(value).forEach(function (key) {
      output[key] = sanitizeForClient_(value[key]);
    });
    return output;
  }
  return value;
}

function now_() {
  return new Date();
}

function nowIso_() {
  return now_().toISOString();
}

function uuid_() {
  return Utilities.getUuid();
}

function randomToken_(bytes) {
  const pieces = [];
  const count = Math.max(2, Math.ceil((bytes || 32) / 16));
  for (let i = 0; i < count; i += 1) pieces.push(Utilities.getUuid().replace(/-/g, ''));
  return pieces.join('').slice(0, (bytes || 32) * 2);
}

function normalizeText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeUpper_(value) {
  return normalizeText_(value).toUpperCase();
}

function normalizeMasp_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits && digits.length <= 8 ? digits.padStart(8, '0') : digits;
}

function formatMasp_(value) {
  const digits = normalizeMasp_(value);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  return digits.slice(0, -2).padStart(6, '0') + '-' + digits.slice(-2);
}

function isMaspField_(field) {
  const normalized = normalizeUpper_(field).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.indexOf('MASP') >= 0 || normalized.indexOf('MATRICULA') >= 0;
}

/** Compara MASPs aceitando valor bruto, formatado e ausência/presença de zeros iniciais. */
function maspMatches_(storedValue, queryValue) {
  const queryText = normalizeText_(queryValue);
  if (!queryText || !/^[\d\s.\/-]+$/.test(queryText)) return false;
  const queryDigits = queryText.replace(/\D/g, '');
  const storedDigits = normalizeMasp_(storedValue);
  if (!queryDigits || !storedDigits) return false;
  const storedWithoutZeros = storedDigits.replace(/^0+/, '') || '0';
  const queryWithoutZeros = queryDigits.replace(/^0+/, '') || '0';
  return storedDigits.indexOf(queryDigits) >= 0 ||
    storedWithoutZeros.indexOf(queryWithoutZeros) >= 0 ||
    formatMasp_(storedDigits).replace(/\D/g, '').indexOf(queryDigits) >= 0;
}

function normalizeCpf_(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePlate_(value) {
  return normalizeUpper_(value).replace(/[^A-Z0-9]/g, '');
}

function normalizeBoolean_(value) {
  return value === true || ['true', '1', 'sim', 's', 'yes'].indexOf(String(value).toLowerCase()) >= 0;
}

function toDate_(value, allowNull) {
  if (!value && allowNull) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (allowNull) return null;
    throw appError_('INVALID_DATE', 'Data inválida.');
  }
  return date;
}

function addMinutes_(date, minutes) {
  return new Date(date.getTime() + Number(minutes) * 60000);
}

function addHours_(date, hours) {
  return new Date(date.getTime() + Number(hours) * 3600000);
}

function formatDateTime_(date) {
  if (!date) return '';
  return Utilities.formatDate(toDate_(date), APP_CONFIG.TIME_ZONE, 'dd/MM/yyyy HH:mm');
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw appError_('BUSY', 'O sistema está processando outra alteração. Aguarde alguns segundos.');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cache curto para leituras das planilhas.
 *
 * Uma chamada da interface pode consultar a mesma aba várias vezes (sessão,
 * permissões, cautelas e devoluções). Manter essas leituras em memória durante
 * a execução e por alguns segundos no CacheService evita novas chamadas ao
 * Google Sheets a cada tecla digitada nos campos de pesquisa.
 */
const DATA_ROWS_CACHE_PREFIX_ = 'rows-v393-dev-frota-all-sheets-20260720:';
const DATA_ROWS_CACHE_SECONDS_ = 120;
const DATA_ROWS_CACHE_CHUNK_SIZE_ = 40000;
const DATA_ROWS_CACHE_MAX_CHUNKS_ = 20;
let DATA_ACCESS_RUNTIME_CACHE_ = { spreadsheets: {}, sheets: {}, headers: {}, rows: {} };

function resetDataAccessRuntimeCache_() {
  DATA_ACCESS_RUNTIME_CACHE_ = { spreadsheets: {}, sheets: {}, headers: {}, rows: {} };
}

function dataRowsCacheKey_(namespace, sheetName) {
  return DATA_ROWS_CACHE_PREFIX_ + String(namespace || '') + ':' + String(sheetName || '');
}

function cloneDataRows_(rows) {
  return (rows || []).map(function (row) { return Object.assign({}, row); });
}

function getDataRowsCache_(cacheKey) {
  try {
    const cache = CacheService.getScriptCache();
    const manifestText = cache.get(cacheKey);
    if (!manifestText) return null;
    const manifest = JSON.parse(manifestText);
    if (!manifest || !manifest.chunks || manifest.chunks < 1 || manifest.chunks > DATA_ROWS_CACHE_MAX_CHUNKS_) return null;
    const keys = [];
    for (let index = 0; index < manifest.chunks; index += 1) keys.push(cacheKey + ':' + index);
    const chunks = cache.getAll(keys);
    let json = '';
    for (let index = 0; index < keys.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(chunks, keys[index])) return null;
      json += chunks[keys[index]];
    }
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function putDataRowsCache_(cacheKey, rows) {
  try {
    const json = JSON.stringify(rows || []);
    const chunkCount = Math.ceil(json.length / DATA_ROWS_CACHE_CHUNK_SIZE_) || 1;
    if (chunkCount > DATA_ROWS_CACHE_MAX_CHUNKS_) return;
    const values = {};
    for (let index = 0; index < chunkCount; index += 1) {
      values[cacheKey + ':' + index] = json.slice(index * DATA_ROWS_CACHE_CHUNK_SIZE_, (index + 1) * DATA_ROWS_CACHE_CHUNK_SIZE_);
    }
    const cache = CacheService.getScriptCache();
    cache.putAll(values, DATA_ROWS_CACHE_SECONDS_);
    cache.put(cacheKey, JSON.stringify({ chunks: chunkCount }), DATA_ROWS_CACHE_SECONDS_);
  } catch (error) {
    // Cache é uma otimização; a leitura direta continua sendo a fonte oficial.
  }
}

function invalidateDataRowsCache_(namespace, sheetName) {
  const cacheKey = dataRowsCacheKey_(namespace, sheetName);
  delete DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey];
  try {
    const cache = CacheService.getScriptCache();
    const manifestText = cache.get(cacheKey);
    const keys = [cacheKey];
    if (manifestText) {
      const manifest = JSON.parse(manifestText);
      for (let index = 0; index < Number(manifest.chunks || 0); index += 1) keys.push(cacheKey + ':' + index);
    }
    cache.removeAll(keys);
  } catch (error) {
    // A próxima leitura direta recompõe o cache.
  }
}

function getSpreadsheet_(databaseKey) {
  if (DATA_ACCESS_RUNTIME_CACHE_.spreadsheets[databaseKey]) return DATA_ACCESS_RUNTIME_CACHE_.spreadsheets[databaseKey];
  const propertyKey = APP_CONFIG.PROPERTY_KEYS[databaseKey];
  if (!propertyKey) throw appError_('INVALID_DATABASE', 'Banco de dados desconhecido: ' + databaseKey);
  const id = getProperty_(propertyKey, true);
  try {
    const spreadsheet = SpreadsheetApp.openById(id);
    DATA_ACCESS_RUNTIME_CACHE_.spreadsheets[databaseKey] = spreadsheet;
    return spreadsheet;
  } catch (error) {
    throw appError_('DATABASE_UNAVAILABLE', 'Não foi possível abrir uma das planilhas do sistema.', { database: databaseKey });
  }
}

function getSheet_(databaseKey, sheetName) {
  const cacheKey = databaseKey + ':' + sheetName;
  if (DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey]) return DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey];
  const sheet = getSpreadsheet_(databaseKey).getSheetByName(sheetName);
  if (!sheet) throw appError_('SHEET_NOT_FOUND', 'Aba não encontrada: ' + sheetName);
  DATA_ACCESS_RUNTIME_CACHE_.sheets[cacheKey] = sheet;
  return sheet;
}

function getHeaders_(sheet) {
  const cacheKey = String(sheet.getSheetId());
  if (DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey]) return DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey].slice();
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText_);
  DATA_ACCESS_RUNTIME_CACHE_.headers[cacheKey] = headers;
  return headers.slice();
}

function rowToObject_(headers, row, rowNumber) {
  const object = { _row: rowNumber };
  headers.forEach(function (header, index) {
    object[header] = row[index] instanceof Date ? row[index].toISOString() : row[index];
  });
  return object;
}

function readAll_(databaseKey, sheetName) {
  const cacheKey = dataRowsCacheKey_(databaseKey, sheetName);
  if (DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey]) return cloneDataRows_(DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey]);
  const cached = getDataRowsCache_(cacheKey);
  if (cached) {
    DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = cached;
    return cloneDataRows_(cached);
  }
  const sheet = getSheet_(databaseKey, sheetName);
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !headers.length) {
    DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = [];
    putDataRowsCache_(cacheKey, []);
    return [];
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const output = rows
    .map(function (row, index) { return rowToObject_(headers, row, index + 2); })
    .filter(function (row) {
      return headers.some(function (header) { return row[header] !== '' && row[header] !== null; });
    });
  DATA_ACCESS_RUNTIME_CACHE_.rows[cacheKey] = output;
  putDataRowsCache_(cacheKey, output);
  return cloneDataRows_(output);
}

function findOne_(databaseKey, sheetName, field, value, normalizer) {
  const normalize = normalizer || function (input) { return String(input); };
  const expected = normalize(value);
  const rows = readAll_(databaseKey, sheetName);
  for (let i = 0; i < rows.length; i += 1) {
    if (normalize(rows[i][field]) === expected) return rows[i];
  }
  return null;
}

function findMany_(databaseKey, sheetName, predicate) {
  return readAll_(databaseKey, sheetName).filter(predicate);
}

function objectToRow_(headers, object) {
  return headers.map(function (header) {
    const value = object[header];
    if (value === undefined || value === null) return '';
    return value;
  });
}

function appendObject_(databaseKey, sheetName, object) {
  const sheet = getSheet_(databaseKey, sheetName);
  const headers = getHeaders_(sheet);
  if (!headers.length) throw appError_('INVALID_SHEET', 'A aba ' + sheetName + ' não possui cabeçalhos.');
  const row = objectToRow_(headers, object);
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  invalidateDataRowsCache_(databaseKey, sheetName);
  return rowToObject_(headers, row, rowNumber);
}

function updateObjectAtRow_(databaseKey, sheetName, rowNumber, patch) {
  const sheet = getSheet_(databaseKey, sheetName);
  const headers = getHeaders_(sheet);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw appError_('ROW_NOT_FOUND', 'Registro não encontrado.');
  const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const current = rowToObject_(headers, currentValues, rowNumber);
  const next = Object.assign({}, current, patch || {});
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([objectToRow_(headers, next)]);
  invalidateDataRowsCache_(databaseKey, sheetName);
  return rowToObject_(headers, objectToRow_(headers, next), rowNumber);
}

function upsertBy_(databaseKey, sheetName, field, value, object, normalizer) {
  const current = findOne_(databaseKey, sheetName, field, value, normalizer);
  if (current) return updateObjectAtRow_(databaseKey, sheetName, current._row, object);
  return appendObject_(databaseKey, sheetName, object);
}

function softDeleteBy_(databaseKey, sheetName, idField, idValue, statusField) {
  const row = findOne_(databaseKey, sheetName, idField, idValue);
  if (!row) throw appError_('NOT_FOUND', 'Registro não encontrado.');
  const patch = {};
  patch[statusField || 'STATUS'] = 'INATIVO';
  patch.ATUALIZADO_EM = now_();
  return updateObjectAtRow_(databaseKey, sheetName, row._row, patch);
}

function paginate_(rows, options) {
  const opts = options || {};
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(opts.pageSize) || 20));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page: safePage, pageSize: pageSize, total: total, pages: pages };
}

function searchRows_(rows, query, fields) {
  const terms = parseSearchTerms_(query);
  if (!terms.length) return rows;
  return rows.filter(function (row) {
    return terms.every(function (term) {
      return fields.some(function (field) {
        const value = normalizeSearchText_(row[field]);
        const statusMatch = normalizeUpper_(field).indexOf('STATUS') >= 0 ? value === term.normalized : value.indexOf(term.normalized) >= 0;
        return statusMatch ||
          (isMaspField_(field) && maspMatches_(row[field], term.raw));
      });
    });
  });
}

/**
 * Lê vários filtros na mesma pesquisa. Frases entre aspas permanecem unidas e
 * todos os termos precisam existir em algum dos campos pesquisáveis do registro.
 */
function parseSearchTerms_(query) {
  const text = normalizeText_(query);
  if (!text) return [];
  const output = [];
  const pattern = /"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|(\S+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const raw = normalizeText_(match[1] || match[2] || match[3] || match[4] || match[5]).replace(/^["'“”‘’]|["'“”‘’]$/g, '');
    const normalized = normalizeSearchText_(raw);
    if (normalized && !output.some(function (item) { return item.normalized === normalized; })) output.push({ raw: raw, normalized: normalized });
  }
  return output;
}

function normalizeSearchText_(value) {
  return normalizeText_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function sortByDateDesc_(rows, field) {
  return rows.sort(function (a, b) {
    return new Date(b[field] || 0).getTime() - new Date(a[field] || 0).getTime();
  });
}

function pick_(object, allowedFields) {
  const output = {};
  allowedFields.forEach(function (field) {
    if (object && object[field] !== undefined) output[field] = object[field];
  });
  return output;
}

function omitSensitiveUser_(user) {
  if (!user) return null;
  const copy = Object.assign({}, user);
  ['SENHA_HASH', 'SENHA_SALT', 'TENTATIVAS', 'BLOQUEADO_ATE', '_row'].forEach(function (key) { delete copy[key]; });
  copy.MASP_FORMATADO = formatMasp_(copy.MASP);
  return copy;
}
