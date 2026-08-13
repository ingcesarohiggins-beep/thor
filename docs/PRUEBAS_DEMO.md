# Pruebas DEMO de THOR

Usa esta guia antes de cargar informacion real. Los productos de prueba usan el
prefijo `DEMO-`; el limpiador elimina solo esos datos.

## 1. Preparar Supabase una sola vez

Ejecuta en Supabase SQL Editor, en este orden, las migraciones:

1. `migrations/202608040001_initial_thor.sql`
2. `migrations/202608040002_github_pages_access.sql`
3. `migrations/202608060003_complete_sale.sql`
4. `migrations/202608060006_admin_user_management.sql`

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
4. **Inventario:** abre **Registrar equipo**, baja hasta el ultimo campo y
   cierra el formulario. La ventana debe desplazarse sin cortar los botones.
5. **Venta serializada:** vende un celular DEMO. Debe pasar de disponible a
   vendido y no volver a ofrecerse como disponible.
6. **Venta por cantidad:** vende dos cargadores DEMO. El stock debe disminuir
   exactamente en dos unidades.
7. **Caja y recuperacion:** abre/cierra una sesion de caja y solicita el
   cambio de contrasena para una cuenta DEMO.

No mezcles productos DEMO con productos reales en una misma venta.

## 4. Terminar el piloto

Cuando todas las pruebas pasen, ejecuta en Supabase SQL Editor esta linea junto
con el contenido completo de `cleanup_demo.sql`:

```sql
set app.thor_cleanup_demo = 'true';
```

Despues ejecuta de nuevo `verify_demo.sql`; no deben aparecer productos DEMO.
