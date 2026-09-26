/**
 * pages/M365ServicesPage.jsx
 *
 * Dashboard "Servicios M365": uso de correo, OneDrive, SharePoint y Teams (los 10
 * usuarios con el buzón más lleno y con el OneDrive más utilizado, los 10 sitios
 * de SharePoint con más almacenamiento y los usuarios y equipos de Teams más
 * activos), según los informes de uso de Microsoft 365 (Graph, permiso `Reports.Read.All`, sin licencia adicional)
 * tal como quedaron en la última sincronización. Microsoft actualiza esos
 * informes una vez por día y con atraso (la fecha de cada informe se muestra
 * en pantalla), así que no es un dato en vivo.
 *
 * `M365ServicesView` es el contenido (lo reutiliza la vista pública de
 * "Compartir", ver PublicDashboardPage.jsx).
 */

import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { ShareDialog } from '../components/ShareDialog.jsx';
import { m365Service } from '../services/m365.service.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { formatBytes } from '@/lib/formatBytes.js';
import { formatDay } from '@/lib/formatDay.js';

// Colores de estado reservados (mismos que el dashboard de Backups): crítico ≥ 90 %, advertencia ≥ 75 %.
const COLOR_CRITICAL = '#d03b3b';
const COLOR_WARNING = '#fab219';
const COLOR_OK = '#199e70';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5 },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--muted-foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.4 },
};

const statusOf = (pct) => (pct == null ? 'muted' : pct >= 90 ? 'destructive' : pct >= 75 ? 'warning' : 'success');
const colorOf = (pct) => (pct == null ? 'var(--muted-foreground)' : pct >= 90 ? COLOR_CRITICAL : pct >= 75 ? COLOR_WARNING : COLOR_OK);

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-BO'));

/**
 * Top 10 genérico: gráfico de barras horizontales + tabla.
 *  - `rows`: ya ordenadas; cada una con `name` (etiqueta) y `key` únicas.
 *  - `value(row)` / `valueFormatter`: medida de la barra; `colorOf(row)` su color.
 *  - `tooltip(row)`: texto del globo; `columns`: columnas de la tabla (DataTable).
 */
function TopBarCard({ title, description, rows, value, valueFormatter, colorOf: rowColor, tooltip, columns, emptyMessage }) {
  const data = rows.map((r) => ({ ...r, _value: value(r) }));
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(data.length * 34, 120)} minWidth={280}>
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={190}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  tickFormatter={(v) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                />
                <Tooltip {...TOOLTIP_STYLE} formatter={(_v, _n, props) => [tooltip(props.payload), undefined]} />
                <Bar dataKey="_value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {data.map((r) => (
                    <Cell key={r.key} fill={rowColor(r)} />
                  ))}
                  <LabelList dataKey="_value" position="right" formatter={valueFormatter} style={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <DataTable columns={columns} rows={data} emptyMessage={emptyMessage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// "Nombre<br><small>correo</small>" — el texto va escapado (DataTable inyecta HTML).
const nameCell = (name, detail) =>
  `${escapeHtml(name)}${detail ? `<br><span class="text-xs text-muted-foreground">${escapeHtml(detail)}</span>` : ''}`;

const pctBadge = (pct) => (pct == null ? '—' : badgeHtml(`${pct.toFixed(0)} %`, statusOf(pct)));

/** Top 10 por almacenamiento (buzones, OneDrive, sitios de SharePoint): las barras se pintan según % usado. */
function StorageTopCard({ title, section, capacityKey, capacityLabel, countKey, countLabel, emptyMessage, rowName, rowDetail, entityLabel }) {
  const rows = section.top.map((r) => ({ ...r, key: r.userPrincipalName ?? r.name, name: rowName(r), pct: r.pctUsed, capacity: r[capacityKey] }));
  return (
    <TopBarCard
      title={title}
      description={`Espacio usado por ${entityLabel} · informe de Microsoft del ${formatDay(section.reportDate)}`}
      rows={rows}
      value={(r) => r.usedBytes}
      valueFormatter={formatBytes}
      colorOf={(r) => colorOf(r.pct)}
      tooltip={(r) => `${formatBytes(r.usedBytes)}${r.capacity ? ` de ${formatBytes(r.capacity)} (${r.pct.toFixed(0)} %)` : ''}`}
      columns={[
        { key: 'name', label: entityLabel[0].toUpperCase() + entityLabel.slice(1), render: (r) => nameCell(r.name, rowDetail(r)) },
        { key: 'usedBytes', label: 'Usado', render: (r) => formatBytes(r.usedBytes) },
        { key: 'capacity', label: capacityLabel, render: (r) => formatBytes(r.capacity) },
        { key: 'pct', label: '% usado', render: (r) => pctBadge(r.pct) },
        { key: countKey, label: countLabel, render: (r) => fmtInt(r[countKey]) },
        { key: 'lastActivityDate', label: 'Última actividad', render: (r) => formatDay(r.lastActivityDate) },
      ]}
      emptyMessage={emptyMessage}
    />
  );
}

function SectionTitle({ children }) {
  return <h2 className="mt-8 mb-3 text-lg font-semibold">{children}</h2>;
}

export function M365ServicesView({ data, isPublic = false }) {
  const { mailboxes, onedrive, sharepoint, teams, note } = data;
  const noData = mailboxes.total === 0 && onedrive.total === 0 && sharepoint.total === 0 && teams.users.total === 0 && teams.teams.total === 0;

  return (
    <>
      <p className="topology-page__hint">
        Uso de correo, OneDrive, SharePoint y Teams según los informes de uso de Microsoft 365. Microsoft los actualiza
        una vez por día y con algunos días de atraso: la fecha de cada informe figura en cada tarjeta.
      </p>

      {note && (
        <Alert variant="warning" className="mb-4 max-w-3xl">
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
      {noData && !note && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>
            {isPublic ? 'Todavía no hay datos sincronizados.' : 'Todavía no hay datos. Andá a "Microsoft 365 → Configuración" y sincronizá.'}
          </AlertDescription>
        </Alert>
      )}

      <SectionTitle>Correo y OneDrive</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Buzones de correo" value={fmtInt(mailboxes.total)} />
        <StatCard label="Espacio en buzones" value={formatBytes(mailboxes.totalUsedBytes)} />
        <StatCard label="Cuentas de OneDrive" value={fmtInt(onedrive.total)} />
        <StatCard label="Espacio en OneDrive" value={formatBytes(onedrive.totalUsedBytes)} />
      </div>
      <StorageTopCard
        title="Top 10 — buzones de correo más llenos"
        section={mailboxes}
        capacityKey="quotaBytes"
        capacityLabel="Cuota"
        countKey="itemCount"
        countLabel="Elementos"
        entityLabel="usuario"
        rowName={(r) => r.displayName || r.userPrincipalName}
        rowDetail={(r) => r.userPrincipalName}
        emptyMessage="No hay buzones sincronizados todavía"
      />
      <StorageTopCard
        title="Top 10 — OneDrive más utilizados"
        section={onedrive}
        capacityKey="allocatedBytes"
        capacityLabel="Asignado"
        countKey="fileCount"
        countLabel="Archivos"
        entityLabel="usuario"
        rowName={(r) => r.displayName || r.userPrincipalName}
        rowDetail={(r) => r.userPrincipalName}
        emptyMessage="No hay cuentas de OneDrive sincronizadas todavía"
      />

      <SectionTitle>SharePoint</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sitios" value={fmtInt(sharepoint.total)} />
        <StatCard label="Almacenamiento usado" value={formatBytes(sharepoint.totalUsedBytes)} />
        <StatCard label="Archivos" value={fmtInt(sharepoint.totalFiles)} />
        <StatCard label="Sitios sin actividad" value={fmtInt(sharepoint.inactive)} hint="hace más de 180 días" />
      </div>
      <StorageTopCard
        title="Top 10 — sitios de SharePoint con más almacenamiento"
        section={sharepoint}
        capacityKey="allocatedBytes"
        capacityLabel="Asignado"
        countKey="fileCount"
        countLabel="Archivos"
        entityLabel="sitio"
        rowName={(r) => r.name || r.siteUrl || '(sin nombre)'}
        rowDetail={(r) => [r.template, r.siteUrl || r.ownerPrincipalName].filter(Boolean).join(' · ')}
        emptyMessage="No hay sitios de SharePoint sincronizados todavía"
      />

      <SectionTitle>Teams</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Equipos" value={fmtInt(teams.teams.total)} hint={`${fmtInt(teams.teams.public)} públicos · ${fmtInt(teams.teams.private)} privados`} />
        <StatCard label="Equipos con actividad" value={fmtInt(teams.teams.active)} hint="últimos 30 días" />
        <StatCard label="Usuarios activos" value={fmtInt(teams.users.active)} hint={`de ${fmtInt(teams.users.total)} · últimos 30 días`} />
        <StatCard
          label="Mensajes"
          value={fmtInt(teams.users.messages)}
          hint={`${fmtInt(teams.users.meetings)} reuniones · ${fmtInt(teams.users.calls)} llamadas`}
        />
      </div>
      <TopBarCard
        title="Top 10 — usuarios más activos en Teams"
        description={`Mensajes, llamadas y reuniones de los últimos 30 días · informe de Microsoft del ${formatDay(teams.users.reportDate)}`}
        rows={teams.topUsers.map((u) => ({ ...u, key: u.userPrincipalName, name: u.userPrincipalName }))}
        value={(r) => r.activity}
        valueFormatter={fmtInt}
        colorOf={() => COLOR_OK}
        tooltip={(r) => `${fmtInt(r.activity)} interacciones (${fmtInt(r.teamChatMessages + r.privateChatMessages)} mensajes, ${fmtInt(r.calls)} llamadas, ${fmtInt(r.meetings)} reuniones)`}
        columns={[
          { key: 'name', label: 'Usuario', render: (r) => escapeHtml(r.name) },
          { key: 'activity', label: 'Interacciones', render: (r) => fmtInt(r.activity) },
          { key: 'teamChatMessages', label: 'En canales', render: (r) => fmtInt(r.teamChatMessages) },
          { key: 'privateChatMessages', label: 'Chat privado', render: (r) => fmtInt(r.privateChatMessages) },
          { key: 'calls', label: 'Llamadas', render: (r) => fmtInt(r.calls) },
          { key: 'meetings', label: 'Reuniones', render: (r) => fmtInt(r.meetings) },
          { key: 'lastActivityDate', label: 'Última actividad', render: (r) => formatDay(r.lastActivityDate) },
        ]}
        emptyMessage="No hay actividad de Teams sincronizada todavía"
      />
      <TopBarCard
        title="Top 10 — equipos más activos"
        description={`Equipos con más usuarios activos en los últimos 30 días · informe de Microsoft del ${formatDay(teams.teams.reportDate)}`}
        rows={teams.topTeams.map((t) => ({ ...t, key: t.name }))}
        value={(r) => r.activeUsers}
        valueFormatter={fmtInt}
        colorOf={() => COLOR_OK}
        tooltip={(r) => `${fmtInt(r.activeUsers)} usuarios activos · ${fmtInt(r.channelMessages)} mensajes de canal · ${fmtInt(r.meetingsOrganized)} reuniones`}
        columns={[
          { key: 'name', label: 'Equipo', render: (r) => nameCell(r.name, r.teamType === 'Public' ? 'Público' : r.teamType === 'Private' ? 'Privado' : '') },
          { key: 'activeUsers', label: 'Usuarios activos', render: (r) => fmtInt(r.activeUsers) },
          { key: 'channelMessages', label: 'Mensajes de canal', render: (r) => fmtInt(r.channelMessages) },
          { key: 'meetingsOrganized', label: 'Reuniones', render: (r) => fmtInt(r.meetingsOrganized) },
          { key: 'guests', label: 'Invitados', render: (r) => fmtInt(r.guests) },
          { key: 'lastActivityDate', label: 'Última actividad', render: (r) => formatDay(r.lastActivityDate) },
        ]}
        emptyMessage="Ningún equipo tuvo actividad en el período"
      />
    </>
  );
}

export function M365ServicesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setData(await m365Service.getServicesUsage());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="mb-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Servicios M365</h1>
        <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-4" />
          Compartir
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !data ? (
        <p className="mt-4 text-muted-foreground">Cargando…</p>
      ) : (
        <M365ServicesView data={data} />
      )}

      {shareOpen && <ShareDialog dashboardKey="m365-services" dashboardLabel="Servicios M365" onClose={() => setShareOpen(false)} />}
    </Layout>
  );
}
