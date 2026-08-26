/**
 * Instalador completo e idempotente.
 * Execute instalarSistema() uma vez pelo editor do Apps Script após o clasp push.
 */

const INSTALLER_SCHEMA = Object.freeze({
  DB_CONFIG: {
    name: 'Intranet Recursos - Configuracao',
    sheets: {
      USUARIOS: ['ID_USUARIO', 'ID_PESSOA', 'MASP', 'NOME', 'EMAIL', 'TELEFONE', 'CARGO', 'FUNCAO', 'SETOR', 'STATUS', 'SENHA_HASH', 'SENHA_SALT', 'SENHA_ALTERADA_EM', 'TROCAR_SENHA', 'TENTATIVAS', 'BLOQUEADO_ATE', 'ULTIMO_ACESSO', 'OBSERVACOES', 'CRIADO_EM', 'ATUALIZADO_EM'],
      PERMISSOES: ['ID_PERMISSAO', 'CODIGO', 'MODULO', 'ACAO', 'DESCRICAO', 'ATIVA'],
      USUARIO_PERMISSOES: ['ID', 'ID_USUARIO', 'ID_PERMISSAO', 'PERMITIDO', 'CONCEDIDO_POR', 'CONCEDIDO_EM'],
      SESSOES: ['TOKEN', 'ID_USUARIO', 'MASP', 'CRIADO_EM', 'EXPIRA_EM', 'ULTIMA_ATIVIDADE', 'ATIVA', 'ENCERRADA_EM', 'MOTIVO'],
      RECUPERACAO_SENHA: ['ID', 'ID_USUARIO', 'CODIGO_HASH', 'CRIADO_EM', 'EXPIRA_EM', 'UTILIZADO', 'UTILIZADO_EM'],
      CONFIGURACOES: ['CHAVE', 'VALOR', 'DESCRICAO', 'ATUALIZADO_EM'],
      AUDITORIA: ['ID', 'DATA_HORA', 'ID_USUARIO', 'MASP', 'MODULO', 'ACAO', 'ID_REGISTRO', 'VALOR_ANTERIOR', 'VALOR_NOVO', 'TOKEN_SESSAO', 'RESULTADO', 'JUSTIFICATIVA', 'OBSERVACAO_TECNICA'],
      NOTIFICACOES: ['ID', 'ID_USUARIO', 'TITULO', 'MENSAGEM', 'TIPO', 'MODULO', 'ID_REGISTRO', 'LIDA', 'CRIADO_EM', 'LIDA_EM']
    }
  },
  DB_PERSONNEL: {
    name: 'Intranet Recursos - Pessoal',
    sheets: {
      PESSOAS: ['ID_PESSOA', 'NOME_COMPLETO', 'NOME_SOCIAL', 'MASP', 'CPF', 'RG', 'DATA_NASCIMENTO', 'SEXO', 'TELEFONE', 'EMAIL', 'ENDERECO', 'CARGO', 'FUNCAO', 'SETOR', 'EQUIPE', 'DATA_ADMISSAO', 'STATUS', 'TIPO_VINCULO', 'FOTO_URL', 'OBSERVACOES', 'ID_USUARIO', 'PASTA_DRIVE_ID', 'CRIADO_EM', 'ATUALIZADO_EM', 'NOME_PAI', 'NOME_MAE', 'PAIS_NASCIMENTO', 'MUNICIPIO_NASCIMENTO', 'UF_NASCIMENTO', 'ESTADO_CIVIL', 'RG_DATA_EMISSAO', 'RG_ORGAO_EXPEDIDOR', 'RG_UF', 'TITULO_ELEITOR', 'MUNICIPIO_ENDERECO', 'UF_ENDERECO', 'CEP', 'BAIRRO', 'MASP_ANTIGO', 'DATA_BAIXA', 'TIPO_SANGUINEO', 'PORTE_ARMA_NUMERO', 'ARMA_INSTITUCIONAL_NUMERO', 'PORTE_ARMA_VALIDADE', 'CPF_PENDENTE_CONFERENCIA'],
      DOCUMENTOS_PESSOAS: ['ID', 'ID_PESSOA', 'TIPO', 'NOME', 'ID_ARQUIVO_DRIVE', 'DATA_DOCUMENTO', 'VENCIMENTO', 'NIVEL_ACESSO', 'OBSERVACOES', 'ENVIADO_EM', 'ENVIADO_POR', 'STATUS'],
      SETORES: ['ID_SETOR', 'NOME', 'SIGLA', 'RESPONSAVEL', 'ATIVO', 'CRIADO_EM'],
      FUNCOES: ['ID_FUNCAO', 'NOME', 'DESCRICAO', 'ATIVA', 'CRIADO_EM'],
      EQUIPES: ['ID_EQUIPE', 'NOME', 'SETOR', 'DESCRICAO', 'ATIVA', 'CRIADO_EM'],
      HISTORICO_FUNCIONAL: ['ID', 'ID_PESSOA', 'DATA_HORA', 'TIPO', 'VALOR_ANTERIOR', 'VALOR_NOVO', 'ID_USUARIO', 'OBSERVACOES'],
      SOLICITACOES_ATUALIZACAO: ['ID_SOLICITACAO', 'ID_USUARIO', 'ID_PESSOA', 'MASP', 'NOME', 'DADOS_ANTERIORES', 'DADOS_SOLICITADOS', 'CAMPOS_ALTERADOS', 'JUSTIFICATIVA', 'STATUS', 'SOLICITADO_EM', 'ANALISADO_EM', 'ANALISADO_POR', 'OBSERVACAO_ADMIN']
    }
  },
  DB_ASSETS: {
    name: 'Intranet Recursos - Patrimonio',
    sheets: {
      PATRIMONIOS: ['ID_PATRIMONIO', 'NUMERO_PATRIMONIAL', 'DESCRICAO', 'CATEGORIA', 'MARCA', 'MODELO', 'NUMERO_SERIE', 'STATUS', 'ESTADO_CONSERVACAO', 'UNIDADE', 'SETOR_RESPONSAVEL', 'LOCALIZACAO_ATUAL', 'DATA_AQUISICAO', 'VALOR', 'FORNECEDOR', 'NOTA_FISCAL', 'GARANTIA_ATE', 'OBSERVACOES', 'FOTO_URL', 'PASTA_DRIVE_ID', 'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'],
      CATEGORIAS: ['ID_CATEGORIA', 'NOME', 'DESCRICAO', 'ATIVA', 'CRIADO_EM'],
      CAUTELAS: ['ID_CAUTELA', 'ID_PATRIMONIO', 'NUMERO_PATRIMONIAL', 'DESCRICAO_PATRIMONIO', 'ID_PESSOA', 'NOME_PESSOA', 'MASP', 'SETOR', 'ENTREGUE_EM', 'PREVISAO_DEVOLUCAO', 'ESTADO_ENTREGA', 'ACESSORIOS_ENTREGUES', 'FINALIDADE', 'ENTREGUE_POR_ID', 'ENTREGUE_POR_NOME', 'TERMO_ARQUIVO_ID', 'CONFIRMACAO', 'OBSERVACOES', 'STATUS', 'DEVOLVIDO_EM', 'RECEBIDO_POR_ID', 'CRIADO_EM'],
      ITENS_CAUTELA: ['ID', 'ID_CAUTELA', 'ID_PATRIMONIO', 'QUANTIDADE', 'ESTADO_ENTREGA', 'ACESSORIOS', 'OBSERVACOES'],
      DEVOLUCOES: ['ID_DEVOLUCAO', 'ID_CAUTELA', 'ID_PATRIMONIO', 'ID_PESSOA', 'DEVOLVIDO_EM', 'DEVOLVIDO_POR', 'RECEBIDO_POR_ID', 'RECEBIDO_POR_NOME', 'ESTADO_RECEBIMENTO', 'ACESSORIOS_DEVOLVIDOS', 'POSSUI_AVARIA', 'DESCRICAO_DANO', 'FOTOS_IDS', 'PROVIDENCIAS', 'OBSERVACOES', 'STATUS_PATRIMONIO', 'CRIADO_EM'],
      MANUTENCOES_PATRIMONIO: ['ID', 'ID_PATRIMONIO', 'DATA_ENTRADA', 'TIPO', 'DESCRICAO', 'FORNECEDOR', 'VALOR', 'PREVISAO', 'CONCLUSAO', 'STATUS', 'ANEXOS_IDS', 'OBSERVACOES', 'CRIADO_POR'],
      DOCUMENTOS_PATRIMONIO: ['ID', 'ID_PATRIMONIO', 'TIPO', 'NOME', 'ID_ARQUIVO_DRIVE', 'DATA_DOCUMENTO', 'VENCIMENTO', 'OBSERVACOES', 'ENVIADO_EM', 'ENVIADO_POR', 'STATUS']
    }
  },
  DB_VEHICLES: {
    name: 'Intranet Recursos - Viaturas',
    sheets: {
      VIATURAS: ['ID_VIATURA', 'PREFIXO', 'PLACA', 'TIPO', 'MARCA', 'MODELO', 'ANO_FABRICACAO', 'ANO_MODELO', 'COR', 'RENAVAM', 'CHASSI', 'COMBUSTIVEL', 'CAPACIDADE', 'SETOR', 'STATUS', 'KM_ATUAL', 'KM_ATUALIZADO_EM', 'DATA_AQUISICAO', 'NUMERO_PATRIMONIAL', 'SEGURADORA', 'APOLICE', 'SEGURO_VENCIMENTO', 'LICENCIAMENTO_VENCIMENTO', 'PROXIMA_REVISAO_KM', 'PROXIMA_REVISAO_DATA', 'OBSERVACOES', 'FOTO_URL', 'PASTA_DRIVE_ID', 'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'],
      TURNOS: ['ID_TURNO', 'ID_VIATURA', 'PREFIXO', 'PLACA', 'ID_USUARIO_RESPONSAVEL', 'ID_PESSOA_RESPONSAVEL', 'NOME_RESPONSAVEL', 'MASP_RESPONSAVEL', 'INTEGRANTES', 'SETOR', 'EQUIPE', 'INICIO_EM', 'FIM_EM', 'KM_INICIAL', 'KM_FINAL', 'KM_PERCORRIDO', 'COMBUSTIVEL_INICIAL', 'COMBUSTIVEL_FINAL', 'CONDICOES_INICIAIS', 'AVARIAS_INICIAIS', 'EQUIPAMENTOS_INICIAIS', 'OBSERVACOES_INICIO', 'FOTOS_INICIO_IDS', 'DIVERGENCIA_KM', 'JUSTIFICATIVA_KM', 'STATUS', 'OCORRENCIAS', 'AVARIAS_FINAIS', 'FALHAS_MECANICAS', 'MULTAS', 'LIMPEZA', 'EQUIPAMENTOS_AUSENTES', 'NECESSITA_MANUTENCAO', 'OBSERVACOES_FIM', 'FOTOS_FIM_IDS', 'CRIADO_EM', 'ATUALIZADO_EM'],
      INTEGRANTES_TURNO: ['ID', 'ID_TURNO', 'ID_PESSOA', 'NOME', 'MASP', 'FUNCAO'],
      ABASTECIMENTOS: ['ID_ABASTECIMENTO', 'ID_VIATURA', 'PREFIXO', 'ID_CONDUTOR', 'CONDUTOR', 'DATA_HORA', 'KM', 'COMBUSTIVEL', 'QUANTIDADE', 'VALOR_TOTAL', 'VALOR_LITRO', 'POSTO', 'COMPROVANTE_ID', 'MEDIA_CONSUMO', 'OBSERVACOES', 'CRIADO_EM', 'CRIADO_POR'],
      MANUTENCOES: ['ID_MANUTENCAO', 'ID_VIATURA', 'PREFIXO', 'KM', 'DATA_ENTRADA', 'TIPO', 'OFICINA', 'FORNECEDOR', 'DESCRICAO', 'PECAS', 'VALOR', 'NOTA_FISCAL', 'PREVISAO_CONCLUSAO', 'DATA_CONCLUSAO', 'RESPONSAVEL', 'ANEXOS_IDS', 'STATUS', 'OBSERVACOES', 'CRIADO_EM', 'CRIADO_POR'],
      AVARIAS: ['ID_AVARIA', 'ID_VIATURA', 'ID_TURNO', 'DATA_HORA', 'DESCRICAO', 'GRAVIDADE', 'STATUS', 'REGISTRADO_POR', 'RESOLVIDO_EM', 'OBSERVACOES'],
      DOCUMENTOS_VIATURAS: ['ID', 'ID_VIATURA', 'TIPO', 'NOME', 'ID_ARQUIVO_DRIVE', 'DATA_DOCUMENTO', 'VENCIMENTO', 'NIVEL_ACESSO', 'OBSERVACOES', 'ENVIADO_EM', 'ENVIADO_POR', 'STATUS'],
      ALERTAS_FROTA: ['ID_ALERTA', 'ID_VIATURA', 'TIPO', 'TITULO', 'MENSAGEM', 'SEVERIDADE', 'DATA_LIMITE', 'RESOLVIDO', 'RESOLVIDO_EM', 'CRIADO_EM'],
      HISTORICO_KM: ['ID', 'ID_VIATURA', 'PREFIXO', 'DATA_HORA', 'KM_ANTERIOR', 'KM_NOVO', 'ORIGEM', 'ID_ORIGEM', 'ID_USUARIO', 'JUSTIFICATIVA']
    }
  },
  DB_DOCUMENTS: {
    name: 'Intranet Recursos - Documentos',
    sheets: {
      DOCUMENTOS: ['ID_DOCUMENTO', 'NUMERO', 'TIPO', 'ASSUNTO', 'DESCRICAO', 'DATA_DOCUMENTO', 'ORIGEM', 'DESTINO', 'SETOR', 'RESPONSAVEL', 'ID_PESSOA', 'ID_VIATURA', 'ID_PATRIMONIO', 'ID_RECOMPENSA', 'DOCUMENTO_RELACIONADO_ID', 'NIVEL_ACESSO', 'USUARIOS_AUTORIZADOS', 'SITUACAO', 'PRAZO', 'VENCIMENTO', 'OBSERVACOES', 'PASTA_DRIVE_ID', 'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'],
      DOCUMENTOS_VINCULOS: ['ID', 'ID_DOCUMENTO', 'TIPO_ENTIDADE', 'ID_ENTIDADE', 'CRIADO_EM'],
      DOCUMENTOS_ARQUIVOS: ['ID', 'ID_DOCUMENTO', 'ID_ARQUIVO_DRIVE', 'NOME_ARQUIVO', 'MIME_TYPE', 'TAMANHO', 'CATEGORIA', 'VERSAO', 'PRINCIPAL', 'STATUS', 'ENVIADO_EM', 'ENVIADO_POR', 'ARQUIVO_URL'],
      DOCUMENTOS_VERSOES: ['ID_VERSAO', 'ID_DOCUMENTO', 'NUMERO_VERSAO', 'DADOS_JSON', 'ID_ARQUIVO', 'MOTIVO', 'CRIADO_EM', 'CRIADO_POR'],
      MOVIMENTACOES: ['ID', 'ID_DOCUMENTO', 'DATA_HORA', 'ORIGEM', 'DESTINO', 'ACAO', 'ID_USUARIO', 'OBSERVACOES'],
      CIENCIAS: ['ID', 'ID_DOCUMENTO', 'ID_USUARIO', 'DATA_HORA', 'CONFIRMACAO', 'OBSERVACOES']
    }
  },
  DB_REWARDS: {
    name: 'Intranet Recursos - Recompensas',
    sheets: {
      PEDIDOS: ['ID_PEDIDO', 'NUMERO', 'TITULO', 'DESCRICAO_FATO', 'DATA_FATO', 'LOCAL_FATO', 'FUNDAMENTACAO', 'ID_PESSOA_SOLICITANTE', 'SOLICITANTE_NOME', 'SETOR', 'TIPO_RECOMPENSA', 'STATUS', 'PARECER_FINAL', 'DECISAO_EM', 'DECIDIDO_POR', 'OBSERVACOES', 'PASTA_DRIVE_ID', 'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'],
      PEDIDO_PESSOAS: ['ID', 'ID_PEDIDO', 'ID_PESSOA', 'NOME', 'MASP', 'PAPEL', 'CRIADO_EM'],
      TRAMITACOES: ['ID_TRAMITACAO', 'ID_PEDIDO', 'DATA_HORA', 'ORIGEM', 'DESTINO', 'ACAO', 'ID_USUARIO', 'OBSERVACOES'],
      PARECERES: ['ID_PARECER', 'ID_PEDIDO', 'TIPO', 'TEXTO', 'ID_USUARIO', 'NOME_USUARIO', 'CRIADO_EM'],
      DOCUMENTOS_RECOMPENSA: ['ID', 'ID_PEDIDO', 'TIPO', 'NOME', 'ID_ARQUIVO_DRIVE', 'ENVIADO_EM', 'ENVIADO_POR', 'STATUS'],
      HISTORICO_RECOMPENSA: ['ID', 'ID_PEDIDO', 'DATA_HORA', 'ACAO', 'STATUS_ANTERIOR', 'STATUS_NOVO', 'ID_USUARIO', 'NOME_USUARIO', 'OBSERVACOES']
    }
  }
});

const PERMISSION_CATALOG = Object.freeze([
  ['usuarios.visualizar', 'usuarios', 'visualizar', 'Visualizar usuários'],
  ['usuarios.criar', 'usuarios', 'criar', 'Cadastrar usuários'],
  ['usuarios.editar', 'usuarios', 'editar', 'Editar usuários'],
  ['usuarios.inativar', 'usuarios', 'inativar', 'Ativar, bloquear ou inativar usuários'],
  ['usuarios.redefinir_senha', 'usuarios', 'redefinir_senha', 'Redefinir senha de usuários'],
  ['usuarios.gerenciar_permissoes', 'usuarios', 'gerenciar_permissoes', 'Gerenciar permissões individuais'],
  ['pessoal.visualizar', 'pessoal', 'visualizar', 'Visualizar pessoas'],
  ['pessoal.criar', 'pessoal', 'criar', 'Cadastrar pessoas'],
  ['pessoal.editar', 'pessoal', 'editar', 'Editar pessoas'],
  ['pessoal.excluir', 'pessoal', 'excluir', 'Inativar pessoas'],
  ['pessoal.visualizar_dados_sensiveis', 'pessoal', 'visualizar_dados_sensiveis', 'Visualizar dados pessoais sensíveis'],
  ['pessoal.visualizar_documentos', 'pessoal', 'visualizar_documentos', 'Visualizar documentos pessoais'],
  ['pessoal.enviar_documentos', 'pessoal', 'enviar_documentos', 'Enviar documentos pessoais'],
  // As permissões antigas `patrimonio.*` são migradas pelo instalador do
  // módulo. Não devem voltar ao catálogo ativo, pois repetem as ações abaixo.
  ['PATRIMONIO_VISUALIZAR', 'patrimonio', 'visualizar', 'Visualizar o módulo Patrimônio e Cautelas'],
  ['PATRIMONIO_CADASTRAR', 'patrimonio', 'cadastrar', 'Cadastrar patrimônios e equipamentos'],
  ['PATRIMONIO_EDITAR', 'patrimonio', 'editar', 'Editar patrimônios e equipamentos'],
  ['PATRIMONIO_EXCLUIR', 'patrimonio', 'excluir', 'Inativar patrimônios'],
  ['PATRIMONIO_BAIXAR', 'patrimonio', 'baixar', 'Baixar patrimônios'],
  ['PATRIMONIO_MANUTENCAO', 'patrimonio', 'manutencao', 'Encaminhar patrimônios para manutenção'],
  ['CAUTELA_REALIZAR', 'patrimonio', 'cautela_realizar', 'Realizar cautelas'],
  ['CAUTELA_MULTIPLA', 'patrimonio', 'cautela_multipla', 'Realizar cautela com vários itens'],
  ['CAUTELA_ADMINISTRATIVA_GERENCIAR', 'patrimonio', 'cautela_administrativa', 'Realizar, visualizar e descautelar cautelas administrativas'],
  ['DESCAUTELA_REALIZAR', 'patrimonio', 'descautela_realizar', 'Registrar devoluções'],
  ['DESCAUTELA_TERCEIRO', 'patrimonio', 'descautela_terceiro', 'Receber devolução por pessoa diferente do recebedor'],
  ['CAUTELA_CANCELAR', 'patrimonio', 'cautela_cancelar', 'Cancelar cautelas'],
  ['CAUTELA_PRORROGAR', 'patrimonio', 'cautela_prorrogar', 'Prorrogar cautelas'],
  ['CAUTELA_VISUALIZAR_ATIVAS', 'patrimonio', 'cautela_ativas', 'Visualizar cautelas ativas'],
  ['HISTORICO_VISUALIZAR', 'patrimonio', 'historico', 'Visualizar histórico patrimonial'],
  ['AUDITORIA_VISUALIZAR', 'patrimonio', 'auditoria', 'Visualizar auditoria patrimonial'],
  ['PATRIMONIO_EXPORTAR', 'patrimonio', 'exportar', 'Exportar relatórios patrimoniais'],
  ['PATRIMONIO_CONFIGURAR', 'patrimonio', 'configurar', 'Gerenciar categorias e configurações patrimoniais'],
  ['FROTA_ACESSAR', 'frota', 'acessar', 'Acessar o módulo Frota'],
  ['FROTA_VISUALIZAR_KM', 'frota', 'visualizar_km', 'Visualizar a área Lançamento de KM'],
  ['FROTA_VISUALIZAR_VEICULOS', 'frota', 'visualizar_veiculos', 'Visualizar os veículos cadastrados na Frota'],
  ['FROTA_VISUALIZAR_MANUTENCOES', 'frota', 'visualizar_manutencoes', 'Visualizar a área Manutenções'],
  ['FROTA_VISUALIZAR_DEFEITOS', 'frota', 'visualizar_defeitos', 'Visualizar a área Defeitos e observações'],
  ['FROTA_KM_ABRIR', 'frota', 'km_abrir', 'Abrir utilização e lançar KM inicial'],
  ['FROTA_KM_ENCERRAR', 'frota', 'km_encerrar', 'Encerrar utilização e lançar KM final'],
  ['FROTA_ENCERRAR_MOVIMENTACAO_OUTRO_USUARIO', 'frota', 'km_encerrar_outro', 'Encerrar movimentação de outro usuário'],
  ['FROTA_VISUALIZAR_GERENCIAMENTO', 'frota', 'visualizar_gerenciamento', 'Visualizar gerenciamento administrativo da frota'],
  ['FROTA_EDITAR_OBSERVACOES', 'frota', 'editar_observacoes', 'Editar observação principal do veículo'],
  ['FROTA_VISUALIZAR_HISTORICO', 'frota', 'visualizar_historico', 'Visualizar histórico completo da frota'],
  ['FROTA_CADASTRAR_VIATURA', 'frota', 'cadastrar_veiculo', 'Cadastrar veículos na Frota'],
  ['FROTA_EDITAR_VIATURA', 'frota', 'editar_veiculo', 'Editar dados dos veículos da Frota'],
  ['FROTA_EXCLUIR_VIATURA', 'frota', 'excluir_veiculo', 'Desativar veículos da Frota'],
  ['FROTA_ALTERAR_STATUS', 'frota', 'alterar_status', 'Alterar o status operacional dos veículos'],
  ['FROTA_VISUALIZAR_ARQUIVOS', 'frota', 'visualizar_arquivos', 'Visualizar arquivos dos veículos'],
  ['FROTA_ENVIAR_ARQUIVOS', 'frota', 'enviar_arquivos', 'Enviar arquivos para as pastas dos veículos'],
  ['FROTA_EXCLUIR_ARQUIVOS', 'frota', 'excluir_arquivos', 'Excluir logicamente arquivos dos veículos'],
  ['FROTA_GERENCIAR_MANUTENCOES', 'frota', 'gerenciar_manutencoes', 'Cadastrar e atualizar manutenções'],
  ['FROTA_GERENCIAR_PNEUS', 'frota', 'gerenciar_pneus', 'Cadastrar e atualizar pneus'],
  ['FROTA_TRATAR_DEFEITOS', 'frota', 'tratar_defeitos', 'Visualizar e tratar defeitos'],
  ['FROTA_RECEBER_NOTIFICACOES', 'frota', 'receber_notificacoes', 'Receber notificações automáticas da frota'],
  ['documentos.visualizar', 'documentos', 'visualizar', 'Visualizar documentos autorizados'],
  ['documentos.criar', 'documentos', 'criar', 'Criar documentos e enviar arquivos'],
  ['documentos.editar', 'documentos', 'editar', 'Editar e versionar documentos'],
  ['documentos.excluir', 'documentos', 'excluir', 'Inativar documentos'],
  ['documentos.baixar', 'documentos', 'baixar', 'Baixar arquivos'],
  ['documentos.compartilhar', 'documentos', 'compartilhar', 'Definir usuários autorizados'],
  ['documentos.visualizar_restritos', 'documentos', 'visualizar_restritos', 'Visualizar documentos restritos de outros setores'],
  ['documentos.gerenciar_sigilo', 'documentos', 'gerenciar_sigilo', 'Classificar documentos confidenciais e sigilosos'],
  ['recompensas.visualizar', 'recompensas', 'visualizar', 'Visualizar pedidos relacionados'],
  ['recompensas.criar', 'recompensas', 'criar', 'Criar pedidos de recompensa'],
  ['recompensas.editar_proprio', 'recompensas', 'editar_proprio', 'Editar e enviar pedidos próprios'],
  ['recompensas.visualizar_todos', 'recompensas', 'visualizar_todos', 'Visualizar todos os pedidos'],
  ['recompensas.analisar', 'recompensas', 'analisar', 'Analisar pedidos'],
  ['recompensas.emitir_parecer', 'recompensas', 'emitir_parecer', 'Emitir parecer'],
  ['recompensas.aprovar', 'recompensas', 'aprovar', 'Aprovar pedidos'],
  ['recompensas.indeferir', 'recompensas', 'indeferir', 'Indeferir pedidos'],
  ['recompensas.cancelar', 'recompensas', 'cancelar', 'Cancelar pedidos'],
  ['recompensas.gerar_documento', 'recompensas', 'gerar_documento', 'Gerar documentos do pedido'],
  ['auditoria.visualizar', 'auditoria', 'visualizar', 'Visualizar auditoria'],
  ['configuracoes.gerenciar', 'configuracoes', 'gerenciar', 'Gerenciar configurações do sistema']
]);

function instalarSistema() {
  assertDevelopmentConfigured_();
  return withScriptLock_(function () {
    const started = now_();
    const folders = ensureDriveStructure_();
    const databases = {};
    Object.keys(INSTALLER_SCHEMA).forEach(function (databaseKey) {
      databases[databaseKey] = ensureDatabase_(databaseKey, INSTALLER_SCHEMA[databaseKey], folders.CONFIGURACAO);
    });
    getPasswordPepper_();
    seedConfigurations_(databases.DB_CONFIG);
    seedPermissions_();
    seedLookups_();
    const admin = ensureInitialAdministrator_();
    const patrimonio = patrimonioGarantirModuloSistema_();
    const frota = frotaGarantirModuloSistema_();
    ensureMaintenanceTrigger_();
    getScriptProperties_().setProperty(APP_CONFIG.PROPERTY_KEYS.INSTALLED, 'true');
    const result = {
      status: 'INSTALADO',
      startedAt: started.toISOString(),
      finishedAt: nowIso_(),
      rootFolderId: folders.ROOT.getId(),
      spreadsheets: Object.keys(databases).reduce(function (output, key) { output[key] = databases[key].getId(); return output; }, {}),
      administrator: admin,
      patrimonio: patrimonio,
      frota: frota
    };
    console.log('INSTALAÇÃO CONCLUÍDA\n' + JSON.stringify(result, null, 2));
    if (admin && admin.temporaryPassword) {
      console.log('CREDENCIAIS INICIAIS — MASP: ' + formatMasp_(admin.masp) + ' | SENHA TEMPORÁRIA: ' + admin.temporaryPassword);
    }
    return result;
  });
}

function ensureDriveStructure_() {
  const properties = getScriptProperties_();
  let root = null;
  const savedId = properties.getProperty(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID);
  if (savedId) {
    try { root = DriveApp.getFolderById(savedId); } catch (error) { root = null; }
  }
  if (!root) {
    const existing = DriveApp.getRootFolder().getFoldersByName('INTRANET_RECURSOS');
    root = existing.hasNext() ? existing.next() : DriveApp.getRootFolder().createFolder('INTRANET_RECURSOS');
    properties.setProperty(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID, root.getId());
  }
  const tree = {
    CONFIGURACAO: [],
    PESSOAL: [],
    PATRIMONIO: [],
    VIATURAS: [],
    DOCUMENTOS_GERAIS: ['ORDENS_DE_SERVICO', 'OFICIOS', 'MEMORANDOS', 'PORTARIAS', 'RELATORIOS', 'OUTROS'],
    RECOMPENSAS: [],
    TEMPORARIOS: [],
    BACKUPS: []
  };
  const output = { ROOT: root };
  Object.keys(tree).forEach(function (name) {
    const folder = getOrCreateChildFolder_(root, name);
    output[name] = folder;
    tree[name].forEach(function (child) { getOrCreateChildFolder_(folder, child); });
  });
  properties.setProperty(APP_CONFIG.PROPERTY_KEYS.CONFIG_FOLDER_ID, output.CONFIGURACAO.getId());
  return output;
}

function ensureDatabase_(databaseKey, definition, destinationFolder) {
  const propertyKey = APP_CONFIG.PROPERTY_KEYS[databaseKey];
  const properties = getScriptProperties_();
  let spreadsheet = null;
  const savedId = properties.getProperty(propertyKey);
  if (savedId) {
    try { spreadsheet = SpreadsheetApp.openById(savedId); } catch (error) { spreadsheet = null; }
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(definition.name);
    properties.setProperty(propertyKey, spreadsheet.getId());
    try { DriveApp.getFileById(spreadsheet.getId()).moveTo(destinationFolder); } catch (error) { console.warn('Não foi possível mover a planilha: ' + error.message); }
  }
  spreadsheet.setSpreadsheetTimeZone(APP_CONFIG.TIME_ZONE);
  Object.keys(definition.sheets).forEach(function (sheetName) { ensureSheetSchema_(spreadsheet, sheetName, definition.sheets[sheetName]); });
  ['Página1', 'Sheet1'].forEach(function (defaultName) {
    const sheet = spreadsheet.getSheetByName(defaultName);
    if (sheet && !definition.sheets[defaultName] && sheet.getLastRow() <= 1 && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(sheet);
  });
  return spreadsheet;
}

function ensureSheetSchema_(spreadsheet, sheetName, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const currentHeaders = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizeText_) : [];
  if (!currentHeaders.some(Boolean)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    const missing = requiredHeaders.filter(function (header) { return currentHeaders.indexOf(header) < 0; });
    if (missing.length) sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
  const totalColumns = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, totalColumns)
    .setBackground('#123b66').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 38);
  sheet.getRange(1, 1, Math.max(1, sheet.getMaxRows()), totalColumns).setVerticalAlignment('middle');
  for (let column = 1; column <= totalColumns; column += 1) sheet.setColumnWidth(column, column <= 3 ? 180 : 140);
  try {
    if (!sheet.getFilter() && sheet.getLastRow() > 1) sheet.getRange(1, 1, sheet.getLastRow(), totalColumns).createFilter();
  } catch (error) { console.warn('Filtro não aplicado em ' + sheetName + ': ' + error.message); }
}

function seedConfigurations_() {
  const rows = [
    ['NOME_SISTEMA', APP_CONFIG.NAME, 'Nome exibido no cabeçalho e nas mensagens'],
    ['NOME_INSTITUICAO', 'Guarda Civil Municipal de Passos', 'Nome da instituição'],
    ['LOGO_URL', '', 'Link do arquivo de imagem no Google Drive, ID do arquivo, URL pública ou data URL do brasão'],
    ['FAVICON_URL', '', 'URL pública do ícone do navegador'],
    ['SESSAO_HORAS', String(APP_CONFIG.DEFAULT_SESSION_HOURS), 'Duração máxima da sessão em horas'],
    ['SESSAO_INATIVIDADE_MINUTOS', String(APP_CONFIG.DEFAULT_IDLE_MINUTES), 'Encerramento por inatividade em minutos'],
    ['MAX_TENTATIVAS_LOGIN', String(APP_CONFIG.DEFAULT_MAX_LOGIN_ATTEMPTS), 'Tentativas antes do bloqueio temporário'],
    ['BLOQUEIO_MINUTOS', String(APP_CONFIG.DEFAULT_LOCK_MINUTES), 'Duração do bloqueio temporário'],
    ['RECUPERACAO_MINUTOS', String(APP_CONFIG.DEFAULT_RECOVERY_MINUTES), 'Validade do código de recuperação'],
    ['EMAIL_SUPORTE', Session.getEffectiveUser().getEmail() || '', 'E-mail de suporte exibido aos usuários']
  ];
  rows.forEach(function (row) {
    if (!findOne_(APP_CONFIG.DATABASES.CONFIG, 'CONFIGURACOES', 'CHAVE', row[0])) appendObject_(APP_CONFIG.DATABASES.CONFIG, 'CONFIGURACOES', { CHAVE: row[0], VALOR: row[1], DESCRICAO: row[2], ATUALIZADO_EM: now_() });
  });
}

function seedPermissions_() {
  PERMISSION_CATALOG.forEach(function (item) {
    const current = findOne_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', 'CODIGO', item[0]);
    const record = { ID_PERMISSAO: current ? current.ID_PERMISSAO : uuid_(), CODIGO: item[0], MODULO: item[1], ACAO: item[2], DESCRICAO: item[3], ATIVA: true };
    if (current) updateObjectAtRow_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', current._row, record);
    else appendObject_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES', record);
  });
}

function seedLookups_() {
  const sectors = [['GCM', 'Guarda Civil Municipal'], ['ADMIN', 'Administrativo'], ['OPER', 'Operacional'], ['NIT', 'Núcleo de Inteligência'], ['TRANS', 'Trânsito']];
  sectors.forEach(function (item) {
    if (!findOne_(APP_CONFIG.DATABASES.PERSONNEL, 'SETORES', 'SIGLA', item[0])) appendObject_(APP_CONFIG.DATABASES.PERSONNEL, 'SETORES', { ID_SETOR: uuid_(), NOME: item[1], SIGLA: item[0], RESPONSAVEL: '', ATIVO: true, CRIADO_EM: now_() });
  });
  ['Comandante', 'Subcomandante', 'Inspetor', 'Subinspetor', 'GCM', 'Administrativo', 'Colaborador'].forEach(function (name) {
    if (!findOne_(APP_CONFIG.DATABASES.PERSONNEL, 'FUNCOES', 'NOME', name)) appendObject_(APP_CONFIG.DATABASES.PERSONNEL, 'FUNCOES', { ID_FUNCAO: uuid_(), NOME: name, DESCRICAO: '', ATIVA: true, CRIADO_EM: now_() });
  });
  ['Patrulhamento', 'Moto Patrulha', 'Supervisão', 'Trânsito', 'Administrativo'].forEach(function (name) {
    if (!findOne_(APP_CONFIG.DATABASES.PERSONNEL, 'EQUIPES', 'NOME', name)) appendObject_(APP_CONFIG.DATABASES.PERSONNEL, 'EQUIPES', { ID_EQUIPE: uuid_(), NOME: name, SETOR: '', DESCRICAO: '', ATIVA: true, CRIADO_EM: now_() });
  });
  ['Armamento e proteção', 'Comunicação', 'Informática', 'Uniforme', 'Sinalização', 'Ferramentas', 'Mobiliário', 'Outros'].forEach(function (name) {
    if (!findOne_(APP_CONFIG.DATABASES.ASSETS, 'CATEGORIAS', 'NOME', name)) appendObject_(APP_CONFIG.DATABASES.ASSETS, 'CATEGORIAS', { ID_CATEGORIA: uuid_(), NOME: name, DESCRICAO: '', ATIVA: true, CRIADO_EM: now_() });
  });
}

function ensureInitialAdministrator_() {
  const users = readAll_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS');
  if (users.length) return { created: false, userId: users[0].ID_USUARIO, masp: users[0].MASP };
  const temporary = generateTemporaryPassword_();
  const passwordRecord = makePasswordRecord_(temporary);
  const timestamp = now_();
  const admin = appendObject_(APP_CONFIG.DATABASES.CONFIG, 'USUARIOS', Object.assign({
    ID_USUARIO: uuid_(), ID_PESSOA: '', MASP: '00000000', NOME: 'Administrador do Sistema',
    EMAIL: Session.getEffectiveUser().getEmail() || 'admin@instituicao.local', TELEFONE: '', CARGO: 'Administrador',
    FUNCAO: 'Administrador do Sistema', SETOR: 'Administrativo', STATUS: 'ATIVO', TROCAR_SENHA: true,
    TENTATIVAS: 0, BLOQUEADO_ATE: '', ULTIMO_ACESSO: '', OBSERVACOES: 'Usuário criado automaticamente pelo instalador.',
    CRIADO_EM: timestamp, ATUALIZADO_EM: timestamp
  }, passwordRecord));
  const catalog = readAll_(APP_CONFIG.DATABASES.CONFIG, 'PERMISSOES');
  catalog.forEach(function (permission) {
    appendObject_(APP_CONFIG.DATABASES.CONFIG, 'USUARIO_PERMISSOES', {
      ID: uuid_(), ID_USUARIO: admin.ID_USUARIO, ID_PERMISSAO: permission.ID_PERMISSAO,
      PERMITIDO: true, CONCEDIDO_POR: 'INSTALLER', CONCEDIDO_EM: timestamp
    });
  });
  return { created: true, userId: admin.ID_USUARIO, masp: admin.MASP, temporaryPassword: temporary, email: admin.EMAIL };
}

function ensureMaintenanceTrigger_() {
  const handler = 'cleanupExpiredSessions_';
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === handler; });
  if (!exists) ScriptApp.newTrigger(handler).timeBased().everyHours(6).create();
}

function repararEstruturaSistema() {
  if (getProperty_(APP_CONFIG.PROPERTY_KEYS.INSTALLED, false) !== 'true') return instalarSistema();
  return instalarSistema();
}

function obterResumoInstalacao() {
  const properties = getScriptProperties_().getProperties();
  const output = { installed: properties[APP_CONFIG.PROPERTY_KEYS.INSTALLED] === 'true', rootFolderId: properties[APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID] || '', spreadsheets: {} };
  Object.keys(APP_CONFIG.DATABASES).forEach(function (key) {
    const databaseKey = APP_CONFIG.DATABASES[key];
    output.spreadsheets[databaseKey] = properties[APP_CONFIG.PROPERTY_KEYS[databaseKey]] || '';
  });
  output.frota = {
    spreadsheetId: properties[FROTA_CONFIG.SPREADSHEET_PROPERTY] || '',
    rootFolderId: properties[FROTA_CONFIG.ROOT_FOLDER_PROPERTY] || FROTA_CONFIG.ROOT_FOLDER_ID
  };
  output.patrimonio = {
    version: properties.PATRIMONIO_MODULE_VERSION || '',
    spreadsheetId: properties[APP_CONFIG.PROPERTY_KEYS.DB_ASSETS] || ''
  };
  return output;
}

function criarBackupManual() {
  const root = getRootFolder_();
  const backupRoot = getOrCreateChildFolder_(root, 'BACKUPS');
  const stamp = Utilities.formatDate(now_(), APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd_HH-mm-ss');
  const folder = backupRoot.createFolder('BACKUP_' + stamp);
  Object.keys(APP_CONFIG.DATABASES).forEach(function (key) {
    const databaseKey = APP_CONFIG.DATABASES[key];
    const id = getProperty_(APP_CONFIG.PROPERTY_KEYS[databaseKey], true);
    DriveApp.getFileById(id).makeCopy(DriveApp.getFileById(id).getName() + '_' + stamp, folder);
  });
  const frotaId = getScriptProperties_().getProperty(FROTA_CONFIG.SPREADSHEET_PROPERTY);
  if (frotaId) DriveApp.getFileById(frotaId).makeCopy(FROTA_CONFIG.SPREADSHEET_NAME + '_' + stamp, folder);
  console.log('Backup criado: ' + folder.getUrl());
  return { folderId: folder.getId(), url: folder.getUrl(), createdAt: nowIso_() };
}
