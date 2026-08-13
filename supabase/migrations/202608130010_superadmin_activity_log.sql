-- Presencia y bitacora exclusiva para el Superadministrador.
create table if not exists public.user_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  session_key uuid not null,
  signed_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signed_out_at timestamptz,
  last_action text not null default 'session.started',
  unique (user_id, session_key)
);

create index if not exists user_activity_sessions_online_idx
  on public.user_activity_sessions (last_seen_at desc)
  where signed_out_at is null;

alter table public.user_activity_sessions enable row level security;

drop policy if exists "thor admins read audit" on public.audit_log;
create policy "thor superadmins read audit"
on public.audit_log for select to authenticated
using (public.thor_is_superadmin());

create or replace function public.touch_thor_activity(
  p_session_key uuid,
  p_action text default 'session.active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.app_users
  where auth_user_id = auth.uid() and active = true;
  if v_user_id is null then
    raise exception 'Usuario THOR no disponible.';
  end if;

  if not exists (
    select 1 from public.user_activity_sessions
    where user_id = v_user_id and session_key = p_session_key
  ) then
    insert into public.user_activity_sessions (user_id, session_key, last_action)
    values (v_user_id, p_session_key, 'session.started');
    insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (v_user_id, 'session.started', 'user_session', null, jsonb_build_object('session_key', p_session_key));
  else
    update public.user_activity_sessions
    set last_seen_at = now(), last_action = coalesce(nullif(trim(p_action), ''), 'session.active')
    where user_id = v_user_id and session_key = p_session_key and signed_out_at is null;
  end if;
end;
$$;

create or replace function public.end_thor_activity(
  p_session_key uuid,
  p_reason text default 'session.signed_out'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.app_users
  where auth_user_id = auth.uid() and active = true;
  if v_user_id is null then return; end if;

  update public.user_activity_sessions
  set last_seen_at = now(), signed_out_at = now(), last_action = p_reason
  where user_id = v_user_id and session_key = p_session_key and signed_out_at is null;

  if found then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (v_user_id, p_reason, 'user_session', null, jsonb_build_object('session_key', p_session_key));
  end if;
end;
$$;

create or replace function public.get_superadmin_activity()
returns table (
  user_id uuid,
  name text,
  role text,
  location_name text,
  signed_in_at timestamptz,
  last_seen_at timestamptz,
  last_action text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.thor_is_superadmin() then
    raise exception 'Solo el Superadministrador puede ver la actividad.';
  end if;
  return query
  select u.id, u.name, u.role, l.name, s.signed_in_at, s.last_seen_at, s.last_action
  from public.user_activity_sessions s
  join public.app_users u on u.id = s.user_id
  left join public.locations l on l.id = u.location_id
  where s.signed_out_at is null and s.last_seen_at >= now() - interval '3 minutes'
  order by s.last_seen_at desc;
end;
$$;

create or replace function public.get_superadmin_audit_log(p_limit integer default 60)
returns table (
  id uuid,
  action text,
  entity_type text,
  detail jsonb,
  created_at timestamptz,
  actor_name text,
  actor_role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.thor_is_superadmin() then
    raise exception 'Solo el Superadministrador puede ver la bitacora.';
  end if;
  return query
  select a.id, a.action, a.entity_type, a.detail, a.created_at, u.name, u.role
  from public.audit_log a
  left join public.app_users u on u.id = a.actor_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 150));
end;
$$;

grant execute on function public.touch_thor_activity(uuid, text) to authenticated;
grant execute on function public.end_thor_activity(uuid, text) to authenticated;
grant execute on function public.get_superadmin_activity() to authenticated;
grant execute on function public.get_superadmin_audit_log(integer) to authenticated;
