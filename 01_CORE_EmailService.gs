/** Envio de mensagens transacionais. */

function sendRecoveryEmail_(user, code, expiresAt) {
  if (APP_CONFIG.ENVIRONMENT === 'DEVELOPMENT') {
    console.log('[DEV] E-mail de recuperação suprimido para ' + String(user && user.MASP || 'usuário sem MASP') + '. Código: ' + code);
    return { sent: false, suppressed: true };
  }
  const systemName = getRuntimeConfig_('NOME_SISTEMA', APP_CONFIG.NAME);
  const subject = systemName + ' — código para redefinir senha';
  const expiration = formatDateTime_(expiresAt);
  const plain = [
    'Olá, ' + user.NOME + '.',
    '',
    'Seu código temporário é: ' + code,
    'Validade: ' + expiration + '.',
    '',
    'Se você não solicitou esta alteração, ignore esta mensagem.'
  ].join('\n');
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033">' +
    '<div style="background:#123b66;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0"><h2 style="margin:0">' + escapeHtmlServer_(systemName) + '</h2></div>' +
    '<div style="border:1px solid #dce4ee;border-top:0;padding:24px;border-radius:0 0 12px 12px">' +
    '<p>Olá, <strong>' + escapeHtmlServer_(user.NOME) + '</strong>.</p>' +
    '<p>Use o código abaixo para criar uma nova senha:</p>' +
    '<div style="font-size:30px;font-weight:700;letter-spacing:7px;text-align:center;background:#eef4fa;padding:18px;border-radius:10px">' + escapeHtmlServer_(code) + '</div>' +
    '<p style="color:#536174">O código expira em ' + escapeHtmlServer_(expiration) + ' e só pode ser usado uma vez.</p>' +
    '<p style="color:#536174">Se você não solicitou esta alteração, ignore esta mensagem.</p></div></div>';
  MailApp.sendEmail({ to: user.EMAIL, subject: subject, body: plain, htmlBody: html, name: systemName });
}

function escapeHtmlServer_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
