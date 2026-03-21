# DocBoard Deep Analysis & Massive Customization Strategy

## 1. Current System Map

### Main User Flows

| Flow | Path | Status |
|------|------|--------|
| **Morning Review** | Login → Calendar → MorningBriefing → DayDetail | Complete |
| **Day Planning** | Calendar → Day/:date → PatientCards by location | Complete |
| **Surgery Scheduling** | SurgeryList → SurgeryForm (new/edit) → Push notification | Complete |
| **Surgery Tracking** | SurgeryList → SurgeryDetail → Status updates → PostOpNotes | Complete |
| **Analytics Review** | Analytics → Filter by period/location → PDF export | Complete |
| **Notification Check** | BottomNav badge → Notifications → Mark read | Complete |
| **Manual Sync** | Settings/DayDetail → Trigger sync per location | Complete |

### Main Modules

| Module | Frontend Files | Backend Service | DB Tables |
|--------|---------------|-----------------|-----------|
| **Calendar** | `Calendar.jsx`, `CalendarGrid.jsx`, `WeeklyView.jsx` | `DocBoardService` | `docboard_events`, `practice_schedules` |
| **Day Planner** | `DayDetail.jsx`, `LocationCard.jsx`, `PatientCard.jsx` | `DocBoardService` | `docboard_events`, `docboard_patients` |
| **Surgery** | `SurgeryList.jsx`, `SurgeryForm.jsx`, `SurgeryDetail.jsx`, `PostOpNotesForm.jsx` | `SurgeryService` | `surgery_schedules`, `surgery_operation_types`, `surgery_external_staff` |
| **AI Briefing** | `MorningBriefing.jsx` | `DocBoardAIService` | `docboard_briefings` |
| **Notifications** | `Notifications.jsx`, `BottomNav.jsx` (badge) | `DocBoardPushService` | `docboard_notifications`, `docboard_push_tokens` |
| **Analytics** | `Analytics.jsx`, `ExportButton.jsx` | `SurgeryService.getAnalytics()` | `surgery_schedules` |
| **Settings** | `Settings.jsx` | `DocBoardService` (sync status) | `docboard_push_tokens` |
| **Auth** | `Login.jsx`, `stores/auth.js` | `/api/auth/login` | `users` |

### Data Sources (4 hospitals, 3 sync methods)

```
┌──────────────────────────────────────────────────────────────┐
│                      DocBoard Data Pipeline                   │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Klinik Privat│ RSIA Melinda │RSUD Gambiran │ RS Bhayangkara  │
│  (Internal)  │  (Medify)    │  (Medify)    │  (Chrome Ext)   │
│              │              │              │                 │
│ sunday_appt  │ HTTP API     │ HTTP API     │ /sync/evo-push  │
│ sunday_clinic│ polling      │ polling      │ NO AUTH (!)     │
│ appointments │              │              │                 │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │              │              │                │
       ▼              ▼              ▼                ▼
   ┌─────────────────────────────────────────────────────────┐
   │  docboard_events (date+location) → docboard_patients    │
   │  surgery_schedules (independent, cross-location)        │
   │  docboard_briefings (AI cache, daily)                   │
   └─────────────────────────────────────────────────────────┘
```

### State & Sync Model

- **Frontend state**: Preact Signals (3 stores: auth, schedule, notifications)
- **Sync model**: Manual trigger per location + evo-push from Chrome extension
- **Real-time**: Socket.IO broadcast on evo-push sync (`docboard:sync` event)
- **Caching**: SW caches API responses for 5 min; AI briefing cached in DB per day
- **Polling**: Unread notification count every 60s

### Strengths

1. **Lightweight stack** — Preact (3KB) + Signals + Vite = fast, minimal bundle (99KB JS, 40KB CSS)
2. **Multi-source aggregation** — 4 hospitals unified into one calendar view
3. **Surgery workflow is complete** — CRUD, status tracking, post-op notes, team management, analytics, PDF export
4. **AI briefing** — GPT-4o-mini with structured fallback, daily caching
5. **Push notifications** — VAPID-based Web Push with auto-cleanup of stale tokens
6. **PWA installable** — Offline fallback, standalone mode, proper manifest
7. **84 pre-seeded operation types** — Comprehensive OB-GYN reference data
8. **Patient context lookup** — RM lookup pulls diagnosis, labs, USG, anamnesa from main SIMRS

### What Feels Incomplete or Limiting

| Area | Issue |
|------|-------|
| **`docboard_briefings` table** | Referenced in AI service but **no migration file exists** — may cause runtime errors |
| **Evo-push has NO authentication** | `/sync/evo-push` endpoint accepts data without token verification |
| **Daily surgery reminders** | `sendDailyReminders()` method exists but **not wired to any cron** |
| **No offline data mutation** | PWA caches reads but cannot create/edit surgeries offline |
| **Calendar is read-only** | No drag-to-reschedule, no block-time, no quick-create from calendar |
| **No recurring schedules** | Each surgery must be created individually; no templates |
| **No patient consent/checklist** | Pre-op checklist, consent tracking not modeled |
| **No anesthesia workflow** | No anesthesia type, ASA score, NPO status fields |
| **Analytics is surgery-only** | No clinic visit analytics, no revenue tracking |
| **Single-user design** | Auth exists but no role differentiation within DocBoard (dokter vs. admin assistant vs. anesthesiologist) |
| **No audit log** | No history of who changed what on a surgery record |
| **team_members is denormalized JSON** | Makes querying "all surgeries for Dr. X" difficult |

---

## 2. Massive Customization Matrix

### A. UI and Visual Design

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Theme/Colors | Custom CSS vars, Tailwind-inspired palette | CSS variable overrides for brand colors | Dark/light mode toggle (vars already defined) | Themeable per-user preferences stored in DB |
| Typography | System fonts | Google Fonts swap (1 CSS change) | Font size preferences (accessibility) | Full i18n with RTL support |
| Layout | Mobile-first, bottom nav | Adjust nav order/icons | Side nav for tablet/desktop | Responsive layout with desktop dashboard panels |
| Loading states | SkeletonLoader component | Customize shimmer colors | Add progress bars for sync | Optimistic UI updates |
| Calendar cells | Location dots + count | Add surgery count indicator | Mini patient list on hover | Full agenda-in-cell (Google Calendar style) |

**Risks**: Custom CSS is 2893 lines without a framework — refactoring to Tailwind would reduce maintenance but is a large migration.

### B. Navigation and Information Architecture

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| BottomNav tabs | 4 tabs (Calendar, Surgery, Notifications, Settings) | Reorder tabs, change icons | Add Analytics tab, badge counts per tab | Configurable tabs per role |
| Deep linking | Route-based (10 routes) | Add share/copy link buttons | Add URL state for filters (date, location) | Cross-app deep links (from main SIMRS) |
| Search | Patient search in SurgeryForm only | Global search bar | Search across surgeries + patients + notifications | Full-text search with Elasticsearch |
| Quick actions | None | Floating action button (new surgery) | Swipe actions on cards (call patient, mark done) | Voice commands via Web Speech API |

**Risks**: Adding tabs risks cluttering mobile UI. Consider a "More" overflow menu instead.

### C. Calendar / Day Planner Workflow

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Views | Month + Week toggle | Add "3-day" view | Timeline view (hour-by-hour) | Multi-resource Gantt view (one row per OR room) |
| Interaction | Tap date → DayDetail | Long-press date → quick surgery create | Drag surgery to reschedule | Drag-and-drop between locations |
| Availability | Shows patient count dots | Color-code by capacity (green/yellow/red) | Block time slots (e.g., "no surgery after 2PM") | OR room availability from hospital systems |
| Practice schedule | Read-only from `practice_schedules` | Edit schedule within DocBoard | Recurring exceptions (holidays, leave) | Auto-suggest optimal surgery dates |
| Today widget | Patient counts in MorningBriefing | Add "next patient" countdown | Add running time indicator for current surgery | Live OR board with real-time status |

**Dependencies**: Timeline/Gantt views require time data for all events (currently only surgeries have `surgery_time`; clinic visits have `slot_time`).

### D. Surgery Workflow

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Status flow | 6 states (planned→confirmed→in_progress→completed/cancelled/postponed) | Add "pre-op" state between confirmed and in_progress | Checklist gates (can't start until pre-op checklist done) | Workflow engine with configurable state machines |
| Pre-op | Diagnosis, lab, USG, radiology fields | Add blood type, allergy alert fields | Pre-op checklist (NPO, consent, labs verified) | Automated lab result pull from SIMRS |
| Intra-op | Post-op notes only | Add intra-op timer (start/stop) | Blood loss, fluids, complications real-time entry | Integration with anesthesia monitoring |
| Post-op | `PostOpNotesForm` (procedure, findings, complications, blood loss, duration) | Add structured complication codes | Post-op orders, follow-up scheduling | Recovery tracking with outcome scores |
| Templates | None | Surgery templates (pre-fill common operations) | Surgeon preference cards (preferred team, instruments) | Protocol-driven operation planning |
| Consent | Not tracked | Consent checkbox field | Digital consent form generation | E-signature with legal timestamp |
| Anesthesia | Not modeled | Add `anesthesia_type` field to surgery_schedules | Separate anesthesia assessment form | Full anesthesia record module |

**DB changes needed for medium+**: Add columns to `surgery_schedules` or create `surgery_checklists` table.

### E. Notification System

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Channels | Web Push + in-app | Add email notifications | WhatsApp via API (Fonnte/Twilio) | Multi-channel preference per notification type |
| Types | 4 types (new_booking, status_change, reminder, sync_failure) | Add post-op reminder, follow-up reminder | Custom notification rules (e.g., "notify me when Dr. X is assigned") | Event-driven notification engine |
| Timing | Real-time push on action; daily reminder (NOT wired) | Wire `sendDailyReminders()` to cron | Configurable reminder times (1h, 2h, 1d before) | Smart scheduling based on travel time to hospital |
| Grouping | Flat list | Group by date | Group by surgery/patient | Threaded notifications with context |

**Quick win**: Wiring `sendDailyReminders()` to `appointmentScheduler.js` cron is ~10 lines of code.

### F. Settings and Preferences

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Push toggle | On/off only | Per-type toggle (surgery vs sync vs reminders) | Quiet hours setting | Per-location notification rules |
| Display | None | Default calendar view preference (month/week) | Default location filter | Full preference object in DB |
| Data | Sync status display | Export all data (backup) | Import surgery data from spreadsheet | Bulk operations (reschedule all at location) |
| Account | Logout only | Change password | Profile editing | Multi-device session management |

**DB change**: Add `docboard_preferences` table (user_id, key, value JSON).

### G. Analytics and Reporting

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Surgery stats | Total, completion/cancel/postpone rates, top operation, by-month, by-type, by-location | Add average duration tracking | Trend analysis (month-over-month) | Predictive analytics (surgery volume forecast) |
| Clinic stats | Not tracked | Add patient count analytics from `docboard_events` | Visit completion rates by location | Revenue analytics (from billing system) |
| Export | PDF (date range, max 3 months) | CSV export | Excel with charts | Automated monthly reports via email |
| Dashboard | Analytics page only | Add mini charts to Calendar page | Comparison view (this month vs last month) | Real-time dashboard with live metrics |
| Audit | None | Add `surgery_audit_log` table | Full change history viewer | Compliance reporting |

**Files**: `Analytics.jsx` (frontend), `SurgeryService.getAnalytics()` (backend).

### H. AI Assistant / Morning Briefing

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Briefing | Daily summary (patients, surgeries, schedule) | Add weather/traffic context | Personalized based on doctor preferences | Multi-day lookahead briefing |
| Model | GPT-4o-mini with JSON schema | Switch to Claude for better reasoning | Add surgical risk assessment per patient | Clinical decision support |
| Interaction | Read-only card | Add "ask about today" chat | Voice briefing (text-to-speech) | Conversational AI assistant for surgery planning |
| Data sources | docboard_events, surgery_schedules, practice_schedules | Add recent lab results | Add patient history summary | Pull from all SIMRS modules |
| Caching | Per-day in `docboard_briefings` | Add manual refresh button (exists) | Auto-refresh when new surgery added | Streaming updates as data changes |

**Assumption**: `docboard_briefings` table needs to be created first — currently missing from migrations.

### I. Multi-Location Workflow

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Location display | Color-coded dots on calendar, cards per location | Add location filter on all views | Default location preference | Location-aware features (nearby, travel time) |
| Sync | Manual trigger + Chrome extension push | Auto-sync on page load | Scheduled background sync (every 15 min) | Real-time WebSocket per hospital |
| OR availability | Not tracked | Add "available OR rooms" field to location | OR room scheduling table | Integration with hospital OR management systems |
| Cross-location | Surgeries can be at any location | Show "conflicts" when scheduling overlapping surgeries | Travel time warnings between locations | Auto-suggest based on OR availability |

**Risk**: Adding auto-sync intervals increases load on external Medify API. Need rate limiting.

### J. Role-Based / Per-User Customization

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Roles | Single role (staff token) | Add role field to DocBoard auth | Different views per role (doctor vs. secretary) | Full RBAC with permission matrix |
| Secretary view | Not available | Read-only surgery view | Surgery creation by secretary with doctor approval | Workflow with approval chains |
| Anesthesiologist | Not available | Filtered view of their assigned surgeries | Separate anesthesia assessment form | Pre-op evaluation module |
| Patient view | Not available | Read-only surgery status for patient | Patient consent submission | Full patient surgery portal |

**Architecture note**: DocBoard currently uses the main SIMRS `verifyStaffToken` which already has `user.role`. Differentiation is a routing concern, not an auth concern.

### K. Mobile / PWA Behavior

| Aspect | Current | Low Effort | Medium Effort | Major Work |
|--------|---------|------------|---------------|------------|
| Install | PWA installable, standalone mode | Add install prompt UI | Custom splash screen animation | Native app wrapper (Capacitor) |
| Offline | Offline fallback page only | Cache last-viewed calendar data | Offline surgery creation (queue + sync) | Full offline-first with conflict resolution |
| Performance | 99KB JS bundle, network-first API | Preload critical data on login | Virtual scrolling for long lists | Service worker background sync API |
| Gestures | None | Pull-to-refresh on calendar | Swipe between days/weeks | Gesture-based navigation |
| Native features | Push notifications | Share surgery details | Camera for wound photos | Biometric auth |

**Risk**: Offline mutation (creating surgeries offline) requires conflict resolution strategy when multiple users are involved.

### L. Backend / Data Model Extensions

| Extension | Effort | Tables/Changes |
|-----------|--------|----------------|
| `docboard_briefings` table creation | **Low** | Create missing migration |
| `surgery_checklists` | **Medium** | New table: surgery_id, checklist_type, items JSON, completed_by, completed_at |
| `surgery_audit_log` | **Medium** | New table: surgery_id, action, old_value, new_value, user_id, timestamp |
| `docboard_preferences` | **Low** | New table: user_id, preferences JSON |
| Normalize `team_members` | **Major** | New `surgery_team` table, migrate JSON data, update all queries |
| `surgery_templates` | **Medium** | New table: name, default values JSON, user_id |
| `or_rooms` + `or_availability` | **Major** | New tables, integration with hospital systems |
| `surgery_consent` | **Medium** | New table: surgery_id, consent_type, signed_at, signature_data |
| `surgery_outcomes` | **Medium** | New table: surgery_id, complication_grade, readmission, follow_up_date |

### M. External Integrations & Automations

| Integration | Current | Potential |
|-------------|---------|-----------|
| **Medify (RSIA Melinda, RSUD Gambiran)** | HTTP polling sync | Bidirectional sync, push surgery to Medify |
| **Chrome Extension (RS Bhayangkara)** | Evo-push (no auth!) | Add token auth, bidirectional sync |
| **WhatsApp** | Not integrated | Surgery reminders to patient via Fonnte API |
| **Google Calendar** | Not integrated | Sync surgeries to doctor's Google Calendar |
| **Lab System** | Manual entry of results | Auto-pull lab results by MR ID |
| **BPJS** | Not integrated | Coverage verification before surgery |
| **Pharmacy** | Not integrated | Post-op medication orders |

---

## 3. Best Product Directions

### Direction A: Lean Personal Doctor Planner

**Who it serves**: Solo OB-GYN practitioner managing their own schedule across multiple hospitals.

**Philosophy**: Keep it simple, fast, personal. A doctor's "second brain" for their day.

**What to add**:
- Quick-create surgery from calendar (tap + form)
- Surgery templates for common operations (e.g., "Elective SC at Melinda")
- Google Calendar sync (bidirectional)
- WhatsApp reminders to self
- Voice briefing (TTS of morning briefing)
- Better offline support (cache last 7 days)

**What to simplify/remove**:
- Remove role-based access (single user)
- Simplify notification types (just reminders)
- Remove external staff management (manual notes instead)

**Reusable modules**: Calendar, SurgeryForm, MorningBriefing, Analytics, Push

**New backend work**: Google Calendar OAuth, WhatsApp API integration, surgery templates table

**Effort**: ~3-4 weeks

---

### Direction B: Surgery Coordination Command Center

**Who it serves**: OB-GYN surgeon + their team (secretary, anesthesiologist, assistant). The "operating room operations hub."

**Philosophy**: Surgery is the core workflow. Everything revolves around planning, executing, and documenting surgeries.

**What to add**:
- Pre-op checklist system (NPO, consent, labs, blood bank)
- Anesthesia assessment fields (ASA score, anesthesia type, airway)
- OR board view (timeline of today's surgeries across locations)
- Intra-op timer with complication logging
- Post-op outcome tracking (Clavien-Dindo grade)
- Surgery audit trail (who changed what)
- Secretary role (can create surgery, doctor approves)
- Automated pre-op reminders to patient (WhatsApp)
- Equipment/instrument checklist

**What to simplify/remove**:
- Clinic visit calendar becomes secondary (smaller in UI)
- Settings page stays minimal
- Analytics focuses on surgical outcomes, not visit counts

**Reusable modules**: All surgery modules, Calendar (as surgery calendar), Push, AI Briefing

**New backend work**: `surgery_checklists`, `surgery_audit_log`, `surgery_outcomes` tables; role-based views; WhatsApp integration; OR board API

**Effort**: ~8-12 weeks

---

### Direction C: Multi-Site Operational Cockpit

**Who it serves**: Doctor + hospital admin teams managing operations across all 4 sites. The "control tower."

**Philosophy**: Visibility across everything — patients, surgeries, schedules, metrics — unified in one command center.

**What to add**:
- Dashboard homepage with KPI cards (today's patients, pending surgeries, completion rates)
- Real-time sync (auto-refresh, not manual trigger)
- Cross-location conflict detection (double-booked surgeon)
- OR room availability tracking per hospital
- Revenue analytics (from billing integration)
- Staff workload distribution view
- Multi-user with role-based dashboards
- API integrations with all 4 hospital systems
- Compliance and audit reporting
- Mobile + desktop responsive layouts

**What to simplify/remove**:
- Less focus on individual surgery details
- Morning briefing becomes a dashboard widget
- Notifications become a feed/activity stream

**Reusable modules**: Calendar, Analytics (expanded), Sync infrastructure, Push

**New backend work**: `or_rooms`, `or_availability` tables; dashboard aggregation queries; revenue API; role system; WebSocket for real-time; desktop layout components

**Effort**: ~16-24 weeks

---

## 4. Concrete Technical Roadmap

### Phase 1: Quick Wins (1-2 weeks)

**Goal**: Fix gaps, wire loose ends, improve daily UX.

| Feature | Files Affected | Type |
|---------|---------------|------|
| **Create `docboard_briefings` migration** | `database/docboard-briefings-migration.sql` | DB |
| **Wire daily surgery reminders to cron** | `staff/backend/services/appointmentScheduler.js` (add cron entry calling `docboardPush.sendDailyReminders()`) | Backend |
| **Add auth to evo-push endpoint** | `staff/backend/routes/docboard.js` line with `/sync/evo-push` | Backend |
| **Add surgery indicator to calendar cells** | `docboard/src/components/CalendarGrid.jsx`, `WeeklyView.jsx` | Frontend |
| **Add FAB (floating action button) for quick surgery create** | `docboard/src/app.jsx`, new `FAB.jsx` component | Frontend |
| **Default calendar view preference** | `docboard/src/stores/schedule.js` (persist to localStorage) | Frontend |
| **Pull-to-refresh gesture on calendar** | `docboard/src/views/Calendar.jsx` | Frontend |

**Verification**: Manual test each feature; check push notification delivery; verify briefing table creation with `DESCRIBE docboard_briefings`.

### Phase 2: Medium Customizations (3-6 weeks)

**Goal**: Surgery workflow depth + team collaboration.

| Feature | Files Affected | Type |
|---------|---------------|------|
| **Surgery templates** | New `surgery_templates` table; `SurgeryForm.jsx` (template selector dropdown); `SurgeryService.js` (CRUD for templates) | Full stack |
| **Pre-op checklist** | New `surgery_checklists` table; new `PreOpChecklist.jsx` component; `SurgeryDetail.jsx` (embed checklist); `SurgeryService.js` (checklist methods) | Full stack |
| **Surgery audit log** | New `surgery_audit_log` table; `SurgeryService.js` (log on every update/status change); new `AuditLog.jsx` in SurgeryDetail | Full stack |
| **Anesthesia fields** | `surgery_schedules` ALTER TABLE (add `anesthesia_type`, `asa_score`, `npo_status`); `SurgeryForm.jsx` (new fields); `SurgeryService.js` (update whitelist) | Full stack |
| **Clinic visit analytics** | `Analytics.jsx` (new tab for clinic stats); `DocBoardService.js` (new `getClinicAnalytics()` method) | Full stack |
| **Configurable notification preferences** | New `docboard_preferences` table; `Settings.jsx` (per-type toggles); `DocBoardPushService.js` (check preferences before sending) | Full stack |
| **Auto-sync on page load** | `docboard/src/views/Calendar.jsx` (trigger sync if stale >15 min); `DocBoardService.js` (add staleness check) | Frontend + Backend |
| **WhatsApp surgery reminder to patient** | `staff/backend/services/WhatsAppService.js` (new); `SurgeryService.js` (trigger on confirm); new env vars for API key | Backend |

**Verification**: Create test surgeries through full lifecycle; verify checklist gates; test template create/use; check audit log entries; test WhatsApp delivery.

### Phase 3: Major Expansions (2-3 months)

**Goal**: Transform into Surgery Command Center.

| Feature | Files Affected | Type |
|---------|---------------|------|
| **OR Board view** | New `ORBoard.jsx` page; new route `/docboard/or-board`; `SurgeryService.js` (timeline query grouping by location+time) | Full stack |
| **Role-based views** | `app.jsx` (conditional routing); `stores/auth.js` (role checks); middleware updates for secretary/anesthesiologist roles | Full stack |
| **Normalize team_members** | New `surgery_team` table; migration to move JSON → rows; update all SurgeryService queries; update SurgeryForm team picker | Major DB + Backend |
| **Offline surgery creation** | `docboard/src/utils/offlineQueue.js` (new); IndexedDB storage; `sw.js` (Background Sync API); conflict resolution logic | Major Frontend |
| **Post-op outcome tracking** | New `surgery_outcomes` table; new `OutcomeForm.jsx`; analytics for outcomes (Clavien-Dindo distribution) | Full stack |
| **Google Calendar sync** | New `GoogleCalendarService.js`; OAuth2 flow; bidirectional sync on surgery CRUD | Major Backend |
| **Real-time OR status** | WebSocket channel per surgery (`surgery:${id}:status`); live timer in ORBoard; Socket.IO rooms per location | Full stack |
| **Desktop layout** | Responsive redesign: side nav + main content + detail panel; media queries in `index.css`; possibly CSS Grid layout refactor | Major Frontend |

**Verification**: E2E testing for role-based access; offline create → online sync test; Google Calendar round-trip; OR Board load test with concurrent surgeries.

---

## 5. File-Level Impact Analysis (Key Customization Hotspots)

### Frontend Hotspots

| File | Size | Why It's a Hotspot |
|------|------|--------------------|
| **`docboard/src/views/SurgeryForm.jsx`** | ~23KB | Largest view. Any surgery field addition (anesthesia, checklist, template) modifies this file. **Refactoring target**: Split into sub-components (PatientSection, ClinicalSection, TeamSection, ScheduleSection). |
| **`docboard/src/views/SurgeryDetail.jsx`** | ~12KB | Surgery detail rendering. Every new tab (checklist, audit log, outcomes) gets added here. **Refactoring target**: Tab-based layout with lazy-loaded sections. |
| **`docboard/src/views/Calendar.jsx`** | ~10KB | Main landing page. Any calendar enhancement (surgery dots, quick-create, auto-sync) touches this. |
| **`docboard/src/views/Analytics.jsx`** | ~10KB | All chart/stat rendering. Adding clinic analytics or outcome metrics expands this. |
| **`docboard/src/services/api.js`** | ~4.5KB | Every new endpoint requires a function here. Well-structured but will grow. |
| **`docboard/src/stores/schedule.js`** | — | Central state store. New data types (templates, checklists) may bloat this. **Refactoring target**: Split into `surgeryStore.js` and `calendarStore.js`. |
| **`docboard/src/utils/constants.js`** | — | All enums/colors. New statuses, roles, or categories go here. |
| **`docboard/src/index.css`** | 2893 lines | Monolithic CSS. Any visual customization touches this. **Refactoring target**: Split into component-scoped CSS or migrate to Tailwind. |
| **`docboard/src/app.jsx`** | — | Route definitions. New pages require route additions here. |
| **`docboard/src/components/BottomNav.jsx`** | 71 lines | Tab changes here. Surprisingly fragile — adding a 5th tab breaks mobile layout. |

### Backend Hotspots

| File | Size | Why It's a Hotspot |
|------|------|--------------------|
| **`staff/backend/services/SurgeryService.js`** | Large | All surgery business logic. Templates, checklists, audit logging, analytics expansion all go here. **Refactoring target**: Split into `SurgerySchedulingService`, `SurgeryAnalyticsService`. |
| **`staff/backend/services/DocBoardService.js`** | Large | Calendar + sync logic. Auto-sync, clinic analytics, new data sources expand this. |
| **`staff/backend/services/DocBoardPushService.js`** | — | Notification delivery. Adding WhatsApp, email, or preference checks modifies this. |
| **`staff/backend/services/DocBoardAIService.js`** | — | AI briefing. More data sources, personalization, or model changes go here. |
| **`staff/backend/routes/docboard.js`** | ~10KB | Route mounting point. Every new endpoint group adds here. **Refactoring target**: Split surgery routes into separate file (already done) and add checklist routes. |
| **`staff/backend/routes/surgery.js`** | — | Surgery REST endpoints. New operations (templates, checklists, outcomes) add routes here. |

### Database Hotspots

| Table | Why |
|-------|-----|
| **`surgery_schedules`** | Most-modified table. New columns (anesthesia, outcomes, checklist refs) go here. Wide table risk. |
| **`surgery_operation_types`** | Stable reference data, but may need sub-categories or custom entries per doctor. |
| **`docboard_events`** | Sync target. More data sources or auto-sync changes affect insert/update patterns. |

---

## 6. Architectural Constraints and Cautions

### Duplicated Logic Risks

| Risk | Where | Mitigation |
|------|-------|------------|
| **Calendar rendering** is in both `CalendarGrid.jsx` and `WeeklyView.jsx` | Frontend | Extract shared cell rendering into a `CalendarCell` component before adding surgery dots |
| **Date formatting** exists in both `utils/date.js` and inline in components | Frontend | Audit all date formatting to use `date.js` utilities exclusively |
| **Location normalization** (`klinik_privat` → `klinik_private`) in DocBoardService | Backend | Centralize in a `normalizeLocation()` utility; currently inline in `getSchedules()` |
| **Surgery status labels** defined in both `constants.js` (frontend) and `DocBoardPushService.js` (backend) | Full stack | Single source of truth: define in backend, serve via API, cache in frontend |

### Sync / Cache Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **SW caches API for 5 minutes** | Stale data after surgery creation — user creates surgery, goes to calendar, sees old count | Add cache-busting param on navigation, or use `stale-while-revalidate` strategy |
| **Manual sync only** for 3/4 locations | Data can be hours stale if doctor doesn't sync | Add auto-sync on Calendar mount if `last_synced_at` > 15 min |
| **Evo-push overwrites all patients** for a date/location | If Chrome extension sends partial data, existing patients are deleted (DELETE + INSERT pattern) | Add incremental sync option or at least a patient count sanity check |
| **Briefing cache per-day only** | If surgeries are added after briefing is generated, briefing is stale | Invalidate briefing cache when surgery is created/modified for that date |

### PWA / Offline Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No offline mutation** | Doctor in OR (poor connectivity) can't update surgery status | Implement IndexedDB queue with Background Sync API |
| **SW update requires refresh** | Users may run old code indefinitely | Add "new version available" banner with reload button |
| **Push notification click opens URL** | If user is offline, opened page may show offline fallback | Cache critical surgery detail pages in SW |

### Data Consistency Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`team_members` JSON** denormalization | Cannot query "all surgeries involving Dr. X" efficiently | Plan migration to normalized `surgery_team` table before adding team-related features |
| **`post_op_notes` is TEXT** (not JSON type) | Inconsistent format if entered from different clients | Validate JSON before storage in SurgeryService; use MySQL `JSON` type |
| **No foreign key from `surgery_schedules` to `patients`** | `patient_id` is VARCHAR, not enforced FK | Surgery can reference non-existent patients; add FK or at least validation |
| **`docboard_events` + `docboard_patients` vs `surgery_schedules`** | Two parallel data models for the same date/location — surgeries don't appear in docboard_events | Consider: should surgery count be reflected in calendar dots? If yes, need sync logic. |

### What to Modularize BEFORE Massive Customization

1. **Split `SurgeryForm.jsx`** (~23KB) into sub-components — it will only grow with templates, checklists, anesthesia fields
2. **Split `index.css`** (2893 lines) into component-scoped files or adopt Tailwind
3. **Split `schedule.js` store** into `calendarStore` + `surgeryStore` — the signal store is becoming a god object
4. **Extract `SurgeryService`** analytics into `SurgeryAnalyticsService` — analytics queries are complex and growing
5. **Create `docboard_briefings` table** — blocking issue for AI briefing to work properly
6. **Add auth to evo-push** — security hole that should be fixed before any public exposure

---

## 7. Recommendation

### Recommended Direction: **Surgery Coordination Command Center** (Direction B)

**Why:**

1. **Aligns with actual usage** — DocBoard was specifically repurposed for surgery scheduling. The doctor's primary workflow is planning and executing surgeries across 4 hospitals.

2. **Highest ROI on existing code** — The surgery module is already the most complete part of the system (CRUD, status flow, team management, analytics, PDF export, post-op notes, patient lookup). Building on this strength is more efficient than pivoting.

3. **Unique value proposition** — There's no lightweight OB-GYN surgery coordinator that works across multiple Indonesian hospitals. The multi-source sync architecture is a competitive moat.

4. **Natural growth path** — Starts with doctor-only use (already works), naturally extends to secretary (booking) → anesthesiologist (pre-op) → patient (consent/status) as the practice grows.

### What to Build First

**Immediate (this week):**
1. Create `docboard_briefings` migration (blocks AI briefing)
2. Wire `sendDailyReminders()` to cron (surgery reminders are high value, already coded)
3. Add auth to evo-push endpoint (security fix)

**Next 2 weeks:**
4. Surgery templates (biggest time-saver for daily workflow)
5. Pre-op checklist (critical for surgical safety)
6. Surgery indicators on calendar cells (visual planning)

**Month 2:**
7. Audit log (compliance requirement for medical records)
8. Anesthesia fields (completes the surgical record)
9. WhatsApp patient reminders (reduces no-shows)

### What NOT to Change Yet

| Don't Touch | Why |
|------------|-----|
| **Preact → React migration** | Preact is working fine, bundle is small. No benefit. |
| **CSS → Tailwind migration** | 2893 lines of working CSS. Migrate incrementally only when adding new components. |
| **Normalize team_members JSON** | Works for current scale. Only normalize when querying by team member becomes a requirement. |
| **Offline-first architecture** | Complex conflict resolution not needed until multi-user is real. |
| **Multi-role access** | Only needed when secretary starts using DocBoard independently. |
| **OR room availability** | Requires hospital system integration that isn't available yet. |
| **Google Calendar sync** | Nice-to-have but complex OAuth flow. Push notifications already handle reminders. |

---

## Summary

The system is well-architected for its current scope. The key insight is: **deepen the surgery workflow before widening the platform**. The calendar/clinic side is adequate; the surgery side is where the doctor's pain points and differentiation opportunities live.
