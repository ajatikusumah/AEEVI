# AEEVI membership staging checks

Run these checks only in a dedicated non-production Supabase project after the migration and Edge Function are deployed.

## Account and application

1. Without Supabase configuration, the public form displays the setup notice and sends no data.
2. With configuration, request a magic link. An unconfirmed or signed-out caller cannot submit or view an application.
3. Confirmed members see only their own application history, NRA and dues.
4. With no open registration window, a valid account receives a closed-window response. Test the exact Jakarta boundaries: 1 and 30 January, then 1 and 30 June.
5. Within an open window, submit a new application and a renewal application with an NRA. The API stores the authenticated account email rather than accepting an unverified email from the form.
6. A second active application by the same account in the same window is rejected.
7. Upload a PDF/JPG/PNG below 5 MB. Confirm another account cannot read or replace the object and that a file above 5 MB or an unsupported content type is rejected.
8. An existing member renewal preserves the existing NRA. If account linkage is ambiguous or conflicts with another account, final approval must fail and the case must be reviewed.

## Pengurus roles

- Registrar: can review applications and request corrections or reject; cannot inspect payment evidence, validate payment, approve membership, or export the master.
- Treasurer: can inspect evidence and verify/reject payment; cannot approve membership or export the master.
- Membership admin: can validate payment and approve after payment is verified; can export the master workbook.
- Superadmin: can administer roles/configuration and perform all membership actions.
- A disabled or unlisted account receives a 403 response from admin actions.
- A public member cannot call admin actions by changing the browser UI or request body.

## NRA, iuran and output

1. Approval without a verified payment fails and leaves the application pending.
2. Approve a paid new member. Verify one NRA is issued in B + year + four-digit sequence format, the application links to that record, and the NRA cannot later be changed.
3. Approve a paid renewal. Verify the existing NRA remains unchanged and only one annual dues record exists for that member/year.
4. Try two concurrent approvals for new members. Confirm unique NRA values with no reuse of retired NRA values.
5. Verify payment and application decisions appear in the audit log.
6. Download the .xlsx from the pengurus page and verify its member and annual-dues sheets contain no evidence files.
7. Verify an approved member can display and print/save the digital card.
8. Confirm the WhatsApp invitation is not auto-sent until an approved AEEVI messaging channel and invitation URL are configured.

## Data and recovery

- Import only the reviewed master list. Treat the 59 source records marked for review as a manual queue; do not import comparison names as member aliases.
- Verify the database export and payment evidence files are backed up separately. Supabase database backups do not include Storage objects.
