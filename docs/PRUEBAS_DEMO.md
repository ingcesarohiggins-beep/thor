# Pruebas DEMO de THOR

Usa esta guia antes de cargar informacion real. Los productos de prueba usan el
prefijo `DEMO-` y las pruebas operativas usan el prefijo `QA`; el limpiador
elimina ambos grupos sin afectar usuarios, sedes ni proveedores no-QA.

## 1. Preparar Supabase una sola vez

Ejecuta en Supabase SQL Editor, en este orden, las migraciones:

1. `migrations/202608040001_initial_thor.sql`
2. `migrations/202608040002_github_pages_access.sql`
3. `migrations/202608060003_complete_sale.sql`
4. `migrations/202608060006_admin_user_management.sql`
5. Todas las migraciones posteriores en orden numérico, hasta
   `migrations/202608140003_managed_users_rpc.sql`.

En **Edge Functions**, despliega `functions/create-thor-user/index.ts`. Despues
en **Authentication > URL Configuration**, agrega:

- `https://ingcesarohiggins-beep.github.io/thor/**`

Verifica que el primer superadministrador y `Almacen Central` existan antes de
continuar.

## 2. Cargar y verificar catalogo DEMO

En una consulta nueva ejecuta exactamente esto, junto con todo el contenido de
`seed_demo.sql`:

```sql
set app.thor_seed_demo = 'true';
```

Luego ejecuta `verify_demo.sql`. Antes de realizar ventas, debe mostrar:

- 30 modelos de celular y 19 accesorios.
- 49 productos DEMO en total.
- 107 celulares disponibles.
- 267 accesorios en stock.

Actualiza THOR con `Ctrl + F5` y entra por
`https://ingcesarohiggins-beep.github.io/thor/`.

## 3. Pruebas de aceptacion

1. **Superadmin:** crea un administrador DEMO y un vendedor DEMO desde
   Usuarios.
2. **Administrador:** inicia sesion con esa cuenta. Debe poder crear solo
   vendedores de su sede; no administradores.
3. **Vendedor:** confirma que puede ver inventario y completar una venta, pero
   no administrar usuarios.
4. **Inventario y camara:** en Compras registra un equipo de prueba, añade su
   IMEI y adjunta una foto desde cámara o galería. En iPhone acepta el permiso
   de cámara solo cuando el navegador lo solicite.
5. **Venta serializada:** vende un celular DEMO. Debe pasar de disponible a
   vendido y no volver a ofrecerse como disponible.
6. **Venta por cantidad:** vende dos cargadores DEMO. El stock debe disminuir
   exactamente en dos unidades.
7. **Caja y recuperacion:** abre/cierra una sesion de caja y solicita el
   cambio de contrasena para una cuenta DEMO.
8. **Bitacora:** como Superadministrador, abre **Usuarios** y verifica que la
   actividad y las acciones de catálogo, lotes y confirmaciones estén visibles.

No mezcles productos DEMO o QA con productos reales en una misma venta.

## 4. Terminar el piloto

Cuando todas las pruebas pasen, ejecuta en Supabase SQL Editor esta linea junto
con el contenido completo de `cleanup_demo.sql`:

```sql
set app.thor_cleanup_demo = 'true';
```

Despues ejecuta de nuevo `verify_demo.sql`; no deben aparecer productos DEMO o QA.
