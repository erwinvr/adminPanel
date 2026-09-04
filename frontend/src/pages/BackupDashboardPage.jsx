/**
 * pages/BackupDashboardPage.jsx
 *
 * Dashboard de backups: total de jobs, estado de su última ejecución
 * (Veeam Backup & Replication) y espacio libre en los repositorios.
 * Puramente de lectura — la sincronización vive en "Backups →
 * Configuración".
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { backupService } from '../services/backup.service.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';

const STATUS_BADGE_VARIANT = { Success: 'success', Warning: 'warning', Failed: 'destructive', None: 'muted' };
const STATUS_LABEL = { Success: 'Éxito', Warning: 'Advertencia', Failed: 'Error', None: 'Sin ejecutar' };

// Umbral de espacio libre — mismo criterio de "estado" que el resto de
// la app (colores de estado reservados, no categóricos): < 10% libre
// es crítico, < 25% es advertencia, el resto está bien.
const FREE_SPACE_CRITICAL = '#d03b3b';
const FREE_SPACE_WARNING = '#fab219';
const FREE_SPACE_OK = '#199e70';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5 },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--muted-foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.4 },
};

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

function StatCard({ label, value }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function BackupDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await backupService.getDashboard());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  if (error) {
    return (
      <Layout>
        <h1 className="text-2xl font-semibold">Backups</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <h1 className="text-2xl font-semibold">Backups</h1>
        <p className="mt-4 text-muted-foreground">Cargando…</p>
      </Layout>
    );
  }

  const noData = data.totalJobs === 0 && data.repositories.length === 0;

  const repoRows = data.repositories.map((r) => {
    const pctFree = r.capacityBytes ? Math.round((r.freeBytes / r.capacityBytes) * 100) : null;
    const color = pctFree == null ? 'var(--muted-foreground)' : pctFree < 10 ? FREE_SPACE_CRITICAL : pctFree < 25 ? FREE_SPACE_WARNING : FREE_SPACE_OK;
    return { name: r.name, pctFree: pctFree ?? 0, label: pctFree == null ? '—' : `${pctFree}%`, color, freeBytes: r.freeBytes, capacityBytes: r.capacityBytes };
  });
  const repoChartHeight = Math.max(repoRows.length * 34, 100);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Backups</h1>
      <p className="topology-page__hint">
        Jobs y repositorios de Veeam Backup & Replication, tal como quedaron en el último sync.
      </p>

      {noData && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>
            Todavía no hay datos sincronizados. Andá a "Backups → Configuración" para traerlos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de jobs" value={data.totalJobs} />
        <StatCard label="Con éxito" value={data.statusCounts.Success ?? 0} />
        <StatCard label="Con advertencia" value={data.statusCounts.Warning ?? 0} />
        <StatCard label="Con error" value={data.statusCounts.Failed ?? 0} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Jobs</CardTitle>
          <CardDescription>Estado de la última ejecución de cada job</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: 'name', label: 'Job', render: (r) => escapeHtml(r.name) },
              {
                key: 'lastStatus',
                label: 'Última ejecución',
                render: (r) => badgeHtml(STATUS_LABEL[r.lastStatus] ?? r.lastStatus ?? 'Sin ejecutar', STATUS_BADGE_VARIANT[r.lastStatus] ?? 'muted'),
              },
              { key: 'lastRunAt', label: 'Fecha', render: (r) => (r.lastRunAt ? new Date(r.lastRunAt).toLocaleString('es-BO') : '—') },
            ]}
            rows={data.jobs}
            emptyMessage="No hay jobs sincronizados todavía"
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Espacio libre en repositorios</CardTitle>
          <CardDescription>% de capacidad libre por repositorio</CardDescription>
        </CardHeader>
        <CardContent>
          {repoRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay repositorios sincronizados todavía</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={repoChartHeight} minWidth={280}>
                <BarChart data={repoRows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(_value, _name, props) => [`${props.payload.label} libre (${formatBytes(props.payload.freeBytes)} de ${formatBytes(props.payload.capacityBytes)})`, undefined]}
                  />
                  <Bar dataKey="pctFree" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {repoRows.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                    <LabelList dataKey="label" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <DataTable
                columns={[
                  { key: 'name', label: 'Repositorio', render: (r) => escapeHtml(r.name) },
                  { key: 'capacityBytes', label: 'Capacidad', render: (r) => formatBytes(r.capacityBytes) },
                  { key: 'freeBytes', label: 'Libre', render: (r) => formatBytes(r.freeBytes) },
                ]}
                rows={repoRows}
                emptyMessage="No hay repositorios sincronizados todavía"
              />
            </>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
