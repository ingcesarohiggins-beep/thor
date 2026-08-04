# Base de datos de THOR

1. Abre **Supabase > SQL Editor > New query**.
2. Copia y ejecuta el contenido de `migrations/202608040001_initial_thor.sql`.
3. En **Authentication > Providers**, deja habilitado Email para los usuarios de THOR.
4. En **Storage**, confirma que exista el bucket privado `thor-files`.

La primera cuenta creada en Supabase Auth se convierte en el superadministrador mediante la función `bootstrap_thor_admin(nombre, usuario)`. La aplicación incorporará ese paso al iniciar por primera vez.

## Variables locales

Duplica `.env.example` como `.env.local` y completa únicamente tus valores. El archivo local queda ignorado por Git.

No publiques `SUPABASE_SERVICE_ROLE_KEY`: esa clave permite administrar toda la base de datos.
