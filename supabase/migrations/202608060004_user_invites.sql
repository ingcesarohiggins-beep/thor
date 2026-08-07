-- Invitaciones de usuarios THOR. Ejecutar despues de las migraciones anteriores.
-- Un administrador registra el correo y rol; al crear su acceso con ese correo,
-- el usuario queda vinculado automaticamente a su perfil y sede.

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'seller')),
  location_id uuid not null references public.locations(id) on delete restrict,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (email)
);

alter table public.user_invites enable row level security;

create policy "thor admins manage user invitations"
  on public.user_invites for all to authenticated
  using (public.thor_is_admin()) with check (public.thor_is_admin());

create or replace function public.thor_attach_invited_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite public.user_invites;
  v_username text;
begin
  select * into v_invite
  from public.user_invites
  where lower(email) = lower(new.email)
    and accepted_at is null
  for update;

  if v_invite.id is null then
    return new;
  end if;

  v_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9._-]', '', 'g'))
    || '-' || substr(new.id::text, 1, 6);

  insert into public.app_users (auth_user_id, name, email, username, role, location_id, active)
  values (new.id, v_invite.name, lower(new.email), v_username, v_invite.role, v_invite.location_id, true);

  update public.user_invites set accepted_at = now() where id = v_invite.id;
  return new;
end;
$$;

drop trigger if exists thor_attach_invited_user_on_signup on auth.users;
create trigger thor_attach_invited_user_on_signup
  after insert on auth.users
  for each row execute function public.thor_attach_invited_user();
