# Community chat attention verification — 23 September 2026

Approved scope: room-member mentions, structured quotes, nickname-only typing, targeted portal/push notifications, server unread state and green Home-card count, smooth chat motion. Implementation follows the approved plan. No plugin or native app rebuild.

## Completed checks before deployment

- 21 focused unit tests passed (six CommunityChat suites), with observed failing baselines for typing identity, unread endpoints, mention edits/count formatting, shared staff session, overlapping context requests.
- Browser smoke passed with synthetic APIs at 390px and 1280px: keyboard/touch mention selection, duplicate nickname identity, quote metadata, typing nickname, stable history scroll, socket dedup, missed-message recovery, quote navigation/error recovery, viewport resize, reduced motion, badge 99+/zero/retry, DocBoard staff login with concurrent patient login.
- MariaDB integration passed in a disposable database. No real patient data copied or modified. Verified migration twice without resetting the baseline, multiple-room unread counts, own-message exclusion, monotonic read cursors, authorization, missing/cross-room quotes, one actual notification row and one mocked push dispatch for combined mention/quote, deleted-message context.
- DocBoard Vite production build and date utility tests passed.
- Syntax checks and git diff whitespace checks passed.
- Independent review findings were fixed and covered by regression tests.

## Existing suite failures

Full suite: 138 suites passed, 13 failed; 940 tests passed, 16 failed (before the last context regression test was added). Every listed failure also occurs in the original checkout; no unrelated fixes included.

- FrontendModularizationStage2Wave2.test.js
- FrontendModularizationStage2Wave3.test.js
- FrontendModularizationStage2Wave4.test.js
- FrontendModularizationStage2Wave5.test.js
- FrontendModularizationStage2Wave6.test.js
- patientGoogleRegistrationFlow.test.js
- PatientPortalHeaderBranding.test.js
- RegistrationCodeHeader.test.js
- StaffPanelWave6StartupSchema.test.js
- StaffPatientShellWave1.test.js
- SundayClinicPwaVisualRefactor.test.js
- SundayClinicWave5Modularity.test.js
- WebHardeningPlan.test.js

The original baseline also intermittently failed integration/sloAuth.test.js. Two unrelated DocBoard source-text tests were sensitive to CRLF in the new Windows worktree; both passed with LF without source changes. Original file bytes were restored afterward. The suite leaves a pre-existing worker timer open, so the complete comparison used --forceExit.

## Deployment verification

- Feature commit `b3557cad` was pushed to main and deployed at `/var/www/dokterdibya` on 23 September 2026, about 11:49 WIB. Migration completed with baseline message ID 20, so existing history was excluded from new unread counts.
- `dibyaklinik-backend` is online; public `/api/health` reports healthy with the database connected. All operational schemas validate. Unauthenticated unread requests return 401 with no-cache headers.
- SHA-256 of the served chat page, Home page, mention/badge/session scripts, motion CSS and service worker matches the deployed files. DocBoard production assets `index-hHzkt6uv.js` and `index-BUeAnSKc.css` are served on its established `dokterdibya.com/docboard/` route.
- Both 390px and 1280px browser runs passed against the real deployed assets with isolated API fixtures. This proves rendered UI behavior without writing to patient rooms; it is not an authenticated patient end-to-end test.
- Live verification exposed an existing redirect that moved staff chat links to the patient domain and lost the DocBoard session. The regression first failed against that redirect. The versioned Nginx snippet now keeps `staffBridge=1` chat links on the staff origin; ordinary patient links still redirect to SISIwanita. Nginx validation passed, live staff chat returns 200, patient redirect returns 301, and the browser regression passes with a DocBoard token and concurrent synthetic patient session.
- DocBoard build initially hit an existing non-executable esbuild binary (mode 644). Restoring that binary to mode 755 resolved the build; only new source files and the built dist received ownership/permission updates.

## Device verification boundary

Browser fixtures verify deployed assets and interaction without posting synthetic chat to real rooms. The database integration mocks only push delivery, not notification persistence. Actual push arrival on a recipient device is a separate acceptance step and requires a designated test account/device; the user has been asked for this missing recipient. Do not describe device delivery as verified from these tests.
