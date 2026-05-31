# Go-Live SISIwanita Patient Portal

## Target architecture
- `https://sisiwanita.id/` remains the public landing page.
- Patient portal live pages live on `sisiwanita.id` with final non-trial URLs, for example `/patient-login.html`, `/patient-menu.html`, `/album-usg.html`, `/dokumen-medis.html`, `/booking-klinik.html`, and `/fertility-calendar.html`.
- Staff panel, Sunday Clinic staff, and staff-only pages remain on `dokterdibya.com`.
- Patient API calls use same-origin `/api/...` on `sisiwanita.id`, proxied to the same backend/database.
- Patient auth tokens are stored under the `sisiwanita.id` browser origin, separate from `dokterdibya.com`.

## Nginx requirements
Use `deployment/sisiwanita.id.nginx.conf.example` as the SISIwanita server block reference.

Required behavior:
- Serve `/` from `public/sisiwanita/index.html`.
- Serve live patient pages from `public/*.html`.
- Proxy `/api/` and `/socket.io/` to the Dokter Dibya backend.
- Block `/staff/` and staff/admin pages from the SISIwanita domain.
- Keep patient HTML no-cache so new portal versions are picked up immediately.

## Google OAuth requirement
Add these in Google Cloud Console for the patient OAuth client:
- Authorized JavaScript origin: `https://sisiwanita.id`
- Authorized redirect URI if used by the current Google flow: `https://sisiwanita.id/patient-login.html`

## Legacy behavior
Old patient trial URLs should no longer be linked from the live SISIwanita portal. If a legacy redirect is installed on `dokterdibya.com`, redirect patient-facing pages to the matching final URL on `https://sisiwanita.id/` while leaving staff and Sunday Clinic staff paths untouched.

## Verification checklist
- Search live SISIwanita files for `trial` and confirm none remain except historical docs/backups if intentionally kept.
- Open `https://sisiwanita.id/` and use the CTA/login flow.
- Confirm portal URLs no longer contain `-trial.html`.
- Confirm `/api/...` calls work same-origin on `sisiwanita.id`.
- Confirm staff panel and Sunday Clinic staff still work on `dokterdibya.com`.
- Confirm PWA cache name is `sisiwanita-patient-portal-*`.
