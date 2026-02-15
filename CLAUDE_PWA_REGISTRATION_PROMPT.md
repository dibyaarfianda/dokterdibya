# Prompt for Claude: PWA Registration Flow Match Android (Capacitor)

You are a senior engineer tasked with making the PWA registration flow match the Android Capacitor app registration flow exactly in UI and behavior. Focus only on the patient portal PWA, not native Android code.

Follow the project rules in [CLAUDE.md](CLAUDE.md) exactly. Do not assume APIs, method names, or dependencies. Verify in code before changes.

## Objectives
1. Make the PWA registration flow match the Android registration flow (Capacitor WebView).
2. Copy most of the Android registration structure and styles into the PWA while keeping a rollback path.
3. Keep existing auth logic intact (Google OAuth web flow and any current PWA rules).
4. Preserve PWA behavior (service worker, offline fallbacks, caching rules).

## Must-Read Files (in this order)
- [CLAUDE.md](CLAUDE.md) (project rules; must comply)
- [public/patient-login.html](public/patient-login.html) (current PWA entry, login and registration links)
- [public/complete-profile.html](public/complete-profile.html) (post-registration flow, if applicable)
- [mobile-app/android/app/src/main/assets/public/index.html](mobile-app/android/app/src/main/assets/public/index.html) (Android app WebView registration flow)
- [public/manifest.json](public/manifest.json) (PWA metadata)
- [public/sw.js](public/sw.js) (PWA service worker)
- [public/offline.html](public/offline.html) (offline fallback)

## Scope
- PWA only. Do not modify Capacitor or native Android wrapper code.
- Match layout, typography, spacing, colors, animations, error state behavior, and button treatment.
- Copy most of the Android registration markup and styles into the PWA to reduce drift.

## Current State (verify in code)
- PWA login/entry is in [public/patient-login.html](public/patient-login.html).
- Android registration flow is implemented in [mobile-app/android/app/src/main/assets/public/index.html](mobile-app/android/app/src/main/assets/public/index.html) under registration pages (registration code, Google sign-in, and any multi-step UI).
- PWA uses Google OAuth web redirect; do not break it.

## Requirements
- Visual parity with Android registration:
  - Registration code step (if present), error message styles, instructions, headings.
  - Google sign-in button and labels.
  - Progress/step transitions if present in Android flow.
- Behavioral parity:
  - Same validation rules and error messages as Android (as feasible on web).
  - Keep Google sign-in via web OAuth in PWA.
- Rollback safety:
  - Keep a backup copy of the original PWA registration files before changes.
- Do not regress mobile Safari/Chrome behavior.

## Suggested Approach (validate in code before implementing)
1. Create backup copies of any PWA files you will modify.
2. Extract the Android registration UI and logic from the Capacitor WebView file.
3. Apply equivalent structure and styles to the PWA registration page(s).
4. Ensure the PWA registration still connects to the same backend endpoints and redirects correctly.
5. Verify the post-registration flow (profile completion or dashboard redirect) matches Android behavior.

## Endpoints and Events to Verify (do not assume)
- Registration code validation endpoint (if used)
- Google auth endpoint for patient registration
- Post-registration redirect URLs

## Deliverables
1. Short summary of parity changes.
2. Code changes in PWA registration only + backup copy for rollback.
3. Test plan plus actual test results (do not claim done without testing).

## Definition of Done
- PWA registration flow matches Android registration flow visually and behaviorally.
- Google OAuth registration still works.
- No regressions in PWA load or offline fallback behavior.
