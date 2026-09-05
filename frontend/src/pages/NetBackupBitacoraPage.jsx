/**
 * pages/NetBackupBitacoraPage.jsx
 *
 * "Backup Networking" → Bitácora: por dispositivo, cuántas corridas
 * exitosas tiene y cuántas CONFIGURACIONES DISTINTAS hay entre ellas
 * (mismo contenido = misma versión, sin importar cuántas veces se
 * repitió) — y permite elegir dos versiones para ver la diferencia
 * línea por línea entre ellas.
 */

import { useEffect, useState } from 'react';
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

/** Divide cada bloque del diff en líneas individuales, con su marca +/-/espacio. */
function diffLinesForRender(parts) {
  const lines = [];
  for (const part of parts) {
    const kind = part.added ? 'added' : part.removed ? 'removed' : 'context';
    const partLines = part.value.split('\n');
    // split('\n') deja un '' final si el texto terminaba en salto de línea — se descarta.
    if (partLines[partLines.length - 1] === '') partLines.pop();
    for (const line of partLines) lines.push({ kind, line });
  }
  return lines;
}

const LINE_STYLE = {
  added: 'bg-success/15 text-success-foreground',
  removed: 'bg-destructive/15 text-destructive-foreground',
  context: 'text-muted-foreground',
};
const LINE_PREFIX = { added: '+', removed: '-', context: ' ' };

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
            <CardDescription>Elegí dos para ver la diferencia entre ellas.</CardDescription>
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
                      <TableHead>¿Cambió respecto a la anterior?</TableHead>
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
                          <TableCell
                            dangerouslySetInnerHTML={{
                              __html: v.changedFromPrevious ? badgeHtml('Sí', 'warning') : badgeHtml('No', 'muted'),
                            }}
                          />
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

      {diffResult && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Diferencias</CardTitle>
            <CardDescription>
              {formatDateTime(diffResult.fromStartedAt)} → {formatDateTime(diffResult.toStartedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[32rem] overflow-auto rounded-md border p-3 font-mono text-xs leading-5">
              {diffLinesForRender(diffResult.parts).map((l, i) => (
                <div key={i} className={LINE_STYLE[l.kind]}>
                  {LINE_PREFIX[l.kind]} {l.line}
                </div>
              ))}
            </pre>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
