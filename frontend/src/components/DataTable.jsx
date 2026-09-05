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
 * Pagina de a `pageSize` filas (default 10) DEL LADO DEL CLIENTE — la
 * mayoría de las páginas de la app le pasan la lista COMPLETA ya
 * traída en un solo request, así que cortarla acá adentro alcanza para
 * no mostrar listas larguísimas de una sola vez, sin tener que sumar
 * paginación real (page/pageSize) a cada endpoint del backend. La
 * página actual se ajusta sola si la lista se achica (por un alta/baja)
 * y quedó apuntando más allá del último resultado.
 *
 * Para listas que YA se traen paginadas del backend (ej. Auditoría, con
 * volumen real y un endpoint que acepta page/pageSize) pasar
 * `paginated={false}` — en ese caso `rows` ya es solo la página actual
 * y esta tabla no debe volver a cortarla.
 *
 * @param {{
 *   columns: { key: string, label: string, render?: (row:object)=>string }[],
 *   rows: object[],
 *   actions?: { label: string, onClick: (row:object)=>void, variant?: string }[],
 *   emptyMessage?: string,
 *   paginated?: boolean,
 *   pageSize?: number
 * }} props
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';
import { Pagination } from './Pagination.jsx';

// Los "variant" que ya usan las páginas ("danger", "ghost", ...) no son
// 1:1 con los variants de Button de shadcn — se traducen acá para no
// tener que tocar cada page.jsx que llama a DataTable con actions.
const ACTION_VARIANT_MAP = {
  danger: 'destructive',
  primary: 'default',
  ghost: 'outline',
};

export function DataTable({ columns, rows, actions = [], emptyMessage = 'Sin resultados', paginated = true, pageSize = 10 }) {
  const [page, setPage] = useState(1);

  const totalPages = paginated ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  // Si la página guardada quedó fuera de rango (la lista se achicó),
  // se muestra la última página válida en vez de una en blanco.
  const safePage = Math.min(page, totalPages);
  const visibleRows = paginated ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows;

  return (
    <>
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
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (actions.length > 0 ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row, i) => (
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
      {paginated && rows.length > pageSize && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />}
    </>
  );
}
