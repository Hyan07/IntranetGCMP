import 'dotenv/config';

function required(name, fallback = '') {
  const value = process.env[name] ?? fallback;
  if (String(value).trim() === '') throw new Error(`Variável obrigatória ausente: ${name}`);
  return String(value);
}

function integer(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Valor inválido em ${name}`);
  return value;
}

const sessionSecret = required('SESSION_SECRET');
const passwordPepper = required('PASSWORD_PEPPER');
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET deve possuir ao menos 32 caracteres.');
if (passwordPepper.length < 32) throw new Error('PASSWORD_PEPPER deve possuir ao menos 32 caracteres.');

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer('PORT', 3000),
  appName: process.env.APP_NAME || 'Intranet GCMP',
  institutionName: process.env.INSTITUTION_NAME || 'Guarda Civil Municipal de Passos',
  sessionSecret,
  passwordPepper,
  db: {
    host: required('DB_HOST'),
    port: integer('DB_PORT', 3306),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || ''
  },
  auth: {
    sessionHours: integer('SESSION_HOURS', 8),
    idleMinutes: integer('SESSION_IDLE_MINUTES', 30),
    maxAttempts: integer('MAX_LOGIN_ATTEMPTS', 5),
    lockMinutes: integer('LOGIN_LOCK_MINUTES', 15),
    recoveryMinutes: integer('RECOVERY_MINUTES', 15)
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: integer('SMTP_PORT', 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  }
});
