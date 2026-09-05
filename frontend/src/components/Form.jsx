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
 * `field.enabledWhen(values)` deshabilita el campo dinámicamente según
 * el valor actual de otros campos del mismo formulario (ej. la fecha de
 * vencimiento de soporte solo se habilita si el checkbox "cuenta con
 * soporte" está tildado) — se recalcula en cada render con el estado
 * controlado del Form, así no hace falta que la página dueña del
 * formulario levante su propio estado para lograrlo.
 *
 * @param {{
 *   fields: { name: string, label: string, type?: string, required?: boolean, value?: any, options?: {value:string,label:string}[], enabledWhen?: (values: Record<string, any>) => boolean }[],
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
  return Object.fromEntries(
    fields.map((f) => {
      if (f.type === 'checkbox-group') return [f.name, f.value ?? []];
      if (f.type === 'checkbox') return [f.name, f.value ?? false];
      return [f.name, f.value ?? ''];
    })
  );
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
      {fields.map((field) => {
        const disabled = field.enabledWhen ? !field.enabledWhen(values) : field.disabled;
        return (
          <div className="flex flex-col gap-1.5" key={field.name}>
            {field.type !== 'checkbox-group' && field.type !== 'checkbox' && (
              <Label htmlFor={`field-${field.name}`}>{field.label}</Label>
            )}
            <FieldInput
              field={disabled === field.disabled ? field : { ...field, disabled }}
              value={values[field.name]}
              onChange={(v) => setValue(field.name, v)}
            />
          </div>
        );
      })}
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
      <Select
        value={toRadix(value)}
        onValueChange={(v) => onChange(v === EMPTY_SELECT_VALUE ? '' : v)}
        disabled={field.disabled}
      >
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

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm font-normal" htmlFor={id}>
        <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(Boolean(checked))} />
        {field.label}
      </label>
    );
  }

  if (field.type === 'checkbox-group') {
    const selected = new Set(value ?? []);
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{field.label}</p>
        {/*
          contain-content (CSS `contain: layout paint`) es necesario acá:
          sin él, el modal que envuelve este formulario (Modal.jsx, con su
          propio max-height + overflow-y-auto) termina midiendo un
          scrollHeight que incluye el contenido SIN recortar de ESTA lista
          (aunque acá ya se recorta a max-h-52) — el resultado es un scroll
          fantasma en el modal que, al arrastrarlo, muestra espacio en
          blanco. `contain-content` le dice al navegador que el layout/paint
          de esta lista no se filtra hacia afuera, y elimina ese scroll.
        */}
        <div className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded-md border p-3 contain-content">
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
