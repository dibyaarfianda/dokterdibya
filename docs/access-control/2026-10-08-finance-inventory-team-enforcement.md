# Finance, inventory, and team account access evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Account-mode Staff requests for medicines, medical supplies, stock, suppliers, procedures, cost estimates, invoices, billing, financial analysis, briefing, payroll, Staff points, and workdesk operations are authorized by the exact route permission before the handler runs.
- Read, create, write, delete, purchase, adjust, payment, export, reset, finalize, and other sensitive actions use separate grants. Legacy doctor/superadmin restrictions remain the fallback for legacy-mode Staff, while an explicit matching account grant permits delegation.
- Analisa Keuangan automatically includes its required analytics, inventory, and visit read dependencies. The Private parent navigation follows payroll visibility, so a delegated payroll account can reach the granted page.
- Matching Staff controls are hidden or disabled when an account lacks the action permission. Protected doctors retain full access, and the Staff popup chat remains outside the permission matrix.
- Task 10 changes no schema and does not switch any production account to account mode.

## Validation

- The focused Task 10 gate passed 69 tests, including 139 mapped routes with dynamic allow/deny coverage. The cross-group Task 7-10 gate passed 160 tests.
- The complete non-baseline unit gate passed 206 suites and 1,819 tests. The same eleven unrelated baseline suites remain excluded: eight stale size/snapshot/workflow contracts and three Assistant DAF suites whose environment lacks `@simplewebauthn/server`.
- The integration gate passed 24 suites and 248 tests; the Staff smoke gate passed 4 suites and 36 tests.
- JavaScript syntax checks passed for 40 changed files. Staff static validation passed with HTML 322,290 bytes, inline JavaScript 41,182 characters, and cache version `v429`; `git diff --check` also passed.
- No production patient, billing, stock, payroll, finance, procedure, or clinical record was created or changed. The only retained production write was the explicitly authorized Staff chat gate message.

## Production release

- Implementation commit `9e77dd77e0068eaae02db0c152f33c077972601e` was pushed to the feature branch and `main`, then deployed by fast-forwarding the detached production checkout from `d72575fdcba7126d782c837e4f16f5c36b30c5bc`.
- Immutable Staff release `v429` contains 238 files and has manifest SHA-256 `e80df92ef242a889794d93b663d3b97936ea970af25affaf362c7bf9039a21b9`. Both production origins served exact immutable `v428` and `v429` assets, while current assets resolved to `v429`.
- `dibyaklinik-backend` remained online after its controlled reload with restart count 15, zero unstable restarts, `wait_ready=true`, and a 330-second drain timeout. The local upstream and both production origins returned healthy database-connected responses; unauthenticated `/api/access/me` and `/api/auth/me` returned `401`.
- Production remained at 215 catalog permissions, 14 access policies, 1,282 grants, zero account-mode accounts, zero invitations, and 12 active Staff after the test fixture was restored. The root-only Task 10 parity report records 12 migrated non-doctor accounts, two protected doctors, and zero unexplained differences.
- An authenticated protected-doctor Chromium session loaded `v429`. Obat, Penjualan Obat, Analisa Keuangan, Gajian, and Invoice/Keuangan loaded live data without an access or page error; sensitive controls remained available to the protected doctor and the chat button remained visible.
- Two authenticated polling-only Staff clients loaded 100 chat messages plus presence. A temporarily activated, pre-existing inactive Staff fixture was switched to account mode with zero grants only for the gate, then restored byte-for-byte at the access-policy/grant boundary. It loaded chat, sent message `1308`, and each client received it once with the role badge intact. A refreshed credential reconnected over polling; direct inventory access returned `403 ACCESS_DENIED`, two clinical/billing emissions returned `ACCESS_DENIED`, and no patient or billing event reached the zero-grant client.
- The controlled five-minute Nginx release gate used 205 continuous read-only health probes with zero probe failures on the same commit and assets. The exact release window contained 317 requests, zero 5xx responses, and a 0% server-error rate.

## Rollback

- Application rollback restores commit `d72575fdcba7126d782c837e4f16f5c36b30c5bc`, reloads `dibyaklinik-backend`, and restores current Staff assets to retained immutable release `v428`.
- Task 10 has no schema migration. Production has zero account-mode users, so rollback requires no access-policy or grant mutation.
- Immutable `v428` and `v429`, the Task 1 authorization backup, the Task 5 pre-migration backup, and the root-only Task 10 parity report remain available.
