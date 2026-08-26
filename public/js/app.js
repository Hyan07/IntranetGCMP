import { api } from './api.js';
import { dashboardPage, personnelPage, assetsPage, fleetPage, usersPage, auditPage, documentsPage, rewardsPage, settingsPage, profilePage } from './pages.js';

const state = { user: null, permissions: [], currentPage: 'dashboard' };

const menu = [
  { id:'dashboard', label:'Visão geral', permission:null },
  { id:'pessoal', label:'Pessoal', permission:'pessoal.visualizar' },
  { id:'patrimonio', label:'Patrimônio', permission:'patrimonio.visualizar' },
  { id:'frota', label:'Frota', permission:'frota.visualizar' },
  { id:'documentos', label:'Documentos', permission:'documentos.visualizar' },
  { id:'recompensas', label:'Recompensas', permission:'recompensas.visualizar' },
  { id:'usuarios', label:'Usuários', permission:'usuarios.visualizar' },
  { id:'auditoria', label:'Auditoria', permission:'auditoria.visualizar' },
  { id:'configuracoes', label:'Configurações', permission:'configuracoes.gerenciar' }
];

const titleMap = Object.fromEntries(menu.map(item=>[item.id,item.label]));
titleMap.perfil='Minha conta';

const $ = (selector) => document.querySelector(selector);
const initials = (name) => String(name||'U').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();

function toast(message, type='') {
  const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message;
  $('#toast-container').appendChild(el); setTimeout(()=>el.remove(),3500);
}

function setAuthView(authenticated) {
  $('#auth-view').hidden=authenticated;
  $('#application').hidden=!authenticated;
}

function buildMenu() {
  const allowed = menu.filter(item=>!item.permission || state.permissions.includes(item.permission));
  $('#main-menu').innerHTML=allowed.map(item=>`<button class="menu-item ${item.id===state.currentPage?'active':''}" data-page="${item.id}">${item.label}</button>`).join('');
}

function populateUser() {
  const user=state.user;
  const avatar=initials(user.nome);
  $('#sidebar-avatar').textContent=avatar; $('#header-avatar').textContent=avatar;
  $('#sidebar-user-name').textContent=user.nome; $('#header-user-name').textContent=user.nome;
  $('#sidebar-user-masp').textContent=user.masp; $('#header-user-role').textContent=user.funcao||user.cargo||'Acesso institucional';
}

async function renderPage(page) {
  state.currentPage=page; buildMenu();
  $('#page-title').textContent=titleMap[page]||'Intranet';
  $('#page-breadcrumb').textContent=page==='dashboard'?'Intranet':'Intranet / '+(titleMap[page]||page);
  $('#main-content').innerHTML='<div class="route-loading">Carregando informações…</div>';
  try {
    const renderers={
      dashboard:()=>dashboardPage(), pessoal:()=>personnelPage(), patrimonio:()=>assetsPage(), frota:()=>fleetPage(),
      usuarios:()=>usersPage(), auditoria:()=>auditPage(), perfil:()=>profilePage(state),
      documentos:()=>documentsPage(), recompensas:()=>rewardsPage(), configuracoes:()=>settingsPage()
    };
    $('#main-content').innerHTML=await (renderers[page]||renderers.dashboard)();
    bindPageActions();
  } catch(error) {
    if(error.status===401){ await logout(false); return; }
    $('#main-content').innerHTML=`<section class="panel"><div class="empty">${error.message}</div></section>`;
  }
}

function formValue(form,name){return new FormData(form).get(name)?.toString().trim()||''}

function openModal(title, fields, onSubmit) {
  const wrap=document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<form class="modal"><h3>${title}</h3><div class="modal-grid">${fields.map(f=>`<label class="field"><span>${f.label}</span>${f.type==='select'?`<select name="${f.name}">${(f.options||[]).map(o=>`<option value="${o}">${o}</option>`).join('')}</select>`:`<input name="${f.name}" type="${f.type||'text'}" ${f.required?'required':''} ${f.placeholder?`placeholder="${f.placeholder}"`:''}>`}</label>`).join('')}</div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-close]').onclick=()=>wrap.remove();
  wrap.querySelector('form').onsubmit=async(event)=>{event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));try{await onSubmit(data);wrap.remove();toast('Registro salvo com sucesso.');renderPage(state.currentPage)}catch(error){toast(error.message,'error')}};
}

function bindPageActions() {
  document.querySelectorAll('[data-filter-table]').forEach(input=>{
    input.addEventListener('input',()=>{
      const needle=input.value.toLowerCase();
      document.querySelectorAll('[data-table-panel] tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(needle));
    });
  });

  document.querySelector('[data-action="new-person"]')?.addEventListener('click',()=>openModal('Novo cadastro de pessoal',[
    {name:'nomeCompleto',label:'Nome completo',required:true},{name:'masp',label:'MASP',required:true},{name:'cpf',label:'CPF'},
    {name:'cargo',label:'Cargo'},{name:'funcao',label:'Função'},{name:'setor',label:'Setor'},{name:'equipe',label:'Equipe'},
    {name:'email',label:'E-mail',type:'email'},{name:'telefone',label:'Telefone'}
  ],data=>api('/pessoal',{method:'POST',body:data})));

  document.querySelector('[data-action="new-asset"]')?.addEventListener('click',()=>openModal('Novo patrimônio',[
    {name:'numeroPatrimonial',label:'Número patrimonial',required:true},{name:'descricao',label:'Descrição',required:true},{name:'categoria',label:'Categoria'},
    {name:'marca',label:'Marca'},{name:'modelo',label:'Modelo'},{name:'numeroSerie',label:'Número de série'},
    {name:'estadoConservacao',label:'Estado',type:'select',options:['BOM','REGULAR','RUIM']},{name:'setorResponsavel',label:'Setor responsável'}
  ],data=>api('/patrimonio',{method:'POST',body:data})));

  document.querySelector('[data-action="new-vehicle"]')?.addEventListener('click',()=>openModal('Nova viatura',[
    {name:'prefixo',label:'Prefixo',required:true},{name:'placa',label:'Placa',required:true},{name:'tipo',label:'Tipo'},
    {name:'marca',label:'Marca'},{name:'modelo',label:'Modelo'},{name:'anoFabricacao',label:'Ano fabricação',type:'number'},
    {name:'anoModelo',label:'Ano modelo',type:'number'},{name:'kmAtual',label:'KM atual',type:'number'},{name:'setor',label:'Setor'}
  ],data=>api('/frota/viaturas',{method:'POST',body:data})));

  document.querySelector('[data-action="new-user"]')?.addEventListener('click',()=>openModal('Novo usuário',[
    {name:'nome',label:'Nome',required:true},{name:'masp',label:'MASP',required:true},{name:'email',label:'E-mail',type:'email'},
    {name:'cargo',label:'Cargo'},{name:'funcao',label:'Função'},{name:'setor',label:'Setor'},{name:'password',label:'Senha temporária',type:'password',required:true}
  ],data=>api('/usuarios',{method:'POST',body:data})));

  document.querySelector('[data-action="new-document"]')?.addEventListener('click',()=>openModal('Novo documento',[
    {name:'numero',label:'Número'},{name:'tipo',label:'Tipo'},{name:'assunto',label:'Assunto',required:true},
    {name:'origem',label:'Origem'},{name:'destino',label:'Destino'},{name:'setor',label:'Setor'},
    {name:'dataDocumento',label:'Data',type:'date'},{name:'nivelAcesso',label:'Nível de acesso',type:'select',options:['INTERNO','RESTRITO','PUBLICO']}
  ],data=>api('/documentos',{method:'POST',body:data})));

  document.querySelector('[data-action="new-reward"]')?.addEventListener('click',()=>openModal('Novo pedido de recompensa',[
    {name:'numero',label:'Número'},{name:'titulo',label:'Título',required:true},{name:'solicitanteNome',label:'Solicitante'},
    {name:'setor',label:'Setor'},{name:'tipoRecompensa',label:'Tipo de recompensa'},{name:'dataFato',label:'Data do fato',type:'datetime-local'},
    {name:'localFato',label:'Local do fato'}
  ],data=>api('/recompensas',{method:'POST',body:data})));

  document.querySelector('[data-action="change-password"]')?.addEventListener('click',()=>openModal('Alterar senha',[
    {name:'currentPassword',label:'Senha atual',type:'password',required:true},{name:'newPassword',label:'Nova senha',type:'password',required:true}
  ],data=>api('/auth/password/change',{method:'POST',body:data})));
}

async function login(event) {
  event.preventDefault();
  const form=event.currentTarget;
  const errorBox=$('#login-error'); errorBox.hidden=true;
  try {
    const result=await api('/auth/login',{method:'POST',body:{masp:formValue(form,'masp'),password:formValue(form,'password')}});
    state.user=result.user; state.permissions=result.permissions||[];
    populateUser(); setAuthView(true); buildMenu(); await renderPage('dashboard');
    if(result.mustChangePassword) toast('Altere sua senha temporária em Minha conta.');
  } catch(error){errorBox.textContent=error.message;errorBox.hidden=false}
}

async function logout(callApi=true) {
  try{if(callApi)await api('/auth/logout',{method:'POST'})}catch{}
  state.user=null;state.permissions=[];setAuthView(false);$('#login-form').reset();
}

async function restoreSession() {
  try {
    const result=await api('/auth/me');
    state.user=result.user;state.permissions=result.permissions||[];populateUser();setAuthView(true);buildMenu();await renderPage('dashboard');
  } catch { setAuthView(false); }
}

function bindAuth() {
  $('#login-form').addEventListener('submit',login);
  $('#open-recovery').onclick=()=>{$('#login-panel').hidden=true;$('#recovery-panel').hidden=false};
  $('#back-login').onclick=()=>{$('#recovery-panel').hidden=true;$('#login-panel').hidden=false};
  $('#already-have-code').onclick=()=>{$('#recovery-request-form').hidden=true;$('#recovery-confirm-form').hidden=false};

  $('#recovery-request-form').onsubmit=async(event)=>{
    event.preventDefault();const form=event.currentTarget;const msg=form.querySelector('.recovery-message');
    try{const r=await api('/auth/password/recovery/request',{method:'POST',body:{masp:formValue(form,'masp'),email:formValue(form,'email')}});msg.textContent=r.message;msg.className='form-message success recovery-message';msg.hidden=false}
    catch(error){msg.textContent=error.message;msg.className='form-message error recovery-message';msg.hidden=false}
  };

  $('#recovery-confirm-form').onsubmit=async(event)=>{
    event.preventDefault();const form=event.currentTarget;const msg=form.querySelector('.recovery-message');
    try{const r=await api('/auth/password/recovery/confirm',{method:'POST',body:{masp:formValue(form,'masp'),email:formValue(form,'email'),code:formValue(form,'code'),newPassword:formValue(form,'newPassword')}});msg.textContent=r.message;msg.className='form-message success recovery-message';msg.hidden=false;setTimeout(()=>{$('#recovery-panel').hidden=true;$('#login-panel').hidden=false},1000)}
    catch(error){msg.textContent=error.message;msg.className='form-message error recovery-message';msg.hidden=false}
  };
}

document.addEventListener('click',(event)=>{
  const pageButton=event.target.closest('[data-page]');
  if(pageButton){renderPage(pageButton.dataset.page); if(innerWidth<800)$('#sidebar').classList.remove('open')}
});
$('#sidebar-logout').onclick=()=>logout(true);
$('#mobile-menu-button').onclick=()=>$('#sidebar').classList.toggle('open');

bindAuth();
restoreSession();
