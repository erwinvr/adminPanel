/**
 * services/m365.service.js
 *
 * Sincronización de licencias de Microsoft 365 vía Microsoft Graph
 * (client credentials — ver integrations/microsoft365/graphClient.js).
 * `sync()` se dispara de dos formas: manual (botón "Sincronizar ahora",
 * con `req` real de la sesión autenticada) o automática
 * (jobs/syncScheduler.js, con `req = null` — sin usuario, se audita con
 * userId null igual que un evento de sistema). La frecuencia del job
 * automático es `sync_interval_minutes` en m365_settings (0/null =
 * desactivado).
 */

import { m365Repository } from '../repositories/m365.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import {
  getAccessToken,
  fetchSubscribedSkus,
  fetchUsersWithLicenses,
  fetchUserRegistrationDetails,
  fetchUsersAuthMethods,
} from '../integrations/microsoft365/graphClient.js';
import { friendlySkuName } from '../integrations/microsoft365/skuNames.js';
import { countDomains, filterUsersByDomain } from '../integrations/microsoft365/domainFilter.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

// MFA por usuario (API limitada por Microsoft): un dato se considera vigente 12 h y cada
// sincronización dedica como máximo 10 min a leer MFA — ver el comentario en sync().
const MFA_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const MFA_TIME_BUDGET_MS = 10 * 60 * 1000;

// Minúsculas y sin tildes (el SQL hace lo mismo con unaccent(lower(...))).
function normalizeSearchText(text) {
  return (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function toPublicSettings(row) {
  if (!row) {
    return {
      tenantId: null,
      clientId: null,
      hasSecret: false,
      clientSecretPreview: null,
      lastSyncedAt: null,
      syncIntervalMinutes: null,
      allowedDomains: [],
      detectedDomains: [],
    };
  }
  return {
    tenantId: row.tenant_id,
    clientId: row.client_id,
    hasSecret: Boolean(row.client_secret_encrypted),
    clientSecretPreview: row.client_secret_preview,
    lastSyncedAt: row.last_synced_at,
    syncIntervalMinutes: row.sync_interval_minutes,
    allowedDomains: row.allowed_domains ?? [],
    detectedDomains: row.detected_domains ?? [],
  };
}

export const m365Service = {
  async getSettings() {
    return toPublicSettings(await m365Repository.getSettings());
  },

  async saveSettings(req, { tenantId, clientId, clientSecret, allowedDomains = [], syncIntervalMinutes }) {
    const actorId = req.session.userId;
    const changes = {
      tenant_id: tenantId,
      client_id: clientId,
      allowed_domains: allowedDomains,
      sync_interval_minutes: syncIntervalMinutes || null,
      updated_by: actorId,
      updated_at: new Date(),
    };
    if (clientSecret) {
      changes.client_secret_encrypted = encryptSecret(clientSecret);
      changes.client_secret_preview = clientSecret.slice(-4);
    }

    const row = await m365Repository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'm365.settings.update',
      resource: 'm365_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { tenantId, clientId, allowedDomains, syncIntervalMinutes: changes.sync_interval_minutes, secretUpdated: Boolean(clientSecret) },
    });

    return toPublicSettings(row);
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js)
  // en vez del botón "Sincronizar ahora" — sin sesión de usuario.
  // `onProgress({ phase, done, total })` informa el avance a quien lo pidió (la
  // ejecución en segundo plano del botón, ver jobs/syncRunner.js).
  async sync(req = null, { onProgress } = {}) {
    const settingsRow = await m365Repository.getSettings();
    if (!settingsRow?.tenant_id || !settingsRow?.client_id || !settingsRow?.client_secret_encrypted) {
      throw new ValidationError('Configurá el tenant, el client ID y el client secret antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
    const clientSecret = decryptSecret(settingsRow.client_secret_encrypted);

    let skus;
    let graphUsers;
    let detectedDomains = [];
    let ignoredUsersCount = 0;
    let mfaWarning = null;
    let mfaSource = null;
    // userId → { isMfaRegistered, isMfaCapable, methodsRegistered, checkedAt }
    let mfaByUserId = new Map();
    try {
      const accessToken = await getAccessToken({ tenantId: settingsRow.tenant_id, clientId: settingsRow.client_id, clientSecret });
      let allGraphUsers;
      [skus, allGraphUsers] = await Promise.all([fetchSubscribedSkus(accessToken), fetchUsersWithLicenses(accessToken)]);

      // Filtro de dominios: solo se admiten los usuarios cuyo UPN pertenece
      // a un dominio permitido (lista vacía = todos). Se aplica ANTES del
      // MFA para no consultar métodos de usuarios que se van a ignorar.
      detectedDomains = countDomains(allGraphUsers);
      ({ admitted: graphUsers, ignoredCount: ignoredUsersCount } = filterUsersByDomain(allGraphUsers, settingsRow.allowed_domains));

      // MFA: 1) reporte de registro (AuditLog.Read.All) — rápido y con
      // `isMfaCapable`, pero Microsoft lo restringe a tenants con Entra ID
      // P1/P2. 2) Si falla (sin licencia o sin permiso), métodos de
      // autenticación por usuario (UserAuthenticationMethod.Read.All) — sin
      // licencia adicional. Ninguno de los dos debe tumbar el resto de la
      // sincronización: si ambos fallan, los campos de MFA quedan en null.
      try {
        const registrationDetails = await fetchUserRegistrationDetails(accessToken);
        mfaByUserId = new Map(
          registrationDetails.map((r) => [
            r.id,
            { isMfaRegistered: r.isMfaRegistered, isMfaCapable: r.isMfaCapable, methodsRegistered: r.methodsRegistered ?? [], checkedAt: new Date() },
          ])
        );
        mfaSource = 'registrationReport';
      } catch (reportErr) {
        try {
          // Microsoft limita la tasa de esta API (~2-3 usuarios/s): leer a todos
          // lleva ~20 minutos con 3.300 usuarios. Por eso es INCREMENTAL: solo se
          // consulta a quien nunca se leyó o tiene el dato viejo (más antiguos
          // primero), con un tope de tiempo; el resto conserva su dato anterior
          // y se completa en las próximas sincronizaciones. Una cuenta
          // deshabilitada no puede iniciar sesión — no se consulta.
          const previousMfa = await m365Repository.getMfaSnapshot();
          const staleBefore = Date.now() - MFA_STALE_AFTER_MS;
          const checkedAtOf = (id) => (previousMfa.get(id)?.checkedAt ? new Date(previousMfa.get(id).checkedAt).getTime() : 0);
          const enabledIds = graphUsers.filter((u) => u.accountEnabled !== false).map((u) => u.id);
          const toCheck = enabledIds.filter((id) => checkedAtOf(id) < staleBefore).sort((a, b) => checkedAtOf(a) - checkedAtOf(b));

          const { byUserId, failedCount, skippedCount, sampleError } = await fetchUsersAuthMethods(accessToken, toCheck, {
            onProgress: (done, total) => onProgress?.({ phase: 'mfa', done, total }),
            deadlineAt: Date.now() + MFA_TIME_BUDGET_MS,
          });

          const checkedAt = new Date();
          mfaByUserId = new Map();
          for (const u of graphUsers) {
            const fresh = byUserId.get(u.id);
            const previous = previousMfa.get(u.id);
            if (fresh) mfaByUserId.set(u.id, { ...fresh, isMfaCapable: null, checkedAt });
            else if (previous?.isMfaRegistered != null) {
              mfaByUserId.set(u.id, {
                isMfaRegistered: previous.isMfaRegistered,
                isMfaCapable: null,
                methodsRegistered: previous.methodsRegistered ?? [],
                checkedAt: previous.checkedAt,
              });
            }
          }
          mfaSource = 'authenticationMethods';

          const notes = [];
          if (failedCount > 0) notes.push(`No se pudo leer el MFA de ${failedCount} usuarios (conservan su dato anterior o quedan "Sin datos"): ${sampleError}.`);
          if (skippedCount > 0) {
            notes.push(
              `MFA actualizado para ${byUserId.size} de ${toCheck.length} usuarios que tocaba revisar; ${skippedCount} quedan para la próxima sincronización ` +
                '(Microsoft limita las consultas de MFA a pocos usuarios por segundo, por eso se lee de a partes y conservan su dato anterior mientras tanto).'
            );
          }
          if (notes.length) mfaWarning = notes.join(' ');
        } catch (methodsErr) {
          mfaWarning =
            `No se pudieron obtener datos de MFA. ` +
            `Reporte de registro (requiere Entra ID P1/P2 y "AuditLog.Read.All"): ${reportErr.message}. ` +
            `Métodos por usuario (sin licencia, requiere "UserAuthenticationMethod.Read.All"): ${methodsErr.message}`;
        }
      }
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'm365.sync',
        resource: 'm365_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message, trigger },
      });
      throw err;
    }

    const licenses = skus.map((s) => ({
      sku_id: s.skuId,
      sku_part_number: s.skuPartNumber,
      enabled_units: s.prepaidUnits?.enabled ?? 0,
      consumed_units: s.consumedUnits ?? 0,
    }));

    const users = graphUsers.map((u) => {
      const mfa = mfaByUserId.get(u.id);
      return {
        aad_object_id: u.id,
        display_name: u.displayName,
        user_principal_name: u.userPrincipalName,
        account_enabled: u.accountEnabled ?? true,
        is_mfa_registered: mfa ? mfa.isMfaRegistered : null,
        is_mfa_capable: mfa ? mfa.isMfaCapable : null,
        methods_registered: mfa ? JSON.stringify(mfa.methodsRegistered) : null,
        mfa_checked_at: mfa ? mfa.checkedAt : null,
      };
    });

    const userLicensePairs = graphUsers.flatMap((u) => (u.assignedLicenses ?? []).map((al) => ({ aadObjectId: u.id, skuId: al.skuId })));

    await m365Repository.replaceSyncedData({ licenses, users, userLicensePairs });
    const syncedAt = new Date();
    await m365Repository.upsertSettings({ last_synced_at: syncedAt, detected_domains: JSON.stringify(detectedDomains) });

    await recordEvent({
      userId: actorId,
      action: 'm365.sync',
      resource: 'm365_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { licensesCount: licenses.length, usersCount: users.length, ignoredUsersCount, mfaSource, mfaWarning, trigger },
    });

    return { licensesCount: licenses.length, usersCount: users.length, ignoredUsersCount, syncedAt: syncedAt.toISOString(), mfaSource, mfaWarning };
  },

  async listLicenses() {
    const rows = await m365Repository.listLicenses();
    return rows.map((r) => ({
      ...r,
      displayName: friendlySkuName(r.skuPartNumber),
      availableUnits: r.enabledUnits - r.consumedUnits,
    }));
  },

  // Una página de usuarios, con la búsqueda resuelta en SQL. Las licencias
  // de cada usuario se devuelven con su nombre comercial (ver skuNames.js),
  // no con el SKU — sin repetir aunque dos SKU compartan nombre (ej.
  // VISIOCLIENT y VISIO_PLAN2_DEPT).
  async listUsers({ page, pageSize, search }) {
    const terms = normalizeSearchText(search).split(/\s+/).filter(Boolean).slice(0, 8);
    let termFilters = [];
    if (terms.length) {
      // Cada término también puede coincidir con el NOMBRE de una licencia:
      // se traduce a los códigos SKU del tenant cuyo nombre lo contiene.
      const skus = (await m365Repository.listLicenses()).map((l) => l.skuPartNumber);
      termFilters = terms.map((term) => ({
        term,
        skus: skus.filter((sku) => normalizeSearchText(friendlySkuName(sku)).includes(term) || sku.toLowerCase().includes(term)),
      }));
    }

    const { items, pagination } = await m365Repository.listUsersPage({ page, pageSize, termFilters });
    return {
      items: items.map((u) => ({ ...u, licenses: [...new Set(u.licenses.map(friendlySkuName))].sort((a, b) => a.localeCompare(b)) })),
      pagination,
    };
  },

  getUsersSummary() {
    return m365Repository.usersSummary();
  },
};
