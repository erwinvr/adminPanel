/**
 * services/topology.service.js
 *
 * Mapa de topología (Criticidad → Aplicación → Base de Datos →
 * Servidor → Datacenter/Nube), reemplazando el almacenamiento en el
 * navegador del artifact original por PostgreSQL — es un recurso
 * COMPARTIDO por todo el equipo (no por usuario), consistente con el
 * propósito original de la herramienta.
 */

import Joi from 'joi';
import { db } from '../config/database.js';
import { topologyRepository } from '../repositories/topology.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import { parseCsv } from '../topology/csvImport.js';
import { COLUMN_TITLES, CRIT_LEVELS, normalizeText } from '../topology/categories.js';

const ipSchema = Joi.string().ip();
const colorSchema = Joi.string().pattern(/^#[0-9a-fA-F]{6}$/);

const MAX_COLUMN_INDEX = 4;
const COL_APP = 1;
const COL_DC = 4;

// Una Aplicación nunca va directo a un Datacenter/Nube — "aplicación" sin
// un Servidor/Instancia de por medio no es una ubicación física real (el
// mapa ya no la dibujaría como contención aunque existiera la conexión, ver
// TopologyPage.jsx). Se bloquea acá para no depender solo de que el
// formulario no la ofrezca.
function assertNotAppDatacenter(from, to) {
  const cols = new Set([from.column_index, to.column_index]);
  if (cols.has(COL_APP) && cols.has(COL_DC)) {
    throw new ValidationError('Una Aplicación no puede conectarse directo a un Datacenter/Nube — tiene que ser a través de un Servidor/Instancia');
  }
}

export const topologyService = {
  async getGraph() {
    const [nodes, edges] = await Promise.all([topologyRepository.listNodes(), topologyRepository.listEdges()]);
    return { nodes, edges };
  },

  async createNode(req, { columnIndex, name, sub, color, ipAddress }) {
    if (columnIndex < 0 || columnIndex > MAX_COLUMN_INDEX) {
      throw new ValidationError('Columna fuera de rango');
    }
    const actorId = req.session.userId;

    const node = await db.transaction(async (trx) => {
      const [created] = await trx('topology_nodes')
        .insert({
          column_index: columnIndex,
          name,
          sub: sub || null,
          color: color || null,
          ip_address: ipAddress || null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id', 'column_index as col', 'name', 'sub', 'color', 'ip_address as ipAddress']);

      await recordEvent({
        userId: actorId,
        action: 'topology.node.create',
        resource: 'topology_node',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { name, columnIndex },
        trx,
      });
      return created;
    });

    return node;
  },

  async updateNode(req, id, changes) {
    const existing = await topologyRepository.findNodeById(id);
    if (!existing) throw new NotFoundError('Nodo no encontrado');

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.sub !== undefined) dbChanges.sub = changes.sub || null;
    if (changes.color !== undefined) dbChanges.color = changes.color || null;
    if (changes.ipAddress !== undefined) dbChanges.ip_address = changes.ipAddress || null;

    const updated = await db.transaction(async (trx) => {
      const result = await trx('topology_nodes')
        .where({ id })
        .update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() })
        .returning(['id', 'column_index as col', 'name', 'sub', 'color', 'ip_address as ipAddress'])
        .then(([row]) => row);

      await recordEvent({
        userId: actorId,
        action: 'topology.node.update',
        resource: 'topology_node',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });

      return result;
    });

    return updated;
  },

  async deleteNode(req, id) {
    const existing = await topologyRepository.findNodeById(id);
    if (!existing) throw new NotFoundError('Nodo no encontrado');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('topology_nodes').where({ id }).del(); // ON DELETE CASCADE borra sus conexiones
      await recordEvent({
        userId: actorId,
        action: 'topology.node.delete',
        resource: 'topology_node',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },

  async createEdge(req, { fromNodeId, toNodeId }) {
    if (fromNodeId === toNodeId) {
      throw new ValidationError('Un nodo no puede conectarse consigo mismo');
    }
    const [from, to] = await Promise.all([
      topologyRepository.findNodeById(fromNodeId),
      topologyRepository.findNodeById(toNodeId),
    ]);
    if (!from || !to) throw new NotFoundError('Alguno de los nodos no existe');
    assertNotAppDatacenter(from, to);

    const exists = await topologyRepository.edgeExists(fromNodeId, toNodeId);
    if (exists) throw new ConflictError('Esa conexión ya existe');

    const actorId = req.session.userId;

    const edge = await db.transaction(async (trx) => {
      const created = await trx('topology_edges')
        .insert({ from_node_id: fromNodeId, to_node_id: toNodeId, created_by: actorId })
        .returning(['id', 'from_node_id as from', 'to_node_id as to'])
        .then(([row]) => row);

      await recordEvent({
        userId: actorId,
        action: 'topology.edge.create',
        resource: 'topology_edge',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { fromNodeId, toNodeId },
        trx,
      });

      return created;
    });

    return edge;
  },

  async updateEdge(req, id, changes) {
    const existing = await topologyRepository.findEdgeById(id);
    if (!existing) throw new NotFoundError('Conexión no encontrada');

    const fromNodeId = changes.fromNodeId ?? existing.from_node_id;
    const toNodeId = changes.toNodeId ?? existing.to_node_id;

    if (fromNodeId === toNodeId) {
      throw new ValidationError('Un nodo no puede conectarse consigo mismo');
    }

    const [from, to] = await Promise.all([
      topologyRepository.findNodeById(fromNodeId),
      topologyRepository.findNodeById(toNodeId),
    ]);
    if (!from || !to) throw new NotFoundError('Alguno de los nodos no existe');
    assertNotAppDatacenter(from, to);

    if (fromNodeId !== existing.from_node_id || toNodeId !== existing.to_node_id) {
      const exists = await topologyRepository.edgeExists(fromNodeId, toNodeId);
      if (exists) throw new ConflictError('Esa conexión ya existe');
    }

    const actorId = req.session.userId;

    const edge = await db.transaction(async (trx) => {
      const updated = await trx('topology_edges')
        .where({ id })
        .update({ from_node_id: fromNodeId, to_node_id: toNodeId })
        .returning(['id', 'from_node_id as from', 'to_node_id as to'])
        .then(([row]) => row);

      await recordEvent({
        userId: actorId,
        action: 'topology.edge.update',
        resource: 'topology_edge',
        resourceId: id,
        result: 'success',
        req,
        metadata: { fromNodeId, toNodeId },
        trx,
      });

      return updated;
    });

    return edge;
  },

  async deleteEdge(req, id) {
    const existing = await topologyRepository.findEdgeById(id);
    if (!existing) throw new NotFoundError('Conexión no encontrada');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('topology_edges').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'topology.edge.delete',
        resource: 'topology_edge',
        resourceId: id,
        result: 'success',
        req,
        trx,
      });
    });
  },

  /**
   * Alta masiva de cajas desde un CSV (ver "Administrar cajas" →
   * descargar plantilla / importar). Solo CREA — si una caja con la misma
   * categoría y nombre ya existe, la fila se cuenta como "omitida" y no se
   * toca (para que reimportar el mismo archivo no pise nada por accidente).
   * Una fila inválida (categoría no reconocida, color/IP con formato
   * inválido, nivel de Criticidad que no es uno de los 4 fijos o que ya
   * existe) se reporta como error y no bloquea al resto del archivo.
   */
  async importNodes(req, csvText) {
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new ValidationError('El archivo no tiene filas de datos (además del encabezado) — descargá la plantilla.');
    }

    const header = rows[0].map(normalizeText);
    const colIndex = {
      categoria: header.findIndex((h) => h === 'categoria'),
      nombre: header.findIndex((h) => h === 'nombre'),
      detalle: header.findIndex((h) => h === 'detalle'),
      ip: header.findIndex((h) => h.startsWith('direccion ip')),
      color: header.findIndex((h) => h === 'color'),
      // Solo se usa en filas de Aplicación — liga la fila recién creada al
      // nodo de Criticidad existente con ese nombre (no crea niveles nuevos,
      // los 4 son fijos). En cualquier otra categoría esta columna se ignora.
      criticidad: header.findIndex((h) => h === 'criticidad'),
    };
    if (colIndex.categoria === -1 || colIndex.nombre === -1) {
      throw new ValidationError('El archivo no tiene las columnas esperadas (Categoría, Nombre, ...) — descargá la plantilla.');
    }

    const existingNodes = await topologyRepository.listNodes();
    const existingKeys = new Set(existingNodes.map((n) => `${n.col}::${normalizeText(n.name)}`));
    const critLevelsUsed = new Set(existingNodes.filter((n) => n.col === 0).map((n) => normalizeText(n.name)));
    const critNodeIdByName = new Map(existingNodes.filter((n) => n.col === 0).map((n) => [normalizeText(n.name), n.id]));

    const cell = (row, idx) => (idx === -1 ? '' : (row[idx] ?? '').trim());

    const toCreate = [];
    const errors = [];
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // 1-based, contando el encabezado como fila 1 (igual que se ve en Excel)
      const categoriaRaw = cell(row, colIndex.categoria);
      const name = cell(row, colIndex.nombre);
      const sub = cell(row, colIndex.detalle);
      const ipAddress = cell(row, colIndex.ip);
      const colorRaw = cell(row, colIndex.color);
      const criticidadRaw = cell(row, colIndex.criticidad);

      if (!name) {
        errors.push({ row: rowNum, message: 'Falta el nombre' });
        continue;
      }
      const columnIndex = COLUMN_TITLES.findIndex((t) => normalizeText(t) === normalizeText(categoriaRaw));
      if (columnIndex === -1) {
        errors.push({ row: rowNum, message: `Categoría "${categoriaRaw}" no reconocida — usá una de: ${COLUMN_TITLES.join(', ')}` });
        continue;
      }

      let color = colorRaw || null;
      if (columnIndex === 0) {
        const level = CRIT_LEVELS.find((l) => normalizeText(l.name) === normalizeText(name));
        if (!level) {
          errors.push({ row: rowNum, message: `Criticidad "${name}" inválida — tiene que ser uno de: ${CRIT_LEVELS.map((l) => l.name).join(', ')}` });
          continue;
        }
        if (critLevelsUsed.has(normalizeText(level.name))) {
          skipped++;
          continue;
        }
        color = level.color;
        critLevelsUsed.add(normalizeText(level.name));
      }

      if (color && colorSchema.validate(color).error) {
        errors.push({ row: rowNum, message: `Color "${color}" inválido — tiene que ser un hex de 6 dígitos, ej. #2E74B5` });
        continue;
      }
      if (ipAddress && ipSchema.validate(ipAddress).error) {
        errors.push({ row: rowNum, message: `Dirección IP "${ipAddress}" inválida` });
        continue;
      }

      // La Criticidad de una Aplicación es una conexión (Criticidad → Aplicación),
      // no un atributo propio — se resuelve acá al nodo ya existente de ese nivel.
      let criticidadNodeId = null;
      if (columnIndex === COL_APP && criticidadRaw) {
        const level = CRIT_LEVELS.find((l) => normalizeText(l.name) === normalizeText(criticidadRaw));
        if (!level) {
          errors.push({ row: rowNum, message: `Criticidad "${criticidadRaw}" inválida — tiene que ser uno de: ${CRIT_LEVELS.map((l) => l.name).join(', ')}` });
          continue;
        }
        criticidadNodeId = critNodeIdByName.get(normalizeText(level.name));
        if (!criticidadNodeId) {
          errors.push({ row: rowNum, message: `Todavía no existe la caja de Criticidad "${level.name}" — creala primero en "Administrar cajas"` });
          continue;
        }
      }

      const key = `${columnIndex}::${normalizeText(name)}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);
      toCreate.push({ columnIndex, name, sub: sub || null, color, ipAddress: ipAddress || null, criticidadNodeId });
    }

    const actorId = req.session.userId;
    let edgesCreated = 0;
    if (toCreate.length) {
      await db.transaction(async (trx) => {
        for (const n of toCreate) {
          const [created] = await trx('topology_nodes')
            .insert({
              column_index: n.columnIndex,
              name: n.name,
              sub: n.sub,
              color: n.color,
              ip_address: n.ipAddress,
              created_by: actorId,
              updated_by: actorId,
            })
            .returning(['id']);
          if (n.criticidadNodeId) {
            await trx('topology_edges').insert({ from_node_id: n.criticidadNodeId, to_node_id: created.id, created_by: actorId });
            edgesCreated++;
          }
        }
        await recordEvent({
          userId: actorId,
          action: 'topology.node.import',
          resource: 'topology_node',
          result: 'success',
          req,
          metadata: { created: toCreate.length, edgesCreated, skipped, errorCount: errors.length },
          trx,
        });
      });
    } else {
      await recordEvent({
        userId: actorId,
        action: 'topology.node.import',
        resource: 'topology_node',
        result: errors.length ? 'failure' : 'success',
        req,
        metadata: { created: 0, edgesCreated: 0, skipped, errorCount: errors.length },
      });
    }

    return { created: toCreate.length, edgesCreated, skipped, errors };
  },
};
