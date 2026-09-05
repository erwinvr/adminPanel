/**
 * pages/NetBackupBitacoraPage.jsx
 *
 * "Backup Networking" → Bitácora: por dispositivo, cuántas corridas
 * exitosas tiene y cuántas CONFIGURACIONES DISTINTAS hay entre ellas
 * (mismo contenido = misma versión, sin importar cuántas veces se
 * repitió) — y permite elegir dos versiones para ver la diferencia
 * línea por línea entre ellas.
 *
 * "Ver versiones" muestra SOLO las corridas donde la config cambió
 * respecto a la anterior — el detalle de cada ejecución (todas,
 * cambien o no la config) ya está en Auditoría (acción "netbackup.run").
 */

import { useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { netbackupService } from '../services/netbackup.service.js';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';

const VERSIONS_PAGE_SIZE = 10;

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO');
}

function splitIntoLines(value) {
  const lines = value.split('\n');
  // split('\n') deja un '' final si el texto terminaba en salto de línea — se descarta.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Arma dos columnas alineadas fila por fila a partir de los `parts` de
 * `diffLines` (jsdiff) — izquierda = versión "from", derecha = versión
 * "to". Un bloque `removed` seguido de un bloque `added` (el caso más
 * común: una línea que cambió de valor) se empareja línea a línea en
 * la MISMA fila en vez de mostrarse como "todo lo viejo, después todo
 * lo nuevo" — así se lee como "esto pasó a ser esto otro", no como dos
 * listas separadas. Si un lado tiene más líneas que el otro, el
 * sobrante queda solo de ese lado con el otro en blanco.
 */
function buildSideBySideRows(parts) {
  const left = [];
  const right = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    if (!part.added && !part.removed) {
      for (const line of splitIntoLines(part.value)) {
        left.push({ kind: 'context', text: line });
        right.push({ kind: 'context', text: line });
      }
      i += 1;
      continue;
    }

    if (part.removed && parts[i + 1]?.added) {
      const removedLines = splitIntoLines(part.value);
      const addedLines = splitIntoLines(parts[i + 1].value);
      const rowCount = Math.max(removedLines.length, addedLines.length);
      for (let j = 0; j < rowCount; j += 1) {
        left.push(j < removedLines.length ? { kind: 'removed', text: removedLines[j] } : { kind: 'empty', text: '' });
        right.push(j < addedLines.length ? { kind: 'added', text: addedLines[j] } : { kind: 'empty', text: '' });
      }
      i += 2;
      continue;
    }

    if (part.removed) {
      for (const line of splitIntoLines(part.value)) {
        left.push({ kind: 'removed', text: line });
        right.push({ kind: 'empty', text: '' });
      }
      i += 1;
      continue;
    }

    // part.added, sin removed inmediatamente antes (ya se consumió arriba si lo había)
    for (const line of splitIntoLines(part.value)) {
      left.push({ kind: 'empty', text: '' });
      right.push({ kind: 'added', text: line });
    }
    i += 1;
  }

  return { left, right };
}

const LINE_STYLE = {
  added: 'bg-success/20',
  removed: 'bg-destructive/20',
  context: 'text-muted-foreground',
  empty: 'bg-muted/30',
};

// Ciclo de variantes para diferenciar visualmente una "Config #N" de
// otra — el número en sí ya identifica cuál es cuál, el color es solo
// para que se note a simple vista cuándo se repite entre filas no
// consecutivas de la tabla (paginada).
const VERSION_BADGE_VARIANTS = ['default', 'secondary', 'success', 'warning'];

function versionBadge(versionNumber) {
  const variant = VERSION_BADGE_VARIANTS[(versionNumber - 1) % VERSION_BADGE_VARIANTS.length];
  return badgeHtml(`Config #${versionNumber}`, variant);
}

export function NetBackupBitacoraPage() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [versions, setVersions] = useState(null);
  const [selectedRunIds, setSelectedRunIds] = useState([]);
  const [diffResult, setDiffResult] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [versionsPage, setVersionsPage] = useState(1);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);
  const syncingScrollRef = useRef(false);

  // Scroll sincronizado entre los dos cuadros — sin esto, comparar
  // configs largas obliga a desplazar cada lado por separado para
  // mantenerlos alineados. La bandera evita el loop infinito de
  // "onScroll de uno dispara el scroll del otro, que dispara de nuevo".
  function syncScroll(sourceRef, targetRef) {
    return () => {
      if (syncingScrollRef.current || !sourceRef.current || !targetRef.current) return;
      syncingScrollRef.current = true;
      targetRef.current.scrollTop = sourceRef.current.scrollTop;
      syncingScrollRef.current = false;
    };
  }

  useEffect(() => {
    (async () => {
      try {
        setSummary(await netbackupService.getConfigSummary());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSelectDevice(device) {
    setSelectedDevice(device);
    setVersions(null);
    setSelectedRunIds([]);
    setDiffResult(null);
    setVersionsPage(1);
    try {
      setVersions(await netbackupService.listDeviceVersions(device.id));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function toggleRun(runId) {
    setDiffResult(null);
    setSelectedRunIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return [prev[1], runId]; // conserva la selección más reciente
      return [...prev, runId];
    });
  }

  async function handleCompare() {
    if (selectedRunIds.length !== 2) return;
    setComparing(true);
    try {
      const [a, b] = selectedRunIds;
      const va = versions.find((v) => v.id === a);
      const vb = versions.find((v) => v.id === b);
      // El diff se pide siempre de la versión más vieja a la más nueva,
      // sin importar en qué orden se hayan tildado los checkboxes.
      const [fromId, toId] = new Date(va.startedAt) <= new Date(vb.startedAt) ? [a, b] : [b, a];
      setDiffResult(await netbackupService.diffRuns(fromId, toId));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setComparing(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Bitácora</h1>
      <p className="topology-page__hint">
        Cantidad de configuraciones distintas guardadas por dispositivo (una misma configuración repetida en varias
        corridas cuenta una sola vez) y comparación línea por línea entre dos versiones.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'hardware', label: 'Equipo', render: (r) => `${r.hardwareBrand} ${r.hardwareModel}` },
            { key: 'totalRuns', label: 'Corridas exitosas' },
            { key: 'uniqueConfigs', label: 'Configuraciones únicas' },
            { key: 'lastRunAt', label: 'Última corrida', render: (r) => formatDateTime(r.lastRunAt) },
          ]}
          rows={summary}
          actions={[{ label: 'Ver versiones', onClick: handleSelectDevice }]}
          emptyMessage="No hay dispositivos configurados todavía"
        />
      )}

      {selectedDevice && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Versiones — {selectedDevice.hardwareBrand} {selectedDevice.hardwareModel}</CardTitle>
            <CardDescription>
              Solo las corridas donde cambió la configuración — el detalle de cada ejecución está en Auditoría. Elegí
              dos para ver la diferencia entre ellas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {versions === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este dispositivo todavía no tiene corridas exitosas.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Configuración</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions
                      .slice((versionsPage - 1) * VERSIONS_PAGE_SIZE, versionsPage * VERSIONS_PAGE_SIZE)
                      .map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRunIds.includes(v.id)}
                              onCheckedChange={() => toggleRun(v.id)}
                              disabled={!selectedRunIds.includes(v.id) && selectedRunIds.length >= 2}
                            />
                          </TableCell>
                          <TableCell>{formatDateTime(v.startedAt)}</TableCell>
                          <TableCell dangerouslySetInnerHTML={{ __html: versionBadge(v.versionNumber) }} />
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {versions.length > VERSIONS_PAGE_SIZE && (
                  <Pagination
                    page={Math.min(versionsPage, Math.ceil(versions.length / VERSIONS_PAGE_SIZE))}
                    totalPages={Math.ceil(versions.length / VERSIONS_PAGE_SIZE)}
                    onChange={setVersionsPage}
                  />
                )}
                <Button className="mt-3" disabled={selectedRunIds.length !== 2 || comparing} onClick={handleCompare}>
                  {comparing ? 'Comparando…' : 'Ver diferencias'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {diffResult &&
        (() => {
          const { left, right } = buildSideBySideRows(diffResult.parts);
          return (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Diferencias</CardTitle>
                <CardDescription>Lo resaltado en rojo (izquierda) ya no está en la versión de la derecha; lo resaltado en verde es nuevo.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{formatDateTime(diffResult.fromStartedAt)}</p>
                    <pre
                      ref={leftPanelRef}
                      onScroll={syncScroll(leftPanelRef, rightPanelRef)}
                      className="max-h-[32rem] overflow-auto rounded-md border p-3 font-mono text-xs leading-5"
                    >
                      {left.map((l, i) => (
                        <div key={i} className={LINE_STYLE[l.kind]}>
                          {l.text || ' '}
                        </div>
                      ))}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{formatDateTime(diffResult.toStartedAt)}</p>
                    <pre
                      ref={rightPanelRef}
                      onScroll={syncScroll(rightPanelRef, leftPanelRef)}
                      className="max-h-[32rem] overflow-auto rounded-md border p-3 font-mono text-xs leading-5"
                    >
                      {right.map((l, i) => (
                        <div key={i} className={LINE_STYLE[l.kind]}>
                          {l.text || ' '}
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
    </Layout>
  );
}
