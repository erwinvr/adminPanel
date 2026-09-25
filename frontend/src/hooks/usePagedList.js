/**
 * hooks/usePagedList.js
 *
 * Lista paginada y con búsqueda del LADO DEL SERVIDOR — el patrón de
 * Auditoría, PAM360 y Microsoft 365: el backend devuelve una página
 * (`{ data, meta: { pagination } }`) y el navegador nunca carga la tabla
 * entera, así la pantalla se mantiene rápida con decenas de miles de
 * filas.
 *
 * - `fetchPage(params)` recibe `{ page, pageSize, ...filtros }` y devuelve
 *   `{ data, meta }` (ver httpClient.getWithMeta).
 * - `setFilter(name, value)` cambia un filtro y vuelve a la página 1;
 *   `setSearchDebounced` lo hace con 300 ms de espera (para inputs de texto).
 * - Una respuesta vieja nunca pisa a una más nueva (escribir rápido dispara
 *   varias requests que pueden volver desordenadas).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePagedList(fetchPage, { pageSize = 10, ...initialFilters } = {}) {
  const [params, setParams] = useState({ page: 1, pageSize, ...initialFilters });
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const latestRequest = useRef(0);
  const debounceRef = useRef(null);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const { data, meta: responseMeta } = await fetchRef.current(params);
      if (requestId !== latestRequest.current) return;
      setItems(data);
      setMeta(responseMeta);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err.message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const setFilter = useCallback((name, value) => {
    setParams((p) => ({ ...p, [name]: value || undefined, page: 1 }));
  }, []);

  const setSearchDebounced = useCallback(
    (value, name = 'search') => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setFilter(name, value), 300);
    },
    [setFilter]
  );

  const goToPage = useCallback((page) => setParams((p) => ({ ...p, page })), []);

  return { items, meta, loading, error, params, setFilter, setSearchDebounced, goToPage, refresh };
}
