# Active Directory — cuenta de servicio y permisos

La integración con Active Directory (LDAP/LDAPS on-prem, ver
`backend/src/integrations/activeDirectory/ldapClient.js`) usa una
**única cuenta de servicio**, configurada en "Active Directory →
Configuración" (`bindDn` + `bindPassword`), tanto para sincronizar
usuarios como para desbloquear cuentas desde "Active Directory →
Operaciones" — no hace falta una cuenta separada para cada cosa.

## 1. Permiso para sincronizar (ya necesario hoy)

La cuenta de servicio necesita, como mínimo:
- Poder autenticarse (bind) contra el controlador de dominio.
- Permiso de **lectura** sobre los objetos User dentro del `baseDn`
  configurado (por defecto, cualquier cuenta de dominio autenticada ya
  puede leer los atributos que se sincronizan — `sAMAccountName`,
  `displayName`, `whenCreated`, `lastLogonTimestamp`, `pwdLastSet`,
  `userAccountControl`, `lockoutTime` — no son atributos protegidos).

Si la sincronización ya funciona hoy, este punto no requiere ningún
cambio.

## 2. Permiso para desbloquear cuentas ("Operaciones")

Desbloquear una cuenta en AD se hace poniendo el atributo
`lockoutTime` en `0` — es literalmente lo mismo que hace "Desbloquear
cuenta" en Active Directory Users and Computers (ADUC). Esto requiere
un permiso de **escritura** que la cuenta de servicio no tiene por
default, aunque ya pueda leer.

**Permiso preciso y mínimo necesario:** *Write Property* sobre el
atributo **`lockoutTime`**, en los objetos User de la(s) OU(s) donde
viven los usuarios a gestionar. **No hace falta** delegar el extended
right completo "Reset Password" — ese permiso es para cambiar la
contraseña en sí (`unicodePwd`), algo mucho más amplio que esta app no
necesita ni pide.

### Opción A — Delegación de control (ADUC, interfaz gráfica)

1. Abrir **Usuarios y equipos de Active Directory**.
2. Click derecho sobre la OU que contiene a los usuarios → **Delegar
   control…**
3. Agregar la cuenta de servicio (la misma configurada como `bindDn`).
4. Elegir **"Crear una tarea personalizada para delegar"**.
5. Alcance: **"Solo los siguientes objetos de la carpeta"** → tildar
   **"Objetos Usuario"**.
6. Permisos: tildar **"Específico de propiedad"** y, en la lista,
   marcar únicamente **"Write lockoutTime"** (a veces aparece como
   "Escribir lockoutTime", según el idioma de la consola).
7. Finalizar el asistente — no tildar ningún otro permiso ni extended
   right.

### Opción B — `dsacls` (scripteable, desde un DC o RSAT)

```
dsacls "OU=Usuarios,DC=miempresa,DC=local" /I:S /G "MIEMPRESA\svc-ad-sync:WP;lockoutTime;user"
```

- `OU=Usuarios,DC=miempresa,DC=local` → la OU real donde están los
  usuarios a gestionar (puede repetirse para más de una OU).
- `MIEMPRESA\svc-ad-sync` → la cuenta de servicio (mismo `bindDn`
  configurado en la app).
- `WP;lockoutTime;user` → *Write Property* sobre `lockoutTime`,
  aplicado a objetos `user`.
- `/I:S` → el permiso se hereda a los objetos User descendientes de la
  OU (no a sub-OUs nuevas que se creen después, salvo que se vuelva a
  correr).

### Verificar que quedó bien aplicado

```
dsacls "OU=Usuarios,DC=miempresa,DC=local" | findstr /I "lockoutTime"
```

Debería listar una entrada `Allow` para la cuenta de servicio con
`WRITE PROPERTY` sobre `lockoutTime`.

## 3. Qué pasa si falta este permiso

"Operaciones" sigue funcionando para **ver** quién está bloqueado (eso
solo necesita el permiso de lectura del punto 1, que ya existe). El
botón **"Desbloquear"** falla con un mensaje claro —

> La cuenta de servicio no tiene permiso para desbloquear cuentas en
> AD — hay que delegarle "Write lockoutTime" sobre los usuarios.

— en vez de un error LDAP crudo (código 50,
`InsufficientAccessRightsError`). El intento fallido queda igual
registrado en Auditoría (`ad.user_unlock`, resultado `failure`).
