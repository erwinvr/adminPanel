/**
 * pages/TopologyPage.jsx
 *
 * Mapa de topología (Criticidad → Aplicación → Base de Datos →
 * Servidor → Datacenter/Nube), persistido en PostgreSQL vía la misma
 * API/sesión/RBAC del resto del panel.
 *
 * Es un DASHBOARD de solo visualización + gestión de conexiones entre
 * cajas ya existentes (resaltar, conectar, desconectar). El alta, baja
 * y modificación de las cajas en sí vive en el ABM de
 * TopologyAdminPage.jsx (topology.edit) — así el mapa no se satura de
 * controles de edición de cajas.
 *
 * Dibujado con React Flow (@xyflow/react): cada caja queda fija en la
 * columna de su categoría (no se puede arrastrar — la posición
 * horizontal ES la categoría) apiladas verticalmente, con pan/zoom
 * real. Los encabezados de columna son nodos más (no un <div> aparte)
 * para que se muevan junto con el resto al hacer pan/zoom.
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
import { X, Info, ArrowLeftRight } from 'lucide-react';
import { Layout } from '../components/Layout.jsx';
import { Modal } from '../components/Modal.jsx';
import { Form } from '../components/Form.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { topologyService } from '../services/topology.service.js';
import { providerService } from '../services/provider.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { COLUMNS } from '../constants/topology.js';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';

const NODE_WIDTH = 190;
const COL_GAP_X = 250;
const ROW_GAP_Y = 76;
const HEADER_ID_PREFIX = '__header_';

function TopologyNode({ data }) {
  return (
    <div
      className={cn(
        'group flex w-full flex-col gap-0.5 rounded-md border-2 bg-card px-3 py-2 shadow-sm transition-opacity duration-150',
        data.dimmed && 'opacity-25'
      )}
      style={{ borderColor: data.color, boxShadow: data.isSelected ? `0 0 0 2px ${data.color}` : undefined }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{data.label}</div>
          {data.sub && <div className="truncate text-xs text-muted-foreground">{data.sub}</div>}
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

function TopologyHeaderNode({ data }) {
  return (
    <div
      className="w-full pb-1.5 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
      style={{ borderBottom: `3px solid ${data.color}` }}
    >
      {data.label} <span className="font-normal normal-case">({data.count})</span>
    </div>
  );
}

const nodeTypes = { topology: TopologyNode, topologyHeader: TopologyHeaderNode };

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
        onNodeSelect(node.id);
      }}
      onEdgeClick={canEdit ? (_, edge) => onEdgeDelete(edge.id) : undefined}
      onPaneClick={onClearSelection}
    >
      <Background />
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

export function TopologyPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.TOPOLOGY_EDIT);
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [connectionsTarget, setConnectionsTarget] = useState(null);
  const [providers, setProviders] = useState([]);
  const [providersError, setProvidersError] = useState(false);

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
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      await refresh();
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

  const selectedNode = useMemo(() => graph.nodes.find((n) => n.id === selectedNodeId) ?? null, [graph.nodes, selectedNodeId]);

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

  const flowNodes = useMemo(() => {
    const rowByColumn = new Map();
    const headers = COLUMNS.map((c, ci) => ({
      id: `${HEADER_ID_PREFIX}${ci}`,
      type: 'topologyHeader',
      position: { x: ci * COL_GAP_X, y: -56 },
      data: { label: c.title, color: c.color, count: graph.nodes.filter((n) => n.col === ci).length },
      draggable: false,
      selectable: false,
      connectable: false,
      style: { width: NODE_WIDTH },
      zIndex: 1,
    }));

    const boxes = graph.nodes.map((n) => {
      const row = rowByColumn.get(n.col) ?? 0;
      rowByColumn.set(n.col, row + 1);
      return {
        id: n.id,
        type: 'topology',
        position: { x: n.col * COL_GAP_X, y: row * ROW_GAP_Y },
        data: {
          label: n.name,
          sub: n.sub,
          color: n.color || COLUMNS[n.col].color,
          dimmed: Boolean(selectedNodeId) && !isRelated(n.id),
          isSelected: selectedNodeId === n.id,
          canEdit,
          onManageConnections: () => handleOpenConnections(n),
          onShowInfo: () => handleShowInfo(n),
        },
        draggable: false,
        style: { width: NODE_WIDTH },
      };
    });

    return [...headers, ...boxes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, selectedNodeId, isRelated, canEdit]);

  const flowEdges = useMemo(
    () =>
      graph.edges.map((e) => {
        const fromNode = graph.nodes.find((n) => n.id === e.from);
        const color = (fromNode && (fromNode.color || COLUMNS[fromNode.col].color)) || '#999';
        const related = Boolean(selectedNodeId) && (e.from === selectedNodeId || e.to === selectedNodeId);
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          type: 'smoothstep',
          style: {
            stroke: color,
            strokeWidth: related ? 2.5 : 1.5,
            opacity: selectedNodeId ? (related ? 1 : 0.1) : 0.6,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      }),
    [graph.edges, graph.nodes, selectedNodeId]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Mapa de Topología</h1>
      <p className="topology-page__hint">
        {canEdit
          ? 'Clic en una caja para resaltar sus conexiones. Usá el ícono ℹ️ para ver su proveedor y el ícono ⇄ para editar con qué otras se conecta. Clic en una línea para eliminarla.'
          : 'Clic en una caja para resaltar sus conexiones. Usá el ícono ℹ️ para ver su proveedor. Modo solo lectura — no tienes permiso de edición sobre este mapa.'}
      </p>

      {canEdit && (
        <Button type="button" variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/topology/admin')}>
          Administrar cajas (alta / baja / modificación) →
        </Button>
      )}

      <div className="h-[70vh] min-h-[480px] rounded-md border bg-card">
        <ReactFlowProvider>
          <TopologyCanvas
            flowNodes={flowNodes}
            flowEdges={flowEdges}
            graphNodes={graph.nodes}
            selectedNode={selectedNode}
            showInfo={showInfo}
            providersError={providersError}
            providersByNodeId={providersByNodeId}
            canEdit={canEdit}
            onNodeSelect={(id) => {
              // Clic en la caja en sí: solo resalta conexiones. Si había
              // un cuadro de información abierto (de esta u otra caja),
              // se cierra — el ℹ️ es el único que lo vuelve a abrir.
              setShowInfo(false);
              setSelectedNodeId((cur) => (cur === id ? null : id));
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
            await refresh();
          }}
        />
      )}
    </Layout>
  );
}

function ConnectionsManagerModal({ node, graph, onClose, onSaved }) {
  const connected = new Set(
    graph.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => (e.from === node.id ? e.to : e.from))
  );

  const groups = COLUMNS.map((c, ci) => ({ ci, title: c.title, nodes: graph.nodes.filter((n) => n.col === ci && n.id !== node.id) })).filter(
    (g) => g.nodes.length
  );

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
