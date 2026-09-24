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
