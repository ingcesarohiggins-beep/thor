# THOR · Inventario, ventas y caja

Sistema móvil para gestionar equipos y accesorios: inventario por almacén, ventas, caja, gastos, proveedores, transferencias y devoluciones.

## Base de datos

THOR usa **Supabase (PostgreSQL + Auth + Storage)**. La estructura completa está en [supabase/migrations/202608040001_initial_thor.sql](supabase/migrations/202608040001_initial_thor.sql).

La migración crea:

- Almacén Central y futuras tiendas; cada ubicación puede vender y tiene caja.
- Equipos serializados (celular, laptop, tablet) con código, IMEI/serie y foto obligatoria.
- Accesorios por SKU/código de barras y cantidad.
- Compras por lote, proveedores, pagos y reclamos.
- Ventas con varios productos, medios de pago mixtos, firma y PDF interno.
- Transferencias con solicitud, aprobación, recepción e incidencias.
- Caja, gastos diarios, devoluciones, movimientos y auditoría.

Las tablas tienen Row Level Security activado. La `service_role` se usa únicamente en el servidor; jamás se debe copiar a GitHub, al navegador ni a un chat.

## Configuración local

1. Copia `.env.example` a `.env.local`.
2. En Supabase, abre **Settings > API** y completa la URL, la clave pública y la clave secreta de servidor.
3. Ejecuta la migración en **SQL Editor**.
4. Instala dependencias y levanta la aplicación.

```powershell
npm.cmd install
npm.cmd run dev
```

Para el primer acceso, se crea una cuenta con Email en Supabase Auth y se ejecuta la función `bootstrap_thor_admin(nombre, usuario)`. Esto inicializa el superadministrador y el **Almacén Central** una sola vez.

## Verificación

```powershell
npm.cmd run build
npm.cmd run lint
```

## Seguridad

- El repositorio es público: solo debe contener código, `.env.example` y migraciones.
- `.env.local` queda ignorado por Git.
- Las fotos, comprobantes, firmas y PDFs van al bucket privado `thor-files`.
