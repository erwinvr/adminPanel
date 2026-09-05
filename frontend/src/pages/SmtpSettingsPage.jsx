/**
 * pages/SmtpSettingsPage.jsx
 *
 * Configuración del servidor SMTP saliente — usado para "olvidé mi
 * contraseña" (ver LoginPage) y, si algún día se activa, el flujo de
 * recuperación por enlace ya existente. Mismo patrón que
 * VulnSettingsPage, pero acá el disparador es "enviar correo de
 * prueba" a una dirección a elección, no "sincronizar".
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { smtpService } from '../services/smtp.service.js';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function SmtpSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await smtpService.getSettings());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await smtpService.sendTestEmail(testTo);
      setTestResult({ ok: true });
      toast.success('Correo de prueba enviado');
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Configuración — SMTP</h1>
      <p className="topology-page__hint">
        Servidor de envío de correo usado por "olvidé mi contraseña" en la pantalla de inicio de sesión.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="max-w-lg">
          <Form
            key={settings.hasPassword ? 'with-password' : 'no-password'}
            fields={[
              { name: 'host', label: 'Servidor (host)', value: settings.host, required: true },
              { name: 'port', label: 'Puerto', type: 'number', value: settings.port, required: true },
              { name: 'secure', label: 'Conexión segura (TLS/SSL directo)', type: 'checkbox', value: settings.secure },
              { name: 'username', label: 'Usuario', value: settings.username },
              {
                name: 'password',
                label: settings.hasPassword
                  ? `Contraseña (configurada, termina en "${settings.passwordPreview}" — dejar en blanco para mantenerla)`
                  : 'Contraseña',
                type: 'password',
              },
              { name: 'fromEmail', label: 'Correo remitente', value: settings.fromEmail, required: true },
              { name: 'fromName', label: 'Nombre del remitente', value: settings.fromName },
            ]}
            submitLabel="Guardar configuración"
            onSubmit={async (values) => {
              await smtpService.saveSettings({ ...values, port: Number(values.port) });
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          <h2 className="mt-8 text-base font-semibold">Enviar correo de prueba</h2>
          <p className="topology-page__hint">Verificá que el servidor configurado realmente entrega correo.</p>

          <div className="flex max-w-sm gap-2">
            <Input
              type="email"
              placeholder="destinatario@empresa.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button onClick={handleSendTest} disabled={testing || !testTo}>
              {testing ? 'Enviando…' : 'Enviar prueba'}
            </Button>
          </div>

          {testResult && (
            <Alert className="mt-4" variant={testResult.ok ? 'success' : 'destructive'}>
              <AlertDescription>
                {testResult.ok ? 'Correo de prueba enviado correctamente.' : `Falló el envío: ${testResult.message}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}
