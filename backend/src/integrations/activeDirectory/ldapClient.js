/**
 * integrations/activeDirectory/ldapClient.js
 *
 * Cliente mínimo de un Active Directory on-prem vía LDAP/LDAPS
 * (`ldapjs`) — a diferencia de Microsoft 365 (Graph, HTTPS REST, ver
 * integrations/microsoft365/), acá se autentica con un bind LDAP
 * simple (DN + contraseña de una cuenta de servicio con permiso de
 * lectura) contra el controlador de dominio, no OAuth2.
 *
 * Se identifica a cada usuario por su `distinguishedName` (DN) en vez
 * del `objectGUID` — el DN llega como string plano en la respuesta LDAP
 * (el GUID llega binario y complica el parseo sin aportar nada acá,
 * dado que esta sincronización ya es una FOTO completa en cada corrida,
 * no un espejo incremental — ver migración de ad_users). Un DN cambia
 * si se mueve el usuario de OU, pero eso solo hace que la próxima
 * sincronización lo trate como "nuevo", sin romper nada.
 */

import ldap from 'ldapjs';
import { AppError } from '../../errors/AppError.js';

const SEARCH_ATTRIBUTES = ['sAMAccountName', 'displayName', 'cn', 'whenCreated', 'lastLogonTimestamp', 'pwdLastSet', 'userAccountControl', 'distinguishedName', 'lockoutTime'];
const USER_FILTER = '(&(objectClass=user)(objectCategory=person))';
const UAC_ACCOUNT_DISABLED = 0x2;

export class LdapError extends AppError {
  constructor(message) {
    super(message, 502, 'AD_SYNC_FAILED');
  }
}

// ldapjs devuelve tanto fallas de RED (host inexistente, puerto
// cerrado, timeout) como de CREDENCIALES INVÁLIDAS a través del mismo
// callback de `client.bind()` — sin distinguirlas, el mensaje de error
// llevaría a revisar usuario/contraseña cuando en realidad el problema
// es que el host o el puerto están mal, que es el error más común al
// cargar la configuración por primera vez.
const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);

function describeBindError(err) {
  if (NETWORK_ERROR_CODES.has(err.code)) {
    return `No se pudo conectar al servidor (revisá el host y el puerto). ${err.message}`;
  }
  if (err.name === 'InvalidCredentialsError' || err.code === 49) {
    return 'Autenticación rechazada — revisá el bind DN y la contraseña.';
  }
  return 'No se pudo autenticar contra Active Directory: ' + err.message;
}

/** FILETIME de Windows (intervalos de 100ns desde 1601-01-01 UTC) → Date, o null si "nunca" (0 o vacío). */
function filetimeToDate(value) {
  if (!value || value === '0') return null;
  const filetime = BigInt(value);
  if (filetime <= 0n) return null;
  const unixMs = filetime / 10000n - 11644473600000n;
  return new Date(Number(unixMs));
}

/** GeneralizedTime de LDAP (ej. "20260101120000.0Z") → Date. */
function generalizedTimeToDate(value) {
  if (!value) return null;
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function attrValue(entry, name) {
  const attr = entry.attributes.find((a) => a.type.toLowerCase() === name.toLowerCase());
  return attr?.values?.[0] ?? null;
}

/**
 * Bindea con la cuenta de servicio y busca todos los usuarios bajo
 * `baseDn`. Devuelve los campos ya normalizados (fechas parseadas,
 * habilitado/deshabilitado derivado de userAccountControl) — el bind
 * y la búsqueda comparten una sola conexión, cerrada siempre al final.
 *
 * @param {{ host: string, port: number, useTls: boolean, bindDn: string, bindPassword: string, baseDn: string }} params
 */
export function searchUsers({ host, port, useTls, bindDn, bindPassword, baseDn }) {
  return new Promise((resolve, reject) => {
    const protocol = useTls ? 'ldaps' : 'ldap';
    const client = ldap.createClient({ url: `${protocol}://${host}:${port}`, connectTimeout: 8000, timeout: 15000 });

    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      client.unbind(() => {});
      if (err) reject(err);
      else resolve(result);
    };

    client.on('error', (err) => {
      const detail = NETWORK_ERROR_CODES.has(err.code) ? 'revisá el host y el puerto. ' : '';
      finish(new LdapError(`No se pudo conectar al servidor LDAP — ${detail}${err.message}`));
    });

    client.bind(bindDn, bindPassword, (bindErr) => {
      if (bindErr) {
        finish(new LdapError(describeBindError(bindErr)));
        return;
      }

      const users = [];
      client.search(baseDn, { scope: 'sub', filter: USER_FILTER, attributes: SEARCH_ATTRIBUTES, paged: true }, (searchErr, res) => {
        if (searchErr) {
          finish(new LdapError('No se pudo iniciar la búsqueda LDAP: ' + searchErr.message));
          return;
        }

        res.on('searchEntry', (entry) => {
          const uac = Number(attrValue(entry, 'userAccountControl') ?? 0);
          users.push({
            distinguishedName: attrValue(entry, 'distinguishedName') ?? entry.objectName,
            samAccountName: attrValue(entry, 'sAMAccountName'),
            displayName: attrValue(entry, 'displayName') ?? attrValue(entry, 'cn'),
            createdAt: generalizedTimeToDate(attrValue(entry, 'whenCreated')),
            lastLoginAt: filetimeToDate(attrValue(entry, 'lastLogonTimestamp')),
            passwordLastSetAt: filetimeToDate(attrValue(entry, 'pwdLastSet')),
            enabled: (uac & UAC_ACCOUNT_DISABLED) === 0,
            lockoutTime: filetimeToDate(attrValue(entry, 'lockoutTime')),
          });
        });
        res.on('error', (err) => finish(new LdapError('Error durante la búsqueda LDAP (revisá el base DN): ' + err.message)));
        res.on('end', () => finish(null, users));
      });
    });
  });
}

/**
 * Desbloquea una cuenta poniendo `lockoutTime` en `0` vía LDAP MODIFY
 * — el equivalente a lo que hace el propio Active Directory Users and
 * Computers al desbloquear a mano. Usa la MISMA cuenta de servicio del
 * sync (`bindDn`/`bindPassword`), que además del permiso de lectura
 * que ya tiene para sincronizar necesita, específicamente, el permiso
 * de AD "Write lockoutTime" sobre los objetos User — ver
 * docs/active-directory.md para cómo delegarlo.
 *
 * @param {{ host: string, port: number, useTls: boolean, bindDn: string, bindPassword: string, targetDn: string }} params
 */
export function unlockUser({ host, port, useTls, bindDn, bindPassword, targetDn }) {
  return new Promise((resolve, reject) => {
    const protocol = useTls ? 'ldaps' : 'ldap';
    const client = ldap.createClient({ url: `${protocol}://${host}:${port}`, connectTimeout: 8000, timeout: 15000 });

    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      client.unbind(() => {});
      if (err) reject(err);
      else resolve();
    };

    client.on('error', (err) => {
      const detail = NETWORK_ERROR_CODES.has(err.code) ? 'revisá el host y el puerto. ' : '';
      finish(new LdapError(`No se pudo conectar al servidor LDAP — ${detail}${err.message}`));
    });

    client.bind(bindDn, bindPassword, (bindErr) => {
      if (bindErr) {
        finish(new LdapError(describeBindError(bindErr)));
        return;
      }

      const change = new ldap.Change({
        operation: 'replace',
        modification: { type: 'lockoutTime', values: ['0'] },
      });

      client.modify(targetDn, change, (modifyErr) => {
        if (modifyErr) {
          // Código LDAP 50 / InsufficientAccessRightsError: el bind DN
          // no tiene el permiso de escritura sobre lockoutTime — el caso
          // más común al activar esta función por primera vez, así que
          // se traduce a un mensaje accionable en vez del error LDAP crudo.
          if (modifyErr.name === 'InsufficientAccessRightsError' || modifyErr.code === 50) {
            finish(
              new LdapError(
                'La cuenta de servicio no tiene permiso para desbloquear cuentas en AD — hay que delegarle "Write lockoutTime" sobre los usuarios (ver docs/active-directory.md).'
              )
            );
            return;
          }
          finish(new LdapError('No se pudo desbloquear la cuenta: ' + modifyErr.message));
          return;
        }
        finish(null);
      });
    });
  });
}
