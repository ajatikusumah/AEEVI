# AEEVI Membership Backend Setup Runbook

## Current readiness

The repository contains the Supabase migration, 2027–2030 registration-window seed, Edge Function, public member page and pengurus portal. The code is not connected to a Supabase project. The Vercel account available for this work currently has no AEEVI project. No member records or credentials are stored in the repository.

**Do not put a Supabase secret/service-role key in GitHub, the public configuration file, or chat.** The browser needs only the project URL and publishable key. Supabase supplies function-side secrets to the Edge Function runtime.

## 1. Create the AEEVI Supabase project

An AEEVI project owner should create a dedicated Supabase project under an AEEVI-controlled account, select the required region, and keep the project credentials private. Record the project reference (the short project identifier) for deployment.

In Supabase Authentication:

- Enable email sign-in and email confirmation.
- Add these redirect URLs:
  - `https://aeevi.org/gabungAEEVI/`
  - `https://aeevi.org/gabungAEEVI/pengurus.html`
- Configure a production SMTP sender before member sign-in is opened.

## 2. Apply database migrations

From a trusted workstation with the Supabase CLI installed and the AEEVI project owner signed in:

```sh
npx supabase login
npx supabase link --project-ref <AEEVI_PROJECT_REF>
npx supabase db push --linked
npx supabase functions deploy membership-api --project-ref <AEEVI_PROJECT_REF>
```

This applies the schema and private payment-evidence bucket in `supabase/migrations/0001_membership_core.sql`, then seeds the Jan 1–30 and Jun 1–30 windows for 2027–2030 in `0002_seed_registration_windows.sql`. Closing timestamps are exclusive, at midnight after the final registration day.

Before production, run all checks in `TEST_PLAN.md` against a separate staging project. Do not import the member master until access controls, evidence storage, payment verification, NRA assignment and Excel export pass.

## 3. Provision the first operator

Create the intended AEEVI operator account using Supabase Auth (email invitation or confirmed sign-in). Then, as the project owner, run this in the Supabase SQL Editor, replacing the address with the nominated first administrator:

```sql
insert into public.admin_users (auth_user_id, role, enabled)
select id, 'superadmin', true
from auth.users
where lower(email) = lower('admin@aeevi.org')
  and email_confirmed_at is not null
on conflict (auth_user_id) do update
set role = excluded.role,
    enabled = true;
```

Confirm that one row was inserted or updated. Add other named operators using only the roles `registrar`, `treasurer`, `membership_admin`, and `superadmin`. Do not provide public administrator registration.

## 4. Configure the public page

Set `url` and `publishableKey` in `membership-platform/public-config.js` to the AEEVI Supabase project's API URL and publishable key. Commit only those two public values to the repository. Never place the secret/service-role key there.

The Edge Function uses `SUPABASE_URL` and `SUPABASE_SECRET_KEYS.default` supplied by the Supabase runtime. It supports the legacy `SUPABASE_SERVICE_ROLE_KEY` name as a fallback. Do not copy a secret key into Vercel; the AEEVI static site does not have an AEEVI Vercel project in the currently connected account.

## 5. Validate and activate

- Sign in as one account from each operator role and confirm permissions in `TEST_PLAN.md`.
- Confirm the public page shows the correct period in Jakarta time and rejects submissions outside the window.
- Test new-member approval, linked and unlinked renewal review, duplicate warnings, rejected-payment replacement, private evidence access, unique NRA assignment and export.
- Confirm the Excel export contains no payment evidence files or storage paths.
- Import only the reviewed primary-name master after AEEVI confirms the mapping. Keep the 59 unresolved source records in a manual-review queue; do not infer historic dues as paid.
- Publish the public URL/key configuration only after staging passes and AEEVI approves activation.

## Access required to proceed

The current session has no Supabase project or Supabase account connector. To perform the cloud setup, connect an AEEVI Supabase project or provide its project reference and arrange access for deployment. Share only the project reference and the email address of the nominated first operator here; enter secrets directly into Supabase. Do not send secret keys in chat.
