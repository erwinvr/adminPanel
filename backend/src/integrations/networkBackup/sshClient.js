/**
 * integrations/networkBackup/sshClient.js
 *
 * Cliente SSH mínimo (librería `ssh2`) para extraer la configuración de
 * un equipo de networking: se conecta con usuario/contraseña, ejecuta
 * UN comando (el que haya quedado configurado para ese dispositivo —
 * ver netbackup.service.js, por defecto `/export` porque es el comando
 * de Mikrotik RouterOS, pero cada dispositivo puede tener el suyo:
 * `show running-config` en Cisco IOS, etc.) y devuelve toda la salida
 * de texto tal cual la mandó el equipo — no se interpreta ni se
 * valida el contenido, es la config completa en crudo.
 */

import { Client } from 'ssh2';
import { AppError } from '../../errors/AppError.js';

const CONNECT_TIMEOUT_MS = 15000;

export class SshBackupError extends AppError {
  constructor(message) {
    super(message, 502, 'NETBACKUP_SSH_FAILED');
  }
}

/**
 * @param {{ host: string, port: number, username: string, password: string, command: string }} params
 * @returns {Promise<string>} salida completa del comando
 */
export function fetchDeviceConfig({ host, port, username, password, command }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    let output = '';
    let stderrOutput = '';

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      conn.end();
      if (err) reject(err);
      else resolve(result);
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          finish(new SshBackupError('No se pudo ejecutar el comando en el equipo: ' + err.message));
          return;
        }
        stream.on('data', (data) => {
          output += data.toString('utf8');
        });
        stream.stderr.on('data', (data) => {
          stderrOutput += data.toString('utf8');
        });
        stream.on('close', (code) => {
          if (code && !output.trim()) {
            finish(new SshBackupError(`El comando terminó con código ${code}: ${stderrOutput || 'sin salida'}`));
          } else {
            finish(null, output);
          }
        });
      });
    });

    conn.on('error', (err) => {
      finish(new SshBackupError('No se pudo conectar por SSH (revisá host, puerto y credenciales): ' + err.message));
    });

    conn.connect({ host, port, username, password, readyTimeout: CONNECT_TIMEOUT_MS, tryKeyboard: false });
  });
}
