import { auth } from '../auth/session.js';
import { navigate } from '../router/router.js';
import { Form } from '../components/Form.js';
import { toast } from '../components/Toast.js';

export function renderLoginPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-page';

  const card = document.createElement('div');
  card.className = 'auth-page__card';
  card.innerHTML = '<h1>Iniciar sesión</h1>';

  const form = Form({
    fields: [
      { name: 'identifier', label: 'Usuario o email', required: true },
      { name: 'password', label: 'Contraseña', type: 'password', required: true },
    ],
    submitLabel: 'Ingresar',
    onSubmit: async ({ identifier, password }) => {
      const user = await auth.login(identifier, password);
      toast.success(`Bienvenido, ${user.first_name}`);
      navigate('/dashboard');
    },
  });

  card.appendChild(form);
  wrapper.appendChild(card);
  root.appendChild(wrapper);
}
