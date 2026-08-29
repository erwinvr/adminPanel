import { Layout } from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Bienvenido, {user?.first_name ?? ''}</h1>
      <p className="mt-2 text-muted-foreground">Seleccione una sección en el menú lateral.</p>
      {user?.must_change_password && (
        <Alert variant="warning" className="mt-4 max-w-md">
          <AlertDescription>Su contraseña es la inicial asignada — se recomienda cambiarla.</AlertDescription>
        </Alert>
      )}
    </Layout>
  );
}
