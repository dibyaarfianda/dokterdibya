# Prompt for Claude: Patient Portal Badges for New Updates

You are a senior engineer tasked with implementing consistent "new" badges and notification indicators across the patient portal. The goal is to inform patients whenever there are new items (Aplikasi, Edukasi, Tanya Dokter replies, and any other relevant updates).

Follow the project rules in [CLAUDE.md](CLAUDE.md) exactly. Do not assume APIs, method names, or dependencies. Verify in code before changes.

## Objectives
1. Add or standardize badges for "new" items across the patient portal.
2. Ensure badges update in real time when new items appear.
3. Keep behavior consistent across pages and menu cards.
4. Avoid regressions in PWA behavior, caching, and auth.

## Must-Read Files (in this order)
- [CLAUDE.md](CLAUDE.md) (project rules; must comply)
- [public/patient-menu.html](public/patient-menu.html) (menu cards, notification bell, badge styles)
- [public/notifikasi.html](public/notifikasi.html) (notification list)
- [public/scripts/patient-utils.js](public/scripts/patient-utils.js) (auth + API helper)
- [public/js/announcements-dashboard.js](public/js/announcements-dashboard.js) (Socket.IO updates)
- [public/sw.js](public/sw.js) (PWA cache rules)

## Scope
- Patient portal PWA only.
- Badges must cover at minimum:
  - Aplikasi
  - Edukasi
  - Tanya Dokter (new reply from doctor)
- Badges must also appear on the notification bell where appropriate.

## Current State (verify in code)
- Menu cards are rendered in [public/patient-menu.html](public/patient-menu.html).
- Notification bell badge uses `#notif-badge` and is loaded via `/api/patient-notifications/count`.
- `announcements-dashboard.js` already listens to some Socket.IO events.

## Requirements
- Consistent badge styles (size, color, animation) across sections.
- Badges appear on:
  - Menu cards on the patient home page.
  - Notification bell (overall summary count if applicable).
- Real-time updates when new content arrives or is read.
- Do not break existing flows (login, navigation, PWA caching, offline fallback).
- No hardcoded tokens or role names.

## Suggested Approach (validate in code before implementing)
1. Inventory existing badge styles and usage in `patient-menu.html` and related scripts.
2. Identify backend endpoints or socket events that signal new content for:
   - Aplikasi
   - Edukasi
   - Tanya Dokter replies
3. Implement a unified badge update helper.
4. Wire badge updates to real-time events (Socket.IO) and fallback to polling.
5. Ensure badges clear when items are viewed/read.

## Endpoints and Events to Verify (do not assume)
- `/api/patient-notifications/count`
- Tanya Dokter: endpoints for unread replies or counts
- Edukasi: endpoints for new content
- Aplikasi: endpoints for updates
- Socket.IO events related to announcements, new replies, or content updates

## Deliverables
1. Short summary of badge behavior and which sections are covered.
2. Code changes implementing badge updates.
3. Test plan plus actual test results (do not claim done without testing).

## Definition of Done
- New badges appear reliably for Aplikasi, Edukasi, and Tanya Dokter replies.
- Notification bell updates correctly.
- Badges update in real time and clear when items are read.
- No regressions in PWA behavior or login flow.
