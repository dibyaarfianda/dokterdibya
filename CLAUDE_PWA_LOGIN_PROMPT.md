# Prompt for Claude: PWA Login Match Android Login

You are a senior engineer tasked with making the PWA login screen match the Android app login (Capacitor WebView) in look and behavior. Focus only on the patient portal PWA, not native Android code.

Follow the project rules in [CLAUDE.md](CLAUDE.md) exactly. Do not assume APIs, method names, or dependencies. Verify in code before changes.

## Objectives
1. Make the PWA login UI and UX match the Android login screen (Capacitor WebView).
2. Copy most of the Android login structure and styles into the PWA while keeping a rollback path.
3. Keep existing auth logic intact (Google OAuth web flow and any current PWA rules).
4. Make the PWA login iOS-ready (Apple meta tags and icons where applicable).
5. Preserve PWA behavior (service worker, offline fallbacks, caching rules).

## Must-Read Files (in this order)
- [CLAUDE.md](CLAUDE.md) (project rules; must comply)
- [public/patient-login.html](public/patient-login.html) (current PWA login)
- [mobile-app/android/app/src/main/assets/public/index.html](mobile-app/android/app/src/main/assets/public/index.html) (Android app WebView login UI and behavior)
- [public/manifest.json](public/manifest.json) (PWA metadata)
- [public/sw.js](public/sw.js) (PWA service worker)
- [public/offline.html](public/offline.html) (offline fallback)

## Scope
- PWA only. Do not modify Capacitor or native Android wrapper code.
- Match layout, typography, spacing, colors, animations, error state behavior, and button treatment.
- Copy most of the Android login markup and styles into the PWA to reduce drift.
- Add iOS-ready PWA metadata (apple touch icon, status bar style) if missing.

## Current State (verify in code)
- PWA login lives in [public/patient-login.html](public/patient-login.html).
- Android login UI and behavior are implemented in [mobile-app/android/app/src/main/assets/public/index.html](mobile-app/android/app/src/main/assets/public/index.html), section "LOGIN PAGE".
- PWA login uses Google OAuth web redirect.

## Requirements
- Visual parity with Android login:
  - Background, logo, tagline, headings, subtitle, spacing, and button style.
  - Error message styling and visibility behavior.
  - Button labels and icon usage.
- Behavioral parity:
  - Same loading and error messaging patterns where applicable.
  - Keep Google sign-in flow via web OAuth in PWA.
- Accessibility:
  - Maintain readable contrast and tap targets.
- Do not regress mobile Safari/Chrome behavior.
- Rollback safety:
  - Keep a backup copy of the original PWA login file before changes.

## Suggested Approach (validate in code before implementing)
1. Create a backup file of the original PWA login (same folder, clear name) for rollback.
2. Extract the exact login UI styles and markup from the Android WebView page.
3. Apply equivalent structure and styles to the PWA login page, copying most Android login markup.
4. Align error display behavior and button states.
5. Add iOS-ready PWA meta tags/icons if missing in the PWA login page.
6. Ensure the PWA login still redirects to Google OAuth as before.

## Constraints and Pitfalls
- Follow all rules in [CLAUDE.md](CLAUDE.md), especially verify-before-code.
- Do not introduce new auth keys or hardcoded tokens.
- Avoid breaking the PWA service worker cache rules.

## Deliverables
1. Short summary of parity changes and iOS-ready updates.
2. Code changes in PWA login only + a backup copy for rollback.
3. Test plan plus actual test results (do not claim done without testing).

## Definition of Done
- PWA login screen matches the Android login screen visually and behaviorally.
- Google OAuth login still works.
- No regressions in PWA load or offline fallback behavior.
