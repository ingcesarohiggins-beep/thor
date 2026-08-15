-- Lista de usuarios para la administracion de THOR.
-- La lectura queda limitada a los roles administrador y superadministrador.
-- to_jsonb evita depender de avatar_path en instalaciones que aun no la tengan.
create or replace function public.get_thor_users()
returns table (
  id uuid,
  name text,
  email text,
  role text,
  active boolean,
  avatar_path text,
  location_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.thor_is_admin() then
    raise exception 'No tienes permiso para ver los usuarios de THOR.';
  end if;

  return query
  select
    u.id,
    u.name,
    u.email,
    u.role,
    u.active,
    nullif(to_jsonb(u) ->> 'avatar_path', '') as avatar_path,
    l.name as location_name
  from public.app_users u
  left join public.locations l on l.id = u.location_id
  order by u.created_at asc;
end;
$$;

grant execute on function public.get_thor_users() to authenticated;
