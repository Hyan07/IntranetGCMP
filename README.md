# Intranet GCMP 4.1 — Node.js + MySQL

Reconstrução da Intranet GCMP para substituir gradualmente Google Apps Script + Google Sheets por uma aplicação web própria. A versão 4.1 troca o banco da base 4.0 por **MySQL 8.4+**, preservando HTML/CSS/JavaScript no frontend e Node.js/Express no backend.

> Esta base é para DEV e homologação. Não substitua produção sem executar migrations, importação, diagnóstico, testes de concorrência e smoke tests em um MySQL real.

## Stack

- **Frontend:** HTML5, CSS responsivo e JavaScript ES Modules;
- **Backend:** Node.js 24 + Express;
- **Banco:** MySQL 8.4+, engine InnoDB, `utf8mb4`;
- **Driver:** `mysql2/promise`;
- **Sessões:** server-side em `http_sessions` no MySQL;
- **Arquivos:** volume/diretório privado, acessado somente por rotas autenticadas;
- **PDF:** PDFKit;
- **E-mail:** Nodemailer/SMTP;
- **Deploy:** Docker opcional + Nginx HTTPS.

## Módulos

1. autenticação por MASP e senha;
2. Dashboard por permissões;
3. Pessoal e ficha funcional;
4. solicitações de atualização cadastral;
5. Usuários, perfis e ALLOW/DENY individual/em massa;
6. Frota: viaturas, KM, encerramento administrativo, ocorrências, oficina, manutenção, histórico e arquivos;
7. Patrimônio e Cautelas: categorias, itens, cautela múltipla, devolução parcial/total, prorrogação, cancelamento e termo PDF;
8. Documentos;
9. Recompensas;
10. Auditoria append-only;
11. Configurações e notificações;
12. Perfil, troca de senha e encerramento de outras sessões;
13. diagnóstico de integridade via API e CLI.

## Garantias de integridade no MySQL

A troca de banco não removeu as proteções da base anterior. No MySQL elas foram implementadas com mecanismos nativos equivalentes:

- transações InnoDB;
- `SELECT ... FOR UPDATE` nas operações críticas;
- colunas geradas + índices `UNIQUE` para garantir **uma única movimentação aberta por viatura e por condutor**;
- coluna gerada + índice `UNIQUE` para impedir **duas cautelas abertas do mesmo patrimônio**;
- FKs e `CHECK` para estados e valores inválidos;
- triggers que rejeitam `UPDATE` e `DELETE` em `audit_log`;
- migrations serializadas com `GET_LOCK`;
- timezone de sessão fixado em UTC;
- `STRICT_TRANS_TABLES` imposto nas conexões da aplicação e migrations.

## Segurança

- Scrypt + salt aleatório para senhas;
- sessão no servidor; nenhum token de autenticação em `localStorage`;
- cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- CSRF ligado à sessão + validação de origem;
- rate limit global e de autenticação;
- Helmet/CSP sem dependência de CDN;
- queries parametrizadas;
- Zod no backend;
- AES-256-GCM para dados pessoais protegidos;
- HMAC para comparação de CPF sem depender do CPF em claro;
- autorização no backend por perfil + permissões individuais;
- proteção do último administrador ativo;
- upload privado com allowlist de MIME, magic bytes e nome UUID;
- proteção contra path traversal e CSV Formula Injection;
- logs com cookies/autorização redigidos;
- usuário MySQL de runtime sem privilégios DDL;
- Docker com filesystem read-only, `cap_drop: ALL` e `no-new-privileges`.

Leia `SECURITY.md` e `DEPLOY_PRODUCAO.md` antes de expor o sistema.

## Estrutura

```text
.
├── public/
├── src/
│   ├── config/
│   ├── db/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── utils/
├── migrations/
├── scripts/
├── tests/
├── deploy/
├── uploads/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Instalação em DEV

### 1. Pré-requisitos

- Node.js 24;
- MySQL 8.4+;
- npm.

### 2. Configuração

```bash
cp .env.example .env
```

Configure no mínimo:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=intranet_gcmp
DB_USER=gcmp_app
DB_PASSWORD=<senha-forte>
DB_SSL=false
SESSION_SECRET=<segredo-aleatorio>
DATA_ENCRYPTION_KEY=<base64-de-32-bytes>
```

Gere os segredos:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Dependências

```bash
npm install
npm audit
```

### 4. MySQL

Com Docker:

```bash
docker compose up -d mysql
```

O MySQL do compose **não publica a porta 3306 para a internet**.

### 5. Migrations

```bash
npm run db:migrate
```

Em produção, configure `MIGRATION_DB_USER` e `MIGRATION_DB_PASSWORD` para uma conta separada do usuário de runtime.

### 6. Primeiro administrador

```bash
npm run db:bootstrap
```

### 7. Integridade

```bash
npm run db:verify
```

### 8. Aplicação

```bash
npm run dev
```

DEV padrão: `http://localhost:3000`.

## Docker DEV

Preencha também no `.env`:

```env
MYSQL_APP_PASSWORD=<senha-do-gcmp_app>
MYSQL_ROOT_PASSWORD=<senha-root-separada>
```

Depois:

```bash
docker compose up -d mysql
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run db:bootstrap
docker compose up -d app
```

O Node fica publicado apenas em `127.0.0.1:3000`. Em produção, use Nginx/HTTPS na frente.

## Comandos

```bash
npm run dev
npm start
npm run check
npm test
npm run db:migrate
npm run db:bootstrap
npm run db:verify
npm run import:fleet
npm run import:personnel
npm run import:users
npm run dev:reset
```

## Migração do sistema atual

Leia nesta ordem:

1. `MIGRACAO_GOOGLE_APPS_SCRIPT.md`;
2. `LEGACY_ACTION_MAP.md`;
3. `VALIDACAO.md`;
4. `DEPLOY_PRODUCAO.md`.

A origem Google Apps Script/Sheets permanece oficial até a homologação da nova aplicação. A importação deve ser testada primeiro com cópias dos dados.

## DEV x PROD

Separe obrigatoriamente:

- instância/schema MySQL;
- contas e senhas do banco;
- `.env` e secrets;
- uploads;
- domínio;
- SMTP;
- administradores;
- backups.

Não copie o `.env` de DEV para PROD e não use `root` como usuário do Node.

## Reset DEV

```bash
CONFIRM_RESET_DEV=RESETAR_DEV npm run dev:reset
```

O script é bloqueado fora de `NODE_ENV=development`.
