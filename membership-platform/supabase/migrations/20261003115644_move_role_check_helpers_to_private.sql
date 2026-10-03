create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_membership_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
  );
$function$;

create or replace function private.has_membership_role(required_roles public.admin_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
      and au.role = any(required_roles)
  );
$function$;

revoke all on function private.is_membership_admin() from public, anon;
revoke all on function private.has_membership_role(public.admin_role[]) from public, anon;
grant execute on function private.is_membership_admin() to authenticated;
grant execute on function private.has_membership_role(public.admin_role[]) to authenticated;

create or replace function public.is_membership_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.is_membership_admin();
$function$;

create or replace function public.has_membership_role(required_roles public.admin_role[])
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.has_membership_role(required_roles);
$function$;

revoke all on function public.is_membership_admin() from public, anon;
revoke all on function public.has_membership_role(public.admin_role[]) from public, anon;
grant execute on function public.is_membership_admin() to authenticated;
grant execute on function public.has_membership_role(public.admin_role[]) to authenticated;
