export class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function requiredFields(payload, fields) {
  const missing = fields.filter((field) => String(payload?.[field] ?? '').trim() === '');
  if (missing.length) throw new AppError(400, 'MISSING_FIELDS', `Campos obrigatórios: ${missing.join(', ')}`);
}

export function normalizeMasp(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskMasp(value) {
  const digits = normalizeMasp(value);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2)}-${digits.slice(-2)}`;
}

export function pagination(req, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(req.query.limit || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}
