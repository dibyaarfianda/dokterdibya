# Prompt for Claude: Patient Portal + PWA + Real-time Badge

You are a senior engineer onboarding to the DokterDibya patient portal. Your goal is to fully understand how the patient portal works across web/PWA, then implement real-time badge notifications (bell count and related badges) without breaking existing flows.

Follow the project rules in [CLAUDE.md](CLAUDE.md) exactly. Do not assume APIs, method names, or dependencies. Verify in code before changes.

## Objectives
1. Map the patient portal architecture (web + PWA) and the auth/data flow.
2. Understand existing notification flows (API + Socket.IO + UI badges).
3. Implement real-time badge notifications for the patient portal, with correct cache behavior and minimal disruption.

## Must-Read Files (in this order)
- [CLAUDE.md](CLAUDE.md) (project rules; must comply)
- [README.md](README.md) (monorepo structure)
- [DOKTERDIBYA_COMPREHENSIVE_REVIEW.md](DOKTERDIBYA_COMPREHENSIVE_REVIEW.md) (high-level architecture)
- [WEB_PATIENT_SYNC_IMPLEMENTATION.md](WEB_PATIENT_SYNC_IMPLEMENTATION.md) (patient identity/data sync)

### Patient Portal (Web + PWA)
- [public/patient-login.html](public/patient-login.html) (auth entry)
- [public/patient-menu.html](public/patient-menu.html) (main dashboard, notification badge)
- [public/notifikasi.html](public/notifikasi.html) (notification list + mark read)
- [public/scripts/patient-utils.js](public/scripts/patient-utils.js) (auth + API helper)
- [public/js/announcements-dashboard.js](public/js/announcements-dashboard.js) (Socket.IO client + announcement updates)
- [public/js/announcements.js](public/js/announcements.js) (legacy announcements file; note the API host)
- [public/manifest.json](public/manifest.json) (PWA metadata)
- [public/sw.js](public/sw.js) (patient PWA SW; note push + cache behavior)
- [public/offline.html](public/offline.html)

### PWA Focus (No Mobile Wrapper)
- Do not review or modify Capacitor or native Android wrapper code for this task.

## Current Behavior (verify in code)
- Patient auth is token-based and stored in browser storage (see `patient-utils.js` and `patient-menu.html`).
- `patient-menu.html` renders the bell badge (`#notif-badge`) and calls `loadNotificationCount()` once on load.
- `announcements-dashboard.js` uses Socket.IO for real-time announcement updates and USG updates, but does not update the bell badge.
- PWA service worker is network-first for HTML and cache-first for assets, with no special handling for notification counts.

## Your Task: Real-Time Badge Notifications (PWA)
Implement real-time updates for patient badges (bell count + related badges) so the PWA UI reflects new notifications without page refresh.

### Requirements
- Use existing real-time channels if available (Socket.IO is already in `patient-menu.html`).
- Do NOT break existing polling / initial load logic.
- Ensure badge updates are accurate after:
  - New notification created (e.g., announcement, booking update, document/USG update).
  - Notification marked read (e.g., from `notifikasi.html`).
- Respect PWA cache rules; do not cache real-time API responses.
- Keep all token/auth handling consistent with existing utilities.

### Suggested Approach (validate in code before implementing)
1. Locate backend event(s) related to patient notifications and announcements. Confirm Socket.IO events and payloads.
2. Reuse the existing Socket.IO connection from `announcements-dashboard.js` or centralize it for the patient portal.
3. On relevant events, call `loadNotificationCount()` and `loadUnreadUsgCount()` to update badges.
4. If notifications are marked read, ensure the badge decreases immediately (local update or refetch).
5. Add minimal UI feedback (e.g., badge animation or updated count) without redesigning the UI.

### Endpoints to Verify (do not assume)
- `/api/patient-notifications/count`
- `/api/patient-documents/unread-usg-count`
- `/api/announcements/active`
- Any socket events in backend that signal patient notification updates.

## Constraints and Pitfalls
- Follow all rules in [CLAUDE.md](CLAUDE.md), especially: verify before coding, no hardcoded token keys, and use the existing real-time patterns.
- Socket.IO transport constraints exist in staff portal; verify if patient portal uses the same restrictions.
- Service worker caching can mask real-time updates; avoid caching notification endpoints.

## Deliverables
1. A short architectural summary (how patient portal + PWA fit together).
2. Code changes implementing real-time badge updates.
3. Test plan + actual test results (do not claim done without testing).

## Definition of Done
- Badge count updates in real time when notifications are created or read.
- No regressions in login or PWA load behavior.
- Changes comply with project rules in [CLAUDE.md](CLAUDE.md).
