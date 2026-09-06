/**
 * integrations/networkBackup/topologyParser.js
 *
 * Heurística de "Topología de Red": no hay LLDP/CDP ni tabla de
 * vecinos en ninguno de los 3 drivers (solo la config declarada), así
 * que la única señal disponible para inferir que dos equipos están
 * interconectados es que tengan una IP en la MISMA subred declarada —
 * si el equipo A tiene 192.168.200.1/24 y el equipo B tiene
 * 192.168.200.2/24, se infiere un enlace entre ellos. Es heurístico a
 * propósito (puede haber falsos positivos, ej. dos equipos en la misma
 * VLAN de gestión sin estar conectados directamente) — el usuario
 * pidió explícitamente esta opción en vez de agregar una consulta de
 * vecinos nueva.
 *
 * Cada parser devuelve `[{ interfaceName, ip, prefixLength }]`. Los de
 * `napalm_ios`/`fortios_api` se escribieron según el formato
 * documentado de cada fabricante (sin equipo real disponible para
 * probarlos, mismo punto de partida que cuando se implementaron esos
 * drivers) — solo el de `raw_ssh` (Mikrotik) está verificado contra
 * una config real.
 */

// Mikrotik /export: bloque "/ip address" con líneas
// "add address=<ip>/<prefix> ... interface=<nombre> ...". Los atributos
// (`comment=`, `disabled=`, etc.) pueden aparecer en cualquier orden
// ENTRE `address=` e `interface=` — RouterOS los intercala según cómo
// se cargó cada uno, así que no se puede asumir que van pegados (un
// `comment=defconf` en el medio, por ejemplo, hacía que una IP real
// quedara sin detectar). Por eso se extraen por separado, no con un
// único regex secuencial. Además una línea larga puede venir partida
// con "\" al final + continuación indentada — se reconstruye antes de
// parsear (no cambia esto en particular ya que `interface=` siempre
// queda en la primera mitad, pero es más robusto en general).
//
// `(?:^|\s)address=` en vez de `\baddress=` a propósito: con `\b`
// también matchearía dentro de "src-address="/"dst-address=" (reglas
// de firewall, que también usan notación IP/prefijo) — exigir que
// venga precedido por inicio de línea o un espacio lo descarta. Mismo
// criterio para `interface=` vs. "in-interface="/"out-interface=".
function parseRawSsh(configText) {
  const results = [];
  const logicalText = configText.replace(/\\\r?\n\s*/g, ' ');

  for (const line of logicalText.split('\n')) {
    if (!/^add\s/.test(line)) continue;
    const addressMatch = /(?:^|\s)address=(\d+\.\d+\.\d+\.\d+)\/(\d+)(?:\s|$)/.exec(line);
    const interfaceMatch = /(?:^|\s)interface=(\S+)/.exec(line);
    if (addressMatch && interfaceMatch) {
      results.push({ ip: addressMatch[1], prefixLength: Number(addressMatch[2]), interfaceName: interfaceMatch[1] });
    }
  }
  return results;
}

// Cisco IOS/IOS-XE show running-config: bloques
//   interface <nombre>
//    ip address <ip> <netmask>
//   !
function parseNapalmIos(configText) {
  const results = [];
  let currentInterface = null;

  for (const rawLine of configText.split('\n')) {
    const line = rawLine.trimEnd();
    const interfaceMatch = /^interface\s+(\S+)/.exec(line);
    if (interfaceMatch) {
      currentInterface = interfaceMatch[1];
      continue;
    }
    if (line === '!' || (line.length > 0 && !line.startsWith(' '))) {
      currentInterface = null; // salió del bloque de interfaz
      continue;
    }
    const ipMatch = currentInterface && /^\s+ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
    if (ipMatch) {
      results.push({ ip: ipMatch[1], prefixLength: netmaskToPrefixLength(ipMatch[2]), interfaceName: currentInterface });
    }
  }
  return results;
}

// FortiOS backup: bloques
//   config system interface
//       edit "<nombre>"
//           set ip <ip> <netmask>
//       next
//   end
function parseFortiosApi(configText) {
  const results = [];
  let inInterfaceBlock = false;
  let currentInterface = null;

  for (const rawLine of configText.split('\n')) {
    const line = rawLine.trim();
    if (line === 'config system interface') {
      inInterfaceBlock = true;
      continue;
    }
    if (!inInterfaceBlock) continue;
    if (line === 'end') {
      inInterfaceBlock = false;
      continue;
    }

    const editMatch = /^edit\s+"([^"]+)"/.exec(line);
    if (editMatch) {
      currentInterface = editMatch[1];
      continue;
    }
    if (line === 'next') {
      currentInterface = null;
      continue;
    }
    const ipMatch = currentInterface && /^set\s+ip\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
    if (ipMatch) {
      results.push({ ip: ipMatch[1], prefixLength: netmaskToPrefixLength(ipMatch[2]), interfaceName: currentInterface });
    }
  }
  return results;
}

const PARSERS = {
  raw_ssh: parseRawSsh,
  napalm_ios: parseNapalmIos,
  fortios_api: parseFortiosApi,
};

/**
 * @param {'raw_ssh'|'napalm_ios'|'fortios_api'} driver
 * @param {string} configText
 * @returns {{ interfaceName: string, ip: string, prefixLength: number }[]}
 */
export function parseInterfaceSubnets(driver, configText) {
  const parser = PARSERS[driver];
  if (!parser || !configText) return [];
  try {
    return parser(configText);
  } catch {
    return []; // un parseo fallido no debe romper el resto del grafo — el equipo queda sin subredes detectadas
  }
}

// Mikrotik /export: líneas de "/ip route" con forma
// "add ... dst-address=<red> ... gateway=<ip> ...". Se exige que la
// línea tenga TANTO dst-address= como gateway= (en cualquier orden,
// mismo motivo que en parseRawSsh) — "/ip dhcp-server network" TAMBIÉN
// tiene `gateway=`, así que exigir dst-address= además es lo que evita
// confundir un gateway de DHCP (no es una ruta real) con uno de
// "/ip route" — si se colara, corroboraría enlaces que no existen.
function parseRawSshRouteGateways(configText) {
  const results = [];
  const logicalText = configText.replace(/\\\r?\n\s*/g, ' ');

  for (const line of logicalText.split('\n')) {
    if (!/^add\s/.test(line)) continue;
    const hasDstAddress = /(?:^|\s)dst-address=/.test(line);
    const gatewayMatch = /(?:^|\s)gateway=(\d+\.\d+\.\d+\.\d+)(?:\s|$)/.exec(line);
    if (hasDstAddress && gatewayMatch) results.push(gatewayMatch[1]);
  }
  return results;
}

// Cisco IOS/IOS-XE: "ip route <red> <máscara> <gateway>" (rutas
// globales, no van dentro de un bloque "interface").
function parseNapalmIosRouteGateways(configText) {
  const results = [];
  const regex = /^ip route\s+\S+\s+\S+\s+(\d+\.\d+\.\d+\.\d+)/gm;
  let match;
  while ((match = regex.exec(configText))) results.push(match[1]);
  return results;
}

// FortiOS: bloques "config router static / edit <n> / set gateway <ip> / next / end".
function parseFortiosApiRouteGateways(configText) {
  const results = [];
  let inStaticBlock = false;

  for (const rawLine of configText.split('\n')) {
    const line = rawLine.trim();
    if (line === 'config router static') {
      inStaticBlock = true;
      continue;
    }
    if (!inStaticBlock) continue;
    if (line === 'end') {
      inStaticBlock = false;
      continue;
    }
    const gatewayMatch = /^set\s+gateway\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
    if (gatewayMatch) results.push(gatewayMatch[1]);
  }
  return results;
}

const ROUTE_PARSERS = {
  raw_ssh: parseRawSshRouteGateways,
  napalm_ios: parseNapalmIosRouteGateways,
  fortios_api: parseFortiosApiRouteGateways,
};

/**
 * Gateways declarados en la tabla de ruteo estática — se usa como
 * señal de CORROBORACIÓN de un enlace inferido por subred compartida:
 * si el equipo A tiene una ruta cuyo gateway es justo la IP que el
 * equipo B declaró en esa misma subred, es mucho más confiable que
 * "ambos equipos tienen algo en esa subred" a secas (que puede ser una
 * coincidencia de rango privado default reusado independientemente,
 * ej. 192.168.0.0/24 en dos WLAN locales sin relación entre sí — ver
 * networkTopology.service.js).
 * @param {'raw_ssh'|'napalm_ios'|'fortios_api'} driver
 * @param {string} configText
 * @returns {string[]}
 */
export function parseRouteGateways(driver, configText) {
  const parser = ROUTE_PARSERS[driver];
  if (!parser || !configText) return [];
  try {
    return parser(configText);
  } catch {
    return [];
  }
}

function netmaskToPrefixLength(netmask) {
  return netmask
    .split('.')
    .map(Number)
    .reduce((bits, octet) => bits + octet.toString(2).split('1').length - 1, 0);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

/**
 * Dirección de red (ej. "192.168.200.0/24") a partir de una IP +
 * prefijo — es la clave que se usa para detectar "misma subred" entre
 * dos dispositivos distintos.
 * @param {string} ip
 * @param {number} prefixLength
 * @returns {string}
 */
export function networkCidr(ip, prefixLength) {
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  const network = (ipToInt(ip) & mask) >>> 0;
  const octets = [(network >>> 24) & 255, (network >>> 16) & 255, (network >>> 8) & 255, network & 255];
  return `${octets.join('.')}/${prefixLength}`;
}
