/**
 * pages/VulnDashboardPage.jsx
 *
 * Dashboard de vulnerabilidades: porcentaje de equipos con
 * actualizaciones pendientes y el top 10 de equipos con más
 * actualizaciones pendientes (ManageEngine Endpoint Central).
 * Puramente de lectura — la sincronización vive en "Vulnerabilidades →
 * Configuración".
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { vulnService } from '../services/vuln.service.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

// Color de estado (no categórico) — es la misma señal de "esto
// necesita atención" que ya usan los top-10 de Usuarios.
const COLOR_PENDING = '#d03b3b';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5 },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--muted-foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.4 },
};

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

export function VulnDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await vulnService.getDashboard());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  if (error) {
    return (
      <Layout>
        <h1 className="text-2xl font-semibold">Vulnerabilidades</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <h1 className="text-2xl font-semibold">Vulnerabilidades</h1>
        <p className="mt-4 text-muted-foreground">Cargando…</p>
      </Layout>
    );
  }

  const topRows = data.topComputers.map((c) => ({ name: c.computerName, pending: c.pendingPatchesCount }));
  const chartHeight = Math.max(topRows.length * 34, 120);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Vulnerabilidades</h1>
      <p className="topology-page__hint">
        Actualizaciones pendientes por equipo, tal como quedaron en el último sync de Endpoint Central.
      </p>

      {data.totalComputers === 0 && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>
            Todavía no hay equipos sincronizados. Andá a "Vulnerabilidades → Configuración" para traerlos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de equipos" value={data.totalComputers} />
        <StatCard label="Con actualizaciones pendientes" value={`${data.pctWithPending}%`} hint={`${data.computersWithPending} equipos`} />
        <StatCard label="Al día" value={`${data.pctUpToDate}%`} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Top 10 — equipos con más actualizaciones pendientes</CardTitle>
          <CardDescription>Cantidad de parches pendientes por equipo</CardDescription>
        </CardHeader>
        <CardContent>
          {topRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ningún equipo tiene actualizaciones pendientes.</p>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight} minWidth={280}>
              <BarChart data={topRows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [`${value} pendientes`, undefined]} />
                <Bar dataKey="pending" fill={COLOR_PENDING} radius={[0, 4, 4, 0]} maxBarSize={16}>
                  <LabelList dataKey="pending" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
