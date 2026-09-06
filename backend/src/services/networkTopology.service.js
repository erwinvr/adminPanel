/**
 * services/networkTopology.service.js
 *
 * Dashboard "Topología de Red": infiere heurísticamente cómo se
 * interconectan los equipos de networking marcados con
 * `hardware_inventory.include_in_topology` — sin LLDP/CDP disponible
 * en ningún driver, la señal base es "¿tienen una IP en la misma
 * subred declarada?" (ver integrations/networkBackup/topologyParser.js
 * para el porqué y las limitaciones de este enfoque).
 *
 * Esa señal base SOLA no alcanza: dos equipos pueden compartir una
 * subred sin estar conectados entre sí — típicamente porque cada uno
 * usa independientemente el mismo rango privado "de manual" para su
 * propia LAN/WLAN local (192.168.0.0/24 y 192.168.1.0/24 son los
 * ejemplos clásicos). Por eso se agrega una segunda señal, de
 * CORROBORACIÓN: si alguno de los dos tiene una ruta cuyo gateway es
 * justo la IP que el otro declaró en esa subred compartida, es
 * evidencia mucho más fuerte de que hay un enlace real (la tabla de
 * ruteo del propio equipo lo trata como next-hop ahí). Cuando un par
 * de equipos comparte varias subredes, se prefieren las corroboradas
 * por ruteo por sobre las que no — si ninguna está corroborada, se
 * muestran igual todas las compartidas (mejor señal débil que nada),
 * pero marcadas como no confirmadas para que la UI lo distinga.
 *
 * Un equipo marcado pero sin backup configurado (o sin ninguna corrida
 * exitosa todavía) aparece igual como nodo aislado — `hasConfig: false`
 * — para que quede claro que está incluido pero sin datos con qué
 * inferir conexiones.
 */

import { networkTopologyRepository } from '../repositories/networkTopology.repository.js';
import { netbackupRepository } from '../repositories/netbackup.repository.js';
import { parseInterfaceSubnets, parseRouteGateways, networkCidr } from '../integrations/networkBackup/topologyParser.js';

export const networkTopologyService = {
  async getGraph() {
    const hardwareList = await networkTopologyRepository.listTopologyHardware();

    // Una consulta independiente por equipo (la última corrida exitosa,
    // si tiene dispositivo de backup) — en paralelo, no importa el orden.
    const lastRuns = await Promise.all(
      hardwareList.map((hw) =>
        hw.netbackupDeviceId ? netbackupRepository.findLatestSuccessfulRunForDevice(hw.netbackupDeviceId) : null
      )
    );

    const nodes = [];
    const ipBySubnetByNodeId = new Map(); // nodeId -> Map(subnetCidr -> ip propia del equipo en esa subred)
    const routeGatewaysByNodeId = new Map(); // nodeId -> Set(gateways declarados en sus rutas)

    hardwareList.forEach((hw, i) => {
      const lastRun = lastRuns[i];
      const hasConfig = Boolean(lastRun);
      const configText = hasConfig ? lastRun.configOutput : '';

      const ipBySubnet = new Map();
      for (const entry of parseInterfaceSubnets(hw.driver, configText)) {
        const subnet = networkCidr(entry.ip, entry.prefixLength);
        if (!ipBySubnet.has(subnet)) ipBySubnet.set(subnet, entry.ip); // si declara 2 IPs en la misma subred, se queda con la primera
      }

      nodes.push({ id: hw.id, brand: hw.brand, model: hw.model, managementIp: hw.managementIp, hasConfig });
      ipBySubnetByNodeId.set(hw.id, ipBySubnet);
      routeGatewaysByNodeId.set(hw.id, new Set(parseRouteGateways(hw.driver, configText)));
    });

    // Todos los pares de nodos DISTINTOS (nunca un equipo contra sí
    // mismo) — con la cantidad esperada de equipos de networking esto
    // es cómputo en memoria trivial, no amerita nada más elaborado.
    const edges = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        const subnetsA = ipBySubnetByNodeId.get(nodeA.id);
        const subnetsB = ipBySubnetByNodeId.get(nodeB.id);
        const routesA = routeGatewaysByNodeId.get(nodeA.id);
        const routesB = routeGatewaysByNodeId.get(nodeB.id);

        const sharedSubnets = [...subnetsA.keys()].filter((subnet) => subnetsB.has(subnet));
        if (sharedSubnets.length === 0) continue;

        const corroboratedSubnets = sharedSubnets.filter((subnet) => {
          const ipA = subnetsA.get(subnet);
          const ipB = subnetsB.get(subnet);
          return routesA.has(ipB) || routesB.has(ipA);
        });

        // Si hay alguna corroborada por ruteo, esas son las únicas que
        // se muestran — las demás compartidas-sin-corroborar quedan
        // descartadas para este par (son las que suelen ser
        // coincidencia de rango privado default, no un enlace real).
        const chosenSubnets = corroboratedSubnets.length > 0 ? corroboratedSubnets : sharedSubnets;

        for (const subnet of chosenSubnets) {
          edges.push({ from: nodeA.id, to: nodeB.id, subnet, corroborated: corroboratedSubnets.includes(subnet) });
        }
      }
    }

    return { nodes, edges };
  },
};
