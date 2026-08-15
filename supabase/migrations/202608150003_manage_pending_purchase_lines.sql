-- Permite corregir un lote pendiente: se puede quitar una línea antes de que
-- genere stock, pagos o movimientos de caja.
create or replace function public.remove_purchase_lot_line(p_lot_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_line public.receipt_lot_lines%rowtype;
  v_lot public.receipt_lots%rowtype;
begin
  select id, role into v_user_id, v_role
  from public.app_users
  where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then
    raise exception 'Solo un Administrador o Superadministrador puede corregir un lote.';
  end if;

  select * into v_line
  from public.receipt_lot_lines
  where id = p_lot_line_id
  for update;
  if not found then
    raise exception 'No se encontró la línea del lote.';
  end if;

  select * into v_lot
  from public.receipt_lots
  where id = v_line.receipt_lot_id
  for update;
  if v_lot.status <> 'pending' then
    raise exception 'Solo se pueden modificar lotes pendientes.';
  end if;

  delete from public.receipt_lot_lines where id = p_lot_line_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    v_user_id,
    'purchase.line_removed',
    'receipt_lot',
    v_lot.id,
    jsonb_build_object('line_id', p_lot_line_id, 'quantity', v_line.quantity)
  );
  return jsonb_build_object(
    'lot_id', v_lot.id,
    'photo_paths', coalesce(v_line.item_photo_paths, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.remove_purchase_lot_line(uuid) to authenticated;
