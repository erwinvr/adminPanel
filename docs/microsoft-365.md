# Microsoft 365 — permisos de la app de Azure AD y estado de MFA

La integración usa una app registrada en Azure AD (Entra ID) con
permisos de **aplicación** de Microsoft Graph y consentimiento de
administrador (`backend/src/integrations/microsoft365/graphClient.js`).

## Permisos

| Permiso de aplicación | Para qué | Licencia |
|---|---|---|
| `Organization.Read.All` | Licencias compradas (SKUs) | — |
| `User.Read.All` | Usuarios y licencias asignadas | — |
| `UserAuthenticationMethod.Read.All` | **Estado de MFA** (métodos registrados por usuario) | **Ninguna adicional** |
| `AuditLog.Read.All` | Estado de MFA vía reporte de registro | Entra ID P1/P2 |

Después de agregar un permiso hay que **otorgar el consentimiento de
administrador** (Azure Portal → App registrations → API permissions →
"Grant admin consent").

## Cómo se obtiene el MFA

El sync intenta dos caminos, en este orden:

1. **Reporte de registro** (`/reports/authenticationMethods/userRegistrationDetails`,
   `AuditLog.Read.All`): rápido y trae además "puede autenticar con MFA".
   **Microsoft lo restringe a tenants con Entra ID P1/P2**; en otro caso
   responde *"Tenant is not a B2C tenant and doesn't have premium license"*.
2. **Métodos por usuario** (`/users/{id}/authentication/methods`,
   `UserAuthenticationMethod.Read.All`): **sin licencia adicional**. Se
   consulta cada usuario habilitado en lotes de 20 (`$batch`) con
   reintento ante throttling.

Sin licencia P1/P2 se usa automáticamente el camino 2; solo hace falta
agregar `UserAuthenticationMethod.Read.All`.

### El camino 2 es lento y por eso es incremental y en segundo plano

Microsoft limita la tasa de esta API a unos **2-3 usuarios por segundo**
sostenidos (mucho más bajo que el resto de Graph): leer el MFA de 3.300
usuarios lleva ~20 minutos por más que se optimice. Por eso:

- **Incremental**: cada sincronización solo consulta a los usuarios cuyo MFA
  **nunca se leyó o tiene más de 12 horas** (los más antiguos primero); el
  resto conserva el dato anterior. Con la lista al día, una sincronización
  tarda segundos.
- **Con tope de tiempo**: la lectura de MFA usa como máximo ~10 minutos por
  sincronización. Si quedan usuarios sin revisar, se completan en las
  siguientes (el resultado lo avisa: *"MFA actualizado para X de Y…"*). La
  primera sincronización de un tenant grande puede necesitar 2-3 corridas.
- **En segundo plano**: "Sincronizar ahora" no espera la respuesta (una
  petición HTTP no puede durar minutos: nginx la corta y el navegador
  mostraba *"Respuesta del servidor no válida"*). El botón muestra el avance
  ("leyendo MFA: 1.200 de 3.284 usuarios"), sigue funcionando si se recarga
  la página y no se puede lanzar dos veces a la vez (tampoco se pisa con la
  sincronización automática). El estado vive en memoria: si el backend se
  reinicia a mitad de una corrida se pierde el avance (el resultado igual
  queda en Auditoría → Microsoft 365).

## Qué significa "MFA registrado" (camino 2)

El usuario tiene registrado al menos un método de segundo factor:
Microsoft Authenticator, teléfono, app TOTP/token OATH, FIDO2, Windows
Hello for Business o credencial de plataforma. **No cuentan**: contraseña,
correo alternativo (solo sirve para recuperar la contraseña) ni Temporary
Access Pass.

Limitaciones respecto del reporte premium:

- Informa **registro**, no si el tenant **exige** MFA (Acceso condicional /
  security defaults).
- No calcula "puede autenticar con MFA" (depende de la política de
  métodos); esa columna se oculta cuando no hay datos.
- Las **cuentas deshabilitadas no se consultan** (no pueden iniciar
  sesión) y muestran "Sin datos".
- En tenants grandes el sync tarda más (miles de usuarios = cientos de
  lotes). nginx tiene `proxy_read_timeout 300s` en `/api/` para esto.

## Si aparece una advertencia de MFA

La advertencia detalla el resultado de cada camino. Si dice `403 ... falta
el permiso "UserAuthenticationMethod.Read.All"`, agregar ese permiso y
otorgar el consentimiento; el siguiente sync lo toma.

## Filtro de dominios

En *Microsoft 365 → Configuración* se puede indicar qué **dominios**
admitir en la sincronización (separados por coma, ej.
`nacionalvida.com.bo, conecta.com.bo`). Los usuarios de cualquier otro
dominio se **ignoran**: no se guardan, no aparecen en "Usuarios
sincronizados" ni en "MFA de usuarios", y no se les consulta el MFA. Con
la lista **vacía** se admiten todos (comportamiento anterior).

- El dominio es el del **userPrincipalName** (lo que sigue a la última
  `@`). Un **invitado externo** tiene un UPN como
  `persona_empresa.com#EXT#@tenant.onmicrosoft.com`, así que su dominio es el
  del tenant (`tenant.onmicrosoft.com`), no el de su empresa.
- La configuración muestra los **dominios detectados** en el último sync con
  su cantidad de usuarios (sobre todo el tenant, antes de filtrar) y si cada
  uno se admite o se ignora, para poder elegir. Hay que sincronizar una vez
  para que aparezcan.
- El filtro rige desde la **próxima sincronización**; los usuarios de
  dominios que dejaron de admitirse desaparecen de los datos locales en ese
  sync (cada sync reemplaza la foto completa).
- Las **licencias compradas** (SKUs y unidades consumidas) son del tenant
  completo y no se filtran: las unidades consumidas siguen contando también
  a los usuarios ignorados.
