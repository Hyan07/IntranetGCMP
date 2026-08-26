import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const context = vm.createContext({ console });
for (const name of ['00_CORE_Config.gs', '40_FROTA_Config.gs', '01_CORE_Utils.gs', '40_FROTA_Utils.gs', '40_FROTA_Historico.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name }).runInContext(context);
}

context.__row = {
  DATA_HORA: '2026-07-13T12:00:00.000Z',
  PREFIXO: 'VTR-01',
  PLACA: 'ABC1D23',
  TIPO_ACAO: 'ALTERACAO_STATUS',
  CAMPO_ALTERADO: 'STATUS',
  VALOR_ANTERIOR: 'INDISPONIVEL',
  VALOR_NOVO: 'DISPONIVEL',
  JUSTIFICATIVA: 'Defeito resolvido',
  USUARIO_MASP: '1234567',
  USUARIO_NOME: 'GCM Silva'
};

context.__predicate = vm.runInContext(`frotaHistoricoCriarFiltro_({
  startDate: '2026-07-01', endDate: '2026-07-31', prefix: 'vtr-01',
  driver: 'silva', type: 'alteracao_status', status: 'disponivel'
})`, context);
assert.equal(vm.runInContext('__predicate(__row)', context), true);

context.__row.USUARIO_NOME = 'GCM Souza';
assert.equal(vm.runInContext('__predicate(__row)', context), false);

context.__predicate = vm.runInContext("frotaHistoricoCriarFiltro_({ query: 'defeito resolvido' })", context);
assert.equal(vm.runInContext('__predicate(__row)', context), true);

console.log('OK: filtros compartilhados pelo histórico e pela impressão institucional validados.');
