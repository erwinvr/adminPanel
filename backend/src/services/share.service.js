/**
 * services/share.service.js
 *
 * "Compartir" para los 3 dashboards de solo lectura del panel (Mapa de
 * aplicaciones, Proveedores y recursos, Usuarios): genera un enlace
 * público con un token de alta entropía que cualquiera puede abrir SIN
 * iniciar sesión — el token ES la autorización, así que nunca se
 * loguea completo fuera de la URL que ya lo lleva.
 *
 * Alcance deliberadamente angosto por seguridad: el mapa de topología
 * público NO incluye qué aplicaciones tienen credencial en la Bóveda
 * (esa señal ya no es inocua para un visitante anónimo — ver
 * PublicDashboardPage.jsx en el frontend, que arma el candado con un
 * Set vacío). Ningún otro módulo (Bóveda, Hardware, Licencias, AD/M365
 * en crudo) es compartible — solo estos 3 dashboards.
 */

import crypto from 'node:crypto';
import { shareRepository } from '../repositories/share.repository.js';
import { topologyService } from './topology.service.js';
import { providerService } from './provider.service.js';
import { insightsService } from './insights.service.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError } from '../errors/AppError.js';

const DASHBOARD_KEYS = ['topology', 'providers', 'users-insights'];

function assertValidKey(dashboardKey) {
  if (!DASHBOARD_KEYS.includes(dashboardKey)) throw new NotFoundError('Dashboard no encontrado');
}

function toPublicShare(row) {
  if (!row) return { active: false };
  return {
    active: true,
    token: row.token,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
  };
}

async function loadDashboardData(dashboardKey) {
  if (dashboardKey === 'topology') return { graph: await topologyService.getGraph() };
  if (dashboardKey === 'providers') return { providers: await providerService.listProviders() };
  if (dashboardKey === 'users-insights') return await insightsService.getUserSecurityInsights();
  throw new NotFoundError('Dashboard no encontrado');
}

export const shareService = {
  async getStatus(dashboardKey) {
    assertValidKey(dashboardKey);
    return toPublicShare(await shareRepository.findActiveByDashboardKey(dashboardKey));
  },

  async createShare(req, dashboardKey) {
    assertValidKey(dashboardKey);

    // Idempotente: si ya hay uno activo, se devuelve el mismo en vez de
    // duplicar — evita que queden varios enlaces "vigentes" para el
    // mismo dashboard sin que nadie sepa cuál es el que corresponde
    // compartir.
    const existing = await shareRepository.findActiveByDashboardKey(dashboardKey);
    if (existing) return toPublicShare(existing);

    const actorId = req.session.userId;
    const token = crypto.randomBytes(32).toString('hex');
    const row = await shareRepository.create({ dashboardKey, token, actorId });

    await recordEvent({
      userId: actorId,
      action: 'dashboard_share.create',
      resource: 'dashboard_share',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { dashboardKey },
    });

    return toPublicShare(row);
  },

  async revokeShare(req, dashboardKey) {
    assertValidKey(dashboardKey);
    const existing = await shareRepository.findActiveByDashboardKey(dashboardKey);
    if (!existing) throw new NotFoundError('No hay un enlace activo para revocar');

    await shareRepository.revoke(existing.id);

    const actorId = req.session.userId;
    await recordEvent({
      userId: actorId,
      action: 'dashboard_share.revoke',
      resource: 'dashboard_share',
      resourceId: existing.id,
      result: 'success',
      req,
      metadata: { dashboardKey },
    });
  },

  // Sin autenticación — la llama la ruta pública. El token vencido o
  // revocado se trata igual que inexistente (404 genérico, no debe
  // insinuar si "alguna vez existió").
  async getPublicDashboard(req, token) {
    const share = await shareRepository.findActiveByToken(token);
    if (!share) throw new NotFoundError('Este enlace no existe o fue revocado');

    await shareRepository.recordAccess(share.id);
    await recordEvent({
      userId: null,
      action: 'dashboard_share.view',
      resource: 'dashboard_share',
      resourceId: share.id,
      result: 'success',
      req,
      metadata: { dashboardKey: share.dashboard_key },
    });

    return { dashboardKey: share.dashboard_key, data: await loadDashboardData(share.dashboard_key) };
  },
};
