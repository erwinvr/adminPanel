/**
 * pages/VulnDashboardPage.jsx
 *
 * Dashboard UEM (gestión unificada de endpoints, ManageEngine Endpoint
 * Central): porcentaje de equipos con actualizaciones pendientes, el
 * top 10 con más actualizaciones pendientes, y la cobertura del agente
 * (equipos del dominio vs. equipos con el agente instalado, por SO).
 * Puramente de lectura — la sincronización vive en "UEM → Configuración".
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { vulnService } from '../services/vuln.service.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { Share2 } from 'lucide-react';
import { ShareDialog } from '../components/ShareDialog.jsx';
import { Button } from '@/components/ui/button.jsx';

// Color de estado (no categórico) — es la misma señal de "esto
// necesita atención" que ya usan los top-10 de Usuarios.
const COLOR_PENDING = '#d03b3b';
// Cobertura del agente: "en el dominio" es la base (neutro) y "con agente"
// se resalta con el color primario de la app.
const COLOR_DOMAIN = '#64748b';
const COLOR_AGENT = 'var(--primary)';

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

/** Contenido del dashboard (lo reutiliza la vista pública de "Compartir", ver PublicDashboardPage.jsx). */
export function VulnDashboardView({ data, isPublic = false }) {
  const topRows = data.topComputers.map((c) => ({ name: c.computerName, pending: c.pendingPatchesCount }));
  const chartHeight = Math.max(topRows.length * 34, 120);

  return (
    <>
      <p className="topology-page__hint">
        Actualizaciones pendientes por equipo, tal como quedaron en el último sync de Endpoint Central.
      </p>

      {data.totalComputers === 0 && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>
            {isPublic ? 'Todavía no hay equipos sincronizados.' : 'Todavía no hay equipos sincronizados. Andá a "UEM → Configuración" para traerlos.'}
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

      <AgentCoverageCard rows={data.agentCoverage} />
    </>
  );
}

/**
 * Cuántos equipos hay en el dominio (Active Directory) contra cuántos
 * tienen el agente de Endpoint Central, por sistema operativo — la familia
 * del SO ("Windows Server 2022" vs. "Windows 10/11") ya distingue
 * servidores de equipos de usuario.
 */
function AgentCoverageCard({ rows }) {
  const chartHeight = Math.max((rows?.length ?? 0) * 44, 140);
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Cobertura del agente de Endpoint Central</CardTitle>
        <CardDescription>Equipos en el dominio (Active Directory) vs. equipos con el agente instalado, por sistema operativo</CardDescription>
      </CardHeader>
      <CardContent>
        {!rows || rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos todavía — sincronizá Active Directory y Endpoint Central.</p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight} minWidth={280}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 4 }} barCategoryGap={16} barGap={4}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis
                type="category"
                dataKey="family"
                width={150}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="domainCount" name="En el dominio (AD)" fill={COLOR_DOMAIN} radius={[0, 4, 4, 0]} maxBarSize={16}>
                <LabelList dataKey="domainCount" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
              </Bar>
              <Bar dataKey="agentCount" name="Con agente (Endpoint Central)" fill={COLOR_AGENT} radius={[0, 4, 4, 0]} maxBarSize={16}>
                <LabelList dataKey="agentCount" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function VulnDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

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
        <h1 className="text-2xl font-semibold">UEM</h1>
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <h1 className="text-2xl font-semibold">UEM</h1>
        <p className="mt-4 text-muted-foreground">Cargando…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">UEM</h1>
        <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-4" />
          Compartir
        </Button>
      </div>
      <VulnDashboardView data={data} />

      {shareOpen && <ShareDialog dashboardKey="vuln" dashboardLabel="UEM" onClose={() => setShareOpen(false)} />}
    </Layout>
  );
}
