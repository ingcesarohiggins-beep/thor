-- Verificacion de solo lectura para despues de ejecutar seed_demo.sql.
-- No modifica datos.

select
  count(*) filter (where category = 'phone') as modelos_de_celular,
  count(*) filter (where category = 'accessory') as accesorios,
  count(*) as productos_demo
from public.products
where sku like 'DEMO-%';

select
  count(*) filter (where status = 'available') as celulares_disponibles,
  count(*) as celulares_demo
from public.inventory_items
where code like 'DEMO-%';

select coalesce(sum(quantity), 0) as unidades_de_accesorios
from public.stock_balances sb
join public.products p on p.id = sb.product_id
where p.sku like 'DEMO-%' and p.category = 'accessory';

select p.brand, count(*) as modelos, sum(sb.quantity) as unidades_no_serializadas
from public.products p
left join public.stock_balances sb on sb.product_id = p.id
where p.sku like 'DEMO-%'
group by p.brand
order by p.brand;

-- Resultado esperado antes de vender: 30 modelos de celular, 19 accesorios,
-- 49 productos DEMO, 107 celulares disponibles y 267 accesorios en stock.
