import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { authService } from '../services/auth.service.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[340px]">
        <CardHeader>
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            fields={[
              { name: 'identifier', label: 'Usuario o email', required: true },
              { name: 'password', label: 'Contraseña', type: 'password', required: true },
            ]}
            submitLabel="Ingresar"
            onSubmit={async ({ identifier, password }) => {
              const user = await login(identifier, password);
              toast.success(`Bienvenido, ${user.first_name}`);
              navigate('/dashboard');
            }}
          />
          <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => setForgotOpen(true)}>
            ¿Olvidaste tu contraseña?
          </Button>
        </CardContent>
      </Card>

      {forgotOpen && (
        <Modal title="Olvidé mi contraseña" onClose={() => setForgotOpen(false)}>
          <p className="text-sm text-muted-foreground">
            Ingresá tu usuario. Si existe, te enviaremos una contraseña temporal por correo — deberás cambiarla al
            iniciar sesión.
          </p>
          <Form
            fields={[{ name: 'username', label: 'Usuario', required: true }]}
            submitLabel="Enviar"
            onSubmit={async ({ username }) => {
              await authService.forgotPassword(username);
              toast.success('Si el usuario existe, se envió un correo con una contraseña temporal');
              setForgotOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
