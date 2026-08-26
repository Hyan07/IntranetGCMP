import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const context = vm.createContext({
  console,
  Utilities: {
    getUuid: () => 'uuid-test',
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
});

for (const name of ['00_CORE_Config.gs', '40_FROTA_Config.gs', '01_CORE_Utils.gs', '40_FROTA_Utils.gs', '40_FROTA_Repository.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name }).runInContext(context);
}

function evaluate(expression) { return vm.runInContext(expression, context); }
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(evaluate("frotaPlaca_('abc-1d23')") === 'ABC1D23', 'Placa Mercosul deve ser normalizada.');
assert(evaluate("frotaUpper_('Viatura sem condições de uso')") === 'VIATURA_SEM_CONDICOES_DE_USO', 'Enumerações devem ser normalizadas sem acento.');
assert(evaluate("frotaTexto_('<b>Texto</b><script>alert(1)</script>')") === 'Texto', 'Textos devem remover HTML executável.');
assert(evaluate("frotaMasp_('12345-67')") === '01234567', 'MASP deve preservar o padrão de oito dígitos.');
assert(evaluate("frotaPesquisar_([{USUARIO_MASP:'9485101'}], '094851-01', ['USUARIO_MASP']).length") === 1, 'Pesquisa da Frota deve aceitar zero inicial e hífen.');
assert(evaluate("frotaSemLinha_({_row:2,USUARIO_MASP:'9485101'}).USUARIO_MASP") === '094851-01', 'A Frota deve devolver MASP formatado para a interface.');
assert(evaluate('Object.keys(FROTA_CONFIG.SHEETS).length') === 8, 'A Frota deve possuir oito abas.');
assert(evaluate('FROTA_CONFIG.PERMISSIONS.length') === 22, 'A Frota deve possuir 22 permissões, com visualização por área.');
assert(
  evaluate("frotaLinhaCanonica_('MANUTENCOES', ['ID_MANUTENCAO','ID_VIATURA','PREFIXO','PLACA','PREFIXO'], ['M-1','V-1','VTR-01','ABC1D23','CORRETIVA'], 2).PREFIXO") === 'VTR-01',
  'A leitura deve recompor os campos de todas as abas pela estrutura canônica.'
);

let invalidPlateRejected = false;
try { evaluate("frotaPlaca_('placa errada')"); } catch { invalidPlateRejected = true; }
assert(invalidPlateRejected, 'Placas inválidas devem ser rejeitadas.');

console.log('OK: normalização, sanitização, placa, MASP, estrutura e permissões da Frota validados.');
