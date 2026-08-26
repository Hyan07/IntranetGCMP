/** Repository de diagnóstico estrutural. Centraliza as leituras diretas de planilhas. */

function diagnosticRepositoryOpenSpreadsheet_(databaseKey) {
  if (databaseKey === SCHEMA_DATABASE_FROTA_) return frotaPlanilha_();
  return getSpreadsheet_(databaseKey);
}

function diagnosticRepositoryDuplicateTexts_(values) {
  const seen = {};
  const duplicates = [];
  values.forEach(function (value) {
    const text = normalizeUpper_(value);
    if (!text) return;
    if (seen[text] && duplicates.indexOf(value) < 0) duplicates.push(value);
    seen[text] = true;
  });
  return duplicates;
}

function diagnosticRepositoryReadSheet_(spreadsheet, databaseKey, sheetName, expectedHeaders) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return {
      databaseKey: databaseKey,
      sheetName: sheetName,
      exists: false,
      ok: false,
      rowCount: 0,
      columnCount: 0,
      headers: [],
      missingColumns: expectedHeaders.slice(),
      extraColumns: [],
      duplicateColumns: [],
      duplicateIds: [],
      blankIds: 0
    };
  }

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = lastColumn
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText_)
    : [];
  const normalizedActual = {};
  headers.forEach(function (header) { normalizedActual[normalizeUpper_(header)] = header; });

  const missingColumns = expectedHeaders.filter(function (header) {
    return !Object.prototype.hasOwnProperty.call(normalizedActual, normalizeUpper_(header));
  });
  const expectedIndex = {};
  expectedHeaders.forEach(function (header) { expectedIndex[normalizeUpper_(header)] = true; });
  const extraColumns = headers.filter(function (header) {
    return header && !Object.prototype.hasOwnProperty.call(expectedIndex, normalizeUpper_(header));
  });
  const duplicateColumns = diagnosticRepositoryDuplicateTexts_(headers);

  const idHeader = expectedHeaders.filter(function (header) {
    const key = normalizeUpper_(header);
    return key === 'ID' || key.indexOf('ID_') === 0 || key.indexOf('_ID') >= 0 || key === 'TOKEN';
  })[0] || expectedHeaders[0] || '';
  const idColumn = headers.map(normalizeUpper_).indexOf(normalizeUpper_(idHeader)) + 1;
  const duplicateIds = [];
  let blankIds = 0;
  if (idColumn > 0 && lastRow > 1) {
    const idValues = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues().map(function (row) { return normalizeText_(row[0]); });
    const seenIds = {};
    idValues.forEach(function (id) {
      if (!id) {
        blankIds += 1;
        return;
      }
      if (seenIds[id] && duplicateIds.indexOf(id) < 0) duplicateIds.push(id);
      seenIds[id] = true;
    });
  }

  return {
    databaseKey: databaseKey,
    sheetName: sheetName,
    exists: true,
    ok: !missingColumns.length && !duplicateColumns.length && !duplicateIds.length,
    rowCount: Math.max(0, lastRow - 1),
    columnCount: headers.length,
    headers: headers,
    missingColumns: missingColumns,
    extraColumns: extraColumns,
    duplicateColumns: duplicateColumns,
    duplicateIds: duplicateIds,
    blankIds: blankIds
  };
}

function diagnosticRepositoryReadDatabase_(databaseKey, definition) {
  const spreadsheet = diagnosticRepositoryOpenSpreadsheet_(databaseKey);
  const sheets = Object.keys(definition.sheets).map(function (sheetName) {
    return diagnosticRepositoryReadSheet_(spreadsheet, databaseKey, sheetName, definition.sheets[sheetName]);
  });
  return {
    databaseKey: databaseKey,
    name: definition.name,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    ok: sheets.every(function (sheet) { return sheet.ok; }),
    sheets: sheets
  };
}
