# Task 6 implementation report

## Scope and result

Implementation commit: `81d219cc4c21f308aed2e18a2540b759e1e427e2` on `codex/system-hardening-seamless`, starting from `e6105ef65dcd5585ef6ba271733ca887b1292d12`. This report is committed separately so it can name the implementation SHA. No push, deployment, production access, real patient operation, dependency update, or Wave 4 work was performed, as explicitly directed for this SDD subphase.

The implementation follows Task 6's approved nonvisual direction:

- Staff asset-version cutover now removes only registered disposable local cache keys, without clearing either storage area. Authentication, clinical drafts, filters, selected patient, and last navigation remain untouched.
- `PageRegistry` has a last-navigation generation guard while `ensureLoaded` still coalesces a page's fragment load. The final `main.js` UI commit independently checks its navigation generation. Cached menu activation duration is measured with no patient/MR argument.
- Patient profile remains the first authenticated/intake gate. An incomplete intake now stops bootstrap. After that gate, portal settings and the independent notification-count read overlap; nickname still waits for settings, and birth pending/congratulations retain their original order. `loadProfile()` sets `PatientSession` identity, `fetchPortalSettings()` consumes and rechecks that identity, and the nickname gate consumes `portalSettings.nickname`: those three operations cannot safely start concurrently despite the high-level performance aspiration.
- Coordinator jobs, staff notification badges/count, and patient home queue pause when hidden, avoid overlapping reads, and request one immediate refresh on return to visible; an in-flight read completes before the queued refresh. Normal intervals remain unchanged.
- Staff/patient workers use app-scoped versioned static caches, reject failed precache installs, keep HTML/API network-only/no-store, and delete only their own old caches. Patient worker `SKIP_WAITING` checks use logical conjunction. Staff `v413` and patient `20260924wave3` references are synchronized across the shell, worker, compatibility worker, landing, and manifests. No markup/CSS layout redesign was made.
- Performance workflow targets `/staff/public/index-adminlte.html`, accepts the staff token only through `STAFF_PERF_TOKEN`, and fails when absent. It measures cold and warm loads and five cached dashboard activations, enforcing warm requests <=40, zero failed warm requests, and cached activation p95 <=1000 ms. RUM accepts existing uppercase and live lowercase vitals, aggregates them canonically, allowlists cached activation, and buckets API paths without query or dynamic patient path segments.

## TDD evidence

Local Jest commands used `NODE_PATH=D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules` because dependencies are installed in the saved checkout rather than this worktree; Chromium structural tests additionally used `PUPPETEER_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`.

Each family was run against the pre-patch implementation before editing production code:

| RED focused command suffix (`jest --runInBand --forceExit --coverage=false`) | Baseline failure |
| --- | --- |
| `tests/unit/RealtimeClientAuth.test.js -t 'asset cache cutover'` | 1 failed: clinical draft and selected patient erased |
| `tests/unit/StaffPanelWave2LazyShell.test.js -t 'last navigation'` | 1 failed: late page became active |
| `tests/unit/StaffPanelWave3Lifecycle.test.js -t 'resumes once'` | 1 failed: no immediate resume |
| `tests/unit/StaffPanelWave3Lifecycle.test.js -t 'performance workflow'` | 1 failed: skip-on-missing secret, CLI token, wrong URL |
| `tests/integration/observabilityAuth.test.js -t 'live lowercase'` | 1 failed: frontend vital payload returned HTTP 400 |
| `tests/integration/observabilityAuth.test.js -t 'path buckets'` | 1 failed: patient path sentinel appeared in RUM summary |
| `tests/unit/Task6ServiceWorker.test.js` | 5 failed: partial installs resolved, unrelated caches deleted, bitwise message condition |
| `tests/unit/Task6ServiceWorker.test.js -t 'patient precache'` | 1 failed: unversioned/third-party static assets |
| `tests/unit/Task6ServiceWorker.test.js -t 'both workers treat'` | 1 failed: non-navigation patient HTML lacked no-store branch |
| `tests/unit/Task6Polling.test.js` | 2 failed: missing visible badge refresh and hidden patient queue poll |
| `tests/unit/Task6Polling.test.js -t 'notification count'` | 1 failed: in-flight visible refresh was dropped |
| `tests/unit/Task6PatientBootstrap.test.js` | 2 failed: incomplete intake did not return false; no independent overlap |
| `tests/unit/Task6PerformanceGate.test.js` | RED: importing the gate called `process.exit(1)`; missing numeric fixture was later shown to pass incorrectly |

GREEN final focused command: `node D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules/jest/bin/jest.js --runInBand --forceExit --coverage=false --silent tests/unit/RealtimeClientAuth.test.js tests/unit/StaffPanelWave1Hardening.test.js tests/unit/StaffPanelWave2LazyShell.test.js tests/unit/StaffPanelWave3Lifecycle.test.js tests/unit/Task6ServiceWorker.test.js tests/unit/Task6Polling.test.js tests/unit/Task6PatientBootstrap.test.js tests/unit/Task6StructuralSnapshot.test.js tests/unit/Task6PerformanceGate.test.js tests/unit/WebHardeningPlan.test.js tests/integration/observabilityAuth.test.js` — **11 suites, 83 tests passed**.

The deferred-promise bootstrap test demonstrates the critical path: settings and notification count do not start before profile/intake; they start together after the profile promise resolves; nickname does not run until both resolve; content remains hidden until nickname succeeds; birth pending precedes birth congratulations.

The structural tests mask dynamic script/style bodies and cache-version query values and compare approved tag/attribute hashes. A Chromium DOM test then compares the same masked element hierarchy at 1366×768 desktop and 390×844 mobile/PWA viewports with scripts disabled. This is structural equivalence evidence, **not** a production screenshot or pixel-level visual assertion.

## Final validation

- Full integration: `jest --runInBand --forceExit --coverage=false --silent --testPathPatterns=integration` — **23 suites, 238 tests passed**.
- Existing staff smoke: four prescribed suites (`StaffPanelWave1Hardening`, `StaffPanelWave2LazyShell`, `StaffApiClient`, `observabilityAuth`) — **4 suites, 34 tests passed**.
- `node scripts/staff-static-check.js` — passed; HTML 317544 bytes, inline JS 41162 characters, cache `v413`.
- `node --check` — passed for 21 changed/new JavaScript files. `git diff --check` and staged diff check — passed. Package has no applicable frontend build script; no dependency/build configuration was changed.
- CLI failure proof: with no `STAFF_PERF_TOKEN`, `node scripts/perf-budget-check.js --base-url http://127.0.0.1:9` exited 1 with only a configuration message; supplying a synthetic `--token` was also rejected without printing its value. Browser performance against a real authenticated target was deliberately not run locally.

Controller-supplied read-only pre-Task6 production baseline (not local verification): `/api/rum/summary` HTTP 200 with empty vitals/API; five warm reload load times `[523,433,501,385,300]` ms, p75 `501` ms and p95 `523` ms, resource counts `[83,75,59,84,59]`; one cache-disabled cold load DCL `341` ms, load `460` ms, 75 resources, 710255 transferred bytes. Post-deployment controller gates remain p75 <=375.75 ms (25% improvement) and p95 <=549.15 ms (<=5% regression), alongside CI's <=40/zero-failure/cached <=1000 ms fixture. No post-deployment improvement is claimed.

## Self-review and remaining gates

The diff contains only Task 6 shell, worker, RUM/performance, and focused test files. No patient identifier is supplied to the new cached-activation metric; RUM API query strings and post-resource path segments are discarded on both client and server. Potential tradeoff: a poll that never settles will defer visible refresh indefinitely rather than overlap requests; normal API requests have their existing timeouts. The patient worker no longer serves a cached HTML offline page because the approved no-store HTML rule takes precedence; static assets remain available from the versioned cache. These behavior boundaries should be reviewed before rollout.

Release still requires controller review, CI with a configured `STAFF_PERF_TOKEN`, production deployment via the approved atomic process, live asset/cache and desktop/PWA verification, a staffed-session RUM comparison to the controller baseline, and rollback if the p75/p95 gate fails. This task was intentionally not deployed.

## Review Round 1 correction

The five findings in `task-6-review.md` were addressed on top of `81682db9`, with no push, deploy, production access, patient data, or dependency-version change. This correction follows the approved nonvisual Task 6 direction. The prior structural-only visual claim above is superseded by the screenshot comparison below.

### RED evidence and correction

All commands below used `NODE_PATH=D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules` and `node D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules/jest/bin/jest.js --runInBand --forceExit --coverage=false` from `staff/backend`; Chromium tests also used `PUPPETEER_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`.

| Finding | Focused RED against prior implementation | Correction and GREEN |
| --- | --- | --- |
| Final Staff UI race | `tests/unit/Task6NavigationRace.test.js`: four direct-handler/synchronous races failed; `-t registered-fragment`: six actual async handlers failed after a later Finance click. | One shared `staffNavigationGeneration` now governs registry, legacy direct, sync, and delayed commits, including Sunday, cashier, hospital, and Kantor callbacks. `Task6NavigationRace`: **10/10 passed**. |
| CI dependency bootstrap | `tests/unit/Task6PerformanceGate.test.js`: workflow test failed because `npm ci` was absent. | Credential precheck, locked `npm ci`, and Puppeteer Chrome installation precede the gate. Secret exists only in step environment, not argv. Missing-secret subprocess exits 1 before a request. **3/3 passed**. |
| Patient SW offline keys | `tests/unit/Task6ServiceWorker.test.js -t shell-owned`: actual shell asset URL failed offline; static import graph then exposed two uncached community modules. A cache-namespace test separately failed while still at `20260924wave3`. | Added four missing shell/import scripts; versioned precache lookup ignores query **only** for same-origin app-owned immutable paths. Rotated the patient worker, compatibility registration, shell, landing, and manifest versions together to `20260924wave3r1` so a failed install cannot delete the active cache. HTML/API remain no-store; foreign/staff assets cannot borrow cache entries. **11/11 passed**. |
| RUM first path segment | `tests/integration/observabilityAuth.test.js -t unknown first API` exposed synthetic first-segment sentinel; `tests/unit/Task6RumPathPrivacy.test.js` exposed it on the client. | Client and server now emit only allowlisted static route-family buckets; unknown families collapse to `/other`. Distinct known categories remain separate. Combined **8/8 passed**. |
| Visual regression | `tests/unit/Task6VisualBaseline.test.js` initially failed because the screenshot comparator was absent. | Chromium now renders approved commit `e6105ef6` and current Staff desktop (1366×768) and patient PWA (390×844) shells with real local CSS/assets, JavaScript disabled, external requests blocked, deterministic dynamic-region/animation masking, and pixel comparison. An injected 80px CSS displacement with identical DOM exceeds the failure threshold. **3/3 passed**. Staff CI fetches full Git history so the approved baseline commit is available. |

The masked visual gate is a local/CI structural pixel comparison, not live-browser or post-deployment evidence. It intentionally ignores sub-24-channel pixel noise and allows <0.2% differing pixels, while the synthetic displacement must exceed 2%. It fetches approved source/assets from the pinned commit at test time, rendering both sides with the same Chromium binary; this avoids comparing a Windows screenshot artifact against a Linux CI browser. It does not execute clinical scripts or load patient data.

### Validation and limits

- Focused Task 6 round: 11 suites, **63 tests passed** after the import-graph and cache-rotation additions (navigation, workflow, SW, RUM, visual, existing structural/bootstrap/polling/lifecycle, and RUM integration).
- Full integration: 23 suites, **239 tests passed**.
- Existing Staff smoke: 4 suites, **35 tests passed**.
- Staff static check passed (HTML 317544 bytes; inline JS 41162 chars; cache `v413`); `node --check` passed for changed JavaScript; `git diff --check` passed. The Stage 2 main.js byte-budget assertion remains below 218000 bytes after shortening local variable names without changing behavior.
- The broader all-unit sweep is **not green** but returned to the controller's `fc0a483f` baseline failure counts: **157 suites/1167 tests passed; 12 suites/13 tests failed** (169 suites/1180 tests total). The unchanged failures include native Gambiran media conversion and older static modularity/visual assertions. The one newly crossed main.js size threshold was corrected; an additional Task 6 patient-shell size threshold was corrected by tightening only its new queue/bootstrap code to 171977 normalized bytes (<172000), with deferred bootstrap and polling behavior tests still green. Neither failure remains in the final sweep.
- A separate clean-copy `npm ci` rehearsal could not start locally because this Codex Windows runtime has Node but no `npm` executable or npm CLI (`CommandNotFoundException`). The workflow order/lockfile resolution and missing-secret failure are tested, but actual clean Ubuntu dependency/browser installation remains a CI release gate; no local success is claimed.

Self-review: the Staff generation guard is shared by final UI commits, preserving same-page PageRegistry coalescing. SW ignore-search never applies to HTML/API, other origins, or Staff paths. RUM buckets cannot hold arbitrary first segments, though less common API families intentionally aggregate as `/other`. Visual source is pinned to the pre-change commit and cannot silently compare two copies of current markup. No visible UI/layout/CSS was changed. Review, CI, staged dry-run deployment, live performance comparison, and the approved release gates remain pending.
