/**
 * auth/password.js
 *
 * Único punto de la aplicación que hashea/verifica contraseñas. Usa
 * Argon2id (ganador de la Password Hashing Competition), con parámetros
 * explícitos en vez de los defaults de la librería, para que queden
 * documentados y no cambien silenciosamente entre versiones del paquete.
 */

import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

// Parámetros recomendados por OWASP para Argon2id (perfil balanceado
// para un servidor de aplicación, no para hardware dedicado a hashing).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB
  timeCost: 2,
  parallelism: 1,
};

/**
 * @param {string} plainPassword
 * @returns {Promise<string>} hash listo para almacenar en users.password_hash
 */
export async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, hash) {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // argon2.verify lanza si el hash está corrupto/formato inválido —
    // se trata como contraseña incorrecta, nunca se propaga el error.
    return false;
  }
}

/**
 * Política mínima de complejidad, validada en el backend (además de la
 * validación de formato con Joi). Longitud mínima 12 — más relevante que
 * exigir combinaciones de símbolos, que empujan a patrones predecibles.
 * @param {string} plainPassword
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function checkPasswordPolicy(plainPassword) {
  const reasons = [];
  if (!plainPassword || plainPassword.length < 12) {
    reasons.push('La contraseña debe tener al menos 12 caracteres');
  }
  if (plainPassword && !/[a-z]/.test(plainPassword)) {
    reasons.push('Debe incluir al menos una letra minúscula');
  }
  if (plainPassword && !/[A-Z]/.test(plainPassword)) {
    reasons.push('Debe incluir al menos una letra mayúscula');
  }
  if (plainPassword && !/[0-9]/.test(plainPassword)) {
    reasons.push('Debe incluir al menos un número');
  }
  return { valid: reasons.length === 0, reasons };
}

const TEMP_PASSWORD_LOWER = 'abcdefghijkmnpqrstuvwxyz'; // sin l/o, se confunden con 1/0
const TEMP_PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_PASSWORD_DIGITS = '23456789';
const TEMP_PASSWORD_LENGTH = 14;

/**
 * Contraseña temporal para el flujo de "olvidé mi contraseña" (ver
 * auth.service.js#forgotPassword) — cumple la política mínima por
 * construcción (al menos una minúscula, una mayúscula y un número) y
 * evita caracteres ambiguos para que copiarla a mano desde el correo
 * no sea una trampa.
 * @returns {string}
 */
export function generateTemporaryPassword() {
  const pool = TEMP_PASSWORD_LOWER + TEMP_PASSWORD_UPPER + TEMP_PASSWORD_DIGITS;
  const required = [
    TEMP_PASSWORD_LOWER[randomInt(TEMP_PASSWORD_LOWER.length)],
    TEMP_PASSWORD_UPPER[randomInt(TEMP_PASSWORD_UPPER.length)],
    TEMP_PASSWORD_DIGITS[randomInt(TEMP_PASSWORD_DIGITS.length)],
  ];
  const rest = Array.from({ length: TEMP_PASSWORD_LENGTH - required.length }, () => pool[randomInt(pool.length)]);
  const chars = [...required, ...rest];
  // Barajado Fisher-Yates con randomInt (criptográficamente seguro) en
  // vez de Math.random() — para que la posición de los caracteres
  // "obligatorios" tampoco sea predecible.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
