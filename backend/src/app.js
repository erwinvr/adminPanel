/**
 * app.js
 *
 * ÚNICA responsabilidad: ensamblar middlewares y rutas en una instancia
 * de Express. NO contiene lógica de negocio, NO abre el puerto (eso lo
 * hace server.js) — esta separación permite importar `app` directamente
 * en los tests de integración (supertest) sin levantar un servidor real.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createSessionMiddleware } from './auth/session.js';
import { csrfProtection } from './middleware/csrf.js';
import apiRouter from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// La app corre detrás de nginx (reverse proxy) tanto en desarrollo como en
// producción on-prem. Sin esto, express-rate-limit y el logging de IP
// verían siempre la IP del proxy en vez de la del cliente real, y las
// cookies "Secure" podrían no comportarse bien detrás de TLS terminado
// en el proxy.
app.set('trust proxy', 1);

// --- Seguridad HTTP básica ---
app.use(helmet());

// --- CORS restringido a un único origen explícito (sin wildcard) ---
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true, // necesario para que la cookie de sesión viaje en requests cross-origin
  })
);

// --- Parsing de body con límite de tamaño (mitiga payloads abusivos) ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// --- Logging estructurado de cada request ---
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/health', // evita ruido del healthcheck
    },
  })
);

// --- Sesión (cookie HttpOnly + store en PostgreSQL) ---
app.use(createSessionMiddleware());

// --- Protección CSRF (double-submit cookie) para todas las rutas mutantes ---
app.use(csrfProtection);

// --- Rutas de la API ---
app.use('/api', apiRouter);

// --- 404 para cualquier ruta no reconocida ---
app.use(notFound);

// --- Manejador de errores centralizado (SIEMPRE al final) ---
app.use(errorHandler);
