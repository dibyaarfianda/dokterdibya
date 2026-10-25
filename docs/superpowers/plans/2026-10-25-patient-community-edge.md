# Patient community edge chat implementation plan

**Goal:** Right-edge mobile launcher opening existing community chat in a full-screen panel from the right.

**Architecture:** Shared module and CSS mounted through PatientSession; lazy same-origin chat iframe; existing unread badge service. No new dependencies or chat API changes.

**Spec:** `docs/superpowers/specs/2026-10-25-patient-community-edge-design.md`.

## Task and checks

- [ ] Add and run failing runtime regression tests for lazy open, close, history, viewport, authentication and message-source checks.
- [ ] Implement `mountPatientCommunityChat()` in `public/scripts/patient-community-chat.js` and `public/styles/patient-community-chat.css`.
- [ ] Load through `public/scripts/patient-session.js`, use one badge service for card and edge, and route mobile community-card taps to the panel.
- [ ] Add patient-embed close/visibility behavior in community chat and preserve embedded profile return navigation. Leave Staff embed behavior intact.
- [ ] Bump `public/sw.js` and `public/sisiwanita-sw.js`, precaching both new assets.
- [ ] Run focused community/session tests and inspect mobile, keyboard-height, landscape, desktop and history behavior in the Codex in-app browser.
- [ ] Commit and push only related files; deploy using the existing locked VPS checkout flow; verify served hashes, service worker, health and actual mobile UI.

Review focus: closed iframe read acknowledgements, duplicate sockets, auth loss, same-origin/source validation, existing home Back exit guard, safe-area and keyboard geometry.

Standing authorization covers design, implementation and deployment without additional approval gates.
