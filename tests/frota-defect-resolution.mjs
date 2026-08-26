import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const context = vm.createContext({ console });
for (const name of ['00_CORE_Config.gs', '40_FROTA_Config.gs', '01_CORE_Utils.gs', '40_FROTA_Utils.gs', '40_FROTA_Service.gs', '40_FROTA_Defeitos.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name }).runInContext(context);
}

context.__data = { MOVIMENTACOES_KM: [], DEFEITOS_VIATURAS: [] };
context.frotaLerTodos_ = sheet => context.__data[sheet] || [];
context.FrotaRepository_ = () => ({
  readAll: context.frotaLerTodos_,
});
const vehicle = { ID_VIATURA: 'V1', STATUS: 'INDISPONIVEL', MOVIMENTACAO_ATIVA_ID: 'ID-ANTIGO' };
context.__vehicle = vehicle;

assert.equal(vm.runInContext('frotaMotivoBloqueioRestauracao_(__vehicle, "D1")', context), '');

context.__data.MOVIMENTACOES_KM = [{ ID_VIATURA: 'V1', STATUS: 'ABERTA' }];
assert.match(vm.runInContext('frotaMotivoBloqueioRestauracao_(__vehicle, "D1")', context), /movimentação de KM aberta/i);

context.__data.MOVIMENTACOES_KM = [];
context.__data.DEFEITOS_VIATURAS = [{ ID_DEFEITO: 'D2', ID_VIATURA: 'V1', STATUS_DEFEITO: 'PENDENTE', GRAVIDADE: 'VIATURA_SEM_CONDICOES_DE_USO', ATIVO: 'SIM' }];
assert.match(vm.runInContext('frotaMotivoBloqueioRestauracao_(__vehicle, "D1")', context), /outro defeito impeditivo/i);

context.__data.DEFEITOS_VIATURAS[0].STATUS_DEFEITO = 'RESOLVIDO';
assert.equal(vm.runInContext('frotaMotivoBloqueioRestauracao_(__vehicle, "D1")', context), '');

console.log('OK: ID antigo não bloqueia liberação; movimentação real e defeito impeditivo continuam protegidos.');
