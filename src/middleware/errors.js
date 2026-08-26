export function notFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `Rota não encontrada: ${req.method} ${req.path}` } });
}

export function errorHandler(error, req, res, _next) {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    ok: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'Ocorreu um erro interno no servidor.' : error.message,
      details: error.details || undefined
    }
  });
}
