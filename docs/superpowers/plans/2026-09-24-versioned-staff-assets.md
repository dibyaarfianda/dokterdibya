# Versioned Staff Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that every executable Staff Panel dependency is served from one immutable physical release while preserving active clinical drafts and the existing UI.

**Architecture:** A Node staging tool publishes complete `staff/public` snapshots under `RELEASE_BASE/vN/staff/public` using checksum manifests and an exclusive atomic rename. Production Nginx selects a physical root from a validated `?v=vN`, propagates that version down canonical ES-module imports using a same-origin versioned module referrer, and never falls back to mutable current bytes for an explicit version.

**Tech Stack:** Node.js 22, Jest 30, Puppeteer 24/Chromium, Nginx, PowerShell-compatible Node CLIs, Git worktrees, PM2.

**Spec:** `docs/superpowers/specs/2026-09-24-versioned-staff-assets-design.md`

**Command convention:** Run Node/Jest/npm commands shown in Tasks 1-4 with `staff/backend` as the working directory. Run Git commands and `npm --prefix docboard ...` from the repository root. Every production command belongs in the reviewed runbook; no test invokes production paths.

## Global Constraints

- Valid release versions match `^v[1-9][0-9]*$`; invalid or unavailable versions fail closed.
- Published release directories are immutable. Identical restaging is idempotent; any mismatch is fatal and cannot overwrite the release.
- The reserved `<release-base>/.invalid` path must be absent; staging and deployment verification fail if it exists or is a symlink.
- The snapshot contains the complete `staff/public` tree and a deterministic SHA-256 manifest tied to one source commit.
- Exact Staff HTML and service-worker routes remain current and `no-store`; APIs, Socket.IO, uploads, patient assets, and DocBoard never enter release routing.
- Every executable dependency reachable from the authenticated Staff shell must resolve below `/staff/public/`; Staff code must not import mutable patient-root `/scripts/` assets.
- No visible layout, menu order, transition, or standalone-PWA workflow may change.
- Active drafts and patient context cannot be cleared or force-reloaded during upgrade.
- Production staging must publish both the active and target release snapshots before Nginx routing or the active checkout changes.
- Never use `git reset --hard`; never delete a release base, repository root, current release, previous release, home directory, or an unresolved/globbed path.
- No synthetic clinical mutation is allowed in production.

## Review Focus

- A valid version whose directory is absent must return failure, never bytes from the current checkout; Task 2 exercises this with actual Nginx.
- A two-level module graph must keep its root version after redirects, cache misses, and disabled service workers; Task 2 exercises v413 and v414 in Chromium.
- A failed copy or checksum after another release is published must leave that release byte-identical; Task 1 injects both failures.
- A stale Staff page must not escape through `/scripts/` or a canonical dynamic import; Task 3 scans and executes the active graph.
- A failed Nginx syntax check or live hash check must restore configuration without switching the application checkout; Task 4 rehearses this against a disposable configuration and records the exact rollback commands.

---

### Task 1: Immutable Staff Release Staging

**Files:**
- Create: `staff/backend/services/staffAssetRelease.js`
- Create: `staff/backend/scripts/stage-staff-assets.js`
- Create: `staff/backend/tests/unit/StaffAssetRelease.test.js`

**Interfaces:**
- Consumes: repository root containing `staff/public`; explicit release base; version; full source commit SHA.
- Produces: `validateReleaseVersion(value): string`, `buildStaffReleaseManifest({ publicRoot, version, sourceCommit }): Promise<Manifest>`, and `stageStaffAssetRelease({ repositoryRoot, releaseBase, version, sourceCommit }): Promise<{ status, releaseDir, manifest, manifestSha256 }>`.
- `Manifest` is `{ schemaVersion: 1, version, sourceCommit, fileCount, totalBytes, files: [{ path, bytes, sha256 }] }`; `files` is sorted by slash-normalized relative path and excludes `release-manifest.json`.

- [ ] **Step 1: Write failing validation and manifest tests**

Add table-driven tests that accept `v1`, `v413`, and `v9999`; reject empty, `v0`, `V414`, `v414/../x`, absolute paths, whitespace, query text, and separators. Build a fixture `staff/public` containing nested scripts, CSS, HTML, image bytes, and an empty file. Assert exact sorted paths, file count, total bytes, commit, and SHA-256 values.

```javascript
const manifest = await buildStaffReleaseManifest({
    publicRoot: path.join(repo, 'staff', 'public'),
    version: 'v414',
    sourceCommit: 'a'.repeat(40)
});
expect(manifest).toEqual({
    schemaVersion: 1,
    version: 'v414',
    sourceCommit: 'a'.repeat(40),
    fileCount: 5,
    totalBytes: expectedBytes,
    files: expectedFiles
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetRelease.test.js`

Expected: FAIL because `staffAssetRelease.js` does not exist.

- [ ] **Step 3: Implement version validation and deterministic manifests**

Use `fs.promises.readdir(..., { withFileTypes: true })`, explicitly reject symbolic links and non-file/non-directory entries, hash files by streaming SHA-256, normalize manifest paths with `/`, and serialize JSON as `JSON.stringify(manifest, null, 2) + '\n'`. Require a 40-character hexadecimal commit; do not infer it from the active checkout.

```javascript
const RELEASE_VERSION = /^v[1-9][0-9]*$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

function validateReleaseVersion(value) {
    if (!RELEASE_VERSION.test(String(value || ''))) throw new Error('Invalid Staff release version');
    return value;
}
```

- [ ] **Step 4: Write failing publication-safety tests**

Cover new publication, identical restaging, changed-content collision, changed-commit collision, two concurrent publishers of the same version, a stale publication lock, a copy failure, a post-copy checksum failure, a pre-existing unrelated release, a pre-existing or symlinked `.invalid` path, a symlink inside the source, release base equal to repository root, final path escaping release base, and temporary cleanup limited to the invocation's exact directory.

```javascript
await stageStaffAssetRelease(input);
const before = await hashTree(path.join(releaseBase, 'v413'));
await expect(stageStaffAssetRelease({ ...input, repositoryRoot: changedRepo }))
    .rejects.toThrow(/already exists with different content/i);
expect(await hashTree(path.join(releaseBase, 'v413'))).toEqual(before);
```

- [ ] **Step 5: Run publication tests and confirm RED**

Run the same focused Jest command.

Expected: validation/manifest tests pass; publication tests fail because atomic staging is absent.

- [ ] **Step 6: Implement exclusive atomic publication**

Resolve all roots with `path.resolve`, require `sourcePublic` beneath `repositoryRoot`, require both temp and final paths beneath `releaseBase`, create the release base if absent, and copy into `.<version>.tmp-<pid>-<uuid>` on the same filesystem. Write and re-verify the manifest before publication.

Serialize publishers with an adjacent `.<version>.publish.lock` opened using `wx`; the lock records only PID, start timestamp, version, and temp basename. A live lock is a hard failure. A stale lock may be removed only after its age exceeds the documented timeout, its recorded temp path passes containment checks, and no final release exists; test this path with injected time. While holding the lock, re-check `final`: compare it for exact idempotence when present, otherwise publish with `fs.rename(temp, final)`. The cooperative lock plus same-filesystem rename is the exclusive publication boundary for this repository-owned tool. Never delete or replace `final`. On `EEXIST`/`ENOTEMPTY`/Windows rename collision, compare the existing manifest and every listed file; return `status: 'existing'` only for an exact match. Cleanup only the recorded temp and lock paths in `finally`, after containment checks, and never remove a lock whose recorded invocation ID differs.

- [ ] **Step 7: Add the fail-closed CLI**

Require all flags and reject positional fallbacks:

```text
node scripts/stage-staff-assets.js \
  --repository-root /var/tmp/dokterdibya-target \
  --release-base /var/www/dokterdibya-staff-releases \
  --version v414 \
  --source-commit <40-char-sha>
```

The CLI prints only version, status, release directory, file count, total bytes, and manifest SHA-256. It must not print file names, tokens, environment values, or patient data. Missing/invalid arguments exit nonzero before filesystem mutation.

- [ ] **Step 8: Run Task 1 GREEN gates**

Run:

```text
node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetRelease.test.js
node --check services/staffAssetRelease.js
node --check scripts/stage-staff-assets.js
git diff --check
```

Expected: all tests and checks pass; no directory outside the test temp root changes.

- [ ] **Step 9: Commit Task 1**

```text
git add staff/backend/services/staffAssetRelease.js staff/backend/scripts/stage-staff-assets.js staff/backend/tests/unit/StaffAssetRelease.test.js
git commit -m "Add immutable Staff asset release staging"
```

---

### Task 2: Nginx Release Routing and Module Propagation

**Files:**
- Create: `deployment/nginx/dokterdibya-staff-assets-map.conf.template`
- Create: `deployment/nginx/dokterdibya-staff-assets-location.conf.template`
- Create: `staff/backend/services/staffAssetNginxConfig.js`
- Create: `staff/backend/scripts/render-staff-asset-nginx.js`
- Create: `staff/backend/tests/unit/StaffAssetNginxConfig.test.js`
- Create: `staff/backend/tests/unit/StaffAssetModulePropagation.test.js`
- Modify: `.github/workflows/staff-panel-ci.yml`

**Interfaces:**
- Consumes: release layout and version grammar from Task 1.
- Produces: `renderStaffAssetNginx({ releaseBase, currentRoot }): { mapConfig, locationConfig }` and two rendered include files. `releaseBase` and `currentRoot` must be absolute Linux paths containing only `/`, alphanumerics, `.`, `_`, and `-`.
- The map include is installed in Nginx `http` context. The location include replaces the existing production `location ^~ /staff/public/` block inside the `dokterdibya.com` TLS server.

- [ ] **Step 1: Write failing renderer and route-boundary tests**

Assert rendered configuration contains:

- no `v` argument -> `/var/www/dokterdibya`;
- exactly one lowercase `v` argument whose value matches `^v[1-9][0-9]*$` -> `/var/www/dokterdibya-staff-releases/$arg_v`;
- invalid -> `/var/www/dokterdibya-staff-releases/.invalid`;
- exact current/no-store routes for `sw.js`, Staff HTML, and proxied `sunday-clinic.html` before versioned static resolution;
- no API, Socket.IO, uploads, patient, or DocBoard location;
- `try_files $uri =404` with no fallback root;
- same-origin `https://dokterdibya.com/staff/public/scripts/...js?v=vN` referrer extraction only;
- a canonical Staff JS request with a validated module referrer gets a same-path `307` adding only `?v=vN`.

Also reject relative roots, newline/semicolon injection, `..`, shell syntax, spaces, and release base equal to current root.

- [ ] **Step 2: Run renderer tests and confirm RED**

Run: `node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetNginxConfig.test.js`

Expected: FAIL because the renderer/templates do not exist.

- [ ] **Step 3: Implement deterministic rendering**

Keep routing policy in the templates and substitute only `__STAFF_RELEASE_BASE__` and `__DOKTERDIBYA_CURRENT_ROOT__` after strict validation. The renderer refuses unreplaced `__...__` tokens and emits final-newline text. The CLI requires `--release-base`, `--current-root`, `--map-output`, and `--location-output`; it writes each through a sibling temporary file plus rename and refuses identical output paths.

The map template must implement the following states explicitly. Matching `v` arguments is case-sensitive; a case variant, empty value, duplicate (including case variants), encoded separator, or invalid value selects `.invalid`. A query with no exact lowercase `v` argument continues to current bytes.

```nginx
map $args $staff_v_present {
    default 0;
    ~(^|&)v= 1;
}

map $args $staff_v_duplicate {
    default 0;
    ~*(^|&)v=[^&]*(?:&[^&]*)*&v= 1;
}

map "$staff_v_duplicate:$staff_v_present:$arg_v" $staff_asset_root {
    default "__STAFF_RELEASE_BASE__/.invalid";
    "0:0:" "__DOKTERDIBYA_CURRENT_ROOT__";
    ~^0:1:v[1-9][0-9]*$ "__STAFF_RELEASE_BASE__/$arg_v";
}

map "$staff_v_duplicate:$staff_v_present:$arg_v" $staff_asset_cache_control {
    default "no-store";
    "0:0:" "no-cache, must-revalidate";
    ~^0:1:v[1-9][0-9]*$ "public, max-age=31536000, immutable";
}

map $http_referer $staff_module_referrer_version {
    default "";
    ~^https://dokterdibya[.]com/staff/public/scripts/[^?#]+[.]js[?]v=(v[1-9][0-9]*)$ $1;
}

map "$args:$staff_module_referrer_version" $staff_module_redirect_version {
    default "";
    ~^:(v[1-9][0-9]*)$ $1;
}
```

The location template must preserve the currently deployed `sunday-clinic.html` upstream configuration below and place current/no-store HTML and service-worker locations ahead of the generic asset resolver. Its executable/static core is:

```nginx
location ^~ /staff/public/ {
    location = /staff/public/sw.js {
        root __DOKTERDIBYA_CURRENT_ROOT__;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        try_files $uri =404;
    }

    location = /staff/public/sunday-clinic.html {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location ~ [.]html$ {
        root __DOKTERDIBYA_CURRENT_ROOT__;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        try_files $uri =404;
    }

    location ~ ^/staff/public/scripts/.+[.]js$ {
        if ($staff_module_redirect_version != "") {
            return 307 $uri?v=$staff_module_redirect_version;
        }
        root $staff_asset_root;
        add_header Cache-Control $staff_asset_cache_control always;
        try_files $uri =404;
    }

    root $staff_asset_root;
    add_header Cache-Control $staff_asset_cache_control always;
    try_files $uri =404;
}
```

Renderer tests must parse the rendered text and prove that exact locations precede the nested HTML/script regex locations; they must also exercise `?foo=1` as current, `?v=v413` as release, and `?v=`, `?V=v413`, `?v=v413&v=v414`, and `?v=v413%2f..` as invalid. If `nginx -t` shows that the preserved production proxy cannot legally remain nested, stop and revise the design with the user rather than silently changing route ownership.

- [ ] **Step 4: Write the real-Chromium module propagation RED test**

Create a loopback fixture with distinct v413/v414 `root.js -> mid.js -> leaf.js` sentinels. The fixture implements the specified redirect rule and records URL, referrer, status, and served release. Run Chromium with service workers disabled and assert:

```javascript
expect(await loadVersion('v413')).toEqual(['root-v413', 'mid-v413', 'leaf-v413']);
expect(await loadVersion('v414')).toEqual(['root-v414', 'mid-v414', 'leaf-v414']);
expect(trace.every(item => item.servedVersion === requestedVersion)).toBe(true);
```

Add malformed version, missing release, external referrer, misleading host suffix, encoded traversal, and dependency-depth-two cases. First run must fail because canonical dependencies resolve to current bytes.

- [ ] **Step 5: Implement and verify version propagation semantics**

Update the fixture to use the exact renderer policy: only a canonical Staff `.js` request with no `v` and a validated production/loopback Staff-module referrer redirects; the redirected explicit request then selects the release root. Do not copy arbitrary referrer query parameters. Rerun `StaffAssetModulePropagation.test.js` with local Chrome and require both version traces to pass.

- [ ] **Step 6: Add an actual Nginx CI probe**

Add a workflow step that installs `nginx-light` on Ubuntu, renders the two includes into a temporary Nginx prefix, stages synthetic v413/v414 trees with Task 1, and runs `nginx -t`. Start a disposable TLS listener bound only to loopback on port 443 with a fixture certificate; Chromium uses `--host-resolver-rules=MAP dokterdibya.com 127.0.0.1` and ignores only that fixture certificate. This keeps the browser referrer equal to the exact production origin required by the template. Always stop the disposable Nginx process in a workflow cleanup step.

Execute a Node/Puppeteer probe against that listener. It must assert distinct two-depth module sentinels, invalid/empty/duplicate/missing-release 404, current unversioned bytes, HTML/SW no-store, and no routing of `/api/health` into a release. It must record every module URL/referrer and prove every body and final URL uses the requested root version.

The workflow uses no Staff credential for this synthetic job and prints no environment secrets.

- [ ] **Step 7: Run Task 2 GREEN gates**

Run locally:

```text
node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetNginxConfig.test.js tests/unit/StaffAssetModulePropagation.test.js
node --check services/staffAssetNginxConfig.js
node --check scripts/render-staff-asset-nginx.js
git diff --check
```

Run the actual Nginx probe in an Ubuntu container/CI or the disposable VPS staging prefix before release. Expected: syntax valid and all HTTP/module assertions pass.

- [ ] **Step 8: Commit Task 2**

```text
git add deployment/nginx staff/backend/services/staffAssetNginxConfig.js staff/backend/scripts/render-staff-asset-nginx.js staff/backend/tests/unit/StaffAssetNginxConfig.test.js staff/backend/tests/unit/StaffAssetModulePropagation.test.js .github/workflows/staff-panel-ci.yml
git commit -m "Route Staff assets through immutable releases"
```

---

### Task 3: Contain the Active Staff Dependency Graph

**Files:**
- Create: `staff/public/scripts/socket-credentials.js`
- Modify: `staff/public/scripts/realtime-sync.js`
- Modify: `staff/public/scripts/kelola-announcement.js`
- Modify: `staff/public/scripts/legacy/patient-tools.js`
- Modify: `staff/public/scripts/sunday-clinic/utils/medical-import.js`
- Modify: `staff/public/index-adminlte.html`
- Modify: `staff/public/sw.js`
- Test: `staff/backend/tests/unit/RealtimeClientAuth.test.js`
- Create: `staff/backend/tests/unit/StaffAssetDependencyGraph.test.js`
- Modify: `staff/backend/tests/unit/Task6ServiceWorker.test.js`

**Interfaces:**
- Consumes: version propagation and immutable roots from Task 2.
- Produces: an authenticated Staff executable graph whose same-origin dependencies are all under `/staff/public/` and whose canonical imports inherit the parent release.
- Patient pages continue using `public/scripts/socket-credentials.js`; their URL and behavior do not change.

- [ ] **Step 1: Write the dependency-containment RED tests**

Scan executable imports and script-loader literals in the authenticated Staff graph. Fail for a quoted absolute `/scripts/` specifier, while allowing `/staff/public/scripts/` and third-party HTTPS executable dependencies pinned to an exact semantic version. Parse the authenticated `index-adminlte.html` entrypoint and require every same-origin local script or module entry URL to carry exactly `?v=v414`; reject an empty, duplicate, malformed, or stale version. Assert the initial failures identify the known `socket-credentials.js` and `patient-list-pages.js` callers plus the floating `sweetalert2@11` CDN entry; all other executable CDN entries must already be exact.

Add a behavioral parity test that runs both credential-helper files in isolated VM windows with a fake Socket.IO object and verifies missing token, token change, logout invalidation, reconnect, stale async read, and stop-tracking outcomes match.

- [ ] **Step 2: Run containment tests and confirm RED**

Run:

```text
node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetDependencyGraph.test.js tests/unit/RealtimeClientAuth.test.js
```

Expected: graph scan fails on the known root imports and floating SweetAlert version; Staff-local credential helper is missing.

- [ ] **Step 3: Pin the Staff credential helper and repair patient-list imports**

Create the Staff-local credential helper with the current reviewed behavior. Change only Staff imports:

```javascript
// realtime-sync.js and kelola-announcement.js
import './socket-credentials.js';

// legacy/patient-tools.js
await import('../patient-list-pages.js');

// sunday-clinic/utils/medical-import.js
await import('../../patient-list-pages.js');
```

Preserve the patient shared helper at `/scripts/socket-credentials.js`. Do not change its patient callers. Pin the authenticated shell's floating SweetAlert entry from `sweetalert2@11` to the currently resolved `sweetalert2@11.26.25`; do not change library behavior or visible UI.

- [ ] **Step 4: Align service-worker graph handling**

Add the Staff-local credential helper to the verified current shell graph. Preserve exact-version cache keys and HTML/API network rules. For a canonical Staff dependency, use only the already-proved client release; an unproved client goes to network where Task 2 routing remains authoritative. Do not use `ignoreSearch`, do not cache API/HTML, and do not force client navigation.

- [ ] **Step 5: Add old/new graph browser coverage**

Extend the Chromium fixture so v413 and v414 each load credential setup plus a lazy patient-list module with distinct sentinels, first with service worker disabled and then with current worker cache misses. Assert one release per trace and no request to patient-root `/scripts/`.

- [ ] **Step 6: Run Task 3 GREEN gates**

Run:

```text
node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetDependencyGraph.test.js tests/unit/RealtimeClientAuth.test.js tests/unit/Task6ServiceWorker.test.js tests/unit/StaffAssetModulePropagation.test.js
node scripts/staff-static-check.js
node --check ../public/scripts/socket-credentials.js
node --check ../public/scripts/realtime-sync.js
node --check ../public/scripts/kelola-announcement.js
node --check ../public/scripts/legacy/patient-tools.js
node --check ../public/scripts/sunday-clinic/utils/medical-import.js
node --check ../public/sw.js
git diff --check
```

Expected: all tests and checks pass with cache version still exactly `v414`; no visual source changes.

- [ ] **Step 7: Commit Task 3**

```text
git add staff/public/scripts/socket-credentials.js staff/public/scripts/realtime-sync.js staff/public/scripts/kelola-announcement.js staff/public/scripts/legacy/patient-tools.js staff/public/scripts/sunday-clinic/utils/medical-import.js staff/public/index-adminlte.html staff/public/sw.js staff/backend/tests/unit/RealtimeClientAuth.test.js staff/backend/tests/unit/StaffAssetDependencyGraph.test.js staff/backend/tests/unit/Task6ServiceWorker.test.js
git commit -m "Keep Staff dependencies inside release snapshots"
```

---

### Task 4: Safe Nginx Installation, Verification, and Runbook

**Files:**
- Create: `staff/backend/services/staffAssetDeployment.js`
- Create: `staff/backend/scripts/prepare-staff-asset-nginx.js`
- Create: `staff/backend/scripts/verify-staff-asset-release.js`
- Create: `staff/backend/tests/unit/StaffAssetDeployment.test.js`
- Create: `deployment/STAFF_ASSET_RELEASES.md`
- Modify: `.superpowers/sdd/2026-09-24-system-hardening-seamless/task-6-report.md`

**Interfaces:**
- Consumes: Task 1 manifests and Task 2 rendered includes.
- Produces: `prepareStaffNginxInstallation({ siteConfig, mapConfig, locationConfig, mapIncludePath, locationIncludePath, outputDirectory, backupDirectory }): Promise<PreparedInstallation>` and `verifyPublishedStaffRelease({ baseUrl, releaseBase, versions, paths }): Promise<VerificationResult>`.
- Preparation never edits `/etc/nginx` directly and never reloads Nginx. It emits a checked candidate site file, includes, backup hash, and exact install/restore manifest for the controller.

- [ ] **Step 1: Write failing preparation/rollback tests**

Use a fixture of the verified production legacy map plus Staff location block. Assert the exact legacy map at file start is replaced once by `include /etc/nginx/snippets/dokterdibya-staff-assets-map.conf;`, and the exact Staff location range is replaced once by `include /etc/nginx/snippets/dokterdibya-staff-assets-location.conf;`. Zero/two matches for either region fail. Assert backup content/hash is preserved, output stays below the requested output directory, and the original site file is never modified. Reject symlinked site/output/backup paths, relative paths, an output equal to input, include destinations outside `/etc/nginx/snippets/`, and newline/semicolon injection.

Add verification tests with loopback v413/v414 assets: expected hashes pass; swapped bytes, missing release, a present/symlinked `.invalid` path, invalid version success, HTML cache regression, API routed as static, and any HTTP 5xx fail.

- [ ] **Step 2: Run deployment tests and confirm RED**

Run: `node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetDeployment.test.js`

Expected: FAIL because deployment service and CLIs do not exist.

- [ ] **Step 3: Implement candidate-only Nginx preparation**

Require the current legacy map to match this exact leading block once:

```nginx
map $arg_v $staff_asset_cache_control {
    default "public, max-age=31536000, immutable";
    ""      "no-cache, must-revalidate";
}
```

Replace it with the validated map-include statement. Separately locate the Staff location only between the exact comments `# IMPORTANT: Staff static files - must come BEFORE /staff/ proxy` and `# Patient portal static assets (fonts/images 30 days)`, replacing only the first range and retaining the latter marker. Replace it with the validated location-include statement. Preserve all other bytes exactly. Emit:

- candidate site config;
- rendered map and location includes;
- SHA-256 of source/candidate/includes;
- JSON install manifest listing destination and backup paths;
- exact restore source/destination pairs.

The CLI requires every path flag, including the two absolute `/etc/nginx/snippets/...` destination paths, supports `--check-only`, and never runs `sudo`, `nginx`, `systemctl`, `service`, PM2, Git, or a shell.

- [ ] **Step 4: Implement the release verifier**

Read local manifests, select sanitized relative paths supplied on the command line, fetch unversioned and explicit-version URLs, and compare response status/body SHA/cache headers. Require at least two versions and one `.js` dependency. Probe an invalid version and require failure. Strip query strings from output and report only version, relative path, status, byte count, and SHA-256.

- [ ] **Step 5: Write the exact operations runbook**

Document these production steps with concrete commands and stop conditions:

1. Capture current commit/version and clean-state evidence.
2. Fetch target commit and create `/var/tmp/dokterdibya-wave3-assets-<shortsha>` without changing current.
3. Use the target tool to stage current v413 from `/var/www/dokterdibya` and target v414 from the temporary worktree.
4. Verify both manifests and file hashes, and require the reserved release-base `.invalid` path to be absent.
5. Prepare candidate Nginx files and back up `/etc/nginx/sites-enabled/dokterdibya.com` into a timestamped path beneath `/var/backups/dokterdibya/`.
6. Install the map include, location include, and candidate site file with explicit paths; run `nginx -t`.
7. On failure, restore exact backup files, rerun `nginx -t`, and stop before Git/PM2 changes.
8. Reload Nginx, verify v413/v414/invalid/current routes, then fast-forward production checkout and reload PM2 once.
9. Verify exact commit, PM2 restart/unstable counts, two health/DB checks, live asset hashes, authenticated browser, realtime, console, Nginx 5xx, and performance gates.
10. Retain at least five releases; cleanup protects current/previous and requires valid manifests.

Never put credentials, tokens, patient identifiers, query values, or manifest file lists into the runbook evidence.

- [ ] **Step 6: Run Task 4 GREEN gates**

Run:

```text
node node_modules/jest/bin/jest.js --runInBand --coverage=false tests/unit/StaffAssetDeployment.test.js tests/unit/StaffAssetRelease.test.js tests/unit/StaffAssetNginxConfig.test.js tests/unit/StaffAssetModulePropagation.test.js tests/unit/StaffAssetDependencyGraph.test.js tests/unit/Task6PerformanceGate.test.js tests/unit/Task6ServiceWorker.test.js
node --check services/staffAssetDeployment.js
node --check scripts/prepare-staff-asset-nginx.js
node --check scripts/verify-staff-asset-release.js
node scripts/staff-static-check.js
git diff --check
```

Then run the repository-wide gates from their stated working directories:

```text
npm run test:staff-smoke
npm run test:integration -- --runInBand --coverage=false --detectOpenHandles
npm run test:ci -- --detectOpenHandles
npm --prefix docboard test
npm --prefix docboard run build
```

Every command must exit normally with status zero. A timeout, non-terminating Jest worker, new open handle, or increased failure count is a failed gate; do not release or mask it with `--forceExit`.

- [ ] **Step 7: Commit Task 4**

```text
git add staff/backend/services/staffAssetDeployment.js staff/backend/scripts/prepare-staff-asset-nginx.js staff/backend/scripts/verify-staff-asset-release.js staff/backend/tests/unit/StaffAssetDeployment.test.js deployment/STAFF_ASSET_RELEASES.md .superpowers/sdd/2026-09-24-system-hardening-seamless/task-6-report.md
git commit -m "Document atomic Staff asset deployment"
```

---

## Wave 3 Review and Release Gate

- [ ] Generate a review package from the Task 6 pre-repair base through final HEAD and obtain independent SPEC PASS and QUALITY PASS. Any Critical/Important finding enters the bounded fix loop before release.
- [ ] Fast-forward local `main` to the reviewed feature HEAD, push without co-author metadata, and confirm the remote exact commit.
- [ ] Before changing the active checkout, execute the runbook to stage and verify v413 plus v414 and validate the disposable Nginx candidate with `nginx -t` and two-version browser probes.
- [ ] Install/reload Nginx atomically, verify both release roots and invalid-version failure, then fast-forward production and perform one planned PM2 reload.
- [ ] Verify production commit, PM2 online/unstable/restart counts, two health/DB checks, Staff v414 HTML/SW, PWA controller, authenticated polling realtime, browser console, and no structural visual change.
- [ ] Run the corrected authenticated performance gate: warm network-backed requests `<=40`, genuine failures `0`, cached activation p95 `<=1000 ms`, and API app-time budgets all pass.
- [ ] Repeat equal-size post-stabilization production samples. Require p75 at least 25% better than the recorded baseline and p95 no more than 5% worse. Do not compare unequal five-versus-twelve sample sets.
- [ ] Aggregate Nginx 5xx for five minutes and require `<=1%`; require Socket.IO auth errors `<=2%` of sessions and no unplanned PM2 restart.
- [ ] Roll back if any health check fails twice, release-related restart appears, 5xx exceeds the threshold, performance gates fail, or any cross-user/unauthorized clinical event is observed.
- [ ] Do not perform synthetic clinical writes. Record that the first legitimate clinical operation remains the before/after integrity verification point.
- [ ] Only after the release gate passes, remove the temporary Git worktree and redundant Wave 3 staging database/user. Retain the production rollback backup and at least five Staff asset releases.
