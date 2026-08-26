import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const properties = new Map([['PASSWORD_PEPPER', 'test-pepper']]);
const scriptProperties = {
  getProperty: (key) => properties.get(key) ?? null,
  setProperty: (key, value) => properties.set(key, value),
};

const context = vm.createContext({
  console,
  PropertiesService: { getScriptProperties: () => scriptProperties },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value), 'utf8').digest()].map((byte) => byte > 127 ? byte - 256 : byte),
    getUuid: () => crypto.randomUUID(),
    formatDate: (date) => new Date(date).toISOString(),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
});

for (const name of ['00_CORE_Config.gs', '01_CORE_Utils.gs', '01_CORE_ValidationService.gs', '01_CORE_PasswordService.gs']) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  new vm.Script(source, { filename: name }).runInContext(context);
}

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

const assertions = [
  [evaluate("normalizeMasp_('12345-67')"), '01234567', 'MASP deve preservar/completar zero inicial'],
  [evaluate("formatMasp_('12345-67')"), '012345-67', 'MASP deve ser exibido no padrão 000000-00'],
  [evaluate("maspMatches_('9485101', '094851-01')"), true, 'Pesquisa deve encontrar MASP antigo quando o zero inicial for digitado'],
  [evaluate("maspMatches_('09485101', '94851-01')"), true, 'Pesquisa deve aceitar MASP sem o zero inicial'],
  [evaluate("searchRows_([{MASP:'9485101',NOME:'Teste'}], '094851-01', ['NOME','MASP']).length"), 1, 'Busca geral deve normalizar o MASP'],
  [evaluate("validateEmail_('Pessoa@Exemplo.com', true)"), 'pessoa@exemplo.com', 'E-mail deve ser normalizado'],
  [evaluate("normalizePlate_('abc-1d23')"), 'ABC1D23', 'Placa deve ser normalizada'],
  [evaluate("safeEqual_('abc', 'abc')"), true, 'Comparação segura deve aceitar valores iguais'],
  [evaluate("safeEqual_('abc', 'abd')"), false, 'Comparação segura deve rejeitar valores diferentes'],
];

for (const [actual, expected, message] of assertions) {
  if (actual !== expected) throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
}

evaluate("globalThis.__passwordRecord = makePasswordRecord_('SenhaForte123')");
if (!evaluate("verifyPassword_('SenhaForte123', __passwordRecord)")) throw new Error('Senha válida não foi confirmada.');
if (evaluate("verifyPassword_('SenhaErrada123', __passwordRecord)")) throw new Error('Senha incorreta foi aceita.');

let weakRejected = false;
try { evaluate("validatePasswordPolicy_('12345678')"); } catch { weakRejected = true; }
if (!weakRejected) throw new Error('Senha previsível não foi rejeitada.');

let longMaspRejected = false;
try { evaluate("validateMasp_('123456789')"); } catch { longMaspRejected = true; }
if (!longMaspRejected) throw new Error('MASP com mais de oito dígitos não foi rejeitado.');

console.log('OK: normalização de MASP/placa/e-mail, hash de senha e política básica validados.');
