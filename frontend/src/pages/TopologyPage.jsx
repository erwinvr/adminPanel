/**
 * pages/TopologyPage.jsx
 *
 * Mapa de topología, persistido en PostgreSQL vía la misma API/sesión/RBAC
 * del resto del panel.
 *
 * MODELO VISUAL (contención, no 5 columnas planas):
 *  - Izquierda: lista plana de Aplicación (como antes), con un punto de
 *    color como ícono de Criticidad (de qué nodo "Crítico/Alto/Medio/Bajo"
 *    está conectada) en vez de una columna aparte.
 *  - Derecha: Datacenter / Nube contiene Servidor / Instancia, que a su vez
 *    contiene la(s) Base(s) de Datos y/o Aplicación(es) conectadas DIRECTO
 *    a él. Una Base de Datos también puede estar directo en un Datacenter
 *    (sin Servidor de por medio). IMPORTANTE: una Aplicación NUNCA se anida
 *    directo en un Datacenter — "aplicación" sin un Servidor de por medio
 *    no es una ubicación física real, el único camino de una Aplicación
 *    hacia un Datacenter es a través de un Servidor. Si existe una
 *    conexión directa Aplicación↔Datacenter (o Aplicación↔Base de Datos,
 *    "usa"), nunca anida — se dibuja como línea entre dondequiera que haya
 *    quedado cada caja (misma lista/contenedor o no). Antes sí anidaba y
 *    eso mostraba una Aplicación dentro de un Datacenter/Servidor con el
 *    que en realidad no tenía la conexión que parecía — reportado y
 *    corregido dos veces (primero "usa" por transitividad, después la
 *    conexión directa Aplicación↔Datacenter).
 *  - NO es un árbol estricto: una Base de Datos, un Servidor o una
 *    Aplicación pueden aparecer REPETIDOS si tienen más de una conexión
 *    directa (ej. una BD en dos Servidores, o una Aplicación en dos
 *    Servidores) — a propósito, para que algo replicado en dos lugares se
 *    vea en los dos.
 *  - El modelo de datos NO cambió (nodos + conexiones libres entre
 *    cualquier par de cajas, ver topology_nodes/topology_edges): esto es
 *    pura reinterpretación de cómo se DIBUJAN esas conexiones. "Editar
 *    conexiones" (⇄) sigue siendo la única forma de decir "esta caja vive
 *    en/usa aquella" — no hay una línea de contención para arrastrar ni
 *    para hacer clic y borrar (solo las líneas no-contención siguen
 *    siendo clicables para eliminar, igual que antes).
 *
 * Dibujado con React Flow (@xyflow/react) usando nodos padre/hijo
 * (`parentId` + `extent: 'parent'`) para la contención — sigue siendo la
 * misma librería, con pan/zoom real.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Info, ArrowLeftRight, Lock, Share2 } from 'lucide-react';
import { Layout } from '../components/Layout.jsx';
import { Modal } from '../components/Modal.jsx';
import { ShareDialog } from '../components/ShareDialog.jsx';
import { Form } from '../components/Form.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { topologyService } from '../services/topology.service.js';
import { providerService } from '../services/provider.service.js';
import { vaultService } from '../services/vault.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { COLUMNS } from '../constants/topology.js';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';

// Índices de columna (ver constants/topology.js) — se siguen usando para
// interpretar las conexiones ya guardadas, aunque el mapa ya no las dibuje
// como 5 columnas paralelas.
const COL_CRIT = 0;
const COL_APP = 1;
const COL_DB = 2;
const COL_SERVER = 3;
const COL_DC = 4;

const NODE_WIDTH = 190; // ancho de las cajas de Aplicación (lista de la izquierda)
const ROW_GAP_Y = 76;
const HEADER_ID_PREFIX = '__header_';

// Geometría de la contención del lado derecho.
const NEST_WIDTH = 172;
const NEST_HEIGHT = 46;
const NEST_GAP = 8;
const NEST_PADDING = 10;
const NEST_HEADER = 24;
const DC_GAP = 24;
const RIGHT_COL_X = NODE_WIDTH + 90;

/** IDs de los nodos conectados a `nodeId` en cualquier sentido (una conexión no distingue "hospeda a" de "usa a" a nivel de dato). */
function neighborsOf(nodeId, edges) {
  return edges.filter((e) => e.from === nodeId || e.to === nodeId).map((e) => (e.from === nodeId ? e.to : e.from));
}

/** El nodo de Criticidad (Crítico/Alto/Medio/Bajo) al que está conectada una Aplicación, si tiene uno. */
function criticalityOf(appId, nodeById, edges) {
  const critId = neighborsOf(appId, edges).find((id) => nodeById.get(id)?.col === COL_CRIT);
  if (!critId) return null;
  const n = nodeById.get(critId);
  return { name: n.name, color: n.color || COLUMNS[COL_CRIT].color };
}

/**
 * Arma el árbol de contención del lado derecho (ver comentario grande al
 * principio del archivo) a partir de los nodos y conexiones ya guardados —
 * sin red/estado, función pura, fácil de razonar y de volver a correr cada
 * vez que cambian los datos.
 *
 * Importante: una caja SOLO se anida donde tiene una conexión DIRECTA (App↔
 * Servidor, App↔Datacenter, BD↔Servidor, BD↔Datacenter, Servidor↔Datacenter).
 * "Usa" (App↔BD) NO es contención — nunca anida una Aplicación dentro del
 * contenedor de su Base de Datos solo porque la usa; esa relación se dibuja
 * aparte, como línea, sin importar dónde haya quedado cada caja (ver
 * `usaEdgesFor` en TopologyMapView). Si no fuera así, una app aparecería
 * dentro de un Datacenter/Servidor con el que en realidad no tiene ninguna
 * conexión — justo el error reportado y corregido acá.
 */
function buildContainment(nodes, edges) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const usedServerIds = new Set();
  const usedDbIds = new Set();

  function leafData(n, kind) {
    return { kind, refId: n.id, label: n.name, sub: n.sub, color: n.color || COLUMNS[n.col].color, ipAddress: n.ipAddress };
  }

  // Hijos DIRECTOS de un Servidor: sus Bases de Datos y las Aplicaciones
  // conectadas a él — un Servidor SÍ es un lugar válido para alojar
  // cualquiera de las dos.
  function childrenOfServer(serverId, pathKey) {
    const dbChildren = neighborsOf(serverId, edges)
      .filter((id) => nodeById.get(id)?.col === COL_DB)
      .map((dbId) => {
        usedDbIds.add(dbId);
        return { id: `${pathKey}__db_${dbId}`, ...leafData(nodeById.get(dbId), 'db') };
      });
    const appChildren = neighborsOf(serverId, edges)
      .filter((id) => nodeById.get(id)?.col === COL_APP)
      .map((appId) => ({ id: `${pathKey}__app_${appId}`, ...leafData(nodeById.get(appId), 'app') }));
    return [...dbChildren, ...appChildren];
  }

  // Hijos directos de un Datacenter/Nube que NO pasan por un Servidor: solo
  // Bases de Datos. Una Aplicación NUNCA se anida directo en un Datacenter
  // aunque tenga una conexión a él — "aplicación" sin un Servidor de por
  // medio no es una ubicación física real, así que esa conexión (si existe)
  // se dibuja como línea en vez de contención (ver más abajo, junto con "usa").
  function dbChildrenOfDc(dcId, pathKey) {
    return neighborsOf(dcId, edges)
      .filter((id) => nodeById.get(id)?.col === COL_DB)
      .map((dbId) => {
        usedDbIds.add(dbId);
        return { id: `${pathKey}__db_${dbId}`, ...leafData(nodeById.get(dbId), 'db') };
      });
  }

  function serverNode(serverId, parentKey) {
    usedServerIds.add(serverId);
    const key = `${parentKey}__srv_${serverId}`;
    return { id: key, ...leafData(nodeById.get(serverId), 'server'), children: childrenOfServer(serverId, key) };
  }

  const tree = nodes
    .filter((n) => n.col === COL_DC)
    .map((dc) => {
      const key = `dc_${dc.id}`;
      const serverChildren = neighborsOf(dc.id, edges)
        .filter((id) => nodeById.get(id)?.col === COL_SERVER)
        .map((id) => serverNode(id, key));
      const directChildren = dbChildrenOfDc(dc.id, key);
      return { id: key, ...leafData(dc, 'dc'), children: [...serverChildren, ...directChildren] };
    });

  // Huérfanos: Servidores sin Datacenter y Bases de Datos que no quedaron
  // alcanzadas por ningún Servidor ni Datacenter — para que nada del mapa
  // desaparezca solo por faltar una conexión de "dónde vive".
  const orphanServers = nodes.filter((n) => n.col === COL_SERVER && !usedServerIds.has(n.id)).map((n) => serverNode(n.id, 'orphan'));
  const orphanDbs = nodes
    .filter((n) => n.col === COL_DB && !usedDbIds.has(n.id))
    .map((n) => ({ id: `orphan__db_${n.id}`, ...leafData(n, 'db') }));
  const orphanChildren = [...orphanServers, ...orphanDbs];
  if (orphanChildren.length) {
    tree.push({ id: 'dc_orphan', kind: 'dc', refId: null, label: 'Sin Datacenter / Nube asignado', sub: null, color: 'var(--muted-foreground)', children: orphanChildren });
  }

  return tree;
}

// Mide (de abajo hacia arriba) y ubica (de arriba hacia abajo) cada caja del
// árbol de contención — un contenedor crece para que entren sus hijos,
// apilados en una sola columna vertical, mismo criterio simple que ya usa
// la lista de Aplicación.
function measure(node) {
  if (!node.children) {
    node._w = NEST_WIDTH;
    node._h = NEST_HEIGHT;
    return;
  }
  node.children.forEach(measure);
  node._w = node.children.length ? Math.max(NEST_WIDTH, ...node.children.map((c) => c._w)) + NEST_PADDING * 2 : NEST_WIDTH;
  node._h = NEST_HEADER + NEST_PADDING * 2 + node.children.reduce((sum, c) => sum + c._h, 0) + NEST_GAP * Math.max(0, node.children.length - 1);
}

function place(node) {
  if (!node.children) return;
  let y = NEST_HEADER + NEST_PADDING;
  for (const child of node.children) {
    child._x = NEST_PADDING;
    child._y = y;
    y += child._h + NEST_GAP;
    place(child);
  }
}

function flattenTree(node, parentId, extra, out) {
  out.push({
    id: node.id,
    type: node.children ? 'topologyGroup' : 'topologyNested',
    position: { x: node._x ?? 0, y: node._y ?? 0 },
    parentId,
    extent: parentId ? 'parent' : undefined,
    draggable: false,
    selectable: true,
    zIndex: node.children ? 0 : 2,
    style: { width: node._w, height: node._h },
    data: { kind: node.kind, refId: node.refId, label: node.label, sub: node.sub, color: node.color, ipAddress: node.ipAddress, ...extra(node) },
  });
  (node.children ?? []).forEach((c) => flattenTree(c, node.id, extra, out));
}

function TopologyNode({ data }) {
  return (
    <div
      className={cn(
        'group flex w-full flex-col gap-0.5 rounded-md border bg-card shadow-sm transition-all duration-150',
        data.compact ? 'px-2 py-1' : 'px-3 py-2',
        data.dimmed && 'opacity-30'
      )}
      style={{
        borderColor: data.isSelected ? 'var(--primary)' : 'var(--border)',
        borderLeftWidth: '3px',
        borderLeftColor: data.color,
        // El glow con el color de acento (no el de la categoría) marca
        // "esta es la caja activa" de forma consistente sin importar
        // qué categoría sea — el borde izquierdo sigue mostrando su
        // color propio.
        boxShadow: data.isSelected ? '0 0 0 1px var(--primary), 0 0 18px rgba(0, 212, 181, 0.35)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1 truncate font-semibold', data.compact ? 'text-xs' : 'text-sm')}>
            {data.criticality && (
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: data.criticality.color }}
                title={`Criticidad: ${data.criticality.name}`}
              />
            )}
            <span className="truncate">{data.label}</span>
            {data.hasVaultCredential && (
              <Lock
                className="size-3 shrink-0 text-primary"
                title="Vinculada a una credencial de la bóveda de contraseñas"
              />
            )}
          </div>
          {data.sub && <div className="truncate font-mono text-[11px] text-muted-foreground">{data.sub}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Ver información del proveedor"
            className="rounded text-muted-foreground hover:text-primary"
            onClick={(event) => {
              event.stopPropagation();
              data.onShowInfo();
            }}
          >
            <Info className="size-3.5" />
          </button>
          {data.canEdit && (
            <button
              type="button"
              title="Editar conexiones"
              className="rounded text-muted-foreground hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                data.onManageConnections();
              }}
            >
              <ArrowLeftRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

/** Contenedor de Datacenter/Nube o Servidor/Instancia — solo encabezado + borde; los hijos los posiciona React Flow encima (nodos padre/hijo, no DOM anidado). */
function TopologyGroupNode({ data }) {
  return (
    <div
      className={cn('group flex h-full w-full flex-col rounded-md border-2 border-dashed bg-card/40 transition-opacity duration-150', data.dimmed && 'opacity-30')}
      style={{ borderColor: data.isSelected ? 'var(--primary)' : data.color }}
    >
      <div className="flex shrink-0 items-start justify-between gap-1 px-2 py-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold tracking-wide uppercase" style={{ color: data.color }}>
            {data.label}
          </div>
          {data.sub && <div className="truncate font-mono text-[10px] text-muted-foreground">{data.sub}</div>}
          {data.ipAddress && <div className="truncate font-mono text-[10px] text-muted-foreground">{data.ipAddress}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Ver información del proveedor"
            className="rounded text-muted-foreground hover:text-primary"
            onClick={(event) => {
              event.stopPropagation();
              data.onShowInfo();
            }}
          >
            <Info className="size-3" />
          </button>
          {data.canEdit && (
            <button
              type="button"
              title="Editar conexiones"
              className="rounded text-muted-foreground hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                data.onManageConnections();
              }}
            >
              <ArrowLeftRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TopologyHeaderNode({ data }) {
  return (
    <div
      className="w-full pb-1.5 text-center font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
      style={{ borderBottom: `2px solid ${data.color}` }}
    >
      {data.label} <span className="normal-case text-muted-foreground/70">({data.count})</span>
    </div>
  );
}

const nodeTypes = { topology: TopologyNode, topologyNested: TopologyNode, topologyGroup: TopologyGroupNode, topologyHeader: TopologyHeaderNode };

/**
 * Envuelve <ReactFlow> + sus paneles. Vive DENTRO de <ReactFlowProvider>
 * porque necesita `useReactFlow()` para poder llamar a `fitView()` a
 * mano cada vez que llegan datos nuevos del backend — con la prop
 * booleana `fitView` de <ReactFlow>, el encuadre se calcula UNA sola
 * vez al montar, casi siempre antes de que `refresh()` (asíncrono)
 * traiga los nodos reales; el resultado es el mapa desfasado que se ve
 * al entrar. Acá se dispara a mano cada vez que cambia el set de nodos
 * (no en cada clic de selección — por eso depende de `graphNodes`, no
 * de `flowNodes`, que también cambia solo por resaltado/selección).
 */
function TopologyCanvas({
  flowNodes,
  flowEdges,
  graphNodes,
  selectedNode,
  showInfo,
  providersError,
  providersByNodeId,
  canEdit,
  onNodeSelect,
  onEdgeDelete,
  onClearSelection,
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!graphNodes.length) return undefined;
    // Un frame de margen para que el contenedor ya tenga su tamaño final
    // (evita encuadrar contra un layout todavía sin asentar).
    const raf = requestAnimationFrame(() => fitView({ padding: 0.25, duration: 200 }));
    return () => cancelAnimationFrame(raf);
  }, [graphNodes, fitView]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        if (node.id.startsWith(HEADER_ID_PREFIX)) return;
        onNodeSelect(node.data.refId);
      }}
      onEdgeClick={canEdit ? (_, edge) => onEdgeDelete(edge.id) : undefined}
      onPaneClick={onClearSelection}
    >
      <Background color="var(--border)" bgColor="var(--background)" gap={22} />
      <Controls showInteractive={false} />
      <MiniMap nodeColor={(n) => n.data?.color ?? '#999'} pannable zoomable className="!bg-muted" />
      {selectedNode && showInfo && (
        // No se usa <Panel> de React Flow acá: solo admite posiciones en
        // bordes/esquinas (top-left, top-center, ..., bottom-right), no
        // "centro". Este div propio se superpone a TODO el lienzo
        // (inset-0) y centra la tarjeta adentro — el fondo tiene
        // pointer-events-none, así un clic afuera de la tarjeta atraviesa
        // hasta el pane de React Flow de abajo y dispara onPaneClick
        // (cierra el panel) igual que antes.
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/5">
          <div className="pointer-events-auto max-h-[70%] w-80 overflow-y-auto rounded-lg border bg-card p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{selectedNode.name}</div>
                <div className="text-xs text-muted-foreground">
                  {COLUMNS[selectedNode.col].title}
                  {selectedNode.sub ? ` — ${selectedNode.sub}` : ''}
                </div>
                {selectedNode.ipAddress && <div className="font-mono text-xs text-muted-foreground">{selectedNode.ipAddress}</div>}
              </div>
              <button
                type="button"
                title="Cerrar"
                className="shrink-0 rounded text-muted-foreground hover:text-foreground"
                onClick={onClearSelection}
              >
                <X className="size-4" />
              </button>
            </div>
            {!providersError && (
              <>
                <div className="mt-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Proveedores</div>
                {(providersByNodeId.get(selectedNode.id) ?? []).length ? (
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {providersByNodeId.get(selectedNode.id).map((p) => (
                      <li key={p.id} className="rounded border px-2 py-1.5 text-xs">
                        <div className="font-medium">{p.name}</div>
                        {p.contactEmail && <div className="text-muted-foreground">{p.contactEmail}</div>}
                        {p.contactPhone && <div className="text-muted-foreground">{p.contactPhone}</div>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Sin proveedor vinculado.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </ReactFlow>
  );
}

/**
 * Todo lo interactivo del mapa (resaltar conexiones, ver info de
 * proveedor, editar conexiones si `canEdit`) — separado de
 * TopologyPage.jsx para que PublicDashboardPage.jsx lo reuse tal cual
 * en el enlace público de "Compartir", con `canEdit={false}` y sin
 * datos de proveedores/bóveda (ver services/share.service.js: el
 * payload público del mapa NO incluye esa información, a propósito —
 * es más sensible para un visitante anónimo que para alguien ya
 * autenticado en el panel).
 */
export function TopologyMapView({ graph, providers, providersError, vaultNodeIds, canEdit, onRefresh }) {
  const confirm = useConfirm();

  // Siempre guarda el ID REAL del nodo (refId), nunca el ID sintético de una
  // instancia anidada — así una Base de Datos repetida en dos Servidores
  // se resalta/selecciona como UNA sola cosa sin importar en cuál copia
  // se hizo clic.
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [connectionsTarget, setConnectionsTarget] = useState(null);

  const isRelated = useCallback(
    (id) => {
      if (id === selectedNodeId) return true;
      return graph.edges.some((e) => (e.from === selectedNodeId && e.to === id) || (e.to === selectedNodeId && e.from === id));
    },
    [graph.edges, selectedNodeId]
  );

  async function handleDeleteEdge(edgeId) {
    const ok = await confirm({ title: 'Eliminar conexión', message: '¿Eliminar esta conexión?', confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await topologyService.deleteEdge(edgeId);
      toast.success('Conexión eliminada');
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const providersByNodeId = useMemo(() => {
    const map = new Map();
    providers.forEach((p) => {
      p.resources.forEach((r) => {
        if (!map.has(r.id)) map.set(r.id, []);
        map.get(r.id).push(p);
      });
    });
    return map;
  }, [providers]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const selectedNode = useMemo(() => nodeById.get(selectedNodeId) ?? null, [nodeById, selectedNodeId]);

  function handleOpenConnections(node) {
    const hasOthers = graph.nodes.some((n) => n.id !== node.id);
    if (!hasOthers) {
      toast.info('No hay otras cajas para conectar');
      return;
    }
    setConnectionsTarget(node);
  }

  // El ícono ℹ️ es el único disparador del cuadro de información — un
  // clic en la caja en sí solo resalta conexiones (ver onNodeSelect más
  // abajo). Clic de nuevo sobre el mismo ícono lo cierra.
  function handleShowInfo(node) {
    if (selectedNodeId === node.id) {
      setShowInfo((prev) => !prev);
    } else {
      setSelectedNodeId(node.id);
      setShowInfo(true);
    }
  }

  // Props comunes a cualquier caja (flat o anidada): resaltado, selección,
  // candado de bóveda y los dos manejadores de ícono — todo resuelto por
  // el ID REAL (refId), para que una caja repetida se comporte como una
  // sola en toda la UI.
  function interactiveProps(refId, kind) {
    const node = nodeById.get(refId);
    return {
      dimmed: Boolean(selectedNodeId) && !isRelated(refId),
      isSelected: selectedNodeId === refId,
      canEdit,
      hasVaultCredential: kind === 'app' && vaultNodeIds.has(refId),
      criticality: kind === 'app' ? criticalityOf(refId, nodeById, graph.edges) : null,
      onManageConnections: () => node && handleOpenConnections(node),
      onShowInfo: () => node && handleShowInfo(node),
    };
  }

  const flowNodes = useMemo(() => {
    const rowByColumn = new Map();
    const appNodes = graph.nodes.filter((n) => n.col === COL_APP);
    const dcCount = graph.nodes.filter((n) => n.col === COL_DC).length;

    // Árbol de contención del lado derecho (Datacenter ⊃ Servidor ⊃ {BD, App},
    // SOLO conexiones directas — ver buildContainment) — se mide ANTES de armar
    // los encabezados porque el de la derecha necesita saber cuánto ocupa.
    const tree = buildContainment(graph.nodes, graph.edges);
    tree.forEach(measure);
    const rightWidth = tree.length ? Math.max(...tree.map((t) => t._w)) : NODE_WIDTH;

    const headers = [
      { ci: COL_APP, x: 0, width: NODE_WIDTH },
      { ci: COL_DC, x: RIGHT_COL_X, width: Math.max(NODE_WIDTH, rightWidth) },
    ].map(({ ci, x, width }) => ({
      id: `${HEADER_ID_PREFIX}${ci}`,
      type: 'topologyHeader',
      position: { x, y: -56 },
      data: { label: COLUMNS[ci].title, color: COLUMNS[ci].color, count: ci === COL_DC ? dcCount : appNodes.length },
      draggable: false,
      selectable: false,
      connectable: false,
      style: { width },
      zIndex: 1,
    }));

    // Toda caja con un refId de Aplicación o Base de Datos (lista plana +
    // cada instancia anidada) — para poder dibujar la línea "usa" entre
    // dondequiera que haya quedado cada una, sea o no el mismo contenedor
    // (ver comentario de buildContainment: "usa" nunca anida).
    const instancesByRefId = new Map();
    const addInstance = (refId, instanceId) => {
      if (!instancesByRefId.has(refId)) instancesByRefId.set(refId, []);
      instancesByRefId.get(refId).push(instanceId);
    };

    const appBoxes = appNodes.map((n) => {
      const row = rowByColumn.get(n.col) ?? 0;
      rowByColumn.set(n.col, row + 1);
      addInstance(n.id, n.id);
      return {
        id: n.id,
        type: 'topology',
        position: { x: 0, y: row * ROW_GAP_Y },
        data: { label: n.name, sub: n.sub, color: n.color || COLUMNS[n.col].color, compact: false, ...interactiveProps(n.id, 'app') },
        draggable: false,
        style: { width: NODE_WIDTH },
      };
    });

    const nestedBoxes = [];
    let y = 0;
    for (const dc of tree) {
      dc._x = RIGHT_COL_X;
      dc._y = y;
      place(dc);
      flattenTree(dc, undefined, (n) => interactiveProps(n.refId, n.kind), nestedBoxes);
      y += dc._h + DC_GAP;
    }
    // Las cajas anidadas (db/app) son más chicas — se marcan acá, después de
    // flattenTree, para no repetir la lógica de interactiveProps por tipo.
    // También se registra cada Datacenter/Nube (para poder dibujar la línea
    // de una Aplicación conectada DIRECTO a él, sin Servidor de por medio —
    // esa conexión nunca anida, ver buildContainment).
    for (const box of nestedBoxes) {
      if (box.type === 'topologyNested') {
        box.data.compact = true;
        addInstance(box.data.refId, box.id);
      } else if (box.data.kind === 'dc') {
        addInstance(box.data.refId, box.id);
      }
    }

    // Líneas que NUNCA son contención, se dibujan entre TODAS las instancias
    // de cada lado (lista plana + cada copia anidada), estén o no en el
    // mismo contenedor:
    //  - "usa" (Aplicación → Base de Datos): la app puede estar lejos de su
    //    BD en el lienzo si no tiene conexión directa con su Servidor/
    //    Datacenter — la línea lo deja igual de claro (o más) que anidarla.
    //  - Aplicación → Datacenter/Nube DIRECTO (sin Servidor de por medio):
    //    nunca anida (ver buildContainment) — si existe esa conexión, se
    //    dibuja igual, como línea, en vez de perderse en silencio.
    const usaEdges = [];
    for (const e of graph.edges) {
      const fromNode = nodeById.get(e.from);
      const toNode = nodeById.get(e.to);
      if (!fromNode || !toNode) continue;
      const appId = fromNode.col === COL_APP ? fromNode.id : toNode.col === COL_APP ? toNode.id : null;
      if (!appId) continue;
      const otherNode = fromNode.col === COL_APP ? toNode : fromNode;
      if (otherNode.col !== COL_DB && otherNode.col !== COL_DC) continue;
      for (const source of instancesByRefId.get(appId) ?? []) {
        for (const target of instancesByRefId.get(otherNode.id) ?? []) {
          usaEdges.push({ id: `${e.id}__${source}__${target}`, source, target, fromRefId: appId, toRefId: otherNode.id });
        }
      }
    }

    return { headers, appBoxes, nestedBoxes, usaEdges, rightWidth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, graph.edges, selectedNodeId, isRelated, canEdit, vaultNodeIds, nodeById]);

  const flowEdges = useMemo(
    () =>
      flowNodes.usaEdges.map((e) => {
        const related = Boolean(selectedNodeId) && (e.fromRefId === selectedNodeId || e.toRefId === selectedNodeId);
        const fromNode = nodeById.get(e.fromRefId);
        const color = (fromNode && (fromNode.color || COLUMNS[fromNode.col].color)) || '#999';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          className: !selectedNodeId || related ? 'topology-edge-flow' : undefined,
          style: {
            stroke: related ? 'var(--primary)' : color,
            strokeWidth: related ? 2.5 : 1.5,
            opacity: selectedNodeId ? (related ? 1 : 0.1) : 0.55,
          },
          // Acá sí un hex literal (no var()) — el color del marcador de
          // flecha lo arma React Flow como atributo SVG, no como
          // propiedad de estilo, y ahí un custom property de CSS no
          // se resuelve de forma confiable.
          markerEnd: { type: MarkerType.ArrowClosed, color: related ? '#00d4b5' : color },
        };
      }),
    [flowNodes.usaEdges, selectedNodeId, nodeById]
  );

  return (
    <>
      <p className="topology-page__hint">
        {canEdit
          ? 'Clic en una caja para resaltar sus conexiones. Usá el ícono ℹ️ para ver su proveedor y el ícono ⇄ para decir en qué Servidor/Datacenter vive o qué Base de Datos usa. Clic en una línea "usa" para eliminarla.'
          : 'Clic en una caja para resaltar sus conexiones. Usá el ícono ℹ️ para ver su proveedor. Modo solo lectura — no tienes permiso de edición sobre este mapa.'}
      </p>

      <div className="h-[70vh] min-h-[480px] rounded-md border bg-card">
        <ReactFlowProvider>
          <TopologyCanvas
            flowNodes={[...flowNodes.headers, ...flowNodes.appBoxes, ...flowNodes.nestedBoxes]}
            flowEdges={flowEdges}
            graphNodes={graph.nodes}
            selectedNode={selectedNode}
            showInfo={showInfo}
            providersError={providersError}
            providersByNodeId={providersByNodeId}
            canEdit={canEdit}
            onNodeSelect={(refId) => {
              // Clic en la caja en sí: solo resalta conexiones. Si había
              // un cuadro de información abierto (de esta u otra caja),
              // se cierra — el ℹ️ es el único que lo vuelve a abrir.
              setShowInfo(false);
              setSelectedNodeId((cur) => (cur === refId ? null : refId));
            }}
            onEdgeDelete={handleDeleteEdge}
            onClearSelection={() => {
              setSelectedNodeId(null);
              setShowInfo(false);
            }}
          />
        </ReactFlowProvider>
      </div>

      {connectionsTarget && (
        <ConnectionsManagerModal
          node={connectionsTarget}
          graph={graph}
          onClose={() => setConnectionsTarget(null)}
          onSaved={async () => {
            setConnectionsTarget(null);
            await onRefresh();
          }}
        />
      )}
    </>
  );
}

export function TopologyPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.TOPOLOGY_EDIT);
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [providers, setProviders] = useState([]);
  const [providersError, setProvidersError] = useState(false);
  const [vaultNodeIds, setVaultNodeIds] = useState(() => new Set());

  const refresh = useCallback(async () => {
    try {
      setGraph(await topologyService.getGraph());
    } catch (err) {
      toast.error('No se pudo cargar el mapa: ' + err.message);
    }
    // El listado de proveedores es información complementaria (para el
    // panel de detalle) — si el usuario no tiene providers.view, esto
    // falla con 403 y simplemente no se muestra esa sección, sin romper
    // el resto del mapa.
    try {
      setProviders(await providerService.list());
      setProvidersError(false);
    } catch {
      setProvidersError(true);
    }
    // Ídem con el símbolo de "vinculada a la bóveda" — si el usuario no
    // tiene vault.view, esto falla con 403 y las cajas de aplicación
    // simplemente no muestran el candado, sin romper el resto del mapa.
    try {
      setVaultNodeIds(new Set(await vaultService.linkedApplicationNodeIds()));
    } catch {
      setVaultNodeIds(new Set());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Layout>
      <div className="mb-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mapa de Aplicaciones</h1>
        <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-4" />
          Compartir
        </Button>
      </div>

      {canEdit && (
        <Button type="button" variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/topology/admin')}>
          Administrar cajas (alta / baja / modificación) →
        </Button>
      )}

      <TopologyMapView
        graph={graph}
        providers={providers}
        providersError={providersError}
        vaultNodeIds={vaultNodeIds}
        canEdit={canEdit}
        onRefresh={refresh}
      />

      {shareOpen && (
        <ShareDialog dashboardKey="topology" dashboardLabel="Mapa de Aplicaciones" onClose={() => setShareOpen(false)} />
      )}
    </Layout>
  );
}

function ConnectionsManagerModal({ node, graph, onClose, onSaved }) {
  const connected = new Set(
    graph.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => (e.from === node.id ? e.to : e.from))
  );

  // Aplicación↔Datacenter/Nube nunca es una conexión válida (solo a través
  // de un Servidor/Instancia) — ni se ofrece acá ni la acepta el backend.
  const groups = COLUMNS.map((c, ci) => ({ ci, title: c.title, nodes: graph.nodes.filter((n) => n.col === ci && n.id !== node.id) }))
    .filter((g) => g.nodes.length)
    .filter((g) => !((node.col === COL_APP && g.ci === COL_DC) || (node.col === COL_DC && g.ci === COL_APP)));

  const fields = groups.map((g) => ({
    name: `col_${g.ci}`,
    label: g.title,
    type: 'checkbox-group',
    options: g.nodes.map((n) => ({ value: n.id, label: n.name })),
    value: g.nodes.filter((n) => connected.has(n.id)).map((n) => n.id),
  }));

  function getEdgeBetween(aId, bId) {
    return graph.edges.find((e) => (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId));
  }

  return (
    <Modal title={`Conexiones de "${node.name}"`} onClose={onClose}>
      <Form
        fields={fields}
        submitLabel="Guardar conexiones"
        onSubmit={async (values) => {
          const selected = new Set(Object.values(values).flat());
          const toAdd = [...selected].filter((id) => !connected.has(id));
          const toRemove = [...connected].filter((id) => !selected.has(id));

          for (const otherId of toAdd) {
            const other = graph.nodes.find((n) => n.id === otherId);
            const [fromNodeId, toNodeId] = node.col <= other.col ? [node.id, otherId] : [otherId, node.id];
            await topologyService.createEdge({ fromNodeId, toNodeId });
          }
          for (const otherId of toRemove) {
            const edge = getEdgeBetween(node.id, otherId);
            if (edge) await topologyService.deleteEdge(edge.id);
          }

          toast.success('Conexiones actualizadas');
          await onSaved();
        }}
      />
    </Modal>
  );
}
