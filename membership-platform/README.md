# AEEVI Membership Platform — Foundation

## Current site and implementation decision
The public AEEVI site is a static HTML/CSS/JavaScript site in `ajatikusumah/AEEVI`, served from the repository's custom domain `aeevi.org`. The repository README says that it is not connected to a membership form or database. The connected Vercel account currently has no AEEVI project. Keep the existing public site and add the registration application to it; do not migrate the domain or replace the site to add membership features.

Recommended backend: a dedicated Supabase project for PostgreSQL, Auth, private Storage, and Edge Functions. Supabase's JavaScript client supports database, auth, function and file operations. Every exposed table and payment-evidence object must be protected by Row Level Security (RLS). Never put a service-role key in the public website.

## Main data model
- `members`: one canonical person record and one immutable NRA. Existing master rows are imported here after validation; do not create member records for unapproved applications.
- `member_name_aliases`: historical spelling/source variants linked to a canonical member. Keep unresolved source conflicts separate; do not auto-merge by name alone.
- `registration_windows`: editable windows, configured in Asia/Jakarta, normally 1–30 January and 1–30 June.
- `applications`: new or renewal request, applicant account, submitted fields and review state. An application is not a member record.
- `payment_submissions`: each annual fee payment and evidence, with pending/verified/rejected status and reviewer details. Historical evidence without treasurer verification stays unverified.
- `annual_membership_dues`: one verified dues record per member and calendar year.
- `admin_users`: allowlisted AEEVI operator accounts and roles, provisioned by a project owner.
- `audit_log`: append-only record of sensitive admin actions.

The SQL migration establishes the core tables, uniqueness constraints, NRA immutability and private-by-default RLS. It intentionally contains no member data and no Supabase credentials.

## Application workflow
1. A visitor can submit only while an enabled window is open. They authenticate and verify an email address before checking status or submitting. Keep WhatsApp OTP as a later integration; do not treat NRA alone as authentication.
2. Renewal applications are matched against the master by NRA plus verified contact/account linkage. New requests are checked for possible duplicates; ambiguous name/NRA conflicts go to a manual validation queue.
3. An application, payment and member record have separate statuses. A treasurer's explicit verification is required before annual dues show as paid.
4. An authorized reviewer approves the application. For a renewal, link to the existing member and preserve the NRA. For a new member, allocate an unused NRA in a database transaction only at final approval, then create the canonical member record.
5. A successful approval triggers card generation and notification. Send a WhatsApp group invitation only through a configured, authorized channel; never imply the system can add a person to a group automatically.
6. The member portal shows only that member's NRA, application history and each annual dues status. Exports are available only to authorized administrators and omit payment files.
7. Keep inactive historical members and retired/duplicate NRA decisions in the audit trail. Do not delete or recycle an NRA.

## Edge Functions to implement next
- `submit-application`: validate window, authenticated identity, required fields, duplicate warnings, create request.
- `review-application`: admin-only approve/reject/request-correction; attach existing member or create new member transactionally.
- `verify-payment`: treasurer-only verification and annual-dues posting.
- `member-dashboard`: return the authenticated member's own NRA and dues statuses.
- `export-members`: admin-only filtered workbook export with role checks and audit log.
- `issue-digital-card`: generate/refresh a card only for an approved member.
- `send-member-invite`: optional WhatsApp integration after approval and consent.

## Setup still required
1. Create a dedicated Supabase project owned by AEEVI and configure its database, Auth email verification, and private payment-evidence bucket.
2. Apply the migration in `supabase/migrations`.
3. Create the first administrator accounts through a trusted project-owner procedure; never expose admin self-registration.
4. Configure secret values in the Supabase project and deployment settings. Keep only the Supabase URL and publishable key in the static client.
5. Implement the functions and connect the existing `membership.html` page; test in staging before linking it publicly.
6. Import the 275-row reviewed master only after confirming data-cleaning decisions. The current workbook notes 33 unresolved duplicate-name groups and 59 source name–NRA conflicts. Do not bulk-import uncertain merge decisions or infer historical dues as verified.

## Source references
- Supabase Auth and RLS: https://supabase.com/docs/guides/auth and https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
