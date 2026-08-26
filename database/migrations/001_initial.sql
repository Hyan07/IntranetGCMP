SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(100) PRIMARY KEY,
  valor TEXT NULL,
  descricao VARCHAR(255) NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pessoas (
  id CHAR(36) PRIMARY KEY,
  nome_completo VARCHAR(180) NOT NULL,
  nome_social VARCHAR(180) NULL,
  masp VARCHAR(30) NOT NULL UNIQUE,
  cpf VARCHAR(14) NULL UNIQUE,
  rg VARCHAR(30) NULL,
  data_nascimento DATE NULL,
  sexo VARCHAR(30) NULL,
  telefone VARCHAR(40) NULL,
  email VARCHAR(180) NULL,
  endereco VARCHAR(255) NULL,
  cargo VARCHAR(120) NULL,
  funcao VARCHAR(120) NULL,
  setor VARCHAR(120) NULL,
  equipe VARCHAR(120) NULL,
  data_admissao DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ATIVO',
  tipo_vinculo VARCHAR(60) NULL,
  foto_url TEXT NULL,
  observacoes TEXT NULL,
  id_usuario CHAR(36) NULL,
  nome_pai VARCHAR(180) NULL,
  nome_mae VARCHAR(180) NULL,
  pais_nascimento VARCHAR(80) NULL,
  municipio_nascimento VARCHAR(120) NULL,
  uf_nascimento CHAR(2) NULL,
  estado_civil VARCHAR(50) NULL,
  rg_data_emissao DATE NULL,
  rg_orgao_expedidor VARCHAR(50) NULL,
  rg_uf CHAR(2) NULL,
  titulo_eleitor VARCHAR(30) NULL,
  municipio_endereco VARCHAR(120) NULL,
  uf_endereco CHAR(2) NULL,
  cep VARCHAR(12) NULL,
  bairro VARCHAR(120) NULL,
  masp_antigo VARCHAR(30) NULL,
  data_baixa DATE NULL,
  tipo_sanguineo VARCHAR(10) NULL,
  porte_arma_numero VARCHAR(80) NULL,
  arma_institucional_numero VARCHAR(80) NULL,
  porte_arma_validade DATE NULL,
  cpf_pendente_conferencia TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pessoas_nome (nome_completo),
  INDEX idx_pessoas_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id CHAR(36) PRIMARY KEY,
  id_pessoa CHAR(36) NULL,
  masp VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(180) NOT NULL,
  email VARCHAR(180) NULL,
  telefone VARCHAR(40) NULL,
  cargo VARCHAR(120) NULL,
  funcao VARCHAR(120) NULL,
  setor VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ATIVO',
  senha_hash VARCHAR(255) NOT NULL,
  senha_alterada_em DATETIME NULL,
  trocar_senha TINYINT(1) NOT NULL DEFAULT 1,
  tentativas INT NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL,
  ultimo_acesso DATETIME NULL,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_pessoa FOREIGN KEY (id_pessoa) REFERENCES pessoas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissoes (
  id CHAR(36) PRIMARY KEY,
  codigo VARCHAR(120) NOT NULL UNIQUE,
  modulo VARCHAR(80) NOT NULL,
  acao VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativa TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_permissoes (
  id CHAR(36) PRIMARY KEY,
  id_usuario CHAR(36) NOT NULL,
  id_permissao CHAR(36) NOT NULL,
  permitido TINYINT(1) NOT NULL DEFAULT 1,
  concedido_por VARCHAR(100) NULL,
  concedido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_permissao (id_usuario, id_permissao),
  CONSTRAINT fk_up_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_permissao FOREIGN KEY (id_permissao) REFERENCES permissoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario CHAR(36) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em DATETIME NOT NULL,
  utilizado TINYINT(1) NOT NULL DEFAULT 0,
  utilizado_em DATETIME NULL,
  INDEX idx_recuperacao_usuario (id_usuario, utilizado, expira_em),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario CHAR(36) NULL,
  masp VARCHAR(30) NULL,
  modulo VARCHAR(80) NOT NULL,
  acao VARCHAR(100) NOT NULL,
  id_registro VARCHAR(100) NULL,
  valor_anterior JSON NULL,
  valor_novo JSON NULL,
  resultado VARCHAR(30) NOT NULL DEFAULT 'SUCESSO',
  justificativa TEXT NULL,
  observacao_tecnica TEXT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  INDEX idx_auditoria_data (data_hora),
  INDEX idx_auditoria_modulo (modulo, acao),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificacoes (
  id CHAR(36) PRIMARY KEY,
  id_usuario CHAR(36) NULL,
  titulo VARCHAR(180) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(40) NULL,
  modulo VARCHAR(80) NULL,
  id_registro VARCHAR(100) NULL,
  lida TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lida_em DATETIME NULL,
  CONSTRAINT fk_notificacao_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS solicitacoes_atualizacao (
  id CHAR(36) PRIMARY KEY,
  id_usuario CHAR(36) NOT NULL,
  id_pessoa CHAR(36) NOT NULL,
  masp VARCHAR(30) NULL,
  nome VARCHAR(180) NULL,
  dados_anteriores JSON NULL,
  dados_solicitados JSON NULL,
  campos_alterados JSON NULL,
  justificativa TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  solicitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  analisado_em DATETIME NULL,
  analisado_por CHAR(36) NULL,
  observacao_admin TEXT NULL,
  CONSTRAINT fk_solic_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
  CONSTRAINT fk_solic_pessoa FOREIGN KEY (id_pessoa) REFERENCES pessoas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patrimonios (
  id CHAR(36) PRIMARY KEY,
  numero_patrimonial VARCHAR(80) NOT NULL UNIQUE,
  descricao VARCHAR(255) NOT NULL,
  categoria VARCHAR(120) NULL,
  marca VARCHAR(120) NULL,
  modelo VARCHAR(120) NULL,
  numero_serie VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL',
  estado_conservacao VARCHAR(40) NULL,
  unidade VARCHAR(30) NOT NULL DEFAULT 'UN',
  setor_responsavel VARCHAR(120) NULL,
  localizacao_atual VARCHAR(180) NULL,
  data_aquisicao DATE NULL,
  valor DECIMAL(14,2) NULL,
  fornecedor VARCHAR(180) NULL,
  nota_fiscal VARCHAR(100) NULL,
  garantia_ate DATE NULL,
  observacoes TEXT NULL,
  foto_url TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36) NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) NULL,
  INDEX idx_patrimonio_status (status),
  INDEX idx_patrimonio_descricao (descricao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cautelas (
  id CHAR(36) PRIMARY KEY,
  numero VARCHAR(80) NOT NULL UNIQUE,
  id_pessoa CHAR(36) NOT NULL,
  nome_pessoa VARCHAR(180) NOT NULL,
  masp VARCHAR(30) NOT NULL,
  setor VARCHAR(120) NULL,
  entregue_em DATETIME NOT NULL,
  previsao_devolucao DATETIME NULL,
  estado_entrega VARCHAR(50) NULL,
  acessorios_entregues TEXT NULL,
  finalidade TEXT NULL,
  entregue_por_id CHAR(36) NULL,
  entregue_por_nome VARCHAR(180) NULL,
  confirmacao VARCHAR(120) NULL,
  observacoes TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
  devolvido_em DATETIME NULL,
  recebido_por_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cautela_pessoa FOREIGN KEY (id_pessoa) REFERENCES pessoas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS itens_cautela (
  id CHAR(36) PRIMARY KEY,
  id_cautela CHAR(36) NOT NULL,
  id_patrimonio CHAR(36) NOT NULL,
  quantidade DECIMAL(10,2) NOT NULL DEFAULT 1,
  estado_entrega VARCHAR(50) NULL,
  acessorios TEXT NULL,
  observacoes TEXT NULL,
  CONSTRAINT fk_item_cautela FOREIGN KEY (id_cautela) REFERENCES cautelas(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_patrimonio FOREIGN KEY (id_patrimonio) REFERENCES patrimonios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devolucoes_patrimonio (
  id CHAR(36) PRIMARY KEY,
  id_cautela CHAR(36) NOT NULL,
  id_patrimonio CHAR(36) NOT NULL,
  id_pessoa CHAR(36) NULL,
  devolvido_em DATETIME NOT NULL,
  recebido_por_id CHAR(36) NULL,
  recebido_por_nome VARCHAR(180) NULL,
  estado_recebimento VARCHAR(50) NULL,
  possui_avaria TINYINT(1) NOT NULL DEFAULT 0,
  descricao_dano TEXT NULL,
  providencias TEXT NULL,
  observacoes TEXT NULL,
  status_patrimonio VARCHAR(30) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dev_cautela FOREIGN KEY (id_cautela) REFERENCES cautelas(id),
  CONSTRAINT fk_dev_patrimonio FOREIGN KEY (id_patrimonio) REFERENCES patrimonios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS viaturas (
  id CHAR(36) PRIMARY KEY,
  prefixo VARCHAR(40) NOT NULL UNIQUE,
  placa VARCHAR(20) NOT NULL UNIQUE,
  tipo VARCHAR(80) NULL,
  marca VARCHAR(80) NULL,
  modelo VARCHAR(120) NULL,
  ano_fabricacao SMALLINT NULL,
  ano_modelo SMALLINT NULL,
  cor VARCHAR(40) NULL,
  renavam VARCHAR(40) NULL,
  chassi VARCHAR(80) NULL,
  combustivel VARCHAR(50) NULL,
  capacidade VARCHAR(50) NULL,
  setor VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL',
  km_atual DECIMAL(12,1) NOT NULL DEFAULT 0,
  km_atualizado_em DATETIME NULL,
  data_aquisicao DATE NULL,
  numero_patrimonial VARCHAR(80) NULL,
  seguradora VARCHAR(120) NULL,
  apolice VARCHAR(80) NULL,
  seguro_vencimento DATE NULL,
  licenciamento_vencimento DATE NULL,
  proxima_revisao_km DECIMAL(12,1) NULL,
  proxima_revisao_data DATE NULL,
  observacoes TEXT NULL,
  foto_url TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36) NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) NULL,
  INDEX idx_viatura_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS historico_km (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  prefixo VARCHAR(40) NULL,
  data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  km_anterior DECIMAL(12,1) NULL,
  km_novo DECIMAL(12,1) NOT NULL,
  origem VARCHAR(80) NULL,
  id_origem VARCHAR(100) NULL,
  id_usuario CHAR(36) NULL,
  justificativa TEXT NULL,
  CONSTRAINT fk_km_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS defeitos_frota (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT NOT NULL,
  gravidade VARCHAR(30) NOT NULL DEFAULT 'MEDIA',
  status VARCHAR(30) NOT NULL DEFAULT 'ABERTO',
  registrado_por CHAR(36) NULL,
  registrado_por_nome VARCHAR(180) NULL,
  resolvido_em DATETIME NULL,
  resolvido_por CHAR(36) NULL,
  solucao TEXT NULL,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_defeito_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documentos (
  id CHAR(36) PRIMARY KEY,
  numero VARCHAR(80) NULL,
  tipo VARCHAR(80) NULL,
  assunto VARCHAR(255) NOT NULL,
  descricao TEXT NULL,
  data_documento DATE NULL,
  origem VARCHAR(180) NULL,
  destino VARCHAR(180) NULL,
  setor VARCHAR(120) NULL,
  responsavel VARCHAR(180) NULL,
  nivel_acesso VARCHAR(30) NOT NULL DEFAULT 'INTERNO',
  situacao VARCHAR(40) NOT NULL DEFAULT 'ATIVO',
  prazo DATE NULL,
  vencimento DATE NULL,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36) NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recompensas (
  id CHAR(36) PRIMARY KEY,
  numero VARCHAR(80) NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao_fato TEXT NULL,
  data_fato DATETIME NULL,
  local_fato VARCHAR(255) NULL,
  fundamentacao TEXT NULL,
  solicitante_nome VARCHAR(180) NULL,
  setor VARCHAR(120) NULL,
  tipo_recompensa VARCHAR(80) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'EM_ANALISE',
  parecer_final TEXT NULL,
  decisao_em DATETIME NULL,
  decidido_por CHAR(36) NULL,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36) NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
