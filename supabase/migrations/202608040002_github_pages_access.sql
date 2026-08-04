-- THOR en GitHub Pages: acceso directo y seguro desde la aplicación estática.
-- Ejecutar en Supabase > SQL Editor después de la migración inicial.

create or replace function public.thor_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where auth_user_id = auth.uid() and active = true
  );
$$;

create or replace function public.thor_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where auth_user_id = auth.uid()
      and active = true
      and role in ('superadmin', 'admin')
  );
$$;

grant execute on function public.thor_is_member() to authenticated;
grant execute on function public.thor_is_admin() to authenticated;

-- Lectura operativa para usuarios THOR autenticados. Las operaciones que
-- cambian stock, precios, usuarios o caja permanecen reservadas a admin.
create policy "thor members read locations" on public.locations for select to authenticated using (public.thor_is_member());
create policy "thor admins write locations" on public.locations for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read own profile" on public.app_users for select to authenticated using (auth_user_id = auth.uid() or public.thor_is_admin());
create policy "thor admins manage users" on public.app_users for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read suppliers" on public.suppliers for select to authenticated using (public.thor_is_member());
create policy "thor admins manage suppliers" on public.suppliers for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read products" on public.products for select to authenticated using (public.thor_is_member());
create policy "thor admins manage products" on public.products for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read serial inventory" on public.inventory_items for select to authenticated using (public.thor_is_member());
create policy "thor admins manage serial inventory" on public.inventory_items for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read balances" on public.stock_balances for select to authenticated using (public.thor_is_member());
create policy "thor admins manage balances" on public.stock_balances for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read prices" on public.product_prices for select to authenticated using (public.thor_is_member());
create policy "thor admins manage prices" on public.product_prices for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read sales" on public.sales for select to authenticated using (public.thor_is_member());
create policy "thor members create sales" on public.sales for insert to authenticated with check (public.thor_is_member());
create policy "thor admins update sales" on public.sales for update to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read sale lines" on public.sale_lines for select to authenticated using (public.thor_is_member());
create policy "thor members create sale lines" on public.sale_lines for insert to authenticated with check (public.thor_is_member());
create policy "thor members read sale payments" on public.sale_payments for select to authenticated using (public.thor_is_member());
create policy "thor members create sale payments" on public.sale_payments for insert to authenticated with check (public.thor_is_member());
create policy "thor members read cash" on public.cash_sessions for select to authenticated using (public.thor_is_member());
create policy "thor admins manage cash" on public.cash_sessions for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read expenses" on public.expenses for select to authenticated using (public.thor_is_member());
create policy "thor members create expenses" on public.expenses for insert to authenticated with check (public.thor_is_member());
create policy "thor admins manage expenses" on public.expenses for update to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read transfers" on public.transfers for select to authenticated using (public.thor_is_member());
create policy "thor members request transfers" on public.transfers for insert to authenticated with check (public.thor_is_member());
create policy "thor admins update transfers" on public.transfers for update to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read transfer lines" on public.transfer_lines for select to authenticated using (public.thor_is_member());
create policy "thor members create transfer lines" on public.transfer_lines for insert to authenticated with check (public.thor_is_member());
create policy "thor members read lots" on public.receipt_lots for select to authenticated using (public.thor_is_member());
create policy "thor members create lots" on public.receipt_lots for insert to authenticated with check (public.thor_is_member());
create policy "thor admins update lots" on public.receipt_lots for update to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read lot lines" on public.receipt_lot_lines for select to authenticated using (public.thor_is_member());
create policy "thor members create lot lines" on public.receipt_lot_lines for insert to authenticated with check (public.thor_is_member());
create policy "thor members read returns" on public.return_requests for select to authenticated using (public.thor_is_member());
create policy "thor members create returns" on public.return_requests for insert to authenticated with check (public.thor_is_member());
create policy "thor admins update returns" on public.return_requests for update to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
create policy "thor members read movements" on public.stock_movements for select to authenticated using (public.thor_is_member());
create policy "thor admins create movements" on public.stock_movements for insert to authenticated with check (public.thor_is_admin());
create policy "thor admins read audit" on public.audit_log for select to authenticated using (public.thor_is_admin());
create policy "thor admins create audit" on public.audit_log for insert to authenticated with check (public.thor_is_admin());

create policy "thor members read files" on storage.objects for select to authenticated using (bucket_id = 'thor-files' and public.thor_is_member());
create policy "thor members upload files" on storage.objects for insert to authenticated with check (bucket_id = 'thor-files' and public.thor_is_member());
