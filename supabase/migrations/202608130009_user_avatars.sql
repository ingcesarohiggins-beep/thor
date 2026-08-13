-- Foto de perfil privada y editable por cada usuario.
alter table public.app_users
  add column if not exists avatar_path text;

create or replace function public.update_my_avatar(p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar tu foto.';
  end if;
  if nullif(trim(p_avatar_path), '') is null or p_avatar_path !~ '^avatars/' then
    raise exception 'La ruta de la foto de perfil no es válida.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'thor-files'
      and name = p_avatar_path
      and owner_id = auth.uid()
  ) then
    raise exception 'Primero debes cargar una foto válida.';
  end if;
  update public.app_users
  set avatar_path = p_avatar_path
  where auth_user_id = auth.uid() and active = true;
end;
$$;

grant execute on function public.update_my_avatar(text) to authenticated;
