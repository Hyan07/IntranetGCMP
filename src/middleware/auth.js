import { AppError } from '../lib/http.js';

export function requireAuth(req, _res, next) {
  if (!req.session?.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Sua sessão expirou. Entre novamente.'));
  req.session.lastActivity = Date.now();
  next();
}

export function requirePermission(code) {
  return (req, _res, next) => {
    const permissions = req.session?.permissions || [];
    if (!permissions.includes(code)) {
      return next(new AppError(403, 'FORBIDDEN', 'Você não possui permissão para executar esta ação.'));
    }
    next();
  };
}
