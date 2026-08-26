import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const updates = [];
const appended = [];
const cacheRemovals = [];
const audits = [];

const users = [
  { ID_USUARIO: 'u1', NOME: 'Agente Um' },
  { ID_USUARIO: 'u2', NOME: 'Agente Dois' }
];
const permissions = [
  { ID_PERMISSAO: 'p1', CODIGO: 'modulo.visualizar', ATIVA: true, MODULO: 'modulo', ACAO: 'visualizar', DESCRICAO: 'Visualizar módulo' },
  { ID_PERMISSAO: 'p2', CODIGO: 'modulo.editar', ATIVA: true, MODULO: 'modulo', ACAO: 'editar', DESCRICAO: 'Editar módulo' }
];
const assignments = [
  { ID: 'a1', ID_USUARIO: 'u1', ID_PERMISSAO: 'p1', PERMITIDO: true, _row: 2 },
  { ID: 'a2', ID_USUARIO: 'u1', ID_PERMISSAO: 'p2', PERMITIDO: false, _row: 3 }
];
const headers = ['ID', 'ID_USUARIO', 'ID_PERMISSAO', 'PERMITIDO', 'CONCEDIDO_POR', 'CONCEDIDO_EM'];

const context = vm.createContext({
  console,
  APP_CONFIG: { DATABASES: { CONFIG: 'CONFIG' } },
  normalizeText_(value) { return String(value ?? '').trim(); },
  normalizeBoolean_(value) { return value === true || String(value).toUpperCase() === 'TRUE'; },
  formatMasp_(value) { return String(value || ''); },
  appError_(code, message, details) { return Object.assign(new Error(message), { code, details }); },
  readAll_(_database, sheet) {
    if (sheet === 'USUARIOS') return users.map(item => ({ ...item }));
    if (sheet === 'PERMISSOES') return permissions.map(item => ({ ...item }));
    if (sheet === 'USUARIO_PERMISSOES') return assignments.map(item => ({ ...item }));
    return [];
  },
  repositoryReadAll_(_database, sheet) {
    if (sheet === 'USUARIOS') return users.map(item => ({ ...item }));
    if (sheet === 'PERMISSOES') return permissions.map(item => ({ ...item }));
    if (sheet === 'USUARIO_PERMISSOES') return assignments.map(item => ({ ...item }));
    return [];
  },
  repositoryFindOne_(_database, sheet, field, value) {
    return this.repositoryReadAll_(_database, sheet).find(item => String(item[field]) === String(value)) || null;
  },
  repositoryUpdate_(_database, sheet, row, record) { updates.push({ sheet, row, record }); },
  withScriptLock_(callback) { return callback(); },
  updateObjectAtRow_(_database, sheet, row, record) { updates.push({ sheet, row, record }); },
  repositoryAppendMany_(_database, sheet, records) {
    appended.push(...records.map(record => headers.map(column => record[column] ?? '')));
    return records.map((record, index) => ({ ...record, _row: assignments.length + 2 + index }));
  },
  getSheet_() {
    return {
      getLastRow() { return assignments.length + 1; },
      getRange() { return { setValues(rows) { appended.push(...rows); } }; }
    };
  },
  getHeaders_() { return headers; },
  objectToRow_(columns, record) { return columns.map(column => record[column] ?? ''); },
  CacheService: { getScriptCache() { return { remove(key) { cacheRemovals.push(key); } }; } },
  audit_(...args) { audits.push(args); },
  uuid_: (() => { let id = 0; return () => `new-${++id}`; })(),
  now_() { return '2026-07-13T12:00:00.000Z'; }
});

const permissionService = fs.readFileSync(path.join(root, '20_SERVICE_Permission.gs'), 'utf8');
new vm.Script(permissionService, { filename: '20_SERVICE_Permission.gs' }).runInContext(context);
context.__result = vm.runInContext(`grantBulkPermissions_({user:{ID_USUARIO:'admin'},permissions:['configuracoes.gerenciar','usuarios.gerenciar_permissoes']},{userIds:['u1','u2'],permissions:['modulo.visualizar','modulo.editar'],justification:'Equipe operacional'})`, context);

assert(permissionService.includes("requirePermission_(context, 'configuracoes.gerenciar')") && permissionService.includes("requirePermission_(context, 'usuarios.gerenciar_permissoes')"));
assert.equal(context.__result.usuariosAtualizados, 2);
assert.equal(context.__result.permissoesSelecionadas, 2);
assert.equal(context.__result.jaConcedidas, 1);
assert.equal(context.__result.concessoesReativadas, 1);
assert.equal(context.__result.concessoesCriadas, 2);
assert.equal(updates.length, 1, 'Somente a permissão negada deve ser reativada.');
assert.equal(updates[0].record.PERMITIDO, true);
assert.equal(appended.length, 2, 'As duas permissões ausentes do segundo usuário devem ser inseridas em lote.');
assert.deepEqual(cacheRemovals, ['permissions:u1', 'permissions:u2']);
assert.equal(audits.length, 1);
assert.equal(audits[0][2], 'CONCEDER_PERMISSOES_EM_MASSA');

const settingsPage = fs.readFileSync(path.join(root, '51_UI_SettingsPage.html'), 'utf8');
const scripts = fs.readFileSync(path.join(root, '50_UI_Scripts.html'), 'utf8');
assert(settingsPage.includes('data-settings-tab="permissions"') && settingsPage.includes('id="settings-permissions-panel"'));
assert(settingsPage.includes('Selecionar exibidos') && settingsPage.includes('Nenhuma permissão já existente será retirada'));
assert(scripts.includes("api('users.bulkPermissionData'") && scripts.includes("api('users.grantBulkPermissions'"));
assert(scripts.includes('confirmAction(\'Conceder permissões em massa\''));
assert(scripts.includes('refreshAccessState') && scripts.includes('Permissões concedidas e verificadas'));

console.log('OK: concessão em massa preserva acessos, reativa permissões e insere novos vínculos em lote.');
