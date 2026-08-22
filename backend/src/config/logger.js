/**
 * config/logger.js
 *
 * Logger estructurado (JSON) basado en pino.
 *
 * - development: salida legible en consola (pino-pretty) si está disponible.
 * - test: nivel 'silent' por defecto para no ensuciar la salida de los tests.
 * - production: JSON puro a stdout, listo para ser recolectado por
 *   el motor de contenedores / un agregador de logs externo.
 *
 * REGLA DE ORO: nunca pasar contraseñas, tokens, cookies completas ni
 * datos sensibles a este logger. Usar los `redact` de abajo como red de
 * seguridad adicional, no como única defensa — el código que llama al
 * logger es responsable de no incluir esos campos en primer lugar.
 */

import pino from 'pino';
import { env } from './env.js';

const isDevelopment = env.nodeEnv === 'development';

export const logger = pino({
  level: env.isTest ? 'silent' : env.logLevel,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'password',
      'password_hash',
      'passwordHash',
      'token',
      'sessionSecret',
      '*.password',
      '*.password_hash',
      '*.token',
    ],
    censor: '[REDACTADO]',
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
