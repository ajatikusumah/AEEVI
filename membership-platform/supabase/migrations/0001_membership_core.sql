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
  create type public.admin_role as enum ('registrar', 'treasurer', 'membership_admin', 'superadmin');
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
  possible_duplicate boolean not null default false,
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

create unique index if not exists one_pending_payment_per_application_year
  on public.payment_submissions (application_id, calendar_year)
  where status = 'pending';

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
as $function$
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.enabled
  );
$function$;

create or replace function public.has_membership_role(required_roles public.admin_role[])
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

-- Issue one new NRA and approve its application atomically.
-- Sequence format follows the established B + year + four-digit sequence pattern.
create or replace function public.approve_membership_application(
  p_application_id uuid,
  p_actor_id uuid,
  p_duplicate_checked boolean default false
)
returns table (approved_member_id uuid, assigned_nra text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_application public.applications%rowtype;
  v_payment public.payment_submissions%rowtype;
  v_member_id uuid;
  v_nra text;
  v_year integer;
  v_sequence integer;
begin
  select * into v_application
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found';
  end if;
  if v_application.status not in ('submitted', 'under_review') then
    raise exception 'Application is not awaiting a decision';
  end if;

  select * into v_payment
  from public.payment_submissions
  where application_id = p_application_id
    and status = 'verified'
  order by verified_at desc
  limit 1
  for update;

  if not found then
    raise exception 'A verified payment is required before approval';
  end if;

  select calendar_year into v_year
  from public.registration_windows
  where id = v_application.window_id;
  if v_year is null then
    raise exception 'Application has no registration year';
  end if;

  if v_application.possible_duplicate and not p_duplicate_checked then
    raise exception 'Possible duplicate requires explicit review';
  end if;

  if v_application.kind = 'renewal' then
    v_member_id := v_application.member_id;
    if v_member_id is null and v_application.requested_nra is not null then
      select id into v_member_id
      from public.members
      where nra = v_application.requested_nra
      for update;
    end if;
    if v_member_id is null then
      raise exception 'Renewal must be linked to a verified existing member';
    end if;

    if exists (
      select 1 from public.members
      where id = v_member_id
        and auth_user_id is not null
        and auth_user_id <> v_application.applicant_auth_user_id
    ) then
      raise exception 'This member is already linked to a different verified account';
    end if;

    update public.members
    set status = 'active',
        auth_user_id = coalesce(auth_user_id, v_application.applicant_auth_user_id),
        updated_at = now()
    where id = v_member_id
    returning nra into v_nra;
  else
    insert into public.members (
      auth_user_id, full_name, normalized_name, category, discipline,
      institution, province, city_or_regency, email, whatsapp,
      status, joined_at
    )
    values (
      v_application.applicant_auth_user_id, v_application.full_name,
      lower(regexp_replace(trim(v_application.full_name), '[^[:alnum:]]+', ' ', 'g')),
      v_application.category, v_application.discipline, v_application.institution,
      v_application.province, v_application.city_or_regency, v_application.email,
      v_application.whatsapp, 'active',
      (timezone('Asia/Jakarta', v_application.submitted_at))::date
    )
    returning id, nra into v_member_id, v_nra;

    v_year := extract(year from timezone('Asia/Jakarta', now()))::integer;
    perform pg_advisory_xact_lock(hashtext('aeevi-nra-' || v_year::text));

    select coalesce(max(right(nra, 4)::integer), 0) + 1
    into v_sequence
    from (
      select m.nra from public.members m
      where m.nra ~ ('^B' || v_year::text || '[0-9]{4}$')
      union all
      select r.nra from public.retired_nras r
      where r.nra ~ ('^B' || v_year::text || '[0-9]{4}$')
    ) issued;

    if v_sequence > 9999 then
      raise exception 'NRA sequence exhausted for year %', v_year;
    end if;
    v_nra := 'B' || v_year::text || lpad(v_sequence::text, 4, '0');

    update public.members
    set nra = v_nra, updated_at = now()
    where id = v_member_id;
  end if;

  update public.applications
  set member_id = v_member_id,
      status = 'approved',
      reviewed_by = p_actor_id,
      reviewed_at = now()
  where id = p_application_id;

  insert into public.annual_membership_dues (
    member_id, calendar_year, payment_submission_id, verified_at, verified_by
  )
  values (
    v_member_id, v_payment.calendar_year, v_payment.id, v_payment.verified_at,
    v_payment.verified_by
  )
  on conflict (member_id, calendar_year) do nothing;

  insert into public.audit_log (
    actor_auth_user_id, action, entity_type, entity_id, details
  )
  values (
    p_actor_id, 'approve_application', 'application', p_application_id::text,
    jsonb_build_object('member_id', v_member_id, 'nra', v_nra, 'kind', v_application.kind, 'possible_duplicate', v_application.possible_duplicate, 'duplicate_checked', p_duplicate_checked)
  );

  return query select v_member_id, v_nra;
end;
$function$;

revoke all on function public.approve_membership_application(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.approve_membership_application(uuid, uuid, boolean) to service_role;

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
using (public.has_membership_role(array['registrar', 'membership_admin', 'superadmin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists members_read_self_or_admin on public.members;
create policy members_read_self_or_admin
on public.members for select to authenticated
using (auth_user_id = (select auth.uid()) or public.has_membership_role(array['registrar', 'membership_admin', 'superadmin']::public.admin_role[]));

drop policy if exists admins_manage_members on public.members;
drop policy if exists admins_update_members on public.members;
create policy admins_update_members
on public.members for update to authenticated
using (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists aliases_admin_only on public.member_name_aliases;
create policy aliases_admin_only
on public.member_name_aliases for select to authenticated
using (public.has_membership_role(array['membership_admin', 'superadmin']::public.admin_role[]));

drop policy if exists retired_nras_admin_only on public.retired_nras;
create policy retired_nras_admin_only
on public.retired_nras for select to authenticated
using (public.has_membership_role(array['membership_admin', 'superadmin']::public.admin_role[]));

drop policy if exists applications_owner_or_admin_read on public.applications;
create policy applications_owner_or_admin_read
on public.applications for select to authenticated
using (applicant_auth_user_id = (select auth.uid()) or public.has_membership_role(array['registrar', 'membership_admin', 'superadmin']::public.admin_role[]));

drop policy if exists applications_admin_update on public.applications;
create policy applications_admin_update
on public.applications for update to authenticated
using (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]))
with check (public.has_membership_role(array['registrar', 'membership_admin']::public.admin_role[]));

drop policy if exists payments_owner_or_admin_read on public.payment_submissions;
create policy payments_owner_or_admin_read
on public.payment_submissions for select to authenticated
using (
  public.has_membership_role(array['treasurer', 'membership_admin', 'superadmin']::public.admin_role[])
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
      and au.role in ('treasurer', 'membership_admin', 'superadmin')
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
using (auth_user_id = (select auth.uid()) or public.has_membership_role(array['superadmin']::public.admin_role[]));

drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read
on public.audit_log for select to authenticated
using (public.has_membership_role(array['membership_admin', 'superadmin']::public.admin_role[]));

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
    public.has_membership_role(array['treasurer', 'membership_admin', 'superadmin']::public.admin_role[])
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
  and public.has_membership_role(array['membership_admin', 'superadmin']::public.admin_role[])
);

grant execute on function public.is_membership_admin() to authenticated;
grant execute on function public.has_membership_role(public.admin_role[]) to authenticated;
