# Versioned Staff Asset Releases

**Status:** Approved design for the Wave 3 atomic-update gate
**Date:** 2026-09-24
**Scope:** DOKTERDIBYA Staff Panel static assets and their production Nginx routing

## Purpose

Make Staff Panel updates atomic without forcing an active clinical session to reload or mixing JavaScript from different releases. An already-open v413 page must continue receiving v413 bytes, while a new v414 page must receive only v414 bytes. Unsaved clinical drafts, authentication, active-patient context, navigation state, and the standalone PWA layout must not be changed by this work.

This design closes a verified production gap: Nginx currently serves `/staff/public/` directly from the mutable Git checkout and treats every non-empty `?v=` value as immutable. Therefore `/staff/public/scripts/example.js?v=v413` can return current v414 bytes after a deploy even though the URL still says v413. Express middleware and service-worker cache names alone cannot correct that boundary.

## Selected Approach

Each Staff release has an immutable physical snapshot:

```text
/var/www/dokterdibya-staff-releases/
  v413/
    staff/public/
    release-manifest.json
  v414/
    staff/public/
    release-manifest.json
```

Nginx resolves a valid explicit Staff version to the matching snapshot. Unversioned requests continue to use the active checkout for backward compatibility. Invalid or unavailable versions fail closed and never fall back to current bytes.

This query-compatible design is preferred over immediately rewriting every application URL to `/assets/<version>/...`. It fixes the trust boundary while preserving existing HTML, module loaders, and cached clients. A future migration to versioned URL prefixes can build on the same snapshots but is outside this wave.

## Components

### 1. Release staging tool

A repository-owned Node.js command stages one complete `staff/public` tree. Node is used so the same safety and manifest tests run on Windows CI and the Linux VPS.

Inputs:

- source repository/worktree root;
- release base directory;
- version matching `^v[1-9][0-9]*$`;
- source commit SHA.

The tool:

1. Resolves and validates absolute source, release-base, temporary, and final paths.
2. Refuses a source outside the supplied repository root or a target outside the supplied release base.
3. Copies into a uniquely named temporary directory on the same filesystem.
4. Includes the complete `staff/public` tree so scripts, styles, sounds, icons, images, and fragments remain internally consistent. HTML and service-worker copies exist for audit/rollback evidence but are not served through the versioned asset location.
5. Creates a deterministic manifest containing version, source commit, file count, total bytes, and sorted relative-path SHA-256 entries.
6. Re-reads the staged files and verifies the manifest before publication.
7. Publishes with an exclusive atomic rename from the temporary directory to `<release-base>/<version>`.

An existing release with the identical manifest is an idempotent success. An existing release with any differing byte, missing file, extra file, version, or source commit is a hard failure. Published releases are never updated in place.

Temporary-directory cleanup may remove only the exact resolved temporary path created by the current invocation. It must never recursively remove the release base, repository root, final release directory, home directory, or a path derived from an unvalidated version.

### 2. Nginx version resolver

The repository contains the reviewed Nginx configuration fragment used by production. Its behavior is:

- no `v` query: resolve under the active `/var/www/dokterdibya` checkout;
- valid `vN`: resolve under `/var/www/dokterdibya-staff-releases/vN`;
- invalid version syntax or a missing release directory: return not found/fail closed;
- never fall back from a requested version to the active checkout.

The requested URI remains `/staff/public/...`, so each release root contains the same `staff/public/...` structure. Nginx uses the selected root plus the original URI and `try_files ... =404`; it does not concatenate an unchecked path supplied by the client.

Exact Staff HTML and service-worker locations remain outside versioned asset resolution:

- `index-adminlte.html`, other HTML, and `sunday-clinic.html` remain current and `no-store`/network-first;
- `sw.js` remains current, `no-store`, and retains its Staff scope;
- APIs, Socket.IO, uploads, patient-domain assets, and DocBoard are not routed through this release store.

Only same-origin Staff asset paths under `/staff/public/` can use this resolver. No patient route or arbitrary filesystem path can select a release directory.

### 3. ES-module version propagation

Top-level Staff scripts already carry an explicit version. Static ES-module imports often use canonical relative URLs without a query. To keep the entire dependency graph on one release, Nginx propagates a version only when all of these are true:

- the request is a canonical same-origin JavaScript path under `/staff/public/scripts/`;
- the request has no `v` argument;
- its `Referer` is the canonical production origin and a Staff JavaScript URL;
- that referrer has a syntactically valid `vN` argument.

Nginx responds with a same-path redirect adding the validated version. The browser's final module URL is therefore versioned, and the next dependency repeats the same rule. The redirect target is constructed from the existing normalized URI and validated version only; arbitrary referrer hosts, paths, fragments, and query text are never copied.

Requests that do not satisfy every condition stay canonical and use the active checkout. Invalid or cross-origin referrers cannot choose a release.

The service worker may cache exact current-version URLs, but it is not the authority for version correctness. A network fallback for v413 must still return v413 from Nginx. Cache misses, worker upgrades, old controllers, and disabled service workers therefore retain the same invariant.

### 4. Active dependency containment

Every executable dependency reachable from the authenticated Staff shell must live below `/staff/public/` so it can participate in the same release snapshot and Nginx rules.

The current graph has two exceptions that must be corrected as part of this change:

- Staff `realtime-sync.js` and `kelola-announcement.js` import the patient-shared `/scripts/socket-credentials.js`. A Staff-local copy becomes the Staff import target, while patient pages continue using the existing shared path. A contract test keeps both copies behaviorally identical until a future shared build system replaces the duplication.
- Legacy patient tools and Sunday Clinic medical import request `/scripts/patient-list-pages.js`, although the maintained module exists at `/staff/public/scripts/patient-list-pages.js`. Those Staff callers move to the Staff-local path and inherit the caller's release version through the module-referrer rule.

The release test scans static imports, dynamic imports, and classic-script loader URLs in the active Staff graph. Any same-origin executable dependency outside `/staff/public/` fails the build unless it is explicitly classified as a third-party CDN dependency already pinned by an exact URL. No production Staff dependency may rely on the mutable patient-root `/scripts/` path.

## Deployment Flow

The deployment order prevents any interval in which a declared version points at different bytes:

1. Verify the production checkout is clean apart from explicitly preserved operational files and record the current commit/version.
2. Stage and verify the currently served version from the current checkout, for example v413.
3. Fetch the target commit without changing the active checkout.
4. Materialize a temporary Git worktree at that exact target commit.
5. Stage and verify the target Staff snapshot, for example v414, from that worktree.
6. Compare both release manifests with their respective Git trees.
7. Back up the active Nginx configuration.
8. Install the version-resolver configuration, run `nginx -t`, and reload Nginx. At this point the still-active v413 HTML resolves to the verified v413 snapshot.
9. Fast-forward the production checkout to the already-staged target commit using the established non-destructive deployment procedure.
10. Reload the backend for server-side changes and verify its exact commit, PM2 state, health, database connectivity, and restart count.
11. Verify live v413 and v414 URLs return their own manifest hashes, invalid versions fail, current HTML advertises v414, and a real browser receives a single-version module graph.

The temporary target worktree is removed only after the production commit and live asset hashes are verified. Release snapshots remain read-only and are not deleted as part of deploy.

## Rollback and Retention

Rollback restores the previous application/HTML commit using the established safe rollback mechanism, reloads the backend if required, and verifies that the previous HTML advertises its retained version. No release directory is rewritten during rollback.

The current and immediately previous releases are always retained. At least five most recent successful Staff releases are retained, which is small relative to current asset size and covers long-lived browser sessions. Cleanup is a separate, explicit operation: it must resolve exact release paths, protect the active and previous versions, and refuse a directory whose manifest is absent or invalid.

If Nginx validation or either manifest check fails, the active checkout and Nginx configuration remain unchanged. If application cutover fails after Nginx activation, both snapshots already exist, so restoring the prior application commit re-establishes the prior release without copying files.

## Failure Semantics

- Invalid version syntax: `404` with no fallback to current assets.
- Valid version with no published release: `404` with no fallback.
- Snapshot collision with different content: staging exits nonzero and preserves both the published release and active application.
- Copy, checksum, or manifest failure: staging exits nonzero and removes only its own temporary directory.
- Nginx syntax failure: do not reload Nginx or switch the application checkout.
- Missing/mixed browser asset version: performance/browser gate fails; do not continue the release.
- HTML/API/service-worker accidentally routed to a release snapshot: contract test fails; deployment is blocked.

No fallback may silently return a different release because availability is less important than preventing mixed clinical code.

## Verification

### Automated tests

- Stage two fixtures with the same relative file and distinct v413/v414 sentinel bytes; both remain retrievable and unchanged after the source tree changes.
- Same-content restaging is idempotent.
- Changed-content restaging of an existing version fails without mutation.
- Copy/checksum/manifest failure leaves the prior release and unrelated directories intact.
- Invalid versions and path traversal inputs fail before filesystem mutation.
- Nginx configuration contract maps empty, valid, invalid, and unavailable versions correctly and excludes HTML, SW, API, patient, upload, and DocBoard routes.
- Real Chromium loads a two-depth ES-module graph from v413 and v414 fixtures and every module body matches its root version.
- Active Staff dependency scanning rejects executable imports under the mutable patient-root `/scripts/`; the Staff credential helper and patient-list pagination callers resolve inside the Staff snapshot.
- Cross-origin and malformed referrers cannot select a release.
- Service-worker-disabled and service-worker-cache-miss browser cases still keep one version.

### Staging/VPS checks

- Run the staging tool against a temporary release base and a temporary Git worktree.
- Validate the candidate Nginx configuration with `nginx -t` before reload.
- Probe both retained release URLs and compare their SHA-256 values to their manifests.
- Confirm an invalid version returns failure and never current bytes.
- Confirm HTML and API responses retain `no-store` behavior.

### Production acceptance

- Warm load has at most 40 genuine network-backed requests, zero genuine failures, and cached activation p95 at most one second.
- Production p75 improves at least 25% against the recorded baseline and p95 does not regress more than 5% using equal-size, post-stabilization samples.
- Browser console has no new error/warning, authenticated polling realtime remains connected, and the live module graph contains one Staff version.
- PM2 remains online with no unplanned restart increase; health and database checks pass twice; Nginx 5xx stays below the approved rollback threshold.
- No synthetic clinical mutation is made in production.

## Operational Ownership

The staging command, Nginx example, deploy order, rollback procedure, manifest verification, and retention rule are repository-owned and documented together. A future Staff cache-version bump is incomplete unless its target snapshot is staged and verified before the active checkout changes.
