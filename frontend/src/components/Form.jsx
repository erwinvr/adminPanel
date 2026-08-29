/**
 * components/Form.jsx
 *
 * Constructor declarativo de formularios simples — misma API que
 * antes (fields/submitLabel/onSubmit) para que las páginas no tengan
 * que cambiar cómo lo llaman. La validación acá es SOLO de UX (campos
 * requeridos, tipos de input) — la validación real y obligatoria
 * ocurre siempre en el backend (Joi).
 *
 * A diferencia de la versión anterior (inputs no controlados, leídos
 * por ref al enviar), acá todo es estado controlado (`values`) —
 * necesario porque el Select y el Checkbox de shadcn/ui (Radix) no son
 * <select>/<input> nativos, no se pueden leer con `.value` por ref.
 *
 * @param {{
 *   fields: { name: string, label: string, type?: string, required?: boolean, value?: any, options?: {value:string,label:string}[] }[],
 *   submitLabel: string,
 *   onSubmit: (values: Record<string, any>) => Promise<void> | void
 * }} props
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';

// Radix <Select.Item> no admite value="" (lo reserva para "sin
// selección" interno) — varios selects de la app sí usan '' para
// representar "ninguno"/"todas las categorías". Se traduce acá para no
// tener que cambiar la forma en que cada página arma sus opciones.
const EMPTY_SELECT_VALUE = '__empty__';

function initialValues(fields) {
  return Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox-group' ? (f.value ?? []) : (f.value ?? '')]));
}

export function Form({ fields, submitLabel, onSubmit }) {
  const [values, setValues] = useState(() => initialValues(fields));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function setValue(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message ?? 'Ocurrió un error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <div className="flex flex-col gap-1.5" key={field.name}>
          {field.type !== 'checkbox-group' && <Label htmlFor={`field-${field.name}`}>{field.label}</Label>}
          <FieldInput field={field} value={values[field.name]} onChange={(v) => setValue(field.name, v)} />
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}

function FieldInput({ field, value, onChange }) {
  const id = `field-${field.name}`;

  if (field.type === 'select') {
    const toRadix = (v) => (v === '' || v === undefined || v === null ? EMPTY_SELECT_VALUE : String(v));
    return (
      <Select value={toRadix(value)} onValueChange={(v) => onChange(v === EMPTY_SELECT_VALUE ? '' : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={toRadix(opt.value)} value={toRadix(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'checkbox-group') {
    const selected = new Set(value ?? []);
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{field.label}</p>
        <div className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded-md border p-3">
          {(field.options ?? []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={selected.has(opt.value)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(opt.value);
                  else next.delete(opt.value);
                  onChange([...next]);
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Input
      id={id}
      type={field.type ?? 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      disabled={field.disabled}
    />
  );
}
