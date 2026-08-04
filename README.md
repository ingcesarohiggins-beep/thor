# THOR · Inventario, ventas y caja

Sistema móvil para equipos y accesorios: inventario por almacén, ventas, caja, gastos, proveedores, transferencias y devoluciones.

## Base de datos

THOR usa Supabase (PostgreSQL, Auth y Storage) y se publica como aplicación estática en GitHub Pages.

1. La estructura de la base está en `supabase/migrations/202608040001_initial_thor.sql`.
2. Para el acceso desde GitHub Pages, ejecuta después `supabase/migrations/202608040002_github_pages_access.sql` en Supabase > SQL Editor.

Las migraciones crean almacenes, usuarios, equipos con IMEI y foto, accesorios, precios, proveedores, lotes, caja, gastos, ventas, transferencias, devoluciones y auditoría.

## GitHub Pages

1. En GitHub abre **Settings > Pages > Build and deployment** y selecciona **GitHub Actions**.
2. Abre **Settings > Secrets and variables > Actions > Variables** y crea:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Cada cambio enviado a `main` actualiza automáticamente:
   `https://ingcesarohiggins-beep.github.io/thor/`

La clave Publishable/Anon es la que usa la aplicación. No se necesita ni se debe subir la clave `service_role` a GitHub.

## Desarrollo local

```powershell
npm.cmd install
npm.cmd run dev
```

Para el primer acceso se crea una cuenta de correo en Supabase Auth. Esa cuenta inicializa el superadministrador y el **Almacén Central**.
