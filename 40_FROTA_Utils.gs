/** Utilitários exclusivos do módulo Frota. */

function frotaOk_(dados, mensagem) {
  return { ok: true, dados: dados === undefined ? {} : dados, mensagem: mensagem || '' };
}

function frotaFalha_(error) {
  return { ok: false, mensagem: error && error.message ? error.message : 'Não foi possível concluir a operação.' };
}

function frotaTexto_(value, maxLength) {
  const text = String(value === null || value === undefined ? '' : value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function frotaUpper_(value) {
  return frotaTexto_(value).toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-/]+/g, '_');
}

function frotaBoolean_(value) {
  return value === true || ['TRUE', '1', 'SIM', 'S', 'YES'].indexOf(String(value || '').toUpperCase()) >= 0;
}

function frotaMasp_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(8, '0').slice(-8) : '';
}

function frotaPlaca_(value) {
  const plate = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
    throw appError_('FROTA_PLACA_INVALIDA', 'Informe uma placa válida no padrão ABC1D23 ou ABC1234.');
  }
  return plate;
}

function frotaNumero_(value, field, allowEmpty) {
  if ((value === '' || value === null || value === undefined) && allowEmpty) return '';
  const normalized = typeof value === 'string' ? value.replace(/\./g, '').replace(',', '.') : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw appError_('FROTA_NUMERO_INVALIDO', (field || 'Valor') + ' deve ser um número igual ou maior que zero.');
  return number;
}

function frotaData_(value, allowEmpty) {
  if (!value && allowEmpty) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw appError_('FROTA_DATA_INVALIDA', 'Uma das datas informadas é inválida.');
  return date;
}

function frotaDataSomente_(value, allowEmpty) {
  if (!value && allowEmpty) return '';
  const text = frotaTexto_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = frotaData_(value, allowEmpty);
  return Utilities.formatDate(date, FROTA_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
}

function frotaExigir_(payload, fields) {
  const missing = (fields || []).filter(function (field) {
    const value = payload ? payload[field] : null;
    return value === null || value === undefined || String(value).trim() === '';
  });
  if (missing.length) throw appError_('FROTA_CAMPOS_OBRIGATORIOS', 'Preencha os campos obrigatórios.', { fields: missing });
}

function frotaValorPermitido_(value, allowed, label, allowEmpty) {
  const normalized = frotaUpper_(value);
  if (!normalized && allowEmpty) return '';
  if (allowed.indexOf(normalized) < 0) throw appError_('FROTA_VALOR_INVALIDO', (label || 'Valor') + ' inválido.');
  return normalized;
}

function frotaDiaInicio_(value) {
  const date = frotaData_(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function frotaDiaFim_(value) {
  const date = frotaData_(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function frotaDiasAte_(value, reference) {
  if (!value) return null;
  const target = frotaDiaInicio_(value);
  const base = frotaDiaInicio_(reference || new Date());
  return Math.ceil((target.getTime() - base.getTime()) / 86400000);
}

function frotaSerializar_(value) {
  if (value === null || value === undefined || value === '') return '';
  return typeof value === 'string' ? value.slice(0, 45000) : JSON.stringify(sanitizeForClient_(value)).slice(0, 45000);
}

function frotaSemLinha_(row) {
  const copy = Object.assign({}, row || {});
  delete copy._row;
  Object.keys(copy).forEach(function (field) {
    if (!isMaspField_(field)) return;
    const digits = String(copy[field] || '').replace(/\D/g, '');
    if (digits) copy[field] = formatMasp_(copy[field]);
  });
  return copy;
}

function frotaPastaNome_(vehicle) {
  return (frotaTexto_(vehicle.PREFIXO, 50) + ' - ' + frotaPlaca_(vehicle.PLACA)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function frotaListaPropriedade_(key, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return fallback.slice();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed.map(frotaUpper_) : fallback.slice();
  } catch (error) {
    return String(raw).split(',').map(frotaUpper_).filter(Boolean);
  }
}

function frotaIdempotencyKey_(parts) {
  return (parts || []).map(function (part) { return frotaTexto_(part, 100); }).join(':');
}
