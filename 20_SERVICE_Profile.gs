/** Minha Conta e dados integrados do usuário logado. */

function getOwnProfile_(context) {
  const person = context.user.ID_PESSOA
    ? repositoryFindOne_(APP_CONFIG.DATABASES.PERSONNEL, 'PESSOAS', 'ID_PESSOA', context.user.ID_PESSOA)
    : null;
  const allCustodies = repositoryReadAll_(APP_CONFIG.DATABASES.ASSETS, 'CAUTELAS');
  const ownMasp = normalizeMasp_(context.user.MASP);
  const modernCustodies = allCustodies.filter(function (custody) {
    return custody.ID && normalizeMasp_(custody['Matrícula do Recebedor']) === ownMasp;
  }).map(patrimonioCustodyClient_);
  const legacyCustodies = person ? allCustodies.filter(function (custody) {
    return !custody.ID && String(custody.ID_PESSOA) === String(person.ID_PESSOA);
  }).map(function (custody) {
    return {
      id: custody.ID_CAUTELA, number: custody.ID_CAUTELA, type: 'COMUM', patrimony: custody.NUMERO_PATRIMONIAL,
      equipment: custody.DESCRICAO_PATRIMONIO, quantity: 1, pending: custody.STATUS === 'ABERTA' ? 1 : 0, unit: 'UN',
      issuedDate: custody.ENTREGUE_EM, dueDate: custody.PREVISAO_DEVOLUCAO, indefinite: false,
      deliveryCondition: custody.ESTADO_ENTREGA, status: custody.STATUS === 'ABERTA' ? 'ATIVA' : custody.STATUS
    };
  }) : [];
  const custodies = modernCustodies.concat(legacyCustodies).sort(function (a, b) {
    return String(b.issuedDate || '').localeCompare(String(a.issuedDate || ''));
  });
  const openCustodies = custodies.filter(function (custody) { return ['ATIVA', 'PARCIAL'].indexOf(normalizeUpper_(custody.status)) >= 0; });
  const shifts = repositoryReadAll_(APP_CONFIG.DATABASES.VEHICLES, 'TURNOS').filter(function (s) {
    return String(s.ID_USUARIO_RESPONSAVEL) === String(context.user.ID_USUARIO) || (person && String(s.ID_PESSOA_RESPONSAVEL) === String(person.ID_PESSOA));
  });
  const rewards = repositoryReadAll_(APP_CONFIG.DATABASES.REWARDS, 'PEDIDOS').filter(function (r) {
    return String(r.CRIADO_POR) === String(context.user.ID_USUARIO) || (person && String(r.ID_PESSOA_SOLICITANTE) === String(person.ID_PESSOA));
  });
  const documents = person && hasPermission_(context, 'pessoal.visualizar_documentos')
    ? repositoryReadAll_(APP_CONFIG.DATABASES.DOCUMENTS, 'DOCUMENTOS').filter(function (d) { return String(d.ID_PESSOA) === String(person.ID_PESSOA) && canAccessDocument_(context, d); })
    : [];
  return {
    user: omitSensitiveUser_(context.user),
    person: person ? ownPersonForClient_(person) : null,
    pendingUpdate: getOwnPendingProfileUpdate_(context),
    permissions: context.permissions,
    openCustodies: openCustodies.filter(function (custody) { return custody.type !== 'ADMINISTRATIVA'; }),
    administrativeCustodies: openCustodies.filter(function (custody) { return custody.type === 'ADMINISTRATIVA'; }),
    custodyHistory: custodies.slice(0, 20),
    shifts: sortByDateDesc_(shifts, 'INICIO_EM').slice(0, 20),
    documents: sortByDateDesc_(documents, 'DATA_DOCUMENTO').slice(0, 20),
    rewards: sortByDateDesc_(rewards, 'CRIADO_EM').slice(0, 20),
    sessions: listOwnSessions_(context)
  };
}

function updateOwnProfile_(context, payload) {
  return requestOwnProfileUpdate_(context, payload || {});
}
