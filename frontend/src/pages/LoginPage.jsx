import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { Form } from '../components/Form.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

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
        </CardContent>
      </Card>
    </div>
  );
}
