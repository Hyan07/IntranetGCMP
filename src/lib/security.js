import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { AppError } from './http.js';

export function validatePasswordPolicy(password) {
  const value = String(password || '');
  if (value.length < 8) throw new AppError(400, 'WEAK_PASSWORD', 'A senha deve possuir pelo menos 8 caracteres.');
  if (!/[A-Za-zÀ-ÿ]/.test(value) || !/\d/.test(value)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'A senha deve combinar letras e números.');
  }
}

export async function hashPassword(password) {
  validatePasswordPolicy(password);
  return bcrypt.hash(`${password}:${env.passwordPepper}`, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(`${password}:${env.passwordPepper}`, hash);
}

export function recoveryHash(code, userId) {
  return crypto.createHash('sha256').update(`${code}:${userId}:${env.passwordPepper}`).digest('hex');
}

export function randomRecoveryCode() {
  return String(crypto.randomInt(100000, 1000000));
}
