/**
 * pages/NetBackupDevicesPage.jsx
 *
 * "Backup Networking" → Dispositivos: ABM de qué equipos de networking
 * del inventario de hardware tienen backup de configuración por SSH
 * configurado, con sus credenciales, el comando de extracción y la
 * frecuencia automática (mismo patrón que Active Directory/Microsoft
 * 365 — 0/null de frecuencia = solo manual). "Descargar ahora" dispara
 * la extracción en el momento (además del job en segundo plano) y, si
 * sale bien, descarga la config recién obtenida como archivo de texto.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { netbackupService } from '../services/netbackup.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

function frequencyLabel(minutes) {
  if (!minutes) return 'Manual';
  return SYNC_FREQUENCY_OPTIONS.find((o) => Number(o.value) === minutes)?.label ?? `Cada ${minutes} min`;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function NetBackupDevicesPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.NETBACKUP_EDIT);
  const confirm = useConfirm();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await netbackupService.listDevices());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRunNow(device) {
    try {
      const result = await netbackupService.runNow(device.id);
      toast.success(`Configuración extraída (${result.configLength} caracteres) — descargando…`);
      const run = await netbackupService.getRunConfig(result.runId);
      downloadTextFile(`${device.hardwareBrand}-${device.hardwareModel}-${new Date().toISOString().slice(0, 10)}.txt`, run.configOutput);
      refresh();
    } catch (err) {
      toast.error('No se pudo extraer la configuración: ' + err.message);
      refresh();
    }
  }

  const actions = [{ label: 'Descargar ahora', onClick: handleRunNow }];
  if (canEdit) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
          title: 'Eliminar dispositivo',
          message: `¿Eliminar el backup configurado para "${row.hardwareBrand} ${row.hardwareModel}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await netbackupService.removeDevice(row.id);
          toast.success('Dispositivo eliminado');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Dispositivos</h1>
      <p className="topology-page__hint">
        Equipos de networking del inventario con backup de configuración por SSH. La IP usada es la "IP de
        administración" cargada en Hardware.
      </p>

      <div className="my-4">{canEdit && <Button onClick={() => setFormTarget(null)}>+ Nuevo dispositivo</Button>}</div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'hardware', label: 'Equipo', render: (r) => escapeHtml(`${r.hardwareBrand} ${r.hardwareModel}`) },
            { key: 'managementIp', label: 'IP', render: (r) => escapeHtml(r.managementIp) },
            { key: 'sshUsername', label: 'Usuario SSH', render: (r) => escapeHtml(r.sshUsername) },
            { key: 'command', label: 'Comando', render: (r) => escapeHtml(r.command) },
            { key: 'syncIntervalMinutes', label: 'Frecuencia', render: (r) => frequencyLabel(r.syncIntervalMinutes) },
            { key: 'lastRunAt', label: 'Última corrida', render: (r) => formatDateTime(r.lastRunAt) },
          ]}
          rows={devices}
          actions={actions}
          emptyMessage="No hay dispositivos configurados todavía"
        />
      )}

      {formTarget !== undefined && (
        <DeviceFormModal
          existing={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined);
            refresh();
          }}
        />
      )}
    </Layout>
  );
}

function DeviceFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [hardwareOptions, setHardwareOptions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (isEdit) {
      setHardwareOptions([]);
      return;
    }
    (async () => {
      try {
        const hardware = await netbackupService.listAvailableHardware();
        if (hardware.length === 0) {
          setLoadError(
            'No hay equipos disponibles — necesitás un hardware de tipo "Networking" con IP de administración cargada y sin backup configurado ya.'
          );
          return;
        }
        setHardwareOptions(hardware.map((h) => ({ value: h.id, label: `${h.brand} ${h.model} (${h.managementIp})` })));
      } catch (err) {
        setLoadError('No se pudo cargar el listado de equipos: ' + err.message);
      }
    })();
  }, [isEdit]);

  useEffect(() => {
    if (loadError) {
      toast.error(loadError);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  if (loadError || hardwareOptions === null) return null;

  return (
    <Modal
      title={isEdit ? `Editar "${existing.hardwareBrand} ${existing.hardwareModel}"` : 'Nuevo dispositivo'}
      onClose={onClose}
    >
      <Form
        fields={[
          ...(isEdit
            ? []
            : [
                {
                  name: 'hardwareId',
                  label: 'Equipo (inventario de Hardware)',
                  type: 'select',
                  value: hardwareOptions[0]?.value ?? '',
                  options: hardwareOptions,
                  required: true,
                },
              ]),
          { name: 'sshPort', label: 'Puerto SSH', type: 'number', value: existing?.sshPort ?? 22, required: true },
          { name: 'sshUsername', label: 'Usuario SSH', value: existing?.sshUsername, required: true },
          {
            name: 'sshPassword',
            label: isEdit
              ? `Contraseña (configurada, termina en "${existing.sshPasswordPreview}" — dejar en blanco para mantenerla)`
              : 'Contraseña',
            type: 'password',
            required: !isEdit,
          },
          {
            name: 'command',
            label: 'Comando de extracción (ej. /export para Mikrotik, "show running-config" para Cisco)',
            value: existing?.command ?? '/export',
            required: true,
          },
          {
            name: 'syncIntervalMinutes',
            label: 'Frecuencia de backup automático',
            type: 'select',
            value: String(existing?.syncIntervalMinutes ?? 0),
            options: SYNC_FREQUENCY_OPTIONS,
            required: true,
          },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear dispositivo'}
        onSubmit={async (values) => {
          const payload = {
            sshPort: Number(values.sshPort),
            sshUsername: values.sshUsername.trim(),
            command: values.command.trim(),
            syncIntervalMinutes: Number(values.syncIntervalMinutes),
          };
          if (values.sshPassword) payload.sshPassword = values.sshPassword;

          if (isEdit) {
            await netbackupService.updateDevice(existing.id, payload);
            toast.success('Dispositivo actualizado');
          } else {
            await netbackupService.createDevice({ ...payload, hardwareId: values.hardwareId, sshPassword: values.sshPassword });
            toast.success('Dispositivo creado');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
