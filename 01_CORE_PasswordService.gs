/** Hash, política de senha e códigos temporários. */

function generateSalt_() {
  return randomToken_(24);
}

function getPasswordPepper_() {
  let pepper = getProperty_(APP_CONFIG.PROPERTY_KEYS.PASSWORD_PEPPER, false);
  if (!pepper) {
    pepper = randomToken_(32);
    getScriptProperties_().setProperty(APP_CONFIG.PROPERTY_KEYS.PASSWORD_PEPPER, pepper);
  }
  return pepper;
}

function bytesToHex_(bytes) {
  return bytes.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function sha256_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8));
}

function hashPassword_(password, salt) {
  return sha256_(String(salt) + ':' + String(password) + ':' + getPasswordPepper_());
}

function safeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function verifyPassword_(password, user) {
  return Boolean(user && user.SENHA_SALT && user.SENHA_HASH) && safeEqual_(hashPassword_(password, user.SENHA_SALT), user.SENHA_HASH);
}

function validatePasswordPolicy_(password) {
  const value = String(password || '');
  if (value.length < APP_CONFIG.PASSWORD_MIN_LENGTH) {
    throw appError_('WEAK_PASSWORD', 'A senha deve possuir pelo menos ' + APP_CONFIG.PASSWORD_MIN_LENGTH + ' caracteres.');
  }
  if (!/[A-Za-zÀ-ÿ]/.test(value) || !/\d/.test(value)) {
    throw appError_('WEAK_PASSWORD', 'A senha deve combinar letras e números.');
  }
  if (/^(.)\1+$/.test(value) || ['12345678', 'password', 'senha123', 'admin123'].indexOf(value.toLowerCase()) >= 0) {
    throw appError_('WEAK_PASSWORD', 'Escolha uma senha menos previsível.');
  }
  return value;
}

function makePasswordRecord_(password) {
  const valid = validatePasswordPolicy_(password);
  const salt = generateSalt_();
  return { SENHA_SALT: salt, SENHA_HASH: hashPassword_(valid, salt), SENHA_ALTERADA_EM: now_() };
}

function generateTemporaryPassword_() {
  return 'Gc!' + randomToken_(8).slice(0, 8) + Math.floor(10 + Math.random() * 89);
}

function hashRecoveryCode_(code, userId) {
  return sha256_(String(userId) + ':' + String(code) + ':' + getPasswordPepper_());
}
