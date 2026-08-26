import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const templates = ['70_UI_FROTA_Page.html', '70_UI_FROTA_KmPage.html', '70_UI_FROTA_ViaturasPage.html', '70_UI_FROTA_HistoricoPage.html', '70_UI_FROTA_GerenciamentoPage.html', '70_UI_FROTA_ManutencoesPage.html', '70_UI_FROTA_ArquivosPage.html', '70_UI_FROTA_DefeitosPage.html', '70_UI_FROTA_Modais.html'].map(read).join('\n');

const baseStyle = `<style>
*{box-sizing:border-box}body{margin:0;padding:28px;font-family:Inter,Arial,sans-serif;background:#eef3f1;color:#243b35}.btn{min-height:42px;padding:0 15px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.btn-primary{color:#fff;background:#205047}.btn-ghost{border:1px solid #d3deda;background:#fff;color:#205047}.btn-sm{min-height:31px;padding:0 9px;font-size:10px}.status{display:inline-flex;padding:5px 8px;border-radius:999px;background:#e5eee9;color:#244d42;font-size:9px;font-weight:900}.status.red{background:#fde9e7;color:#a33b32}.status.green{background:#e4f4ea;color:#237043}.status.blue{background:#e5eefb;color:#285d9b}.status.amber{background:#fff1d3;color:#916719}.spinner{width:25px;height:25px;border:3px solid #dce7e3;border-top-color:#286558;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.form-message{padding:11px;border-radius:9px}.form-message.error{color:#9c332c;background:#fdeae8}.form-message.warning{color:#765718;background:#fff5d9}@media(max-width:600px){body{padding:10px}}
</style>`;

const mock = `<script>
const vehicles=[
 {ID_VIATURA:'v1',PREFIXO:'VTR 01',PLACA:'ABC1D23',TIPO:'AUTOMOVEL',MARCA:'FIAT',MODELO:'PULSE',ANO:2024,COR:'BRANCA',COMBUSTIVEL:'FLEX',KM_ATUAL:28450,STATUS:'DISPONIVEL',SETOR:'Patrulhamento',ATIVO:'SIM',ULTIMO_CONDUTOR:'GCM Almeida',ULTIMA_MOVIMENTACAO:new Date(Date.now()-86400000).toISOString(),OBSERVACAO_ATUAL:'Rádio digital e kit de primeiros socorros conferidos.',DEFEITOS_PENDENTES:0,PNEUS_SITUACAO:'BOM',REVISAO_PROXIMA_KM:29000,SEGURO_VENCIMENTO:'2027-02-20',LICENCIAMENTO_VENCIMENTO:'2027-04-15'},
 {ID_VIATURA:'v2',PREFIXO:'MOTO 03',PLACA:'TDC1D91',TIPO:'MOTOCICLETA',MARCA:'HONDA',MODELO:'XRE 300',ANO:2023,COR:'AZUL',COMBUSTIVEL:'GASOLINA',KM_ATUAL:17320,STATUS:'INDISPONIVEL',SETOR:'Moto Patrulha',ATIVO:'SIM',ULTIMO_CONDUTOR:'GCM Souza',ULTIMA_MOVIMENTACAO:new Date(Date.now()-172800000).toISOString(),OBSERVACAO_ATUAL:'Aguardando substituição do pneu traseiro.',DEFEITOS_PENDENTES:2,PNEUS_SITUACAO:'CRITICO',REVISAO_PROXIMA_KM:17500,SEGURO_VENCIMENTO:'2026-08-12',LICENCIAMENTO_VENCIMENTO:'2026-09-05'}
];
const page=(items)=>({items,page:1,pageSize:20,total:items.length,pages:1});
const permissions=['FROTA_ACESSAR','FROTA_KM_ABRIR','FROTA_KM_ENCERRAR','FROTA_ENCERRAR_MOVIMENTACAO_OUTRO_USUARIO','FROTA_VISUALIZAR_GERENCIAMENTO','FROTA_EDITAR_OBSERVACOES','FROTA_VISUALIZAR_HISTORICO','FROTA_CADASTRAR_VIATURA','FROTA_EDITAR_VIATURA','FROTA_EXCLUIR_VIATURA','FROTA_ALTERAR_STATUS','FROTA_VISUALIZAR_ARQUIVOS','FROTA_ENVIAR_ARQUIVOS','FROTA_EXCLUIR_ARQUIVOS','FROTA_GERENCIAR_MANUTENCOES','FROTA_GERENCIAR_PNEUS','FROTA_TRATAR_DEFEITOS','FROTA_RECEBER_NOTIFICACOES'];
const bootstrap={versao:'2.0.0',usuario:{nome:'GCM Almeida',masp:'01234567',maspFormatado:'012345-67'},permissoes:permissions,agora:new Date().toISOString(),resumo:{viaturas:8,disponiveis:5,movimentacoesAbertas:2,defeitosPendentes:3},opcoes:{statusViatura:['DISPONIVEL','EM_USO','EM_MANUTENCAO','INDISPONIVEL','RESERVADA','SINISTRADA','BAIXADA','INATIVA'],tiposOcorrencia:['OBSERVACAO','DEFEITO','IRREGULARIDADE','LIMPEZA','DOCUMENTACAO','EQUIPAMENTO_AUSENTE','OUTRO'],categoriasOcorrencia:['MECANICA','ELETRICA','PNEUS','FREIOS','ILUMINACAO','LATARIA','MOTOR','SUSPENSAO','DIRECAO','EQUIPAMENTOS','LIMPEZA','DOCUMENTACAO','OUTRO'],gravidades:['BAIXA','MEDIA','ALTA','VIATURA_SEM_CONDICOES_DE_USO'],posicoesPneus:['DIANTEIRO_ESQUERDO','DIANTEIRO_DIREITO','TRASEIRO_ESQUERDO','TRASEIRO_DIREITO','ESTEPE'],estadosPneus:['NOVO','BOM','ATENCAO','RUIM','CRITICO','RETIRADO'],categoriasArquivos:['CRLV','SEGURO','LICENCIAMENTO','NOTA_FISCAL','ORDEM_DE_SERVICO','ORCAMENTO','LAUDO','FOTO','MANUTENCAO','OUTRO'],maxUploadBytes:8388608}};
async function mockApi(action,payload={}){
 if(action==='frota.bootstrap')return bootstrap;
 if(action==='frota.km.estado')return {usuario:bootstrap.usuario,agora:new Date().toISOString(),movimentacao:null,viatura:null};
 if(action==='frota.km.viaturas')return vehicles;
 if(action==='frota.viaturas.listar')return page(vehicles);
 if(action==='frota.viaturas.obter')return vehicles.find(v=>v.ID_VIATURA===payload.id)||vehicles[0];
 if(action==='frota.historico.listar')return page([{ID_HISTORICO:'h1',DATA_HORA:new Date().toISOString(),PREFIXO:'VTR 01',PLACA:'ABC1D23',TIPO_ACAO:'ENCERRAMENTO_UTILIZACAO',CAMPO_ALTERADO:'MOVIMENTACAO',USUARIO_NOME:'GCM Almeida',USUARIO_MASP:'01234567',JUSTIFICATIVA:'Retorno sem alterações.'}]);
 if(action==='frota.manutencoes.listar')return page([{ID_MANUTENCAO:'m1',ID_VIATURA:'v2',PREFIXO:'MOTO 03',PLACA:'TDC1D91',CLASSIFICACAO:'PNEUS',DESCRICAO_PROBLEMA:'Substituição do pneu traseiro',DATA_ABERTURA:'2026-07-12',DATA_PREVISTA:'2026-07-15',OFICINA_FORNECEDOR:'Oficina Municipal',VALOR_TOTAL:780,STATUS:'AUTORIZADA'}]);
 if(action==='frota.arquivos.listar')return page([{ID_REGISTRO:'a1',ID_VIATURA:'v1',PREFIXO:'VTR 01',PLACA:'ABC1D23',NOME_ARQUIVO:'CRLV_2026.pdf',TIPO_ARQUIVO:'application/pdf',TAMANHO_BYTES:342000,CATEGORIA:'CRLV',DESCRICAO:'Documento digital atualizado',DATA_HORA_UPLOAD:new Date().toISOString(),ENVIADO_POR_NOME:'GCM Almeida',LINK_ARQUIVO:'#'}]);
 if(action==='frota.defeitos.listar')return page([{ID_DEFEITO:'d1',ID_REGISTRO_OCORRENCIA:'d1',REGISTRO_TIPO:'DEFEITO',ID_VIATURA:'v2',PREFIXO:'MOTO 03',PLACA:'TDC1D91',CATEGORIA:'PNEUS',DESCRICAO:'Pneu traseiro com desgaste acentuado.',INFORMADO_POR_NOME:'GCM Souza',INFORMADO_POR_MASP:'02345678',DATA_HORA_REGISTRO:new Date().toISOString(),GRAVIDADE:'ALTA',STATUS_DEFEITO:'PENDENTE',SOLICITOU_RETIRADA:'SIM'}]);
 return {};
}
const bridge={api:mockApi,has:p=>permissions.includes(p),toast:console.log,icon:()=>'',esc:v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])),formatDate:(v,d=false)=>v?new Intl.DateTimeFormat('pt-BR',d?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—',badge:s=>'<span class="status '+(['INDISPONIVEL','CRITICO','ALTA'].includes(String(s))?'red':['DISPONIVEL','BOM','CONCLUIDA'].includes(String(s))?'green':['EM_USO','AUTORIZADA'].includes(String(s))?'blue':'amber')+'">'+String(s||'—').replace(/_/g,' ')+'</span>',debounce:(fn,w=50)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),w)}}};
const pageTemplate=document.querySelector('#page-viaturas');document.body.appendChild(pageTemplate.content.cloneNode(true));window.FrotaModule.init(bridge);
</script>`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia Frota</title>${baseStyle}${read('70_UI_FROTA_Styles.html')}${read('50_UI_VisualSystem.html')}</head><body>${templates}${read('70_UI_FROTA_JavaScript.html')}${mock}</body></html>`;
fs.writeFileSync(path.join(root, 'tests', 'frota-preview.html'), html);
console.log('Prévia criada em tests/frota-preview.html');
