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
const UAC_DONT_EXPIRE_PASSWORD = 0x10000;

// Atributos de esquema BASE de Active Directory (estándar desde Windows
// 2000, a diferencia de las configs de equipos de red que varían por
// fabricante) — el bit de deshabilitado en userAccountControl aplica
// igual a objetos computer que a objetos user.
const COMPUTER_SEARCH_ATTRIBUTES = ['name', 'dNSHostName', 'operatingSystem', 'operatingSystemVersion', 'whenCreated', 'lastLogonTimestamp', 'userAccountControl', 'distinguishedName'];
const COMPUTER_FILTER = '(objectCategory=computer)';

// Grupos incorporados de Active Directory que otorgan privilegios de
// administrador. "Enterprise Admins" y "Schema Admins" solo existen en
// el dominio raíz del bosque — buscarlos en cualquier otro dominio
// devuelve 0 resultados, lo cual es un caso normal (no un error).
// "Administrators" (Builtin) suele tener a "Domain Admins" anidado
// adentro, así que un mismo usuario puede aparecer con varios grupos a
// la vez — es correcto mostrarlo así: refleja el privilegio real que
// da esa membresía anidada, no una casualidad de datos.
const PRIVILEGED_GROUP_NAMES = ['Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Administrators'];

// Regla de coincidencia LDAP para "en cadena" (transitiva) de Microsoft
// — permite resolver en una sola búsqueda a los miembros de un grupo
// INCLUYENDO los que llegan por pertenencia a otro grupo anidado
// adentro, sin tener que expandir la jerarquía de grupos a mano.
const LDAP_MATCHING_RULE_IN_CHAIN = '1.2.840.113556.1.4.1941';

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

// RFC 4515: escapa los caracteres que un filtro LDAP interpreta como
// sintaxis propia. Se usa tanto para el nombre del grupo (dato fijo,
// pero se escapa igual por prolijidad) como para el DN ya resuelto que
// se vuelve a interpolar en el filtro de pertenencia recursiva.
function escapeFilterValue(value) {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/** Una búsqueda LDAP puntual sobre un cliente ya bindeado — junta las entries y resuelve. */
function searchOnce(client, baseDn, filter, attributes) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(baseDn, { scope: 'sub', filter, attributes, paged: true }, (searchErr, res) => {
      if (searchErr) {
        reject(new LdapError('No se pudo iniciar la búsqueda LDAP: ' + searchErr.message));
        return;
      }
      res.on('searchEntry', (entry) => entries.push(entry));
      res.on('error', (err) => reject(new LdapError('Error durante la búsqueda LDAP (revisá el base DN): ' + err.message)));
      res.on('end', () => resolve(entries));
    });
  });
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
            passwordNeverExpires: (uac & UAC_DONT_EXPIRE_PASSWORD) !== 0,
          });
        });
        res.on('error', (err) => finish(new LdapError('Error durante la búsqueda LDAP (revisá el base DN): ' + err.message)));
        res.on('end', () => finish(null, users));
      });
    });
  });
}

/**
 * Bindea con la cuenta de servicio (la misma que `searchUsers`) y
 * busca todos los objetos `computer` bajo `baseDn` — "Equipos del AD".
 * Misma conexión/manejo de errores que `searchUsers`, filtro y
 * atributos distintos.
 *
 * @param {{ host: string, port: number, useTls: boolean, bindDn: string, bindPassword: string, baseDn: string }} params
 */
export function searchComputers({ host, port, useTls, bindDn, bindPassword, baseDn }) {
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

      const computers = [];
      client.search(
        baseDn,
        { scope: 'sub', filter: COMPUTER_FILTER, attributes: COMPUTER_SEARCH_ATTRIBUTES, paged: true },
        (searchErr, res) => {
          if (searchErr) {
            finish(new LdapError('No se pudo iniciar la búsqueda LDAP: ' + searchErr.message));
            return;
          }

          res.on('searchEntry', (entry) => {
            const uac = Number(attrValue(entry, 'userAccountControl') ?? 0);
            computers.push({
              distinguishedName: attrValue(entry, 'distinguishedName') ?? entry.objectName,
              name: attrValue(entry, 'name'),
              dnsHostName: attrValue(entry, 'dNSHostName'),
              operatingSystem: attrValue(entry, 'operatingSystem'),
              operatingSystemVersion: attrValue(entry, 'operatingSystemVersion'),
              createdAt: generalizedTimeToDate(attrValue(entry, 'whenCreated')),
              lastLoginAt: filetimeToDate(attrValue(entry, 'lastLogonTimestamp')),
              enabled: (uac & UAC_ACCOUNT_DISABLED) === 0,
            });
          });
          res.on('error', (err) => finish(new LdapError('Error durante la búsqueda LDAP (revisá el base DN): ' + err.message)));
          res.on('end', () => finish(null, computers));
        }
      );
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

/**
 * Bindea con la cuenta de servicio (misma de siempre, solo lectura —
 * no hace falta ningún permiso de AD adicional al de sincronizar) y
 * resuelve, para cada grupo de PRIVILEGED_GROUP_NAMES: 1) su DN
 * (buscando por `cn`, no hardcodeado — así sigue funcionando si algún
 * día se movió el grupo a otra OU), y 2) sus miembros de forma
 * RECURSIVA (`memberOf` con LDAP_MATCHING_RULE_IN_CHAIN), que incluye
 * tanto a los agregados directamente como a los que llegan porque su
 * grupo está anidado dentro del privilegiado. Un grupo que no existe
 * en este dominio (ej. Schema Admins fuera del dominio raíz del
 * bosque) simplemente no aporta miembros, sin error.
 *
 * Devuelve un array de `{ distinguishedName, samAccountName, displayName, groups: string[] }`
 * — una fila por usuario único, con TODOS los grupos privilegiados a
 * los que pertenece (puede ser más de uno, ver comentario en
 * PRIVILEGED_GROUP_NAMES).
 *
 * @param {{ host: string, port: number, useTls: boolean, bindDn: string, bindPassword: string, baseDn: string }} params
 */
export function searchPrivilegedUsers({ host, port, useTls, bindDn, bindPassword, baseDn }) {
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

    client.bind(bindDn, bindPassword, async (bindErr) => {
      if (bindErr) {
        finish(new LdapError(describeBindError(bindErr)));
        return;
      }

      try {
        // Los 4 grupos se resuelven EN PARALELO sobre la misma conexión
        // (ldapjs multiplexa varias operaciones a la vez en un solo
        // socket) — hacerlo secuencial (8 round-trips uno detrás del
        // otro) tarda minutos contra un AD con latencia de red alta, muy
        // por encima del timeout del proxy nginx (60s por defecto).
        const perGroupResults = await Promise.all(
          PRIVILEGED_GROUP_NAMES.map(async (groupName) => {
            const groupEntries = await searchOnce(
              client,
              baseDn,
              `(&(objectClass=group)(cn=${escapeFilterValue(groupName)}))`,
              ['distinguishedName']
            );
            if (groupEntries.length === 0) return { groupName, memberEntries: [] }; // grupo inexistente en este dominio — normal para Enterprise/Schema Admins

            const groupDn = attrValue(groupEntries[0], 'distinguishedName') ?? groupEntries[0].objectName;
            const memberEntries = await searchOnce(
              client,
              baseDn,
              `(&(objectCategory=person)(objectClass=user)(memberOf:${LDAP_MATCHING_RULE_IN_CHAIN}:=${escapeFilterValue(groupDn)}))`,
              ['distinguishedName', 'sAMAccountName', 'displayName', 'cn']
            );
            return { groupName, memberEntries };
          })
        );

        const usersByDn = new Map();
        for (const { groupName, memberEntries } of perGroupResults) {
          for (const entry of memberEntries) {
            const dn = attrValue(entry, 'distinguishedName') ?? entry.objectName;
            if (!usersByDn.has(dn)) {
              usersByDn.set(dn, {
                distinguishedName: dn,
                samAccountName: attrValue(entry, 'sAMAccountName'),
                displayName: attrValue(entry, 'displayName') ?? attrValue(entry, 'cn'),
                groups: new Set(),
              });
            }
            usersByDn.get(dn).groups.add(groupName);
          }
        }

        finish(
          null,
          [...usersByDn.values()].map((u) => ({ ...u, groups: [...u.groups] }))
        );
      } catch (err) {
        finish(err);
      }
    });
  });
}
