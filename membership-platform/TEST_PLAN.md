# AEEVI membership staging checks

Run these checks only in a dedicated non-production Supabase project after applying the migration, deploying the Edge Function, and configuring Auth and Storage. These are acceptance checks; they have not run against a live Supabase project.

## Member account and application

1. Without Supabase configuration, the public form displays the setup notice and sends no data.
2. With configuration, request a magic link. An unconfirmed or signed-out caller cannot submit, revise, or view an application.
3. Confirmed applicants see only their own application history, NRA and annual-dues status.
4. With no open registration window, a valid account receives a closed-window response. Test exact Jakarta boundaries: 1 and 30 January, then 1 and 30 June.
5. Within an open window, submit a new application and a renewal with an NRA. The API stores the authenticated account email, not an unverified email supplied by the form.
6. A second active application by the same account in the same window is rejected.
7. Confirm a payment amount other than Rp 200.000 is rejected by the API and database. Upload a PDF/JPG/PNG below 5 MB. Confirm another account cannot read or replace the object. Confirm files above 5 MB and unsupported content types are rejected.
8. An existing-member renewal preserves its NRA. If the verified account/email does not match the master record, flag it for manual NRA and identity review before approval; a conflicting link to another account must fail.
9. For an application returned for correction, update the requested fields and resubmit; confirm the review history and status remain associated with the same application.
10. For rejected payment evidence, upload a replacement and confirm the previous payment decision remains auditable.

## Pengurus roles

- Registrar: can inspect application details and request correction or reject; cannot inspect payment evidence, verify payment, approve membership, or export the master.
- Treasurer: can inspect payment evidence and verify/reject payment; cannot approve membership or export the master.
- Membership admin: can perform validation and approve after payment is verified; can export the member workbook.
- Superadmin: can perform all membership actions and access operator administration. Provision or change operator roles only through the trusted project-owner procedure.
- A disabled or unlisted account receives a 403 response from admin actions.
- A member cannot call admin actions by changing browser controls or request payload.
- Confirm unauthorized roles cannot retrieve signed evidence URLs, and that each allowed evidence URL expires.

## NRA, dues and outputs

1. Approval without verified payment fails and leaves the application unapproved.
2. Submit a new application whose email or exact name matches the master. Confirm the queue flags it for duplicate review and approval is blocked until the reviewer acknowledges the check.
3. Approve a paid new member. Verify one NRA is issued in `BYYYYNNNN` format using the application's registration year, the application links to the member, and the NRA cannot later be changed.
4. Approve a paid renewal. Verify the existing NRA remains unchanged and only one annual-dues record exists for that member and year. An unlinked renewal must show a manual identity-review flag.
5. Attempt concurrent approvals for new members. Confirm NRA values remain unique and retired NRA values are not reused.
6. Confirm payment and application decisions appear in the audit log.
7. Download the Excel workbook from the pengurus page. Confirm the member and annual-dues sheets contain no payment evidence files or storage paths.
8. Confirm an approved member can display and print/save the digital card.
9. Confirm WhatsApp invitations are not sent automatically; any later automation must use an approved AEEVI channel and invitation URL.

## Data and recovery

- Import only the reviewed primary-name master. Keep the 59 source records marked for review in a manual queue; do not import removed comparison names as member aliases.
- Verify the database backup and payment-evidence file backup separately. Test restoration procedures before launch.
- Confirm export and backup files are stored with access limited to authorized AEEVI administrators.
