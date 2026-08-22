/**
 * auth/password.js
 *
 * Único punto de la aplicación que hashea/verifica contraseñas. Usa
 * Argon2id (ganador de la Password Hashing Competition), con parámetros
 * explícitos en vez de los defaults de la librería, para que queden
 * documentados y no cambien silenciosamente entre versiones del paquete.
 */

import argon2 from 'argon2';

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
