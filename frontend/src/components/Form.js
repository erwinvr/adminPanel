/**
 * components/Form.js
 *
 * Constructor declarativo de formularios simples. La validación aquí es
 * SOLO de UX (campos requeridos, tipos de input) — la validación real
 * y obligatoria ocurre siempre en el backend (Joi), como se documenta
 * en todo el proyecto.
 *
 * @param {{
 *   fields: { name: string, label: string, type?: string, required?: boolean, value?: any, options?: {value:string,label:string}[] }[],
 *   submitLabel: string,
 *   onSubmit: (values: Record<string, any>) => Promise<void> | void
 * }} params
 * @returns {HTMLFormElement}
 */
export function Form({ fields, submitLabel, onSubmit }) {
  const form = document.createElement('form');
  form.className = 'form';

  const inputs = {};

  fields.forEach((field) => {
    const group = document.createElement('div');
    group.className = 'form__group';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.setAttribute('for', `field-${field.name}`);
    group.appendChild(label);

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      (field.options ?? []).forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        input.appendChild(optionEl);
      });
    } else if (field.type === 'checkbox-group') {
      input = document.createElement('div');
      input.className = 'form__checkbox-group';
      (field.options ?? []).forEach((opt) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'form__checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = opt.value;
        checkbox.checked = (field.value ?? []).includes(opt.value);
        wrapper.appendChild(checkbox);
        wrapper.append(` ${opt.label}`);
        input.appendChild(wrapper);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type ?? 'text';
      if (field.value !== undefined) input.value = field.value;
    }

    input.id = `field-${field.name}`;
    if (field.required && field.type !== 'checkbox-group') input.required = true;
    if (field.type !== 'checkbox-group' && field.value !== undefined) input.value = field.value;

    group.appendChild(input);
    form.appendChild(group);
    inputs[field.name] = { el: input, type: field.type };
  });

  const errorBox = document.createElement('div');
  errorBox.className = 'form__error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = submitLabel;
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorBox.hidden = true;

    const values = {};
    for (const [name, { el, type }] of Object.entries(inputs)) {
      if (type === 'checkbox-group') {
        values[name] = Array.from(el.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
      } else {
        values[name] = el.value;
      }
    }

    submitBtn.disabled = true;
    try {
      await onSubmit(values);
    } catch (err) {
      errorBox.textContent = err.message ?? 'Ocurrió un error';
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  return form;
}
