# Base de datos de THOR

1. Abre **Supabase > SQL Editor > New query**.
2. Copia y ejecuta el contenido de `migrations/202608040001_initial_thor.sql`.
3. En **Authentication > Providers**, deja habilitado Email para los usuarios de THOR.
4. En **Storage**, confirma que exista el bucket privado `thor-files`.

La primera cuenta creada en Supabase Auth se convierte en el superadministrador mediante la función `bootstrap_thor_admin(nombre, usuario)`. La aplicación incorporará ese paso al iniciar por primera vez.

## Variables locales

Duplica `.env.example` como `.env.local` y completa únicamente tus valores. El archivo local queda ignorado por Git.

No publiques `SUPABASE_SERVICE_ROLE_KEY`: esa clave permite administrar toda la base de datos.

## Crear los demás usuarios

1. Ejecuta también `migrations/202608060004_user_invites.sql` en Supabase SQL Editor.
2. En THOR, ingresa con el superadministrador o administrador y abre **Usuarios**.
3. Crea la invitación con nombre, correo, sede y rol.
4. La persona abre THOR, elige **"Activa tu acceso"** y usa ese mismo correo para definir su contraseña.

El usuario recibe el rol que definiste previamente; no puede elegir permisos al registrarse.
