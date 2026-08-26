# Intranet GCMP — Node.js + MySQL

Nova arquitetura da Intranet da Guarda Civil Municipal de Passos.

A versão 4 substitui o Google Apps Script por uma aplicação web convencional:

- **Frontend:** HTML5 + CSS3 + JavaScript puro.
- **Backend:** Node.js + Express.
- **Banco:** MySQL.
- **Autenticação:** sessão HTTP persistida no MySQL.
- **Senhas:** bcrypt + pepper definido no ambiente.
- **Auditoria:** operações relevantes ficam registradas no banco.
- **Recuperação de senha:** SMTP configurável, inclusive Gmail/Google Workspace.
- **Hospedagem:** pronta para ambiente Node.js, incluindo Hostinger.

## Estrutura

```text
.
├── server.js
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── api.js
│       ├── app.js
│       └── pages.js
├── src/
│   ├── app.js
│   ├── config/
│   ├── lib/
│   ├── middleware/
│   ├── routes/
│   └── services/
├── database/migrations/
└── scripts/
```

## Instalação local

1. Instale Node.js 20+ e MySQL 8+.
2. Copie `.env.example` para `.env`.
3. Preencha as credenciais do MySQL e troque `SESSION_SECRET` e `PASSWORD_PEPPER`.
4. Instale as dependências:
   ```bash
   npm install
   ```
5. Crie/atualize o banco e o usuário administrador:
   ```bash
   npm run setup
   ```
6. Inicie:
   ```bash
   npm run dev
   ```
7. Abra `http://localhost:3000`.

## Primeiro administrador

O `npm run db:seed` usa:

- `ADMIN_MASP`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

A senha inicial é marcada para troca no primeiro acesso.

## Implantação na Hostinger

Configure as mesmas variáveis do `.env` no painel da aplicação Node.js. O arquivo de inicialização é:

```text
server.js
```

Antes do primeiro start em produção, execute:

```bash
npm install
npm run setup
npm start
```

## O que já foi portado

- Login por MASP e senha.
- Bloqueio por tentativas inválidas.
- Sessão com expiração e inatividade.
- Recuperação e alteração de senha.
- Permissões por usuário.
- Dashboard institucional.
- Cadastro/listagem de pessoal.
- Cadastro/listagem de patrimônio.
- Cautelas e devoluções no backend.
- Cadastro/listagem de viaturas.
- Histórico de quilometragem.
- Registro e resolução de defeitos da frota.
- Usuários e catálogo de permissões.
- Auditoria.
- Cadastro/listagem inicial de documentos e recompensas.
- Configurações do sistema.

## Migração dos dados antigos

Esta versão **não lê mais planilhas do Google diretamente**. Para preservar os dados do ambiente anterior, exporte as abas para CSV/JSON e faça a importação para as tabelas MySQL correspondentes. O mapeamento segue os nomes funcionais do pacote 3.15.0:

- `USUARIOS` → `usuarios`
- `PERMISSOES` → `permissoes`
- `USUARIO_PERMISSOES` → `usuario_permissoes`
- `PESSOAS` → `pessoas`
- `PATRIMONIOS` → `patrimonios`
- `CAUTELAS` → `cautelas` + `itens_cautela`
- `VIATURAS` → `viaturas`
- histórico de KM → `historico_km`
- defeitos → `defeitos_frota`
- `DOCUMENTOS` → `documentos`
- pedidos de recompensa → `recompensas`

O histórico antigo continua recuperável pelo histórico do Git, mesmo após a remoção dos arquivos GAS da árvore atual.
