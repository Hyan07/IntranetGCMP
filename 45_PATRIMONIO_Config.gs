/** Configuração isolada do módulo Patrimônio e Cautelas. */

const PATRIMONIO_CONFIG = Object.freeze({
  VERSION: '3.9.2',
  DATABASE: APP_CONFIG.DATABASES.ASSETS,
  SHEETS: Object.freeze({
    PATRIMONIOS: ['ID', 'Código', 'Patrimônio', 'Nome', 'Descrição', 'Categoria', 'Subcategoria', 'Marca', 'Modelo', 'Número de Série', 'Tipo de Controle', 'Quantidade Total', 'Quantidade Disponível', 'Quantidade Cautelada', 'Unidade', 'Cautelável', 'Situação', 'Estado de Conservação', 'Setor', 'Localização', 'Data de Aquisição', 'Valor', 'Fornecedor', 'Nota Fiscal', 'Garantia', 'Vencimento da Garantia', 'Observações', 'Foto', 'Anexo', 'Ativo', 'Criado em', 'Criado por', 'Atualizado em', 'Atualizado por'],
    CAUTELAS: ['ID', 'Número da Cautela', 'ID do Patrimônio', 'Patrimônio', 'Equipamento', 'Categoria', 'Quantidade', 'Unidade', 'GCM Recebedor', 'Matrícula do Recebedor', 'Intendente', 'Matrícula do Intendente', 'Data da Cautela', 'Hora da Cautela', 'Previsão de Devolução', 'Finalidade', 'Setor', 'Estado na Entrega', 'Observações', 'Status', 'Data da Autenticação', 'Sessão', 'Grupo da Cautela', 'Tipo de Cautela'],
    DEVOLUCOES: ['ID', 'Número da Cautela', 'ID da Cautela', 'ID do Patrimônio', 'Equipamento', 'Quantidade Devolvida', 'GCM que Devolveu', 'Matrícula', 'Intendente que Recebeu', 'Matrícula do Intendente', 'Data', 'Hora', 'Estado na Devolução', 'Avaria', 'Observações', 'Foto', 'Resultado', 'Sessão'],
    HISTORICO_PATRIMONIO: ['ID', 'Data', 'Hora', 'Tipo', 'Patrimônio', 'Equipamento', 'Categoria', 'Quantidade', 'Responsável', 'Matrícula', 'Operador', 'Matrícula do Operador', 'Situação Anterior', 'Situação Nova', 'Observação', 'Referência', 'Sessão'],
    AUDITORIA_PATRIMONIO: ['ID', 'Data', 'Hora', 'Usuário', 'Matrícula', 'Ação', 'Resultado', 'Motivo', 'Registro', 'Valor Anterior', 'Valor Novo', 'Sessão', 'User Agent', 'IP', 'Observação'],
    CATEGORIAS_PATRIMONIO: ['ID', 'Categoria', 'Subcategoria', 'Ativo', 'Criado em', 'Criado por'],
    CONFIG_PATRIMONIO: ['Chave', 'Valor', 'Descrição', 'Atualizado em', 'Atualizado por']
  }),
  PERMISSIONS: Object.freeze([
    ['PATRIMONIO_VISUALIZAR', 'visualizar', 'Visualizar o módulo Patrimônio e Cautelas'],
    ['PATRIMONIO_CADASTRAR', 'cadastrar', 'Cadastrar patrimônios e equipamentos'],
    ['PATRIMONIO_EDITAR', 'editar', 'Editar patrimônios e equipamentos'],
    ['PATRIMONIO_EXCLUIR', 'excluir', 'Inativar patrimônios'],
    ['PATRIMONIO_BAIXAR', 'baixar', 'Baixar patrimônios'],
    ['PATRIMONIO_MANUTENCAO', 'manutencao', 'Encaminhar patrimônios para manutenção'],
    ['CAUTELA_REALIZAR', 'cautela_realizar', 'Realizar cautelas'],
    ['CAUTELA_MULTIPLA', 'cautela_multipla', 'Realizar cautela com vários itens'],
    ['CAUTELA_ADMINISTRATIVA_GERENCIAR', 'cautela_administrativa', 'Realizar, visualizar e descautelar cautelas administrativas'],
    ['DESCAUTELA_REALIZAR', 'descautela_realizar', 'Registrar devoluções'],
    ['DESCAUTELA_TERCEIRO', 'descautela_terceiro', 'Receber devolução autenticada por pessoa diferente do recebedor'],
    ['CAUTELA_CANCELAR', 'cautela_cancelar', 'Cancelar cautelas'],
    ['CAUTELA_PRORROGAR', 'cautela_prorrogar', 'Prorrogar cautelas'],
    ['CAUTELA_VISUALIZAR_ATIVAS', 'cautela_ativas', 'Visualizar cautelas ativas'],
    ['HISTORICO_VISUALIZAR', 'historico', 'Visualizar histórico patrimonial'],
    ['AUDITORIA_VISUALIZAR', 'auditoria', 'Visualizar auditoria patrimonial'],
    ['PATRIMONIO_EXPORTAR', 'exportar', 'Exportar relatórios patrimoniais'],
    ['PATRIMONIO_CONFIGURAR', 'configurar', 'Gerenciar categorias e configurações patrimoniais']
  ]),
  DEFAULTS: Object.freeze([
    ['MAX_TENTATIVAS_AUTENTICACAO', '5', 'Tentativas de autenticação antes do bloqueio temporário'],
    ['BLOQUEIO_AUTENTICACAO_MINUTOS', '15', 'Duração do bloqueio de autenticação, em minutos'],
    ['PRAZO_PADRAO_CAUTELA_HORAS', '12', 'Prazo sugerido para devolução, em horas'],
    ['PRAZO_PADRAO_CAUTELA_DIAS', '30', 'Prazo sugerido para devolução'],
    ['AVISO_VENCIMENTO_DIAS', '5', 'Antecedência do alerta de vencimento'],
    ['PERMITIR_CAUTELA_VENCIDA', 'NAO', 'Permitir nova cautela a usuário com cautela vencida'],
    ['EXIGIR_PREVISAO_DEVOLUCAO', 'SIM', 'Exigir previsão de devolução'],
    ['NUMERO_CAUTELA_SEQUENCIAL', '1', 'Próximo número sequencial de cautela']
  ])
});

function patrimonioTemPermissao_(context, code, legacy) {
  return hasPermission_(context, code) || Boolean(legacy && hasPermission_(context, legacy));
}

function patrimonioExigirPermissao_(context, code, legacy) {
  if (!patrimonioTemPermissao_(context, code, legacy)) {
    patrimonioAuditar_(context, 'ACESSO_NEGADO', 'NEGADO', 'Permissão requerida: ' + code, '', null, null, {});
    throw appError_('FORBIDDEN', 'Você não possui permissão para realizar esta ação.', { permission: code });
  }
  return true;
}
