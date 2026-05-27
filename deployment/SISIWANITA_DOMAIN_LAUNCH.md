# SISIwanita Domain Launch

This runbook wires `https://sisiwanita.id` as a landing-only host.

## Architecture

- Apex domain: `https://sisiwanita.id`
- `https://www.sisiwanita.id` redirects to apex
- Public landing HTML: `public/sisiwanita/index.html`
- Standalone PWA files:
  - `public/sisiwanita.webmanifest`
  - `public/sisiwanita-sw.js`
- Auth and patient portal stay on `https://dokterdibya.com`
- All patient feature links on the landing redirect to:
  - `https://dokterdibya.com/patient-login.html?autoGoogle=1&theme=off`

## Files Added For This Host

- `deployment/sisiwanita.id.nginx.conf.example`
- `public/sisiwanita/index.html`
- `public/sisiwanita.webmanifest`
- `public/sisiwanita-sw.js`

## VPS Steps

1. Pull the latest code:

```bash
cd /var/www/dokterdibya
git pull origin main
```

2. Install the nginx template:

```bash
cp deployment/sisiwanita.id.nginx.conf.example /etc/nginx/sites-available/sisiwanita.id
ln -sf /etc/nginx/sites-available/sisiwanita.id /etc/nginx/sites-enabled/sisiwanita.id
```

3. Fill in the TLS certificate paths inside the nginx file.

4. Test nginx and reload:

```bash
nginx -t
systemctl reload nginx
```

## Behavior The Config Enforces

- `/`, `/index.html`, and `/sisiwanita/index.html` all serve the same landing file.
- `/sisiwanita.webmanifest` and `/sisiwanita-sw.js` are always fresh.
- `/images/`, `/scripts/`, `/js/`, and `/offline.html` stay available because the landing still depends on them.
- Other `*.html` routes on this host return `404`, so the host stays landing-only.

## Verification

Run these after reload:

```bash
curl -I https://sisiwanita.id/
curl -I https://sisiwanita.id/index.html
curl -I https://sisiwanita.id/sisiwanita.webmanifest
curl -I https://sisiwanita.id/sisiwanita-sw.js
curl -I https://www.sisiwanita.id/
```

Expected results:

- `https://www.sisiwanita.id/` -> `301` to `https://sisiwanita.id/`
- `https://sisiwanita.id/` -> `200`
- `https://sisiwanita.id/sisiwanita.webmanifest` -> `200`
- `https://sisiwanita.id/sisiwanita-sw.js` -> `200` with `Service-Worker-Allowed: /`

## Browser Checks

1. Open `https://sisiwanita.id/`
2. Confirm the page stays on the SISIwanita landing
3. Click the main CTA and confirm it opens:
   - `https://dokterdibya.com/patient-login.html?autoGoogle=1&theme=off`
4. Install the PWA and confirm the app opens back to the landing root
5. Open DevTools Application tab and confirm:
   - manifest name is `SISIwanita`
   - service worker script is `/sisiwanita-sw.js`

## Notes

- The landing now blocks leftover local trial-page links by rerouting them to the old-domain Google login.
- If the landing HTML changes again, keep `public/sisiwanita-sw.js` cache version in sync so the PWA refresh path stays predictable.
