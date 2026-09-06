/**
 * pages/NetworkTopologyPage.jsx
 *
 * Dashboard "Topología de Red": grafo INFERIDO de cómo se
 * interconectan los equipos de networking marcados en el inventario
 * ("Incluir en Topología de Red") — la única señal disponible es
 * subredes IP compartidas entre sus configs ya respaldadas (ver
 * backend/src/integrations/networkBackup/topologyParser.js para el
 * porqué no hay descubrimiento real tipo LLDP/CDP). Es de solo
 * lectura, sin edición manual de conexiones — a diferencia de
 * TopologyPage.jsx (mapa de aplicaciones), acá no hay columnas fijas
 * por categoría, así que el layout es un círculo simple calculado por
 * índice en vez del posicionamiento manual por columna de aquel mapa.
 */

import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, useReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layout } from '../components/Layout.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { networkTopologyService } from '../services/networkTopology.service.js';
import { cn } from '@/lib/utils.js';

const NODE_WIDTH = 200;
const RADIUS_PER_NODE = 70; // el radio crece con la cantidad de nodos para que no se amontonen

function NetworkNode({ data }) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border bg-card px-3 py-2 shadow-sm',
        !data.hasConfig && 'border-dashed opacity-50'
      )}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="truncate text-sm font-semibold">{data.label}</div>
      <div className="truncate font-mono text-[11px] text-muted-foreground">{data.managementIp ?? 'sin IP'}</div>
      {!data.hasConfig && <div className="text-[10px] text-muted-foreground">Sin backup todavía</div>}
    </div>
  );
}

const nodeTypes = { network: NetworkNode };

function buildCircularLayout(nodes) {
  const total = nodes.length;
  const radius = Math.max(160, total * RADIUS_PER_NODE);
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(total, 1);
    return {
      id: node.id,
      type: 'network',
      position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      data: { label: `${node.brand} ${node.model}`, managementIp: node.managementIp, hasConfig: node.hasConfig },
      style: { width: NODE_WIDTH },
    };
  });
}

// Igual que TopologyPage.jsx: el fitView se dispara a mano cada vez que
// cambia el set de nodos, en vez de la prop booleana `fitView` de
// <ReactFlow> (que encuadra una sola vez al montar, casi siempre antes
// de que el fetch asíncrono traiga los nodos reales).
function TopologyCanvas({ flowNodes, flowEdges }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!flowNodes.length) return undefined;
    const raf = requestAnimationFrame(() => fitView({ padding: 0.25, duration: 200 }));
    return () => cancelAnimationFrame(raf);
  }, [flowNodes, fitView]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function NetworkTopologyPage() {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setGraph(await networkTopologyService.getGraph());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const flowNodes = useMemo(() => (graph ? buildCircularLayout(graph.nodes) : []), [graph]);
  const flowEdges = useMemo(
    () =>
      graph
        ? graph.edges.map((e) => ({
            id: `${e.from}-${e.to}-${e.subnet}`,
            source: e.from,
            target: e.to,
            type: 'smoothstep',
            label: e.corroborated ? e.subnet : `${e.subnet} (sin confirmar)`,
            // Corroborado = alguno de los dos equipos tiene una ruta cuyo
            // gateway es la IP del otro en esa subred (evidencia real de
            // enlace); sin confirmar = solo comparten la subred, que
            // puede ser coincidencia de rango privado default reusado
            // por cada equipo de forma independiente.
            style: e.corroborated ? undefined : { strokeDasharray: '4 3', opacity: 0.6 },
            markerEnd: { type: MarkerType.ArrowClosed },
          }))
        : [],
    [graph]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Topología de Red</h1>
      <p className="topology-page__hint">
        Interconexión INFERIDA entre los equipos de networking marcados en el inventario ("Incluir en Topología de
        Red") — se infiere por subredes IP compartidas entre sus configs respaldadas, no por descubrimiento real
        (LLDP/CDP). Las líneas punteadas "(sin confirmar)" son subredes compartidas sin evidencia en la tabla de
        ruteo (pueden ser coincidencia, ej. cada equipo con su propia LAN en el mismo rango privado default); las
        sólidas están corroboradas por una ruta cuyo gateway apunta al otro equipo. Un equipo sin backup todavía
        aparece aislado.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : graph === null ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : graph.nodes.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay equipos marcados — activá "Incluir en Topología de Red" en Hardware para los equipos de
          networking que quieras ver acá.
        </p>
      ) : (
        <div style={{ height: '32rem' }} className="rounded-md border">
          <ReactFlowProvider>
            <TopologyCanvas flowNodes={flowNodes} flowEdges={flowEdges} />
          </ReactFlowProvider>
        </div>
      )}
    </Layout>
  );
}
