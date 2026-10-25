# Patient community edge panel verification

Scope: authenticated patient portal mobile launcher, existing community chat, full-screen right-hand animation, close/back and responsive composer. No chat messages were sent to production and no clinical data was changed.

## Automated checks

112 tests passed across 16 related suites, including the new runtime panel tests and existing community chat, patient session/socket, shell and offline draft contracts. New tests were first observed failing before implementation, including home Back-guard ordering, profile replacement navigation, intake exclusion, and retry after missing nickname.

An exploratory run also included the unrelated `StaffAssetModulePropagation.test.js` Chromium integration cases: 29 cases could not launch because the configured Puppeteer Chrome 148 binary is absent. No browser was installed; all interactive UI checks used the Codex in-app browser.

## In-app browser

The committed `staff/backend/tests/browser/patient-community-panel-fixture.cjs` serves actual portal assets with synthetic API data and a loopback polling socket. It binds only to `127.0.0.1`; `--deployed-assets` reads static assets from `https://sisiwanita.id` while keeping every fixture API local.

Verified 390x844, 390x480, 844x390 and 360x740. Panel bounds exactly match the visible viewport; iframe bottom matches the screen bottom and composer gap is approximately zero (less than 0.01 px). Also verified close and Escape, Back without the app exit dialog, draft retention, and profile -> return -> close -> reopen -> Back.

Production verification is recorded after deployment. These browser checks use synthetic content; they do not test physical Android hardware or post messages to live conversations.
