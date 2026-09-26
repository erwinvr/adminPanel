/**
 * pages/ReportsPage.jsx
 *
 * Sección "Reportes": elegir un reporte, filtrarlo (fechas, buscador, umbrales
 * propios) y exportar a CSV LO QUE SE VE — todas las filas que cumplen los
 * filtros activos, no solo la página en pantalla. El catálogo de reportes vive
 * en el backend (backend/src/reports/reportCatalog.js); esta página dibuja
 * cualquiera a partir de la descripción de sus columnas y filtros.
 *
 * Los reportes son consultas sobre datos ya sincronizados: reflejan el último
 * sync (ver la fecha de cada informe de Microsoft en su descripción).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { reportService } from '../services/report.service.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { formatBytes } from '@/lib/formatBytes.js';
import { formatDay } from '@/lib/formatDay.js';
import { cn } from '@/lib/utils.js';

// Excel interpreta el CSV según la configuración regional: en español espera ";" y coma decimal.
const CSV_FORMATS = [
  { value: 'std', label: 'CSV estándar (coma, punto decimal)' },
  { value: 'es', label: 'CSV para Excel en español (punto y coma, coma decimal)' },
];
const defaultCsvFormat = () => (navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'std');

const cellRenderers = {
  text: (v) => (v == null || v === '' ? '—' : escapeHtml(String(v))),
  number: (v) => (v == null ? '—' : Number(v).toLocaleString('es-BO')),
  bytes: (v) => formatBytes(v == null ? null : Number(v)),
  percent: (v) => (v == null ? '—' : `${Number(v).toFixed(1)} %`),
  date: (v) => formatDay(v),
  bool: (v) => (v == null ? '—' : v ? 'Sí' : 'No'),
};

const tableColumns = (report) => report.columns.map((c) => ({ key: c.key, label: c.label, render: (row) => cellRenderers[c.type](row[c.key]) }));

function downloadBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportViewer({ report, onReset }) {
  const defaults = Object.fromEntries(report.params.map((p) => [p.name, p.default]));
  const { items, meta, loading, error, params, setFilter, setSearchDebounced, goToPage } = usePagedList(
    (query) => reportService.run(report.key, query),
    { pageSize: 20, ...defaults }
  );
  const [csvFormat, setCsvFormat] = useState(defaultCsvFormat);
  const [exporting, setExporting] = useState(false);
  const total = meta?.pagination.total;

  async function handleExport() {
    setExporting(true);
    try {
      downloadBlob(await reportService.exportCsv(report.key, { ...params, format: csvFormat }));
      toast.success(`Reporte exportado (${total} fila${total === 1 ? '' : 's'})`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="topology-page__hint">{report.description}</p>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        {report.searchable && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Buscar</Label>
            <Input type="search" onChange={(e) => setSearchDebounced(e.target.value)} placeholder="Nombre o correo" className="w-60" />
          </div>
        )}
        {report.dateLabel && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{report.dateLabel} — desde</Label>
              <Input type="date" value={params.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{report.dateLabel} — hasta</Label>
              <Input type="date" value={params.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} className="w-40" />
            </div>
          </>
        )}
        {report.params.map((p) => (
          <div key={p.name} className="flex flex-col gap-1.5">
            <Label className="text-xs">{p.label}</Label>
            <Input
              type="number"
              min={p.min}
              max={p.max}
              defaultValue={p.default}
              onChange={(e) => setSearchDebounced(e.target.value, p.name)}
              className="w-44"
            />
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Limpiar filtros
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {loading && total === undefined ? 'Cargando…' : `${(total ?? 0).toLocaleString('es-BO')} resultado${total === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={csvFormat} onValueChange={setCsvFormat}>
            <SelectTrigger className="w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CSV_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={handleExport} disabled={exporting || !total}>
            <Download className="size-4" />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <DataTable
            columns={tableColumns(report)}
            rows={items}
            paginated={false}
            emptyMessage={loading ? 'Cargando…' : 'Ninguna fila coincide con los filtros'}
          />
          {meta && <Pagination page={meta.pagination.page} totalPages={meta.pagination.totalPages} onChange={goToPage} />}
        </>
      )}
    </div>
  );
}

export function ReportsPage() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    reportService.list().then(setReports).catch((err) => setError(err.message));
  }, []);

  const selected = reports?.find((r) => r.key === searchParams.get('report')) ?? reports?.[0];

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <p className="topology-page__hint">
        Elegí un reporte, filtralo y exportá a CSV lo que ves (todas las filas que cumplen los filtros, no solo la página
        en pantalla). Reflejan los datos del último sync.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !reports ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {reports.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setSearchParams({ report: r.key })}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                  selected?.key === r.key && 'border-primary bg-muted font-medium'
                )}
              >
                {r.title}
                <span className="block text-xs font-normal text-muted-foreground">{r.source}</span>
              </button>
            ))}
          </div>
          {selected && <ReportViewer key={`${selected.key}-${resetCount}`} report={selected} onReset={() => setResetCount((n) => n + 1)} />}
        </>
      )}
    </Layout>
  );
}
