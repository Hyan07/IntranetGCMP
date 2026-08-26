import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.password) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.password }
    });
  }
  return transporter;
}

export async function sendRecoveryEmail(user, code, expiresAt) {
  const mail = getTransporter();
  if (!mail) {
    console.warn('SMTP não configurado. Recuperação de senha não será enviada.');
    return false;
  }

  await mail.sendMail({
    from: env.smtp.from,
    to: user.email,
    subject: 'Código para redefinição de senha — Intranet GCMP',
    text: `Olá, ${user.nome}. Seu código de recuperação é ${code}. Ele expira em ${expiresAt.toLocaleString('pt-BR')}. Se você não solicitou a troca de senha, ignore esta mensagem.`
  });
  return true;
}
