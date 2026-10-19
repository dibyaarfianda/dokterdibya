# Cerita Pasien durable drafts

Implement the eight agreed protections: immediate per-account device persistence, private server autosave, recovery, truthful save status, save-and-close and explicit deletion, account isolation, retained drafts on failed delivery and idempotent submission, and explicit conflict resolution across tabs/devices.

## Task 1: Storage and API

- Add `patient_story_drafts` (one versioned row per owner) and `patient_story_submissions` (durable unique owner/draft delivery receipts). Keep these separate from moderation until deliberate submission.
- Implement `PatientStoryDraftService`: read, compare-and-swap save/delete, and transactional submit; preserve whitespace and partial fields. Validate IDs, versions and lengths. Retain tombstones so stale clients cannot resurrect submitted/deleted drafts. Retry by mutation ID is idempotent.
- Mount GET/PUT/DELETE `/api/patient-stories/draft` and POST `/draft/submit` behind patient authentication. Derive owner from authentication, never request data. Send no-store headers; permit these exact patient routes.
- Route authorized dummy sessions through the same storage/service with session-scoped owners and isolated delivery receipts, without creating production patient stories.
- RED: focused Jest tests fail for absent draft persistence/route protection. GREEN: service and authorization tests, including conflict and duplicate delivery.

## Task 2: Editor

- Add a testable controller in `public/scripts/patient-story-drafts.js` and DOM binding in `patient-story-editor.js`.
- Save every input synchronously to account-scoped device storage, retry network sync with a bounded delay, flush on background/online, and poll on foreground. Do not rely on unload for durability.
- Persist pending submission IDs; acknowledge before clearing. Preserve all unsynced local variants with separate per-editor keys so conflicting tabs can recover their own text. Show recoverable local versions when necessary.
- Replace form reset with explicit restore; show resume, status, save-and-close, delete, and conflict actions. Preserve existing moderation and category contract.
- RED/GREEN: recovery after reload, failed storage/network, account switch/in-flight response, remote conflict, pending delete and delivery retry.
- Cache-version the new scripts; add offline page/assets to patient service worker.

## Task 3: Verify and deploy

- Run focused tests and related existing patient security/demo tests; syntax-check JS and inspect the final diff. Perform a fresh independent review and address material findings.
- Commit and push to the existing GitHub repository; fast-forward established VPS checkout without unrelated changes. Apply additive idempotent migration, reload only dibyaklinik-backend, fix only new-file permissions.
- Verify served asset hashes, health/database, same production draft API using isolated dummy sessions, and the rendered editor in Codex in-app browser. Exercise typing, background return, refresh, close/reopen, offline/error recovery, conflicts and account isolation.
- Record actual evidence and distinguish browser lifecycle simulation from a real mobile telephone call.

## Review focus

Account changes during requests, writes arriving out of order, lost responses after committed submission, conflict recovery after closing either tab, failed localStorage, offline deletion, and cache behavior. No synthetic clinical records or announcements.
