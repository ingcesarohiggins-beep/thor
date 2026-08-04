-- THOR · inventario, ventas y caja (PostgreSQL / Supabase)
-- Ejecutar una sola vez desde Supabase > SQL Editor.
-- Las tablas quedan protegidas por RLS: el acceso normal debe hacerse desde
-- la API del sistema con la service_role (nunca se publica en el navegador).

create extension if not exists pgcrypto;

create or replace function public.thor_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('central', 'store')),
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  dni text,
  phone text,
  email text,
  username text not null unique,
  role text not null check (role in ('superadmin', 'admin', 'seller')),
  location_id uuid references public.locations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ruc text,
  phone text,
  contact text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text,
  name text not null,
  brand text,
  category text not null check (category in ('phone', 'laptop', 'tablet', 'accessory')),
  serialised boolean not null,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((category = 'accessory' and serialised = false) or (category <> 'accessory' and serialised = true))
);

create table public.receipt_lots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  receipt_number text,
  receipt_photo_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  registered_by uuid references public.app_users(id) on delete set null,
  approved_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receipt_lot_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_lot_id uuid not null references public.receipt_lots(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  product_id uuid not null references public.products(id) on delete restrict,
  receipt_lot_id uuid references public.receipt_lots(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete restrict,
  imei_1 text,
  imei_2 text,
  serial text,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  status text not null default 'available' check (status in ('available', 'reserved', 'in_transit', 'review', 'sold', 'incident', 'retired')),
  photo_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (imei_1 is not null or serial is not null)
);
create unique index inventory_items_imei_1_unique on public.inventory_items (imei_1) where imei_1 is not null;
create unique index inventory_items_imei_2_unique on public.inventory_items (imei_2) where imei_2 is not null;
create index inventory_items_location_status_idx on public.inventory_items (location_id, status);

create table public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  average_cost numeric(12,2) not null default 0 check (average_cost >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, location_id)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),
  changed_by uuid references public.app_users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index product_prices_one_active_idx on public.product_prices (product_id, location_id) where active;
create index product_prices_history_idx on public.product_prices (product_id, location_id, created_at desc);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  opened_by uuid not null references public.app_users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  closed_at timestamptz,
  counted_cash numeric(12,2),
  approved_by uuid references public.app_users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or counted_cash is not null)
);
create index cash_sessions_location_open_idx on public.cash_sessions (location_id, opened_at desc);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  location_id uuid not null references public.locations(id) on delete restrict,
  seller_id uuid not null references public.app_users(id) on delete restrict,
  customer_name text not null default 'Cliente General',
  customer_dni text,
  customer_phone text,
  customer_address text,
  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled', 'return_review')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_approved_by uuid references public.app_users(id) on delete set null,
  total numeric(12,2) not null default 0 check (total >= 0),
  signature_path text,
  pdf_path text,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount = 0 or discount_approved_by is not null)
);
create index sales_location_created_idx on public.sales (location_id, created_at desc);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  payment_method text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete restrict,
  recorded_by uuid not null references public.app_users(id) on delete restrict,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  receipt_photo_path text,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index expenses_location_date_idx on public.expenses (location_id, expense_date desc);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  receipt_lot_id uuid references public.receipt_lots(id) on delete set null,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  recorded_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  requested_by uuid not null references public.app_users(id) on delete restrict,
  approved_by uuid references public.app_users(id) on delete set null,
  received_by uuid references public.app_users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'in_transit', 'received', 'incident', 'rejected')),
  note text,
  incident_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);
create index transfers_status_origin_idx on public.transfers (status, from_location_id, created_at desc);

create table public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  quantity integer not null check (quantity > 0)
);

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  requested_by uuid not null references public.app_users(id) on delete restrict,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reason text not null,
  status text not null default 'review' check (status in ('review', 'exchange', 'refund', 'rejected')),
  evidence_photo_path text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index return_requests_status_created_idx on public.return_requests (status, created_at desc);

create table public.supplier_claims (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  receipt_lot_id uuid references public.receipt_lots(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  reason text not null,
  outcome text check (outcome in ('pending', 'replacement', 'credit_note', 'rejected')),
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  resolved_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  from_location_id uuid references public.locations(id) on delete restrict,
  to_location_id uuid references public.locations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  type text not null check (type in ('receipt', 'transfer', 'sale', 'return', 'adjustment', 'retirement')),
  reference_code text not null,
  performed_by uuid references public.app_users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index stock_movements_item_created_idx on public.stock_movements (inventory_item_id, created_at desc);
create index stock_movements_location_created_idx on public.stock_movements (to_location_id, created_at desc);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_created_idx on public.audit_log (entity_type, entity_id, created_at desc);

-- La cuenta que crea el primer usuario en Supabase Auth puede inicializar THOR una vez.
create or replace function public.bootstrap_thor_admin(p_name text, p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location uuid;
  v_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para inicializar THOR.';
  end if;
  if exists (select 1 from public.app_users) then
    raise exception 'THOR ya tiene un administrador inicial.';
  end if;
  insert into public.locations (name, type) values ('Almacén Central', 'central') returning id into v_location;
  insert into public.app_users (auth_user_id, name, username, role, location_id, active)
  values (auth.uid(), trim(p_name), lower(trim(p_username)), 'superadmin', v_location, true)
  returning id into v_user;
  return v_user;
end;
$$;
grant execute on function public.bootstrap_thor_admin(text, text) to authenticated;

-- Archivos privados: fotos de equipos, comprobantes, firmas y PDFs.
insert into storage.buckets (id, name, public) values ('thor-files', 'thor-files', false)
on conflict (id) do nothing;

-- Solo la API de THOR (service_role) accede a las tablas. Nunca expongas
-- SUPABASE_SERVICE_ROLE_KEY en el navegador ni la subas al repositorio.
alter table public.locations enable row level security;
alter table public.app_users enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.receipt_lots enable row level security;
alter table public.receipt_lot_lines enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_balances enable row level security;
alter table public.product_prices enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.sale_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
alter table public.return_requests enable row level security;
alter table public.supplier_claims enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;

create trigger locations_updated_at before update on public.locations for each row execute function public.thor_set_updated_at();
create trigger app_users_updated_at before update on public.app_users for each row execute function public.thor_set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.thor_set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.thor_set_updated_at();
create trigger receipt_lots_updated_at before update on public.receipt_lots for each row execute function public.thor_set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.thor_set_updated_at();
create trigger cash_sessions_updated_at before update on public.cash_sessions for each row execute function public.thor_set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.thor_set_updated_at();
create trigger transfers_updated_at before update on public.transfers for each row execute function public.thor_set_updated_at();
create trigger return_requests_updated_at before update on public.return_requests for each row execute function public.thor_set_updated_at();
