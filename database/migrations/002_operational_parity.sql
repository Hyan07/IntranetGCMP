-- Intranet GCMP v5 - paridade operacional com a versão Google Apps Script.
SET NAMES utf8mb4;

ALTER TABLE patrimonios
  ADD COLUMN subcategoria VARCHAR(120) NULL AFTER categoria,
  ADD COLUMN tipo_controle VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL' AFTER unidade,
  ADD COLUMN quantidade_total DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER tipo_controle,
  ADD COLUMN quantidade_disponivel DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER quantidade_total,
  ADD COLUMN quantidade_cautelada DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER quantidade_disponivel,
  ADD COLUMN cautelavel TINYINT(1) NOT NULL DEFAULT 1 AFTER quantidade_cautelada,
  ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER cautelavel;

ALTER TABLE cautelas
  ADD COLUMN grupo CHAR(36) NULL AFTER numero,
  ADD COLUMN tipo_cautela VARCHAR(30) NOT NULL DEFAULT 'COMUM' AFTER grupo,
  ADD COLUMN indeterminado TINYINT(1) NOT NULL DEFAULT 0 AFTER previsao_devolucao,
  ADD COLUMN cancelado_em DATETIME NULL AFTER devolvido_em,
  ADD COLUMN cancelado_por CHAR(36) NULL AFTER cancelado_em,
  ADD COLUMN motivo_cancelamento TEXT NULL AFTER cancelado_por;

ALTER TABLE itens_cautela
  ADD COLUMN quantidade_devolvida DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER quantidade,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' AFTER quantidade_devolvida,
  ADD COLUMN devolvido_em DATETIME NULL AFTER status;

CREATE TABLE IF NOT EXISTS historico_funcional (
  id CHAR(36) PRIMARY KEY,
  id_pessoa CHAR(36) NOT NULL,
  data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo VARCHAR(80) NOT NULL,
  valor_anterior JSON NULL,
  valor_novo JSON NULL,
  id_usuario CHAR(36) NULL,
  observacoes TEXT NULL,
  INDEX idx_hist_func_pessoa_data (id_pessoa, data_hora),
  CONSTRAINT fk_hist_func_pessoa FOREIGN KEY (id_pessoa) REFERENCES pessoas(id) ON DELETE CASCADE,
  CONSTRAINT fk_hist_func_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS turnos_frota (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  prefixo VARCHAR(40) NOT NULL,
  placa VARCHAR(20) NOT NULL,
  id_usuario_responsavel CHAR(36) NOT NULL,
  id_pessoa_responsavel CHAR(36) NULL,
  nome_responsavel VARCHAR(180) NOT NULL,
  masp_responsavel VARCHAR(30) NOT NULL,
  setor VARCHAR(120) NULL,
  equipe VARCHAR(120) NULL,
  inicio_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fim_em DATETIME NULL,
  km_inicial DECIMAL(12,1) NOT NULL,
  km_final DECIMAL(12,1) NULL,
  km_percorrido DECIMAL(12,1) NULL,
  combustivel_inicial VARCHAR(50) NULL,
  combustivel_final VARCHAR(50) NULL,
  condicoes_iniciais TEXT NULL,
  avarias_iniciais TEXT NULL,
  equipamentos_iniciais TEXT NULL,
  ocorrencias TEXT NULL,
  avarias_finais TEXT NULL,
  falhas_mecanicas TEXT NULL,
  multas TEXT NULL,
  limpeza TEXT NULL,
  equipamentos_ausentes TEXT NULL,
  necessita_manutencao TINYINT(1) NOT NULL DEFAULT 0,
  justificativa_km TEXT NULL,
  observacoes_inicio TEXT NULL,
  observacoes_fim TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_turno_status_inicio (status, inicio_em),
  INDEX idx_turno_viatura (id_viatura, status),
  INDEX idx_turno_usuario (id_usuario_responsavel, status),
  CONSTRAINT fk_turno_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id),
  CONSTRAINT fk_turno_usuario FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id),
  CONSTRAINT fk_turno_pessoa FOREIGN KEY (id_pessoa_responsavel) REFERENCES pessoas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integrantes_turno (
  id CHAR(36) PRIMARY KEY,
  id_turno CHAR(36) NOT NULL,
  id_pessoa CHAR(36) NOT NULL,
  nome VARCHAR(180) NOT NULL,
  masp VARCHAR(30) NULL,
  funcao VARCHAR(120) NULL,
  UNIQUE KEY uq_turno_integrante (id_turno, id_pessoa),
  INDEX idx_integrante_pessoa (id_pessoa),
  CONSTRAINT fk_integrante_turno FOREIGN KEY (id_turno) REFERENCES turnos_frota(id) ON DELETE CASCADE,
  CONSTRAINT fk_integrante_pessoa FOREIGN KEY (id_pessoa) REFERENCES pessoas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manutencoes_frota (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  tipo VARCHAR(80) NOT NULL,
  descricao TEXT NOT NULL,
  oficina VARCHAR(180) NULL,
  data_entrada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_prevista_saida DATETIME NULL,
  data_saida DATETIME NULL,
  km_entrada DECIMAL(12,1) NULL,
  km_saida DECIMAL(12,1) NULL,
  custo DECIMAL(14,2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ABERTA',
  responsavel_id CHAR(36) NULL,
  responsavel_nome VARCHAR(180) NULL,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_manutencao_viatura_status (id_viatura, status),
  CONSTRAINT fk_manutencao_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id),
  CONSTRAINT fk_manutencao_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pneus_frota (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  posicao VARCHAR(50) NOT NULL,
  marca VARCHAR(100) NULL,
  modelo VARCHAR(100) NULL,
  numero_serie VARCHAR(120) NULL,
  dot VARCHAR(20) NULL,
  instalado_em DATETIME NULL,
  km_instalacao DECIMAL(12,1) NULL,
  removido_em DATETIME NULL,
  km_remocao DECIMAL(12,1) NULL,
  motivo_remocao TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'INSTALADO',
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pneu_viatura_status (id_viatura, status),
  CONSTRAINT fk_pneu_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arquivos_frota (
  id CHAR(36) PRIMARY KEY,
  id_viatura CHAR(36) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  nome_armazenado VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  tamanho_bytes BIGINT UNSIGNED NOT NULL,
  categoria VARCHAR(80) NULL,
  caminho_relativo VARCHAR(500) NOT NULL,
  enviado_por CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_arquivo_viatura (id_viatura, criado_em),
  CONSTRAINT fk_arquivo_viatura FOREIGN KEY (id_viatura) REFERENCES viaturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_arquivo_usuario FOREIGN KEY (enviado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notificacoes_usuario_lida ON notificacoes (id_usuario, lida, criado_em);
CREATE INDEX idx_solicitacoes_status_data ON solicitacoes_atualizacao (status, solicitado_em);
