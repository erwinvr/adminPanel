export const COMPLIANCE_MODE_OPTIONS = [
  { value: 'text', label: 'Texto simple' },
  { value: 'regex', label: 'Expresión regular' },
];

export const COMPLIANCE_MATCH_TYPE_OPTIONS = [
  { value: 'must_contain', label: 'Debe contener' },
  { value: 'must_not_contain', label: 'No debe contener' },
];

export const COMPLIANCE_SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Advertencia' },
  { value: 'critical', label: 'Crítica' },
];

export function complianceSeverityLabel(value) {
  return COMPLIANCE_SEVERITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function complianceSeverityBadgeVariant(severity) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'muted';
}

export function complianceMatchTypeLabel(value) {
  return COMPLIANCE_MATCH_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
