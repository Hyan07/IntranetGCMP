import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { personnelRoutes } from './routes/personnel.routes.js';
import { assetsRoutes } from './routes/assets.routes.js';
import { fleetRoutes } from './routes/fleet.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { documentsRoutes } from './routes/documents.routes.js';
import { rewardsRoutes } from './routes/rewards.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { errorHandler, notFound } from './middleware/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const MySQLStore = MySQLStoreFactory(session);

export const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "img-src": ["'self'", 'data:', 'https:']
    }
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

const store = new MySQLStore({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: env.auth.sessionHours * 60 * 60 * 1000
});

app.use(session({
  name: 'gcmp.sid',
  secret: env.sessionSecret,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: env.auth.sessionHours * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  if (req.session?.user && req.session.lastActivity) {
    const idleMs = Date.now() - req.session.lastActivity;
    if (idleMs > env.auth.idleMinutes * 60_000) {
      return req.session.destroy(() => res.status(401).json({ ok: false, error: { code: 'SESSION_IDLE_TIMEOUT', message: 'Sessão encerrada por inatividade.' } }));
    }
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: env.appName, environment: env.nodeEnv }));
app.get('/api/public/config', (_req, res) => res.json({ ok: true, data: { appName: env.appName, institutionName: env.institutionName, version: '4.0.0' } }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pessoal', personnelRoutes);
app.use('/api/patrimonio', assetsRoutes);
app.use('/api/frota', fleetRoutes);
app.use('/api/usuarios', usersRoutes);
app.use('/api/auditoria', auditRoutes);
app.use('/api/documentos', documentsRoutes);
app.use('/api/recompensas', rewardsRoutes);
app.use('/api/configuracoes', settingsRoutes);

app.use('/api', notFound);
app.use(express.static(publicDir, { extensions: ['html'] }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use(errorHandler);
