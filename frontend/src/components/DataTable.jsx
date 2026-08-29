/**
 * components/DataTable.jsx
 *
 * Tabla genérica reutilizable sobre el Table de shadcn/ui. No sabe nada
 * de usuarios/roles/cajas de topología en particular — recibe columnas
 * (con su propio render por celda) y filas, y opcionalmente acciones
 * por fila.
 *
 * `col.render(row)` puede devolver HTML (badges, swatches de color,
 * etc.) — se inyecta tal cual (quien define `render` es responsable de
 * escapar lo que haga falta); una columna SIN `render` en cambio se
 * muestra como texto plano vía JSX, auto-escapado por React, para que
 * un valor con `<`/`&` (ej. el nombre de una caja) no se interprete
 * como HTML.
 *
 * @param {{
 *   columns: { key: string, label: string, render?: (row:object)=>string }[],
 *   rows: object[],
 *   actions?: { label: string, onClick: (row:object)=>void, variant?: string }[],
 *   emptyMessage?: string
 * }} props
 */
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';

// Los "variant" que ya usan las páginas ("danger", "ghost", ...) no son
// 1:1 con los variants de Button de shadcn — se traducen acá para no
// tener que tocar cada page.jsx que llama a DataTable con actions.
const ACTION_VARIANT_MAP = {
  danger: 'destructive',
  primary: 'default',
  ghost: 'outline',
};

export function DataTable({ columns, rows, actions = [], emptyMessage = 'Sin resultados' }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key}>{col.label}</TableHead>
          ))}
          {actions.length > 0 && <TableHead>Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length + (actions.length > 0 ? 1 : 0)} className="py-8 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, i) => (
            <TableRow key={row.id ?? i}>
              {columns.map((col) =>
                col.render ? (
                  <TableCell key={col.key} dangerouslySetInnerHTML={{ __html: col.render(row) }} />
                ) : (
                  <TableCell key={col.key}>{String(row[col.key] ?? '')}</TableCell>
                )
              )}
              {actions.length > 0 && (
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.label}
                        type="button"
                        size="sm"
                        variant={ACTION_VARIANT_MAP[action.variant] ?? 'outline'}
                        onClick={() => action.onClick(row)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
