# Patient community edge panel verification

Scope: authenticated patient portal mobile launcher, existing community chat, full-screen right-hand animation, close/back and responsive composer. No chat messages were sent to production and no clinical data was changed.

## Automated checks

112 tests passed across 16 related suites, including the new runtime panel tests and existing community chat, patient session/socket, shell and offline draft contracts. New tests were first observed failing before implementation, including home Back-guard ordering, profile replacement navigation, intake exclusion, and retry after missing nickname.

An exploratory run also included the unrelated `StaffAssetModulePropagation.test.js` Chromium integration cases: 29 cases could not launch because the configured Puppeteer Chrome 148 binary is absent. No browser was installed; all interactive UI checks used the Codex in-app browser.

## In-app browser

The committed `staff/backend/tests/browser/patient-community-panel-fixture.cjs` serves actual portal assets with synthetic API data and a loopback polling socket. It binds only to `127.0.0.1`; `--deployed-assets` reads static assets from `https://sisiwanita.id` while keeping every fixture API local.

Verified 390x844, 390x480, 844x390 and 360x740. Panel bounds exactly match the visible viewport; iframe bottom matches the screen bottom and composer gap is approximately zero (less than 0.01 px). Also verified close and Escape, Back without the app exit dialog, draft retention, and profile -> return -> close -> reopen -> Back.

## Production

Runtime commit `c06fac80ad15da695070e202cfc3c45464aa61fc` was pushed on `codex/patient-community-edge` and deployed to `/var/www/dokterdibya` on 25-10-2026. All 12 affected static assets matched their committed SHA-256 hashes on both `https://sisiwanita.id` and `https://dokterdibya.com`. The first immediate HTML check caught the previous nginx worker response and rolled back; the retry used bounded served-hash verification and completed successfully.

Health returned `healthy`, database `connected`, and PM2 `dibyaklinik-backend` remained `online`. In the actual production origin, the in-app browser confirmed active worker `/sw.js?v=20261025edgechat1` and confirmed that both new JS/CSS assets were cached.

The `--deployed-assets` fixture fetched the deployed static files for another in-app-browser pass at 390x844, 390x480, 844x390 and 360x740. All panel/composer geometry checks passed; close returned to the home page with the exit dialog inactive. Launcher bounds at 390x844 were x=338, right=390, width=52, height=58. Evidence is saved locally under `output/patient-community-panel-deployed.png` and `output/patient-community-panel-deployed-verification.json`.

These UI checks use synthetic content; authenticated live patient conversations and physical Android hardware were not exercised. No production chat messages or clinical writes were performed.
