# AEEVI Membership Platform — implementation and activation

## Site and backend

The public AEEVI site is a static HTML/CSS/JavaScript site in `ajatikusumah/AEEVI`, served from the custom domain `aeevi.org`. This branch adds the member journey at `/gabungAEEVI/` without moving the site or changing its hosting.

The backend is Supabase: PostgreSQL, Auth, private Storage, and an Edge Function. All sensitive reads and writes pass through role checks and database Row Level Security (RLS). The Supabase service-role key is server-only and must never be put in the public site.

The implementation is in this branch, but is not active: AEEVI has not created a Supabase project, applied the migration, or deployed the Edge Function. The blank public configuration deliberately keeps the form disabled.

## Data and roles

- `members`: one canonical person record and immutable NRA. Existing members are imported only after the master is approved.
- `member_name_aliases`: reserved for reviewed historical spelling variants; unresolved source conflicts are not automatically merged.
- `registration_windows`: editable Jakarta-time registration periods, normally 1–30 January and 1–30 June.
- `applications`: new or renewal request, applicant identity, profile and review state. An application does not create a member record.
- `payment_submissions` and `annual_membership_dues`: evidence and treasurer decision; only verified payment counts as paid. The annual dues amount is Rp 200,000 per year.
- `admin_users` and `audit_log`: allowlisted operator roles and a record of sensitive actions.

Operator roles are `registrar`, `treasurer`, `membership_admin`, and `superadmin`. Accounts are provisioned by a trusted project owner; there is no public administrator sign-up. Registrar reviews applicant information, treasurer checks payment, and membership administrators complete validation and approval. Permissions are enforced server-side and in RLS.

## What this branch implements

- Public registration page at `/gabungAEEVI/`, with email sign-in, registration-window status, new/renewal form, member profile and contact fields, and private payment-proof upload.
- Applicant status page, correction resubmission, rejected-payment replacement, NRA and annual-dues display, and a printable digital membership card after approval.
- Pengurus portal for role-scoped queue, payment review, correction/rejection, final approval, and Excel export.
- Supabase migration with role-scoped RLS, audit records, duplicate-review flags, private evidence storage, and a transaction-safe approval routine. Renewal keeps the old NRA; a new NRA is allocated only after an authorized final approval with verified payment and uses the registration period's year. Unlinked renewals are flagged for human identity review. Retired NRAs are never recycled.
- Edge Function API for public and authenticated member operations and pengurus actions.

A duplicate warning is a review aid, not a conclusive identity match. Possible duplicates require a human check and acknowledgement before approval. The application does not auto-merge people by name.

Automatic approval email delivery and WhatsApp messaging are not implemented. After approval, the member can print/save the card from the portal; the secretariat can send a group invitation manually. Automatic invitations require an authorized AEEVI messaging channel and configured invitation link.

## Activate safely

1. Create a dedicated Supabase project owned by AEEVI. Enable email verification, configure the Auth redirect URLs for `https://aeevi.org/gabungAEEVI/` and `https://aeevi.org/gabungAEEVI/pengurus.html`, and create the private payment-evidence bucket using the migration.
2. Apply `supabase/migrations/0001_membership_core.sql` in a staging project. Review the schema and RLS policies with the AEEVI project owner.
3. Deploy `supabase/functions/membership-api` and configure its server-side secrets. Put only the Supabase project URL and publishable key in `membership-platform/public-config.js`; never expose the service-role key.
4. Provision the initial named operator accounts through the trusted project-owner procedure. Migration `0002_seed_registration_windows.sql` adds the 2027–2030 registration windows in Jakarta time.
5. Run `membership-platform/TEST_PLAN.md` in staging, including role boundaries, private-file access, concurrent NRA assignment, payment verification, Excel export and recovery checks.
6. Import the reviewed master list only after validating the import mapping. Keep unresolved source records in a manual review queue; do not infer historic dues as paid.
7. Update the public links only after staging passes and AEEVI approves launch.

## Master-list import checkpoint

The working master contains 237 active member rows and 48 retired NRA records. There are 59 source name–NRA records still marked for review. Earlier duplicate-group decisions retain the first NRA and retire later NRA values. Import the approved primary names only; do not add deleted alternative/comparison names as aliases. No member workbook or private member data is included in this branch.

## Files

- `supabase/migrations/0001_membership_core.sql`: schema, policies and atomic approval.
- `supabase/functions/membership-api/index.ts`: public/member/admin API.
- `public-config.js`: browser configuration placeholders.
- `../gabungAEEVI/`: public member and pengurus pages.
- `TEST_PLAN.md`: staging acceptance checks.
- `SETUP_RUNBOOK.md`: Supabase project, migration, first-admin and activation steps.
- `supabase/migrations/0002_seed_registration_windows.sql`: scheduled registration periods for 2027–2030.

## Source references

- Supabase Auth and RLS: https://supabase.com/docs/guides/auth and https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
