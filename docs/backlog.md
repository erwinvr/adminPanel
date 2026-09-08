# Backlog

Funcionalidades y correcciones identificadas durante el desarrollo,
que quedaron deliberadamente fuera de alcance de la tarea puntual que
las hizo evidentes. No es un compromiso de trabajo futuro — es el
registro de "esto lo vi, no lo tocaba porque no era lo que se pedía".

## Seguridad

- **Las contraseñas temporales de "olvidé mi contraseña" no
  expiran.** A diferencia del flujo de reset por enlace (token con 1
  hora de vigencia), la contraseña temporal generada por
  `auth.service.js#forgotPassword` queda como la contraseña real del
  usuario sin límite de tiempo hasta que la cambie — si nunca inicia
  sesión, sigue siendo válida indefinidamente. Evaluar agregar una
  expiración (ej. invalidar y requerir generar una nueva si pasan N
  horas sin usarla).
- **Flujo de reset por enlace sin usar.** `password_reset_tokens` +
  `authService.requestPasswordReset`/`confirmPasswordReset` existen y
  funcionan (se los actualizó para usar SMTP real), pero el frontend
  nunca los expone — quedaron reemplazados por el flujo de contraseña
  temporal. Decidir: eliminarlos (menos superficie de código sin
  ejercitar) o exponerlos como alternativa en el login.
- **Ruido de auditoría en otros syncs automáticos.** Se sacó
  `netbackup.*` de la página de Auditoría por generar cientos de
  eventos redundantes con Historial/Bitácora. Los jobs automáticos de
  AD, Microsoft 365, Veeam y Vulnerabilidades (`ad.sync`, `m365.sync`,
  `backups.sync`, `vuln.sync`) corren con la misma frecuencia
  recurrente y podrían estar generando el mismo tipo de ruido — no se
  revisó puntualmente cuánto volumen representan hoy.

## Deuda técnica / consistencia arquitectónica

- **`driver` (transporte) confundido con "dialecto de fabricante".**
  `configNormalizer.js` y las reglas de `compliance_rules.driver`
  asumen que cada driver de Backup Networking equivale a UN
  fabricante (ej. `raw_ssh` = Mikrotik) — cierto hoy, pero `raw_ssh`
  es genérico por diseño ("SSH + comando", ver su propio docstring).
  El día que se conecte un segundo equipo `raw_ssh` de otra marca, la
  normalización de hash y las reglas de compliance específicas de
  Mikrotik dejan de aplicarle sin ningún error visible (el `replace()`
  simplemente no matchea). Requeriría separar un campo "plataforma/
  dialecto" del `driver` de transporte — cambio de esquema, no
  trivial, señalado pero no implementado.
- **Catálogo de drivers duplicado en 5 lugares** (`netbackup-agent/app/main.py`,
  `netbackup.validator.js`, `compliance.validator.js`, dos migraciones
  con `CHECK (driver IN (...))`, `netbackupDrivers.js` del frontend).
  Con 3 drivers no amerita una refactorización — pero agregar un 4to
  fabricante hoy exige tocar los 5 a mano, sin ningún error si te
  olvidás de alguno.
- **`DataTable` no soporta deshabilitar una acción condicionalmente.**
  Se descartó a propósito al construir Backup Networking (evitar doble
  clic en "Descargar ahora" mientras corre) para no extender un
  componente compartido por una necesidad menor — pero la necesidad
  real sigue estando si se quiere UX más prolija en botones de acción
  de larga duración.
- **`checkbox-group` de `Form.jsx` tiene el mismo bug que se corrigió
  en `checkbox`.** El fix de `enabledWhen`/`disabled` se aplicó solo al
  tipo `checkbox` (el que estaba bloqueando "Incluir en Topología de
  Red"); `checkbox-group` nunca lee `field.disabled` tampoco — hoy no
  lo nota nadie porque ninguna página usa `enabledWhen` sobre un
  `checkbox-group`, pero el bug está igual de latente.

## Testing

- **Ninguna funcionalidad de esta sesión tiene tests automatizados
  (vitest).** SMTP, Backup Networking multi-driver + microservicio,
  Compliance, Topología de Red, AD Operaciones — toda la verificación
  fue manual (Playwright contra el entorno real, con datos
  desechables) y no queda como regresión automática para el futuro.
  La suite existente en `backend/tests/` (unit/integración/seguridad)
  no se tocó ni se extendió en ningún momento.

## Verificación pendiente contra entornos reales

- **Drivers `napalm_ios`/`fortios_api`** (Cisco/FortiGate) — parsers
  de interfaz, rutas y extracción vía NAPALM/API REST escritos según
  formato documentado, verificados con datos fabricados. Nunca
  probados contra un equipo real de ninguna de las dos marcas.
- **SMTP** — el flujo completo (guardar config, error de conexión) se
  verificó; nunca se confirmó un envío exitoso real (no hay servidor
  SMTP de prueba disponible en este entorno).
- **AD Operaciones (desbloqueo)** — el camino de error (LDAP
  inalcanzable) se verificó de punta a punta; el camino de éxito
  (LDAP MODIFY contra un AD real, con el permiso `Write lockoutTime`
  ya delegado) no se pudo probar por no haber un Active Directory
  real accesible desde este entorno.

## Funcionalidad nueva (candidatos, no comprometidos)

- **AD Compliance** — se llegó a diseñar (reglas de política de
  dominio como `minPwdLength`, más reglas por usuario a partir de
  banderas de `userAccountControl` ya sincronizadas: sin vencimiento
  de contraseña, sin contraseña requerida, contraseña/login
  vencidos) pero no se implementó — quedó pausado para priorizar
  Topología de Red y AD Operaciones.
- **Topología de Red — descubrimiento real (LLDP/CDP).** La
  heurística actual (subredes IP compartidas + corroboración por
  tabla de ruteo) fue una elección explícita del usuario sobre
  agregar una consulta de vecinos nueva. Sumar LLDP/CDP como fuente
  adicional (o alternativa) seguiría siendo válido si en algún
  momento se quiere una topología L2 exacta en vez de inferida.
- **Editor de permisos de roles no escala visualmente.** El catálogo
  de permisos creció bastante esta sesión (SMTP, Netbackup,
  Compliance, Topología de Red, AD Operaciones — todos con `_VIEW`/
  `_EDIT` o similar). El modal de edición de permisos de un rol los
  lista todos juntos, sin agrupar por módulo ni colapsar — vale la
  pena revisar la UX a medida que el catálogo sigue creciendo.

## UX menor

- **El campo "Puerto" en Dispositivos (Backup Networking) no se
  ajusta según el driver elegido** — siempre parte de `22` por
  default, aunque FortiGate normalmente use `443` (HTTPS). El usuario
  puede cambiarlo a mano, pero es fácil pasarlo por alto al crear un
  dispositivo FortiGate por primera vez.
