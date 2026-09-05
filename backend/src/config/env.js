/**
 * config/env.js
 *
 * Carga y VALIDA las variables de entorno al arrancar la aplicación.
 * Si falta una variable obligatoria o tiene un formato inválido, el proceso
 * termina inmediatamente con un mensaje claro — preferible a fallar de forma
 * confusa más tarde (ej. una conexión a BD que falla sin explicar por qué).
 *
 * Este es el ÚNICO archivo que debe leer `process.env` directamente.
 * El resto de la aplicación importa el objeto `env` ya validado desde aquí.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import Joi from 'joi';

// Resuelve la ruta del .env de forma ABSOLUTA a partir de la ubicación de
// este archivo, en vez de depender de process.cwd(). Es necesario porque
// el CLI de Knex cambia el directorio de trabajo del proceso a la carpeta
// de knexfile.js (src/config) antes de ejecutarlo, y con una ruta relativa
// el .env dejaría de encontrarse al correr `npm run migrate:latest`.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),

  SESSION_SECRET: Joi.string().min(32).required().messages({
    'string.min':
      'SESSION_SECRET debe tener al menos 32 caracteres. Generar con: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  }),
  SESSION_COOKIE_NAME: Joi.string().default('sid'),
  SESSION_MAX_AGE_MS: Joi.number().integer().positive().default(8 * 60 * 60 * 1000),

  CORS_ORIGIN: Joi.string().uri().required(),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  LOGIN_RATE_LIMIT_WINDOW_MS: Joi.number().integer().positive().default(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: Joi.number().integer().positive().default(5),

  ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS: Joi.number().integer().positive().default(5),
  ACCOUNT_LOCK_DURATION_MS: Joi.number().integer().positive().default(15 * 60 * 1000),

  // Clave simétrica para cifrar en reposo el client secret de Microsoft 365
  // (AES-256-GCM, ver utils/crypto.js) — nunca se guarda en texto plano
  // porque hace falta descifrarlo para llamar a Microsoft Graph en cada sync.
  M365_ENCRYPTION_KEY: Joi.string().hex().length(64).required().messages({
    'string.length':
      'M365_ENCRYPTION_KEY debe ser una clave hex de 64 caracteres (32 bytes, AES-256). Generar con: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    'string.hex': 'M365_ENCRYPTION_KEY debe estar en formato hexadecimal',
  }),

  // Microservicio Python (netbackup-agent) para los drivers de "Backup
  // Networking" que no son SSH crudo (napalm_ios, fortios_api) — el
  // default ya apunta al hostname del servicio en docker-compose, así
  // que no hace falta declarar esta variable en los .env existentes.
  NETBACKUP_MICROSERVICE_URL: Joi.string().uri().default('http://netbackup-agent:8000'),
}).unknown(true); // permite otras variables del sistema sin rechazarlas

const { value: validatedEnv, error } = schema.validate(process.env, {
  abortEarly: false,
});

if (error) {
  // Log directo a stderr: el logger (pino) todavía no puede inicializarse
  // porque su propia configuración depende de este archivo.
  // eslint-disable-next-line no-console
  console.error('❌ Configuración de entorno inválida:\n');
  error.details.forEach((detail) => {
    // eslint-disable-next-line no-console
    console.error(`   • ${detail.message}`);
  });
  process.exit(1);
}

export const env = {
  nodeEnv: validatedEnv.NODE_ENV,
  isProduction: validatedEnv.NODE_ENV === 'production',
  isTest: validatedEnv.NODE_ENV === 'test',
  port: validatedEnv.PORT,

  databaseUrl: validatedEnv.DATABASE_URL,

  session: {
    secret: validatedEnv.SESSION_SECRET,
    cookieName: validatedEnv.SESSION_COOKIE_NAME,
    maxAgeMs: validatedEnv.SESSION_MAX_AGE_MS,
  },

  corsOrigin: validatedEnv.CORS_ORIGIN,

  logLevel: validatedEnv.LOG_LEVEL,

  loginRateLimit: {
    windowMs: validatedEnv.LOGIN_RATE_LIMIT_WINDOW_MS,
    maxAttempts: validatedEnv.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  },

  accountLock: {
    maxFailedAttempts: validatedEnv.ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS,
    durationMs: validatedEnv.ACCOUNT_LOCK_DURATION_MS,
  },

  m365EncryptionKey: validatedEnv.M365_ENCRYPTION_KEY,

  netbackupMicroserviceUrl: validatedEnv.NETBACKUP_MICROSERVICE_URL,
};
