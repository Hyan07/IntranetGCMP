import { AppError } from '../lib/http.js';

export function sameOriginForWrites(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.get('host')) {
      return next(new AppError(403, 'INVALID_ORIGIN', 'Origem da requisição não autorizada.'));
    }
  } catch {
    return next(new AppError(403, 'INVALID_ORIGIN', 'Origem da requisição inválida.'));
  }
  next();
}
