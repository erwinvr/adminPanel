/**
 * hooks/useSettings.js
 *
 * Carga la configuración de una integración (`getSettings`) y expone su
 * estado de carga/error y `refresh()` — la parte que repetían las
 * páginas de configuración de AD, Microsoft 365, Veeam, PAM360 y
 * Vulnerabilidades.
 */

import { useCallback, useEffect, useState } from 'react';

export function useSettings(getSettings) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings());
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
