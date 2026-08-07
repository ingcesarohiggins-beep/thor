-- Registro simple de usuarios THOR.
-- Ejecutar despues de las migraciones anteriores.
-- Las cuentas nuevas se crean automaticamente como vendedores.

create or replace function public.thor_attach_registered_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_location uuid;
  v_name text;
  v_username text;
begin
  -- La instalacion inicial crea su administrador desde la aplicacion.
  if not exists (select 1 from public.app_users) then
    return new;
  end if;

  select id into v_location
  from public.locations
  where active = true
  order by created_at
  limit 1;

  if v_location is null then
    raise exception 'THOR necesita una sede activa antes de registrar usuarios.';
  end if;

  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1));
  v_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9._-]', '', 'g'))
    || '-' || substr(new.id::text, 1, 6);

  insert into public.app_users (auth_user_id, name, email, username, role, location_id, active)
  values (new.id, v_name, lower(new.email), v_username, 'seller', v_location, true)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists thor_attach_invited_user_on_signup on auth.users;
drop trigger if exists thor_attach_registered_user_on_signup on auth.users;
create trigger thor_attach_registered_user_on_signup
  after insert on auth.users
  for each row execute function public.thor_attach_registered_user();
