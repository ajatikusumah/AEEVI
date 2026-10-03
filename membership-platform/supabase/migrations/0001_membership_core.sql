-- AEEVI membership platform core schema.
-- Apply to a dedicated Supabase project after reviewing this migration.
-- Applicant/admin writes should go through authenticated Edge Functions; do not grant
-- the public browser client a service-role credential.

create extension if not exists pgcrypto;

do $$ begin
  create type public.application_kind as enum ('new', 'renewal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum
    ('submitted', 'under_review', 'needs_correction', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.admin_role as enum ('registrar', 'treasurer', 'membership_admin');
exception when duplicate_object then null; end $$;

create table if not exists public.registration_windows (
  id uuid primary key default gen_random_uuid(),
  calendar_year integer not null check (calendar_year between 2020 and 2200),
  period text not null check (period in ('january', 'june')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  check (opens_at < closes_at),
  unique (calendar_year, period)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nra text unique,
  full_name text not null,
  normalized_name text not null,
  category text,
  discipline text,
  institution text,
  province text,
  city_or_regency text,
  email text,
  whatsapp text,
  status public.member_status not null default 'inactive',
  joined_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_notes text,
  check (nra is null or length(trim(nra)) > 0)
);

create unique index if not exists members_nra_case_insensitive_uq
  on public.members (lower(nra)) where nra is not null;
create index if not exists members_normalized_name_idx
  on public.members (normalized_name);

create table if not exists public.member_name_aliases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  alias_name text not null,
  normalized_alias text not null,
  source_label text,
  validation_status text not null default 'confirmed'
    check (validation_status in ('confirmed', 'pending_review', 'rejected')),
  created_at timestamptz not null default now(),
  unique (member_id, normalized_alias, source_label)
);

create table if not exists public.retired_nras (
  nra text primary key,
  retained_nra text references public.members(nra) on update restrict on delete restrict,
  reason text not null,
  decision_reference text,
  retired_at timestamptz not null default now(),
  retired_by uuid references auth.users(id)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_auth_user_id uuid not null references auth.users(id) on delete restrict,
  window_id uuid not null references public.registration_windows(id) on delete restrict,
  member_id uuid references public.members(id) on delete restrict,
  kind public.application_kind not null,
  requested_nra text,
  full_name text not null,
  institution text,
  province text,
  city_or_regency text,
  discipline text,
  category text,
  email text not null,
  whatsapp text not null,
  consent_card_and_contact boolean not null default false,
  status public.application_status not null default 'submitted',
  applicant_note text,
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists applications_queue_idx
  on public.applications (status, submitted_at desc);
create index if not exists applications_applicant_idx
  on public.applications (applicant_auth_user_id, submitted_at desc);

create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete restrict,
  calendar_year integer not null check (calendar_year between 2020 and 2200),
  amount_idr bigint not null check (amount_idr >= 0),
  paid_on date,
  evidence_object_path text not null,
  status public.payment_status not null default 'pending',
  treasurer_note text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'verified' and verified_by is not null and verified_at is not null)
    or status <> 'verified'
  )
);

create index if not exists payment_submissions_application_idx
  on public.payment_submissions (application_id, created_at desc);
create unique index if not exists one_verified_payment_per_application_year
  on public.payment_submissions (application_id, calendar_year)
  where status = 'verified';

create table if not exists public.annual_membership_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  calendar_year integer not null check (calendar_year between 2020 and 2200),
  payment_submission_id uuid not null unique
    references public.payment_submissions(id) on delete restrict,
  verified_at timestamptz not null,
  verified_by uuid not null references auth.users(id),
  unique (member_id, calendar_year)
);

create table if not exists public.admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  role public.admin_role not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_auth_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_membership_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
  );
$;

create or replace function public.has_membership_role(required_roles public.admin_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
      and au.role = any(required_roles)
  );
$;

create or replace function public.prevent_nra_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.nra is not null and new.nra is distinct from old.nra then
    raise exception 'An assigned NRA is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists members_nra_immutable on public.members;
create trigger members_nra_immutable
before update of nra on public.members
for each row execute function public.prevent_nra_reassignment();

alter table public.registration_windows enable row level security;
alter table public.members enable row level security;
alter table public.member_name_aliases enable row level security;
alter table public.retired_nras enable row level security;
alter table public.applications enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.annual_membership_dues enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;

-- Public visitors may read enabled window dates only; all other access is authenticated.
drop policy if exists enabled_windows_are_readable on public.registration_windows;
create policy enabled_windows_are_readable
on public.registration_windows for select to anon, authenticated
using (is_enabled = true);

drop policy if exists admins_manage_windows on public.registration_windows;
drop policy if exists admins_update_windows on public.registration_windows;
create policy admins_update_windows
on public.registration_windows for update to authenticated
using (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists members_read_self_or_admin on public.members;
create policy members_read_self_or_admin
on public.members for select to authenticated
using (auth_user_id = (select auth.uid()) or public.is_membership_admin());

drop policy if exists admins_manage_members on public.members;
drop policy if exists admins_update_members on public.members;
create policy admins_update_members
on public.members for update to authenticated
using (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists aliases_admin_only on public.member_name_aliases;
create policy aliases_admin_only
on public.member_name_aliases for select to authenticated
using (public.is_membership_admin());

drop policy if exists retired_nras_admin_only on public.retired_nras;
create policy retired_nras_admin_only
on public.retired_nras for select to authenticated
using (public.is_membership_admin());

drop policy if exists applications_owner_or_admin_read on public.applications;
create policy applications_owner_or_admin_read
on public.applications for select to authenticated
using (applicant_auth_user_id = (select auth.uid()) or public.is_membership_admin());

drop policy if exists applications_admin_update on public.applications;
create policy applications_admin_update
on public.applications for update to authenticated
using (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists payments_owner_or_admin_read on public.payment_submissions;
create policy payments_owner_or_admin_read
on public.payment_submissions for select to authenticated
using (
  public.is_membership_admin()
  or exists (
    select 1 from public.applications a
    where a.id = payment_submissions.application_id
      and a.applicant_auth_user_id = (select auth.uid())
  )
);

drop policy if exists payments_treasurer_update on public.payment_submissions;
create policy payments_treasurer_update
on public.payment_submissions for update to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
      and au.role in ('treasurer', 'membership_admin')
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
      and au.role in ('treasurer', 'membership_admin')
  )
);

drop policy if exists dues_owner_or_admin_read on public.annual_membership_dues;
create policy dues_owner_or_admin_read
on public.annual_membership_dues for select to authenticated
using (
  public.is_membership_admin()
  or exists (
    select 1 from public.members m
    where m.id = annual_membership_dues.member_id
      and m.auth_user_id = (select auth.uid())
  )
);

drop policy if exists admin_users_read_self_or_admin on public.admin_users;
create policy admin_users_read_self_or_admin
on public.admin_users for select to authenticated
using (auth_user_id = (select auth.uid()) or public.is_membership_admin());

drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read
on public.audit_log for select to authenticated
using (public.is_membership_admin());

-- No client INSERT/DELETE policies are granted for applications, payments, dues,
-- admins or audit rows. Create and review those records through Edge Functions
-- that authenticate the caller, validate inputs, and write the audit log.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-evidence',
  'payment-evidence',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists applicant_uploads_own_payment_evidence on storage.objects;
create policy applicant_uploads_own_payment_evidence
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-evidence'
  and exists (
    select 1 from public.applications a
    where a.id::text = (storage.foldername(name))[1]
      and a.applicant_auth_user_id = (select auth.uid())
  )
);

drop policy if exists applicant_reads_own_payment_evidence on storage.objects;
create policy applicant_reads_own_payment_evidence
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-evidence'
  and (
    public.is_membership_admin()
    or exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[1]
        and a.applicant_auth_user_id = (select auth.uid())
    )
  )
);

drop policy if exists applicant_updates_own_payment_evidence on storage.objects;
create policy applicant_updates_own_payment_evidence
on storage.objects for update to authenticated
using (
  bucket_id = 'payment-evidence'
  and exists (
    select 1 from public.applications a
    where a.id::text = (storage.foldername(name))[1]
      and a.applicant_auth_user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'payment-evidence'
  and exists (
    select 1 from public.applications a
    where a.id::text = (storage.foldername(name))[1]
      and a.applicant_auth_user_id = (select auth.uid())
  )
);

drop policy if exists admins_delete_payment_evidence on storage.objects;
create policy admins_delete_payment_evidence
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-evidence'
  and public.is_membership_admin()
);

grant execute on function public.is_membership_admin() to authenticated;
grant execute on function public.has_membership_role(public.admin_role[]) to authenticated;
