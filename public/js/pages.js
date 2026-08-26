import { api } from './api.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const statusBadge = (value) => {
  const text = String(value || '—');
  const good = ['ATIVO','ATIVA','DISPONIVEL','RESOLVIDO','SUCESSO'].includes(text);
  const bad = ['INATIVO','INDISPONIVEL','NEGADO','ERRO'].includes(text);
  return `<span class="badge ${good?'success':bad?'danger':'warning'}">${esc(text)}</span>`;
};

function table(headers, rows) {
  if (!rows.length) return '<div class="empty">Nenhum registro encontrado.</div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(h=>`<td>${h.render?h.render(row[h.key],row):esc(row[h.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function toolbar(title, subtitle, extra = '') {
  return `<div class="page-toolbar"><div><p class="eyebrow">${esc(subtitle)}</p><h2>${esc(title)}</h2></div><div class="toolbar-actions">${extra}</div></div>`;
}

export async function dashboardPage() {
  const { data } = await api('/dashboard');
  const metrics = [
    ['Pessoal ativo', data.pessoalAtivo, 'Cadastros ativos'],
    ['Patrimônio disponível', data.patrimonioDisponivel, 'Itens disponíveis'],
    ['Cautelas ativas', data.cautelasAtivas, 'Responsabilidades abertas'],
    ['Viaturas disponíveis', data.viaturasDisponiveis, 'Frota pronta'],
    ['Defeitos abertos', data.defeitosAbertos, 'Demandam acompanhamento'],
    ['Notificações', data.notificacoesPendentes, 'Pendências não lidas']
  ];
  return `${toolbar('Visão geral','Painel institucional')}
  <section class="cards">${metrics.map(m=>`<article class="metric-card"><small>${esc(m[0])}</small><strong>${m[1]}</strong><em>${esc(m[2])}</em></article>`).join('')}</section>
  <section class="panel"><div class="panel-header"><h3>Ambiente migrado para Node.js + MySQL</h3></div><div style="padding:20px;line-height:1.7;color:var(--muted)">A nova versão substitui Google Apps Script por API REST no Express e banco MySQL, mantendo autenticação, permissões e auditoria.</div></section>`;
}

export async function personnelPage() {
  const result = await api('/pessoal?limit=100');
  const headers = [
    {key:'nome_completo',label:'Nome'}, {key:'masp',label:'MASP'}, {key:'cargo',label:'Cargo'},
    {key:'funcao',label:'Função'}, {key:'setor',label:'Setor'}, {key:'equipe',label:'Equipe'},
    {key:'status',label:'Situação',render:statusBadge}
  ];
  return `${toolbar('Pessoal','Gestão de efetivo','<input class="search" data-filter-table placeholder="Pesquisar na lista"><button class="btn btn-primary" data-action="new-person">Novo cadastro</button>')}
  <section class="panel" data-table-panel>${table(headers,result.data)}</section>`;
}

export async function assetsPage() {
  const [assets, custodies] = await Promise.all([api('/patrimonio?limit=100'), api('/patrimonio/cautelas/ativas')]);
  const headers = [
    {key:'numero_patrimonial',label:'Patrimônio'}, {key:'descricao',label:'Descrição'}, {key:'categoria',label:'Categoria'},
    {key:'marca',label:'Marca'}, {key:'modelo',label:'Modelo'}, {key:'estado_conservacao',label:'Estado'},
    {key:'status',label:'Situação',render:statusBadge}
  ];
  return `${toolbar('Patrimônio e cautelas','Controle de bens','<input class="search" data-filter-table placeholder="Pesquisar patrimônio"><button class="btn btn-primary" data-action="new-asset">Novo patrimônio</button>')}
  <section class="cards"><article class="metric-card"><small>Itens exibidos</small><strong>${assets.data.length}</strong><em>Até 100 registros</em></article><article class="metric-card"><small>Cautelas ativas</small><strong>${custodies.data.length}</strong><em>Itens sob responsabilidade</em></article></section>
  <section class="panel" data-table-panel><div class="panel-header"><h3>Patrimônios</h3></div>${table(headers,assets.data)}</section>
  <section class="panel"><div class="panel-header"><h3>Cautelas ativas</h3></div>${table([
    {key:'numero',label:'Termo'},{key:'nome_pessoa',label:'Recebedor'},{key:'masp',label:'MASP'},{key:'entregue_em',label:'Entrega',render:date},{key:'previsao_devolucao',label:'Previsão',render:date},{key:'itens',label:'Itens'}
  ],custodies.data)}</section>`;
}

export async function fleetPage() {
  const [vehicles, defects] = await Promise.all([api('/frota/viaturas?limit=100'), api('/frota/defeitos')]);
  const headers = [
    {key:'prefixo',label:'Prefixo'}, {key:'placa',label:'Placa'}, {key:'marca',label:'Marca'}, {key:'modelo',label:'Modelo'},
    {key:'km_atual',label:'KM'}, {key:'setor',label:'Setor'}, {key:'status',label:'Situação',render:statusBadge}
  ];
  return `${toolbar('Frota','Gestão de viaturas','<input class="search" data-filter-table placeholder="Pesquisar viatura"><button class="btn btn-primary" data-action="new-vehicle">Nova viatura</button>')}
  <section class="cards"><article class="metric-card"><small>Viaturas</small><strong>${vehicles.data.length}</strong><em>Cadastros exibidos</em></article><article class="metric-card"><small>Defeitos</small><strong>${defects.data.filter(d=>d.status!=='RESOLVIDO').length}</strong><em>Em aberto</em></article></section>
  <section class="panel" data-table-panel><div class="panel-header"><h3>Viaturas</h3></div>${table(headers,vehicles.data)}</section>
  <section class="panel"><div class="panel-header"><h3>Defeitos e pendências</h3></div>${table([
    {key:'prefixo',label:'Viatura'},{key:'titulo',label:'Título'},{key:'descricao',label:'Descrição'},{key:'gravidade',label:'Gravidade'},{key:'status',label:'Status',render:statusBadge},{key:'criado_em',label:'Registro',render:date}
  ],defects.data)}</section>`;
}

export async function usersPage() {
  const result = await api('/usuarios?limit=100');
  return `${toolbar('Usuários e permissões','Administração de acesso','<input class="search" data-filter-table placeholder="Pesquisar usuário"><button class="btn btn-primary" data-action="new-user">Novo usuário</button>')}
  <section class="panel" data-table-panel>${table([
    {key:'nome',label:'Nome'},{key:'masp',label:'MASP'},{key:'email',label:'E-mail'},{key:'cargo',label:'Cargo'},{key:'setor',label:'Setor'},{key:'status',label:'Situação',render:statusBadge},{key:'ultimo_acesso',label:'Último acesso',render:date}
  ],result.data)}</section>`;
}

export async function auditPage() {
  const result = await api('/auditoria?limit=100');
  return `${toolbar('Auditoria','Rastreabilidade do sistema','<input class="search" data-filter-table placeholder="Pesquisar auditoria">')}
  <section class="panel" data-table-panel>${table([
    {key:'data_hora',label:'Data/hora',render:date},{key:'masp',label:'MASP'},{key:'modulo',label:'Módulo'},{key:'acao',label:'Ação'},{key:'id_registro',label:'Registro'},{key:'resultado',label:'Resultado',render:statusBadge},{key:'ip',label:'IP'}
  ],result.data)}</section>`;
}

export async function documentsPage() {
  const result = await api('/documentos?limit=100');
  return `${toolbar('Documentos','Gestão documental','<input class="search" data-filter-table placeholder="Pesquisar documento"><button class="btn btn-primary" data-action="new-document">Novo documento</button>')}
  <section class="panel" data-table-panel>${table([
    {key:'numero',label:'Número'},{key:'tipo',label:'Tipo'},{key:'assunto',label:'Assunto'},{key:'origem',label:'Origem'},{key:'destino',label:'Destino'},{key:'setor',label:'Setor'},{key:'situacao',label:'Situação',render:statusBadge},{key:'data_documento',label:'Data',render:(v)=>v?new Intl.DateTimeFormat('pt-BR').format(new Date(v)):'—'}
  ],result.data)}</section>`;
}

export async function rewardsPage() {
  const result = await api('/recompensas?limit=100');
  return `${toolbar('Recompensas','Fluxos de reconhecimento','<input class="search" data-filter-table placeholder="Pesquisar pedido"><button class="btn btn-primary" data-action="new-reward">Novo pedido</button>')}
  <section class="panel" data-table-panel>${table([
    {key:'numero',label:'Número'},{key:'titulo',label:'Título'},{key:'solicitante_nome',label:'Solicitante'},{key:'setor',label:'Setor'},{key:'tipo_recompensa',label:'Tipo'},{key:'status',label:'Status',render:statusBadge},{key:'criado_em',label:'Criado em',render:date}
  ],result.data)}</section>`;
}

export async function settingsPage() {
  const result = await api('/configuracoes');
  return `${toolbar('Configurações','Parâmetros do sistema')}
  <section class="panel">${table([
    {key:'chave',label:'Chave'},{key:'valor',label:'Valor'},{key:'descricao',label:'Descrição'},{key:'atualizado_em',label:'Atualização',render:date}
  ],result.data)}</section>`;
}

export async function profilePage(context) {
  const user = context.user;
  return `${toolbar('Minha conta','Perfil')}
  <section class="panel"><div class="panel-header"><h3>${esc(user.nome)}</h3></div><div style="padding:20px;display:grid;gap:10px">
  <div><strong>MASP:</strong> ${esc(user.masp)}</div><div><strong>E-mail:</strong> ${esc(user.email||'—')}</div><div><strong>Cargo:</strong> ${esc(user.cargo||'—')}</div><div><strong>Função:</strong> ${esc(user.funcao||'—')}</div><div><strong>Setor:</strong> ${esc(user.setor||'—')}</div>
  <button class="btn btn-secondary" style="width:max-content" data-action="change-password">Alterar senha</button></div></section>`;
}
