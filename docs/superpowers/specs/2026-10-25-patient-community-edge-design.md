# Patient community chat at the mobile edge

The patient portal needs a fixed community-chat icon on the right edge of the mobile PWA. Tapping it opens a full-screen panel sliding in from the right; closing returns to the current portal page.

Use the existing community chat in a same-origin iframe, loaded on first open. A shared component loaded by PatientSession covers authenticated portal pages without copying the chat implementation. Keep the existing desktop community-card navigation. Preserve room selection, messages, nickname, mentions and session helpers. The mobile card may open the same panel.

Alternatives considered: navigating to a new chat page loses the surrounding page and does not provide the requested sliding panel; copying the chat into every page duplicates its behavior. The iframe reuses the existing working flow.

The panel has a title and close button, follows the visible viewport when the keyboard opens, and handles Escape and browser Back. The iframe remains mounted to retain drafts, but hidden panels cannot poll or acknowledge messages as read. Restore page overflow and focus when closed. Exclude login, onboarding, demo mode, community pages and nested frames from the launcher. Refresh the patient service-worker release and verify actual served assets and mobile geometry.
