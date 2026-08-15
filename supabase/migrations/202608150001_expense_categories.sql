-- Categorías de egresos configurables. Las categorías históricas permanecen
-- intactas aunque una categoría se desactive para futuras capturas.
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) between 2 and 80)
);

create index if not exists expense_categories_active_order_idx
  on public.expense_categories (active, sort_order, name);

drop trigger if exists expense_categories_updated_at on public.expense_categories;
create trigger expense_categories_updated_at
before update on public.expense_categories
for each row execute function public.thor_set_updated_at();

insert into public.expense_categories (name, sort_order) values
  ('Alquiler y servicios', 10),
  ('Transporte y movilidad', 20),
  ('Flete local', 30),
  ('Empaque e insumos', 40),
  ('Mantenimiento y reparación', 50),
  ('Marketing y publicidad', 60),
  ('Servicios digitales', 70),
  ('Sueldos y adelantos', 80),
  ('Impuestos y comisiones', 90),
  ('Otros operativos', 100)
on conflict (name) do nothing;

alter table public.expense_categories enable row level security;

create policy "thor members read expense categories"
on public.expense_categories for select to authenticated
using (public.thor_is_member());

create policy "thor superadmins manage expense categories"
on public.expense_categories for all to authenticated
using (public.thor_is_superadmin())
with check (public.thor_is_superadmin());

grant select, insert, update, delete on public.expense_categories to authenticated;

-- Los egresos son financieros: solo Administrador y Superadministrador pueden crearlos.
drop policy if exists "thor members create expenses" on public.expenses;
create policy "thor admins create expenses"
on public.expenses for insert to authenticated
with check (public.thor_is_admin());

create or replace function public.audit_expense_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select id into v_actor
  from public.app_users
  where auth_user_id = auth.uid() and active = true;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    v_actor,
    case when tg_op = 'INSERT' then 'expense_category.created' else 'expense_category.updated' end,
    'expense_category',
    new.id,
    jsonb_build_object('name', new.name, 'active', new.active, 'sort_order', new.sort_order)
  );
  return new;
end;
$$;

drop trigger if exists audit_expense_category_change on public.expense_categories;
create trigger audit_expense_category_change
after insert or update on public.expense_categories
for each row execute function public.audit_expense_category_change();
