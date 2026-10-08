# Realtime permission rooms and Staff chat evidence

Date: 2026-10-08 (Asia/Jakarta)

## Runtime boundary

- Every active Staff Socket.IO handshake reloads the canonical account state through `AccessControlService`.
- Active Staff joins the existing `staff` room, a private `user:<id>` room, and `permission:<name>` rooms for its current effective permissions.
- The `staff` room remains limited to Staff chat, presence, and status. Existing event names and payloads are unchanged.
- Patient, medical record, examination, billing, visit, queue, log, DocBoard, Medify, Staff-announcement, and support events now use named permission rooms.
- Patient-owned refresh events continue to reach only the matching `patient:<id>` room in addition to the required Staff permission room.
- A zero-grant active Staff account remains in `staff` and `authenticated`, but joins no permission room and receives no clinical or billing event.
- Inactive Staff is rejected at the socket handshake with `ACCOUNT_INACTIVE`.
- `refreshUserAccessRooms` updates every connected session in the private user room, emits the new `access_version`, synchronizes permission rooms, and disconnects an account only when it becomes inactive.

## Chat-preservation gate

- Two in-memory polling-only Staff clients received one `chat:message` exactly once while only the granted client received patient and billing events.
- Presence keeps canonical JWT identity, sibling-tab behavior, reconnect grace, and the existing `users:list` flow.
- Credential refresh, token rotation, logout disconnect, polling-only configuration, popup observers, and lazy lifecycle contracts remain green.
- The Staff chat emitter still targets `staff`; its event and payload are unchanged.
- The chat HTTP route remains a named matrix exemption. No chat message was written during production verification.

## Test evidence

- Expected TDD red: the new realtime permission-room module was absent.
- Focused realtime, socket-auth, credential, presence, popup, and metric gate: 8 suites, 106 tests passed.
- Complete backend run: 221 suites and 1,884 tests passed.
- Twelve pre-existing baseline suites remain unrelated: nine stale static/snapshot contracts and three Assistant DAF suites missing `@simplewebauthn/server` from the shared dependency installation.
- Syntax checks and `git diff --check` passed.
- Independent review found stale-session and support-room gaps before deployment. The final implementation refreshes legacy role, role-assignment, and status changes immediately; discovers sockets before private-room join completion; reloads access once more on connection; serializes overlapping room updates so the newest access version wins; and requires `support_chat.view` before a Staff socket may join a patient support room.

## Rollback

Application rollback restores the previous commit. All accounts remain in `legacy` mode, so permission-room membership is derived from the migrated legacy-equivalent grant set. The Task 1 root-only database backup remains unchanged and is not needed for this code-only rollback.

## Production verification

Pending deployment evidence.
