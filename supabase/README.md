# Base de datos de THOR

1. Abre **Supabase > SQL Editor > New query**.
2. Copia y ejecuta el contenido de `migrations/202608040001_initial_thor.sql`.
3. En **Authentication > Providers**, deja habilitado Email para los usuarios de THOR.
4. En **Storage**, confirma que exista el bucket privado `thor-files`.

La primera cuenta creada en Supabase Auth se convierte en el superadministrador mediante la función `bootstrap_thor_admin(nombre, usuario)`. La aplicación incorporará ese paso al iniciar por primera vez.

## Variables locales

Duplica `.env.example` como `.env.local` y completa únicamente tus valores. El archivo local queda ignorado por Git.

No publiques `SUPABASE_SERVICE_ROLE_KEY`: esa clave permite administrar toda la base de datos.

## Crear los demas usuarios

1. Ejecuta `migrations/202608060006_admin_user_management.sql` en Supabase SQL Editor.
2. En Supabase CLI despliega la funcion: `supabase functions deploy create-thor-user`.
3. En THOR, el Superadmin crea vendedores o administradores desde **Usuarios**. Un Administrador solo crea vendedores.

La funcion usa la clave segura de Supabase en el servidor; nunca la copies a las variables publicas de THOR.

## Recuperacion de contrasena

En Supabase > Authentication > URL Configuration, agrega la URL publica de THOR en **Redirect URLs**. Luego cada usuario puede usar **Olvide mi contrasena** desde la pantalla de inicio de sesion.
