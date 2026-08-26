/** Operações estruturais de migração. Uso restrito pelo MigrationService. */

function migrationRepositoryOpenSpreadsheet_(databaseKey) {
  return diagnosticRepositoryOpenSpreadsheet_(databaseKey);
}

function migrationRepositoryHeaderGroups_(headers) {
  const groups = {};
  (headers || []).forEach(function (header, index) {
    const key = normalizeUpper_(header);
    if (!key) return;
    if (!groups[key]) groups[key] = { header: header, indexes: [] };
    groups[key].indexes.push(index);
  });
  return groups;
}

function migrationRepositoryPlanSheet_(databaseKey, sheetName, expectedHeaders) {
  const spreadsheet = migrationRepositoryOpenSpreadsheet_(databaseKey);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return {
      databaseKey: databaseKey,
      sheetName: sheetName,
      exists: false,
      action: 'CREATE_SHEET',
      missingColumns: expectedHeaders.slice(),
      duplicateColumns: [],
      extraColumns: [],
      needsRepair: true
    };
  }

  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText_) : [];
  const groups = migrationRepositoryHeaderGroups_(headers);
  const expectedIndex = {};
  expectedHeaders.forEach(function (header) { expectedIndex[normalizeUpper_(header)] = header; });
  const missingColumns = expectedHeaders.filter(function (header) {
    return !Object.prototype.hasOwnProperty.call(groups, normalizeUpper_(header));
  });
  const extraColumns = headers.filter(function (header) {
    return header && !Object.prototype.hasOwnProperty.call(expectedIndex, normalizeUpper_(header));
  });
  const duplicateColumns = Object.keys(groups).filter(function (key) {
    return groups[key].indexes.length > 1;
  }).map(function (key) {
    return { header: groups[key].header, count: groups[key].indexes.length, columns: groups[key].indexes.map(function (index) { return index + 1; }) };
  });

  return {
    databaseKey: databaseKey,
    sheetName: sheetName,
    exists: true,
    action: missingColumns.length || duplicateColumns.length ? 'NORMALIZE_HEADERS' : 'NONE',
    rowCount: Math.max(0, sheet.getLastRow() - 1),
    columnCount: headers.length,
    missingColumns: missingColumns,
    duplicateColumns: duplicateColumns,
    extraColumns: extraColumns,
    needsRepair: Boolean(missingColumns.length || duplicateColumns.length)
  };
}

function migrationRepositoryPlanDatabase_(databaseKey, definition) {
  return Object.keys(definition.sheets).map(function (sheetName) {
    return migrationRepositoryPlanSheet_(databaseKey, sheetName, definition.sheets[sheetName]);
  });
}

function migrationRepositoryBackupSheet_(spreadsheet, sheet) {
  const timestamp = Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyyMMdd_HHmmss');
  const base = ('BACKUP_' + sheet.getName() + '_' + timestamp).slice(0, 95);
  let name = base;
  let suffix = 1;
  while (spreadsheet.getSheetByName(name)) {
    name = (base + '_' + suffix).slice(0, 99);
    suffix += 1;
  }
  const backup = sheet.copyTo(spreadsheet).setName(name);
  backup.hideSheet();
  return { name: name, sheetId: backup.getSheetId() };
}

function migrationRepositoryUniqueExtraHeaders_(headers, expectedHeaders) {
  const expectedIndex = {};
  expectedHeaders.forEach(function (header) { expectedIndex[normalizeUpper_(header)] = true; });
  const seen = {};
  const extras = [];
  (headers || []).forEach(function (header) {
    const key = normalizeUpper_(header);
    if (!key || expectedIndex[key]) return;
    let finalHeader = header;
    let suffix = 2;
    while (seen[normalizeUpper_(finalHeader)]) {
      finalHeader = header + '_' + suffix;
      suffix += 1;
    }
    seen[normalizeUpper_(finalHeader)] = true;
    extras.push(finalHeader);
  });
  return extras;
}

function migrationRepositoryFinalColumns_(headers, expectedHeaders) {
  const groups = migrationRepositoryHeaderGroups_(headers);
  const expectedIndex = {};
  const seen = {};
  const columns = [];
  expectedHeaders.forEach(function (header) {
    const key = normalizeUpper_(header);
    expectedIndex[key] = true;
    seen[key] = true;
    columns.push({ header: header, indexes: groups[key] ? groups[key].indexes.slice() : [] });
  });
  (headers || []).forEach(function (header, index) {
    const key = normalizeUpper_(header);
    if (!key || expectedIndex[key]) return;
    let finalHeader = header;
    let suffix = 2;
    while (seen[normalizeUpper_(finalHeader)]) {
      finalHeader = header + '_' + suffix;
      suffix += 1;
    }
    seen[normalizeUpper_(finalHeader)] = true;
    columns.push({ header: finalHeader, indexes: [index] });
  });
  return columns;
}

function migrationRepositoryFirstNonBlank_(row, indexes) {
  for (let index = 0; index < indexes.length; index += 1) {
    const value = row[indexes[index]];
    if (value !== '' && value !== null && value !== undefined) return value;
  }
  return '';
}

function migrationRepositoryApplySheet_(databaseKey, sheetName, expectedHeaders) {
  const spreadsheet = migrationRepositoryOpenSpreadsheet_(databaseKey);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return { databaseKey: databaseKey, sheetName: sheetName, action: 'CREATED', backup: null, conflicts: [] };
  }

  const plan = migrationRepositoryPlanSheet_(databaseKey, sheetName, expectedHeaders);
  if (!plan.needsRepair) return { databaseKey: databaseKey, sheetName: sheetName, action: 'UNCHANGED', backup: null, conflicts: [] };

  const backup = migrationRepositoryBackupSheet_(spreadsheet, sheet);
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText_);
  const finalColumns = migrationRepositoryFinalColumns_(headers, expectedHeaders);
  const finalHeaders = finalColumns.map(function (column) { return column.header; });
  const finalRows = [finalHeaders];
  const conflicts = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const source = values[rowIndex];
    const output = finalColumns.map(function (column) {
      if (!column.indexes.length) return '';
      const nonBlank = column.indexes.map(function (columnIndex) { return source[columnIndex]; })
        .filter(function (value) { return value !== '' && value !== null && value !== undefined; });
      const serialized = {};
      nonBlank.forEach(function (value) { serialized[String(value)] = true; });
      if (Object.keys(serialized).length > 1 && conflicts.length < 200) {
        conflicts.push({ row: rowIndex + 1, header: column.header, values: nonBlank.map(String) });
      }
      return migrationRepositoryFirstNonBlank_(source, column.indexes);
    });
    finalRows.push(output);
  }

  if (sheet.getMaxColumns() < finalHeaders.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), finalHeaders.length - sheet.getMaxColumns());
  }
  sheet.clearContents();
  sheet.getRange(1, 1, finalRows.length, finalHeaders.length).setValues(finalRows);
  if (sheet.getMaxColumns() > finalHeaders.length) {
    sheet.deleteColumns(finalHeaders.length + 1, sheet.getMaxColumns() - finalHeaders.length);
  }
  invalidateDataRowsCache_(databaseKey === SCHEMA_DATABASE_FROTA_ ? 'FROTA' : databaseKey, sheetName);
  return {
    databaseKey: databaseKey,
    sheetName: sheetName,
    action: 'NORMALIZED',
    backup: backup,
    missingColumns: plan.missingColumns,
    duplicateColumns: plan.duplicateColumns,
    conflicts: conflicts
  };
}
