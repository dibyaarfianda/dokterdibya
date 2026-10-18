# Dummy PWA Mobile Staff & DocBoard

Approved brief: interactive mobile-only preview of all Staff and DocBoard pages using the laboratory navy/teal theme. Six tabs remain Dashboard, Janji Temu, DocBoard, Pasien, Tanya Dokter, Lainnya. Standalone public synthetic preview at /staff-preview/. No clinical API, credentials, migration, real patient data or operational UI replacement.

## Task 1: catalogue and local data contract
- Map every Staff container/navigation grant and DocBoard route to a meaningful preview screen. Preserve source references and aliases.
- Implement synthetic fixtures, isolated local persistence, per-visit drafts, version conflicts, local publish/correction/delete and lab comparison. Verify behavior with Node tests, first failing before implementation.

## Task 2: reusable mobile interface and complete workflows
- Build separate Preact/Vite app, lab-theme tokens, six tabs, searchable directory, role/scenario controls and phone frame on desktop.
- Implement dashboard, clinic/patients/DRD/lab, resource lists/details/forms, calendar/operations, chats, content, workdesk and system pages. Preserve identity, scroll, search and drafts.
- All visible actions produce inspectable local results, exports are marked DUMMY. Own manifest/service worker/storage only.

## Task 3: verification and release
- Verify catalogue and local domain tests, build, all routes at 360/390/430 in Codex in-app browser; check representative writes, back/deep links, role/state switches, overflow and zero operational requests.
- Fresh independent whole-change review, fix substantive findings and repeat relevant checks.
- Commit/push and deploy immutable standalone preview with previous release retained, verify both hosts, health, actual assets and operational Staff unchanged.

Review focus: patient/visit draft isolation; account-independent dummy roles; stale writes and publish idempotency; browser back/scroll/keyboard; cache scope and deployment not affecting live Staff.
