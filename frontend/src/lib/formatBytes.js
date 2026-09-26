/** Bytes → "12.3 GB" / "1.5 TB" (base 1024, como lo muestran Windows y el centro de administración de M365). */
export function formatBytes(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}
