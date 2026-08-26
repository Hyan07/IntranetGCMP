/** Contratos base para repositories. Esta camada sera o ponto substituivel por SQL. */

function repositoryAssertSheet_(databaseKey, sheetName) {
  return schemaSheet_(databaseKey, sheetName);
}

function repositoryReadAll_(databaseKey, sheetName) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaLerTodos_(sheetName);
  return readAll_(databaseKey, sheetName);
}

function repositoryFindOne_(databaseKey, sheetName, field, value, normalizer) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaEncontrar_(sheetName, field, value, normalizer);
  return findOne_(databaseKey, sheetName, field, value, normalizer);
}

function repositoryFindMany_(databaseKey, sheetName, predicate) {
  return repositoryReadAll_(databaseKey, sheetName).filter(predicate || function () { return true; });
}

function repositoryAppend_(databaseKey, sheetName, object) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaAcrescentar_(sheetName, object);
  return appendObject_(databaseKey, sheetName, object);
}

function repositoryAppendMany_(databaseKey, sheetName, objects) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (!objects || !objects.length) return [];
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaAcrescentarMuitos_(sheetName, objects);
  const sheet = getSheet_(databaseKey, sheetName);
  const headers = getHeaders_(sheet);
  if (!headers.length) throw appError_('INVALID_SHEET', 'A aba ' + sheetName + ' não possui cabeçalhos.');
  const rows = objects.map(function (object) { return objectToRow_(headers, object); });
  const start = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
  invalidateDataRowsCache_(databaseKey, sheetName);
  return rows.map(function (row, index) { return rowToObject_(headers, row, start + index); });
}

function repositoryUpdateMany_(databaseKey, sheetName, objects) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (!objects || !objects.length) return [];
  if (databaseKey === SCHEMA_DATABASE_FROTA_) {
    return objects.map(function (object) {
      return frotaAtualizar_(sheetName, object._row, object);
    });
  }
  const sheet = getSheet_(databaseKey, sheetName);
  const headers = getHeaders_(sheet);
  if (!headers.length) throw appError_('INVALID_SHEET', 'A aba ' + sheetName + ' não possui cabeçalhos.');
  const sorted = objects
    .filter(function (object) { return Number(object && object._row) >= 2; })
    .sort(function (a, b) { return Number(a._row) - Number(b._row); });
  if (!sorted.length) return [];

  const saved = [];
  let blockStart = Number(sorted[0]._row);
  let block = [];
  function flushBlock_() {
    if (!block.length) return;
    const values = block.map(function (object) { return objectToRow_(headers, object); });
    sheet.getRange(blockStart, 1, values.length, headers.length).setValues(values);
    values.forEach(function (row, index) {
      saved.push(rowToObject_(headers, row, blockStart + index));
    });
    block = [];
  }

  sorted.forEach(function (object) {
    const rowNumber = Number(object._row);
    const expected = blockStart + block.length;
    if (block.length && rowNumber !== expected) {
      flushBlock_();
      blockStart = rowNumber;
    }
    block.push(object);
  });
  flushBlock_();
  invalidateDataRowsCache_(databaseKey, sheetName);
  return saved;
}

function repositoryUpdate_(databaseKey, sheetName, rowNumber, patch) {
  repositoryAssertSheet_(databaseKey, sheetName);
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaAtualizar_(sheetName, rowNumber, patch);
  return updateObjectAtRow_(databaseKey, sheetName, rowNumber, patch);
}

function repositoryUpsertBy_(databaseKey, sheetName, field, value, object, normalizer) {
  const current = repositoryFindOne_(databaseKey, sheetName, field, value, normalizer);
  if (current) return repositoryUpdate_(databaseKey, sheetName, current._row, object);
  return repositoryAppend_(databaseKey, sheetName, object);
}

function repositorySoftDeleteBy_(databaseKey, sheetName, idField, idValue, statusField) {
  const row = repositoryFindOne_(databaseKey, sheetName, idField, idValue);
  if (!row) throw appError_('NOT_FOUND', 'Registro não encontrado.');
  const patch = {};
  patch[statusField || 'STATUS'] = 'INATIVO';
  patch.ATUALIZADO_EM = now_();
  return repositoryUpdate_(databaseKey, sheetName, row._row, patch);
}

function repositoryPage_(databaseKey, sheetName, options, predicate) {
  const rows = repositoryReadAll_(databaseKey, sheetName).filter(predicate || function () { return true; });
  return paginate_(rows, options);
}

function repositoryAssertInstalled_(databaseKey, sheetName, code, message) {
  try {
    repositoryAssertSheet_(databaseKey, sheetName);
    if (databaseKey === SCHEMA_DATABASE_FROTA_) frotaAba_(sheetName);
    else getSheet_(databaseKey, sheetName);
    return true;
  } catch (error) {
    const expected = ['SHEET_NOT_FOUND', 'SCHEMA_SHEET_NOT_FOUND', 'FROTA_ABA_AUSENTE'];
    if (expected.indexOf(error && error.code) >= 0) {
      throw appError_(
        code || 'SHEET_NOT_INSTALLED',
        message || 'Aba obrigatória não instalada.',
        { databaseKey: databaseKey, sheetName: sheetName }
      );
    }
    throw error;
  }
}

function repositoryFlush_() {
  if (typeof SpreadsheetApp !== 'undefined') SpreadsheetApp.flush();
}
