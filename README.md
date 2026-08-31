# Intranet GCMP v5 — Node.js + MySQL

Conversão da Intranet da Guarda Civil Municipal de Passos para uma aplicação web convencional, sem dependência do Google Apps Script para executar regras de negócio.

## Stack

- Frontend: HTML5 + CSS3 + JavaScript ES Modules.
- Backend: Node.js + Express.
- Banco: MySQL 8+ / InnoDB / utf8mb4.
- Autenticação: sessão HTTP persistida no MySQL.
- Senhas: bcrypt + pepper de ambiente.
- PDF: PDFKit.
- E-mail: Nodemailer/SMTP.
- Hospedagem: compatível com Node.js na Hostinger.

## Estrutura

```text
server.js
public/
  index.html
  css/
  js/
    core/
    pages/
src/
  app.js
  config/
  lib/
  middleware/
  routes/
  services/
database/migrations/
scripts/
tests/
uploads/
```

As rotas cuidam de HTTP e autorização; as regras transacionais críticas ficam nos serviços.

## Funcionalidades portadas

### Autenticação
Login por MASP, bloqueio por tentativas inválidas, sessão server-side, expiração por inatividade, troca e recuperação de senha.

### Pessoal
Cadastro, edição, ficha funcional, histórico e solicitação de alteração cadastral com aprovação/recusa por outro administrador.

### Usuários e permissões
Cadastro, edição, reset administrativo de senha, permissões granulares, concessão individual e concessão em massa.

### Patrimônio e cautelas
Patrimônio individual ou quantitativo, saldo total/disponível/cautelado, cautela comum ou administrativa, autenticação do recebedor, vários itens no termo, prazo determinado/indeterminado, bloqueio por cautela vencida, devolução parcial/total, prorrogação, cancelamento e termo PDF.

### Frota
Viaturas, histórico de KM, abertura/encerramento de turno, bloqueio de conflito de viatura/responsável, integrantes, divergência de KM com justificativa, defeitos, manutenção, pneus e mudança automática de status.

### Administração
Dashboard, documentos, recompensas, auditoria, notificações, configurações e diagnóstico estrutural do banco.

## Instalação local

Pré-requisitos: Node.js 20+ e MySQL 8+.

```bash
npm install
npm run db:migrate
npm run db:seed
npm test
npm run dev
```

Abra `http://localhost:3000`.

## Atualização de uma instalação 4.x

A v5 utiliza migrations incrementais. Não apague o banco existente. Antes da atualização, faça backup do banco e use primeiro uma cópia DEV/homologação.

```bash
npm install
npm run db:migrate
npm run db:seed
npm test
npm start
```

As migrations `002_operational_parity.sql` e `003_normalize_legacy_state.sql` adicionam a estrutura operacional e normalizam registros existentes.

## Hostinger

Startup: `hostinger.cjs`. Configure as variáveis do `.env` no painel e execute migrations antes de liberar a nova versão.

Não use a conta root do MySQL como usuário da aplicação em produção.

## Segurança

- cookie HttpOnly, SameSite=Strict e Secure em produção;
- Helmet/CSP;
- validação de origem em operações de escrita;
- queries parametrizadas;
- transações e SELECT ... FOR UPDATE;
- locks nomeados para migrations e concorrência operacional;
- auditoria e permissões verificadas no backend.

## Homologação obrigatória

Antes de substituir produção, validar login/recuperação, pessoal, aprovação cadastral, usuários/permissões, cautelas com vários itens, devolução parcial/total, prorrogação/PDF, turnos/KM, defeitos/manutenção, pneus, auditoria, notificações e diagnóstico estrutural.
