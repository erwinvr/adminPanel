/**
 * pages/UsersInsightsPage.jsx
 *
 * Dashboard de higiene de identidad: cruza las fotos del último sync de
 * Active Directory y Microsoft 365 (backend: services/insights.service.js)
 * para mostrar quiénes están más atrasados en cambiar su contraseña o
 * en volver a autenticarse (umbral fijo: 90 días), y cuántos usuarios
 * hay sincronizados de cada lado. Es puramente de lectura — no dispara
 * sincronizaciones (eso vive en "Active Directory → Configuración" y
 * "Microsoft 365 → Configuración").
 *
 * Colores: un solo hue por serie (regla de "sequential = un hue" del
 * método de dataviz de la app) — ámbar para vencimiento de contraseña,
 * rojo para ausencia de login (ambos son colores de estado, no
 * categóricos), y un par categórico validado (azul/aqua, ΔE >= 15 en
 * modo oscuro) para distinguir AD de M365 en el gráfico comparativo.
 *
 * `UserSecurityInsightsView` es la parte puramente de presentación —
 * exportada para que PublicDashboardPage.jsx la reuse tal cual en el
 * enlace público de "Compartir".
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { ShareDialog } from '../components/ShareDialog.jsx';
import { insightsService } from '../services/insights.service.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { Share2 } from 'lucide-react';

const COLOR_AD = '#199e70';
const COLOR_M365 = '#3987e5';
const COLOR_PASSWORD_STALE = '#fab219';
const COLOR_LOGIN_STALE = '#d03b3b';

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
      {hint && (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      )}
    </Card>
  );
}

function shortName(user) {
  return user.displayName || user.samAccountName || '—';
}

// "Nunca" no tiene un número de días real para graficar — se le da una
// barra larga fija (más que cualquier valor real esperable en este
// top-10) para que se vea como "el peor caso", pero la etiqueta y el
// tooltip siempre muestran el texto "Nunca", nunca ese número inventado.
const NEVER_SENTINEL_DAYS = 730;

function toChartRow(user, daysField) {
  const days = user[daysField];
  return { name: shortName(user), days: days ?? NEVER_SENTINEL_DAYS, label: days === null ? 'Nunca' : `${days} d` };
}

/** Barras horizontales de "días desde X" para un top-10 — una sola serie, un solo hue. */
function StaleUsersChart({ data, dataKey, color, emptyMessage }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  // El backend ya devuelve el más atrasado primero (ASC NULLS FIRST) —
  // el YAxis de categoría de recharts dibuja en ese mismo orden de
  // arriba hacia abajo, así que no hace falta invertir nada.
  const chartHeight = Math.max(data.length * 34, 120);

  // `minWidth` evita el bug conocido de ResponsiveContainer donde el
  // primer montaje (sobre todo cuando TODO el árbol de la página se
  // crea de una — como en la vista pública de "Compartir", que no
  // hereda un layout ya asentado como <Layout>) mide 0 antes de que el
  // ResizeObserver interno se estabilice, y las barras quedan
  // invisibles hasta que el usuario redimensiona la ventana a mano.
  return (
    <ResponsiveContainer width="100%" height={chartHeight} minWidth={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        />
        <Tooltip {...TOOLTIP_STYLE} formatter={(_value, _name, props) => [props.payload.label, undefined]} />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={16}>
          <LabelList dataKey="label" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UserSecurityInsightsView({ data }) {
  const noDataAtAll = data.adUserCount === 0 && data.m365UserCount === 0;

  const passwordRows = data.topStalePasswords.map((u) => toChartRow(u, 'daysSincePasswordChange'));
  const loginRows = data.topStaleLogins.map((u) => toChartRow(u, 'daysSinceLogin'));
  const compareRows = [
    { name: 'Active Directory', count: data.adUserCount, color: COLOR_AD },
    { name: 'Microsoft 365', count: data.m365UserCount, color: COLOR_M365 },
  ];

  return (
    <>
      {noDataAtAll && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>
            Todavía no hay usuarios sincronizados. Andá a "Active Directory → Configuración" y/o "Microsoft 365 →
            Configuración" para traer los datos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Usuarios en Active Directory" value={data.adUserCount} />
        <StatCard label="Usuarios en Microsoft 365" value={data.m365UserCount} />
        <StatCard label="Sin cambiar contraseña 90+ días" value={data.stalePasswordCount} hint="Sobre el total de AD" />
        <StatCard label="Sin autenticar 90+ días" value={data.staleLoginCount} hint="Sobre el total de AD" />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Active Directory vs. Microsoft 365</CardTitle>
          <CardDescription>Cantidad de usuarios sincronizados de cada lado</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160} minWidth={280}>
            <BarChart data={compareRows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--foreground)', fontSize: 12.5 }}
              />
              <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [`${value} usuarios`, undefined]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {compareRows.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
                <LabelList dataKey="count" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 — sin cambiar contraseña (90+ días)</CardTitle>
            <CardDescription>Días desde el último cambio de clave en Active Directory</CardDescription>
          </CardHeader>
          <CardContent>
            <StaleUsersChart
              data={passwordRows}
              dataKey="days"
              color={COLOR_PASSWORD_STALE}
              emptyMessage="Nadie está atrasado — todos cambiaron su contraseña hace menos de 90 días."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 — sin autenticar (90+ días)</CardTitle>
            <CardDescription>Días desde el último login en Active Directory</CardDescription>
          </CardHeader>
          <CardContent>
            <StaleUsersChart
              data={loginRows}
              dataKey="days"
              color={COLOR_LOGIN_STALE}
              emptyMessage="Nadie está atrasado — todos autenticaron en los últimos 90 días."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function UsersInsightsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setData(await insightsService.getUserSecurityInsights());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {data && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" />
            Compartir
          </Button>
        )}
      </div>
      <p className="topology-page__hint">
        Indicadores de higiene de identidad a partir del último sync de Active Directory y Microsoft 365. Umbral de
        "estancado": 90 días.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !data ? (
        <p className="mt-4 text-muted-foreground">Cargando…</p>
      ) : (
        <UserSecurityInsightsView data={data} />
      )}

      {shareOpen && <ShareDialog dashboardKey="users-insights" dashboardLabel="Usuarios" onClose={() => setShareOpen(false)} />}
    </Layout>
  );
}
