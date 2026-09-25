/**
 * hooks/useSettings.js
 *
 * Carga la configuración de una integración (`getSettings`) y expone su
 * estado de carga/error y `refresh()` — la parte que repetían las
 * páginas de configuración de AD, Microsoft 365, Veeam, PAM360 y
 * Vulnerabilidades.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useSettings(getSettings) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // "Cargando…" solo en la PRIMERA carga. Los refrescos posteriores (después de
  // guardar o sincronizar) mantienen la pantalla montada: si no, el bloque de
  // sincronización se desmontaba y perdía el resultado recién mostrado.
  const hasLoaded = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings());
      hasLoaded.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getSettings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, loading, error, refresh };
}
