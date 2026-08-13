-- Clientes reutilizables para ventas con DNI, teléfono y dirección.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dni text unique,
  phone text,
  address text,
  active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers (name);
create index if not exists customers_active_idx on public.customers (active);

alter table public.customers enable row level security;

create policy "thor members read customers"
on public.customers for select to authenticated
using (public.thor_is_member());

create policy "thor members create customers"
on public.customers for insert to authenticated
with check (public.thor_is_member());

create policy "thor admins manage customers"
on public.customers for all to authenticated
using (public.thor_is_admin())
with check (public.thor_is_admin());

create trigger customers_updated_at
before update on public.customers
for each row execute function public.thor_set_updated_at();
