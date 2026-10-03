# AEEVI Membership Backend Setup Runbook

## Current readiness

The AEEVI backend setup project has been provisioned in Supabase:

- Project: `AEEVI-Membership`
- Project reference: `nanmvocarbimrbuwmstu`
- Region: Singapore (`ap-southeast-1`)
- Status: healthy
- Database migrations: core schema, 2027–2030 registration windows, and RLS role-check helpers have been moved into a private schema.
- Edge Function: `membership-api`, version 1, active.

The project contains no member records and no operator accounts. Public registration is not yet activated: Auth redirect URLs and SMTP, the first superadmin, public frontend configuration, and the acceptance checks below remain outstanding.

**Do not put a Supabase secret/service-role key in GitHub, the public configuration file, or chat.** The browser needs only the project URL and publishable key. Supabase supplies function-side secrets to the Edge Function runtime.

## 1. Create the AEEVI Supabase project

The project above is the current setup environment. Keep enrollment closed until the acceptance checks pass and AEEVI approves activation. If AEEVI wants separate staging and production projects, create the production project under an AEEVI-controlled account and apply the same reviewed migrations there. Keep project credentials private.

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

The versioned migration files in `membership-platform/supabase/migrations/` create the schema and private payment-evidence bucket, seed Jan 1–30 and Jun 1–30 windows for 2027–2030, and move privileged role checks into a private schema and restrict public/anon execution. Closing timestamps are exclusive, at midnight after the final registration day. These migrations are already applied to the setup project.

Before production, run all checks in `TEST_PLAN.md` against a separate staging project. Do not import the member master until access controls, evidence storage, payment verification, NRA assignment and Excel export pass.

## 3. Provision the first operator

Create the intended AEEVI operator account using Supabase Auth (email invitation or confirmed sign-in). Then, as the project owner, run this in the Supabase SQL Editor, using the nominated first administrator email:

```sql
insert into public.admin_users (auth_user_id, role, enabled)
select id, 'superadmin', true
from auth.users
where lower(email) = lower('aeevi.indonesia@gmail.com')
  and email_confirmed_at is not null
on conflict (auth_user_id) do update
set role = excluded.role,
    enabled = true;
```

Confirm that one row was inserted or updated. Add other named operators using only the roles `registrar`, `treasurer`, `membership_admin`, and `superadmin`. Do not provide public administrator registration.

## 4. Annual dues amount

The approved annual dues amount is Rp 200,000 per member per year. The public form displays that amount, the Edge Function rejects any different amount, and the database constraint enforces it. If AEEVI changes the fee later, update the form, Edge Function, and database constraint together before opening the next period.

## 5. Configure the public page

Set `url` and `publishableKey` in `membership-platform/public-config.js` to the AEEVI Supabase project's API URL and publishable key. Commit only those two public values to the repository. Never place the secret/service-role key there.

The Edge Function uses `SUPABASE_URL` and `SUPABASE_SECRET_KEYS.default` supplied by the Supabase runtime. It supports the legacy `SUPABASE_SERVICE_ROLE_KEY` name as a fallback. Do not copy a secret key into Vercel; the AEEVI static site does not have an AEEVI Vercel project in the currently connected account.

## 6. Validate and activate

- Sign in as one account from each operator role and confirm permissions in `TEST_PLAN.md`.
- Confirm the public page shows the correct period in Jakarta time and rejects submissions outside the window.
- Test new-member approval, linked and unlinked renewal review, duplicate warnings, rejected-payment replacement, private evidence access, unique NRA assignment and export.
- Confirm the Excel export contains no payment evidence files or storage paths.
- Import only the reviewed primary-name master after AEEVI confirms the mapping. Keep the 59 unresolved source records in a manual-review queue; do not infer historic dues as paid.
- Publish the public URL/key configuration only after staging passes and AEEVI approves activation.

## Access required to proceed

Remaining setup tasks: configure the Auth redirect URLs and production SMTP sender in Supabase; create/confirm the Auth account for `aeevi.indonesia@gmail.com` and provision it as superadmin; run the acceptance checks in a closed environment; then populate `public-config.js` with the project URL and publishable key and import only the reviewed member master. Keep the 59 unresolved historic name/NRA cases in manual review. Enter any secret values directly in Supabase, never in chat or GitHub.
