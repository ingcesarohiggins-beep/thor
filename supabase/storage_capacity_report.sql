-- REPORTE DE CAPACIDAD DE FOTOS (solo lectura).
-- Ejecutar en Supabase > SQL Editor. No modifica datos ni archivos.
-- En el plan Free, Supabase incluye 1 GB de Storage. Verifica tu plan antes de
-- tomar este valor como límite contractual: https://supabase.com/pricing

with files as (
  select
    bucket_id,
    count(*) as archivos,
    coalesce(sum((metadata ->> 'size')::bigint), 0) as bytes_usados
  from storage.objects
  group by bucket_id
), totals as (
  select
    coalesce(sum(archivos), 0) as archivos,
    coalesce(sum(bytes_usados), 0) as bytes_usados
  from files
)
select
  coalesce(files.bucket_id, 'TOTAL') as bucket,
  coalesce(files.archivos, totals.archivos) as archivos,
  round(coalesce(files.bytes_usados, totals.bytes_usados) / 1024.0 / 1024.0, 2) as usados_mb,
  round(greatest(0, 1024 * 1024 * 1024 - coalesce(files.bytes_usados, totals.bytes_usados)) / 1024.0 / 1024.0, 2) as libres_mb_estimados_en_free,
  floor(greatest(0, 1024 * 1024 * 1024 - coalesce(files.bytes_usados, totals.bytes_usados)) / (350 * 1024.0)) as fotos_350kb_estimadas,
  floor(greatest(0, 1024 * 1024 * 1024 - coalesce(files.bytes_usados, totals.bytes_usados)) / (500 * 1024.0)) as fotos_500kb_estimadas
from files
cross join totals
union all
select
  'TOTAL',
  archivos,
  round(bytes_usados / 1024.0 / 1024.0, 2),
  round(greatest(0, 1024 * 1024 * 1024 - bytes_usados) / 1024.0 / 1024.0, 2),
  floor(greatest(0, 1024 * 1024 * 1024 - bytes_usados) / (350 * 1024.0)),
  floor(greatest(0, 1024 * 1024 * 1024 - bytes_usados) / (500 * 1024.0))
from totals
order by bucket = 'TOTAL', bucket;

-- Política recomendada para fotos individuales de equipos:
-- - WebP o JPEG, lado mayor 1,200 px.
-- - Objetivo: 350–500 KB por foto; tope de carga: 1 MB.
-- - Cada celular debe conservar su propia foto en inventory_items.photo_path;
--   la factura/guía se conserva aparte en receipt_lots.receipt_photo_path.
