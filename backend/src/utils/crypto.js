/**
 * utils/crypto.js
 *
 * Cifrado simétrico (AES-256-GCM) para secretos que la aplicación
 * necesita poder DESCIFRAR más tarde (a diferencia de las contraseñas
 * de usuario, que se hashean con Argon2id y nunca se recuperan — ver
 * auth/password.js). Usos actuales: el client secret de la app de
 * Microsoft 365 (services/m365.service.js) y las credenciales
 * guardadas en la bóveda de contraseñas (services/vault.service.js).
 *
 * La clave sale de M365_ENCRYPTION_KEY (ver config/env.js) — nunca se
 * guarda en la base ni en el código. Se reutiliza la misma clave para
 * ambos usos (mismo modelo de amenaza: protección en reposo dentro de
 * esta misma base de datos) en vez de sumar una variable de entorno
 * más para gestionar.
 */

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado por el estándar para GCM
const AUTH_TAG_LENGTH = 16;

const key = Buffer.from(env.m365EncryptionKey, 'hex');

/**
 * @param {string} plaintext
 * @returns {string} iv + authTag + ciphertext empaquetados y codificados en base64
 */
export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * @param {string} packed - valor devuelto por encryptSecret()
 * @returns {string} texto plano original
 */
export function decryptSecret(packed) {
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
