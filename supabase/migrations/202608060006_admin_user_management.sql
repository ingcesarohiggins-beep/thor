-- Usuarios creados solo desde el modulo Usuarios de THOR.
-- Ejecutar despues de la migracion inicial y de acceso GitHub Pages.

drop trigger if exists thor_attach_registered_user_on_signup on auth.users;
drop trigger if exists thor_attach_invited_user_on_signup on auth.users;
drop function if exists public.thor_attach_registered_user();
drop function if exists public.thor_attach_invited_user();
