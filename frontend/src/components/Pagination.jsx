import { Button } from '@/components/ui/button.jsx';

/**
 * @param {{ page: number, totalPages: number, onChange: (page:number)=>void }} props
 */
export function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Anterior
      </Button>
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button type="button" variant="ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Siguiente ›
      </Button>
    </div>
  );
}
