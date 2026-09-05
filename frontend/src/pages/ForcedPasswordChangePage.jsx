/**
 * pages/ForcedPasswordChangePage.jsx
 *
 * Se renderiza en vez de las rutas normales cuando `user.must_change_password`
 * es true (ver App.jsx) — pasa tanto tras "olvidé mi contraseña" (la
 * contraseña temporal es la "actual" acá) como para cualquier otro
 * usuario al que un admin le fuerce el cambio. Reusa el endpoint ya
 * existente POST /auth/change-password, sin cambios de backend.
 */

import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import { Form } from '../components/Form.jsx';
import { authService } from '../services/auth.service.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';

export function ForcedPasswordChangePage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle className="text-xl">Cambio de contraseña obligatorio</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Tenés que definir una nueva contraseña antes de continuar.
          </p>
          <Form
            fields={[
              { name: 'currentPassword', label: 'Contraseña actual (temporal)', type: 'password', required: true },
              { name: 'newPassword', label: 'Nueva contraseña (mín. 12 caracteres)', type: 'password', required: true },
            ]}
            submitLabel="Cambiar contraseña"
            onSubmit={async ({ currentPassword, newPassword }) => {
              await authService.changePassword(currentPassword, newPassword);
              toast.success('Contraseña actualizada');
              await refresh();
              navigate('/dashboard');
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
