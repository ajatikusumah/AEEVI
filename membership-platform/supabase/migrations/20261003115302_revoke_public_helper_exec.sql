-- Restrict execution of RLS helper functions to authenticated sessions.
revoke all on function public.is_membership_admin() from public, anon;
revoke all on function public.has_membership_role(public.admin_role[]) from public, anon;
grant execute on function public.is_membership_admin() to authenticated;
grant execute on function public.has_membership_role(public.admin_role[]) to authenticated;
