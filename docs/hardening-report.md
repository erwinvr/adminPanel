# Informe de Hardening — Revisión de Seguridad

**Fecha de revisión:** en el marco del desarrollo de la Fase 10.
**Metodología:** revisión de código guiada por OWASP Top 10 + los
requisitos explícitos de las secciones 1-24 del proyecto, complementada
con ejecución real de la suite de tests (38/38 pasan) contra PostgreSQL.

Formato por hallazgo: Problema · Severidad · Impacto · Archivo afectado ·
Corrección · Estado.

---

## Hallazgos corregidos durante el desarrollo (no llegaron a producción)

Estos tres bugs se encontraron ejecutando la aplicación real contra
PostgreSQL (no solo leyendo el código) y ya están corregidos y cubiertos
por tests. Se documentan por transparencia.

### 1. Pool de `connect-pg-simple` incompatible con el pool de Knex
- **Severidad:** Alta (rompía el login por completo — no es un hallazgo
  de seguridad, sino de funcionalidad crítica).
- **Impacto:** Cualquier intento de login fallaba con 500. Se detectó
  ejecutando el flujo real, no habría aparecido en una revisión de solo
  lectura del código.
- **Archivo:** `backend/src/auth/session.js`
- **Corrección:** `connect-pg-simple` requiere un pool nativo de `pg`
  (usa `.query()` directamente); el pool interno de Knex usa `tarn` y no
  expone esa interfaz. Se le dio a `connect-pg-simple` su propia cadena
  de conexión (`conString`) en vez de reusar `db.client.pool`.
- **Estado:** ✅ Resuelto y verificado con tests de integración de auth.

### 2. Carga de `.env` rota al ejecutar el CLI de Knex
- **Severidad:** Media (bloqueaba migraciones/seeds en cualquier entorno
  que no fuera exactamente el directorio raíz del backend).
- **Impacto:** `npm run migrate:latest` fallaba con "variables de entorno
  requeridas" a pesar de que `.env` existía, porque el CLI de Knex
  cambia el `cwd` del proceso antes de cargar `knexfile.js`, y
  `dotenv/config` resuelve `.env` relativo al `cwd` actual.
- **Archivo:** `backend/src/config/env.js`
- **Corrección:** Se resuelve la ruta del `.env` de forma absoluta con
  `import.meta.url`, independiente del directorio de trabajo del proceso.
- **Estado:** ✅ Resuelto.

### 3. Cambio de contraseña no invalidaba otras sesiones activas
- **Severidad:** Media-Alta (hallazgo de seguridad real, no solo bug
  funcional).
- **Impacto:** Si una sesión estaba comprometida (dispositivo robado,
  cookie filtrada) y el usuario cambiaba su contraseña pensando que eso
  cerraba el acceso del atacante, la sesión robada seguía siendo válida
  indefinidamente — el cambio de contraseña no tenía ningún efecto sobre
  sesiones ya emitidas.
- **Archivo:** `backend/src/services/auth.service.js`
- **Corrección:** `changePassword` borra de la tabla `sessions` todas las
  filas de ese `user_id` excepto la sesión actual (`req.sessionID`).
  `confirmPasswordReset` (que no tiene una "sesión actual" legítima que
  preservar, ya que ocurre fuera de una sesión autenticada) borra
  **todas** las sesiones de ese usuario.
- **Estado:** ✅ Resuelto y cubierto por test dedicado
  (`tests/integration/auth.test.js` — "cambiar la contraseña invalida
  OTRAS sesiones activas").

---

## Hallazgos pendientes (requieren decisión o información externa)

### 4. Envío de correo de recuperación de contraseña sin implementación SMTP real
- **Severidad:** Media (bloquea un flujo funcional en producción, no es
  una vulnerabilidad en sí).
- **Impacto:** `utils/mailer.js` solo registra el enlace de recuperación
  en el log en desarrollo. En producción, `sendPasswordResetEmail`
  registra un error y no envía nada — el flujo de "olvidé mi
  contraseña" no es funcional hasta configurar un servidor SMTP real.
- **Archivo:** `backend/src/utils/mailer.js`
- **Corrección propuesta:** Integrar `nodemailer` (no agregado como
  dependencia todavía porque no hay host/credenciales SMTP corporativos
  provistos) apuntando al servidor SMTP interno.
- **Estado:** ⏳ Pendiente — requiere información de infraestructura de
  correo antes de poder cerrarse.

### 5. Sin rate limiting general para el resto de la API
- **Severidad:** Media.
- **Impacto:** Existen limiters dedicados en `/auth/login` y
  `/auth/password-reset/*`, pero el resto de los endpoints autenticados
  (`/users`, `/roles`, `/audit-logs`) no tienen límite de tasa —
  dependen solo de autenticación/autorización, no de protección contra
  abuso por volumen (ej. un usuario legítimo pero comprometido haciendo
  scraping del listado de usuarios).
- **Archivo:** `backend/src/app.js`
- **Corrección propuesta:** Agregar un rate limiter global (más laxo que
  el de login) montado en `app.js` antes de `/api`.
- **Estado:** ⏳ Pendiente — no crítico para ~100 usuarios internos, pero
  recomendado antes de exponer la API a redes menos confiables.

### 6. Sin invalidación de tokens de recuperación anteriores al pedir uno nuevo
- **Severidad:** Baja.
- **Impacto:** Si un usuario pide recuperación de contraseña varias
  veces, quedan múltiples tokens válidos simultáneamente (todos con 1h
  de expiración). No es explotable por un tercero (cada token sigue
  requiriendo posesión del valor aleatorio de 32 bytes), pero es un
  descuido de higiene: el primer token debería invalidar los anteriores
  del mismo usuario.
- **Archivo:** `backend/src/services/auth.service.js` (`requestPasswordReset`)
- **Corrección propuesta:** Marcar como `used_at = now()` cualquier
  token previo no usado del mismo `user_id` antes de insertar el nuevo.
- **Estado:** ⏳ Pendiente.

### 7. Metadata de auditoría en login fallido registra el identificador ingresado tal cual
- **Severidad:** Baja.
- **Impacto:** `auth.service.js` guarda `{ reason: 'user_not_found',
  identifier }` en `audit_logs.metadata`. Si un usuario escribe por
  error su contraseña en el campo de usuario (error común), quedaría
  registrada en texto plano en la auditoría — que es de solo lectura
  para roles con `audit.view`, pero de todas formas es una superficie de
  exposición de credenciales evitable.
- **Archivo:** `backend/src/services/auth.service.js`
- **Corrección propuesta:** No incluir el `identifier` crudo en el
  metadata, o truncarlo/enmascararlo.
- **Estado:** ⏳ Pendiente.

### 8. Sin pipeline de CI ni auditoría automática de dependencias
- **Severidad:** Baja (proceso, no código).
- **Impacto:** No hay `.github/workflows` ni equivalente que corra
  `npm test` y `npm audit` automáticamente en cada cambio — el proyecto
  depende de que el desarrollador corra los tests manualmente antes de
  desplegar.
- **Corrección propuesta:** Agregar un pipeline mínimo (test + audit) al
  adoptar la plataforma de control de versiones definitiva.
- **Estado:** ⏳ Pendiente — depende de qué herramienta de CI/CD usa la
  organización (no especificado en los requisitos).

---

## Verificación positiva (controles que SÍ se probaron y funcionan)

| Control | Cómo se verificó |
|---|---|
| SQL Injection | Knex parametriza todas las consultas; no hay concatenación de strings en ningún repository |
| Broken Access Control | Test de seguridad: usuario sin rol recibe 403 en `/users`, `/roles`, `/audit-logs` (12 tests) |
| Autenticación requerida | Test: todos los endpoints protegidos devuelven 401 sin sesión |
| CSRF | Test: POST autenticado sin `X-CSRF-Token` devuelve 403 |
| Mass Assignment | Test: enviar `id`, `status`, `is_system` no declarados en el schema de creación de usuario no tiene efecto |
| Contraseñas | Test: Argon2id hashea/verifica correctamente; política mínima (12 caracteres, mayúscula, minúscula, número) rechaza contraseñas débiles |
| User Enumeration | Test: mismo mensaje de error para usuario inexistente y contraseña incorrecta |
| Session Fixation | `regenerateSession()` se llama antes de escribir el usuario autenticado en la sesión (código + revisión manual) |
| Inmutabilidad de auditoría | Verificado manualmente con `psql`: `UPDATE`/`DELETE` sobre `audit_logs` es rechazado por un trigger de PostgreSQL incluso para el usuario propietario de la tabla |
| Invalidación de sesiones en cambio de contraseña | Test dedicado: sesión "B" queda inválida después de que sesión "A" cambia la contraseña |
| Manejo de errores | Test: un error no operacional nunca expone su mensaje real ni stack trace al cliente (ver `errorHandler.js`) |
| Bloqueo de cuenta | Cubierto por test dedicado (`tests/integration/accountLockout.test.js`): verifica bloqueo tras N intentos fallidos, mensaje diferenciado, y reseteo del contador tras un login exitoso |

---

## Recomendación de siguiente paso

Antes de un despliegue en producción real, priorizar en este orden:
1. Hallazgo #4 (SMTP) — sin esto, la recuperación de contraseña no
   funciona en absoluto en producción.
2. Hallazgo #5 (rate limiting general) — barato de agregar, buena
   defensa en profundidad.
3. Hallazgos #6 y #7 — bajos, pero triviales de corregir cuando se
   retome el proyecto.
