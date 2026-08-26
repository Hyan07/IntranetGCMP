import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/lib/security.js';

const permissionCatalog = [
  ['dashboard.visualizar', 'dashboard', 'visualizar', 'Visualizar painel'],
  ['usuarios.visualizar', 'usuarios', 'visualizar', 'Visualizar usuários'],
  ['usuarios.criar', 'usuarios', 'criar', 'Cadastrar usuários'],
  ['usuarios.editar', 'usuarios', 'editar', 'Editar usuários'],
  ['usuarios.gerenciar_permissoes', 'usuarios', 'gerenciar_permissoes', 'Gerenciar permissões'],
  ['pessoal.visualizar', 'pessoal', 'visualizar', 'Visualizar pessoal'],
  ['pessoal.criar', 'pessoal', 'criar', 'Cadastrar pessoal'],
  ['pessoal.editar', 'pessoal', 'editar', 'Editar pessoal'],
  ['patrimonio.visualizar', 'patrimonio', 'visualizar', 'Visualizar patrimônio'],
  ['patrimonio.criar', 'patrimonio', 'criar', 'Cadastrar patrimônio'],
  ['patrimonio.editar', 'patrimonio', 'editar', 'Editar patrimônio'],
  ['patrimonio.cautelas.visualizar', 'patrimonio', 'cautelas_visualizar', 'Visualizar cautelas'],
  ['patrimonio.cautelas.criar', 'patrimonio', 'cautelas_criar', 'Criar cautelas'],
  ['patrimonio.cautelas.devolver', 'patrimonio', 'cautelas_devolver', 'Registrar devoluções'],
  ['frota.visualizar', 'frota', 'visualizar', 'Visualizar frota'],
  ['frota.viaturas.criar', 'frota', 'viaturas_criar', 'Cadastrar viaturas'],
  ['frota.viaturas.editar', 'frota', 'viaturas_editar', 'Editar viaturas'],
  ['frota.km.registrar', 'frota', 'km_registrar', 'Registrar quilometragem'],
  ['frota.defeitos.visualizar', 'frota', 'defeitos_visualizar', 'Visualizar defeitos'],
  ['frota.defeitos.criar', 'frota', 'defeitos_criar', 'Registrar defeitos'],
  ['frota.defeitos.resolver', 'frota', 'defeitos_resolver', 'Resolver defeitos'],
  ['documentos.visualizar', 'documentos', 'visualizar', 'Visualizar documentos'],
  ['documentos.criar', 'documentos', 'criar', 'Cadastrar documentos'],
  ['recompensas.visualizar', 'recompensas', 'visualizar', 'Visualizar recompensas'],
  ['recompensas.criar', 'recompensas', 'criar', 'Cadastrar recompensas'],
  ['auditoria.visualizar', 'auditoria', 'visualizar', 'Visualizar auditoria'],
  ['configuracoes.gerenciar', 'configuracoes', 'gerenciar', 'Gerenciar configurações']
];

for (const [codigo, modulo, acao, descricao] of permissionCatalog) {
  await pool.execute(
    `INSERT INTO permissoes (id, codigo, modulo, acao, descricao, ativa)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE modulo=VALUES(modulo), acao=VALUES(acao), descricao=VALUES(descricao), ativa=1`,
    [randomUUID(), codigo, modulo, acao, descricao]
  );
}

const defaults = [
  ['NOME_SISTEMA', process.env.APP_NAME || 'Intranet GCMP', 'Nome exibido no sistema'],
  ['NOME_INSTITUICAO', process.env.INSTITUTION_NAME || 'Guarda Civil Municipal de Passos', 'Nome da instituição']
];
for (const item of defaults) {
  await pool.execute('INSERT INTO configuracoes (chave, valor, descricao) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE descricao=VALUES(descricao)', item);
}

const masp = String(process.env.ADMIN_MASP || '').replace(/\D/g, '');
const name = process.env.ADMIN_NAME || 'Administrador do Sistema';
const email = process.env.ADMIN_EMAIL || 'admin@instituicao.local';
const password = process.env.ADMIN_PASSWORD || '';

if (masp && password) {
  const [existing] = await pool.execute('SELECT id FROM usuarios WHERE masp=? LIMIT 1', [masp]);
  let userId = existing[0]?.id;
  if (!userId) {
    userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await pool.execute(
      `INSERT INTO usuarios (id, masp, nome, email, cargo, funcao, setor, status, senha_hash, trocar_senha)
       VALUES (?, ?, ?, ?, 'Administrador', 'Administrador do Sistema', 'Administrativo', 'ATIVO', ?, 1)`,
      [userId, masp, name, email, passwordHash]
    );
    console.log(`Administrador criado: MASP ${masp}`);
  }

  const [permissions] = await pool.query('SELECT id FROM permissoes WHERE ativa=1');
  for (const permission of permissions) {
    await pool.execute(
      `INSERT INTO usuario_permissoes (id, id_usuario, id_permissao, permitido, concedido_por)
       VALUES (?, ?, ?, 1, 'SEED')
       ON DUPLICATE KEY UPDATE permitido=1, concedido_por='SEED', concedido_em=NOW()`,
      [randomUUID(), userId, permission.id]
    );
  }
} else {
  console.warn('ADMIN_MASP/ADMIN_PASSWORD não definidos. Nenhum administrador inicial foi criado.');
}

await pool.end();
console.log('Seed concluído.');
