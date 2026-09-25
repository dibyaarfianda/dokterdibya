# Staff asset releases: staged cutover and rollback

This runbook is for the reviewed v413 → v414 production change. Run commands on the VPS as an operator with the existing deployment access. Stop on any nonzero exit, unexpected path, hash mismatch, or failed browser/health gate. The preparation command writes candidate files only; the operator installs them after inspection. Do not record credentials, tokens, patient identifiers, query values, or manifest file lists in evidence.

If the v413/v414 immutable bridge has already been activated during a guarded trial, **do not rerun sections 3–5 against the modified site**: the preparation tool correctly rejects pre-existing snippets. Verify the installed map, location, site, both release manifests, and both-origin pre-cutover verifier again; then perform the status-log preparation below against that exact current site before any application cutover. Preserve the previously validated bridge on application rollback.

## 1. Freeze and identify the two source commits

```sh
cd /var/www/dokterdibya
git status --porcelain=v1
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git remote -v
```

Record the full current commit and verify that the current Staff HTML and worker advertise `v413`. A dirty checkout requires an explicit preserved-file inventory; stop if a tracked change is unexplained. Set `CURRENT_SHA` to the observed full 40-character commit and `TARGET_SHA` to the full reviewed v414 commit. Verify both with `git cat-file -t` after fetching. Never infer the v413 source SHA from the target checkout.

```sh
CURRENT_SHA='<observed-40-character-current-commit>'
TARGET_SHA='<reviewed-40-character-target-commit>'
git fetch origin main codex/system-hardening-seamless
test "$(git rev-parse HEAD)" = "$CURRENT_SHA"
test "$(git rev-parse refs/remotes/origin/codex/system-hardening-seamless)" = "$TARGET_SHA"
test "$(git cat-file -t "$TARGET_SHA")" = commit
SHORT_SHA="$(git rev-parse --short=12 "$TARGET_SHA")"
WORKTREE="/var/tmp/dokterdibya-wave3-assets-$SHORT_SHA"
test ! -e "$WORKTREE"
git worktree add --detach "$WORKTREE" "$TARGET_SHA"
test "$(git -C "$WORKTREE" rev-parse HEAD)" = "$TARGET_SHA"
```

This creates the target tree without changing the active checkout. Push the reviewed feature branch before this fetch; do not push `main` until the pre-cutover asset and Nginx gates pass. Stop if the current commit or target differs from the approved release. Confirm whether any main-branch push webhook can move the production checkout before performing the later `main` push; coordinate that trigger with the cutover rather than allowing an uncontrolled reload.

## 2. Stage and verify both immutable snapshots

```sh
RELEASE_BASE=/var/www/dokterdibya-staff-releases
test ! -e "$RELEASE_BASE/.invalid" && test ! -L "$RELEASE_BASE/.invalid"
node "$WORKTREE/staff/backend/scripts/stage-staff-assets.js" \
  --repository-root /var/www/dokterdibya --release-base "$RELEASE_BASE" \
  --version v413 --source-commit "$CURRENT_SHA"
node "$WORKTREE/staff/backend/scripts/stage-staff-assets.js" \
  --repository-root "$WORKTREE" --release-base "$RELEASE_BASE" \
  --version v414 --source-commit "$TARGET_SHA"
```

For each release, compare `release-manifest.json` `sourceCommit` to the expected commit, and verify every listed file's byte count and SHA-256 against its release tree. Use the repository's `buildStaffReleaseManifest` function and compare the full structured result to each stored manifest; do not print its file list:

```sh
RELEASE_BASE="$RELEASE_BASE" WORKTREE="$WORKTREE" CURRENT_SHA="$CURRENT_SHA" TARGET_SHA="$TARGET_SHA" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { buildStaffReleaseManifest } = require(`${process.env.WORKTREE}/staff/backend/services/staffAssetRelease`);
(async () => {
  for (const [version, commit] of [['v413', process.env.CURRENT_SHA], ['v414', process.env.TARGET_SHA]]) {
    const root = path.join(process.env.RELEASE_BASE, version);
    const stored = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
    const actual = await buildStaffReleaseManifest({ publicRoot: path.join(root, 'staff/public'), version, sourceCommit: commit });
    if (JSON.stringify(stored) !== JSON.stringify(actual)) throw new Error('Release manifest mismatch');
    process.stdout.write(`${version}: ${actual.fileCount} files verified\n`);
  }
})().catch(() => { process.stderr.write('Release manifest verification failed\n'); process.exitCode = 1; });
NODE
```

Stop if `.invalid` exists (including a symlink), either manifest is invalid, or an already published release conflicts. Never rewrite an existing release.

## 3. Prepare a disposable Nginx candidate and backup

The two Staff compatibility redirects depend on both v413 and v414. The machine-readable `PROTECTED_STAFF_ASSET_RELEASES` contract in `staffAssetNginxConfig.js` protects them during rollback and cleanup. Confirm the active site file is a regular file; the preparation tool refuses symlinks. Confirm the snippet destinations are absent before installation, so rollback can remove exactly the newly installed snippets.

```sh
SITE=/etc/nginx/sites-enabled/dokterdibya.com
MAP_DEST=/etc/nginx/snippets/dokterdibya-staff-assets-map.conf
LOCATION_DEST=/etc/nginx/snippets/dokterdibya-staff-assets-location.conf
test -f "$SITE" && test ! -L "$SITE"
test ! -e "$MAP_DEST" && test ! -L "$MAP_DEST"
test ! -e "$LOCATION_DEST" && test ! -L "$LOCATION_DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PREP="/var/tmp/dokterdibya-wave3-assets-$SHORT_SHA-nginx-$STAMP"
BACKUP="/var/backups/dokterdibya/staff-assets-$STAMP"
install -d -m 0700 "$PREP" "$BACKUP"
node "$WORKTREE/staff/backend/scripts/render-staff-asset-nginx.js" \
  --release-base "$RELEASE_BASE" --current-root /var/www/dokterdibya \
  --map-output "$PREP/rendered-map.conf" --location-output "$PREP/rendered-location.conf"
node "$WORKTREE/staff/backend/scripts/prepare-staff-asset-nginx.js" \
  --site-config "$SITE" --map-config "$PREP/rendered-map.conf" \
  --location-config "$PREP/rendered-location.conf" \
  --map-include-path "$MAP_DEST" --location-include-path "$LOCATION_DEST" \
  --output-directory "$PREP" --backup-directory "$BACKUP" --check-only
node "$WORKTREE/staff/backend/scripts/prepare-staff-asset-nginx.js" \
  --site-config "$SITE" --map-config "$PREP/rendered-map.conf" \
  --location-config "$PREP/rendered-location.conf" \
  --map-include-path "$MAP_DEST" --location-include-path "$LOCATION_DEST" \
  --output-directory "$PREP" --backup-directory "$BACKUP"
```

Inspect `staff-asset-install.json` in `$PREP`: it records source/candidate/include SHA-256, exact install pairs, exact site restore pair, and snippet paths to remove during restore. Require the legacy map at the start of the source and one Staff location range bounded by the named production comments. Any mismatch stops before installation. The source file is not edited by preparation.

## 4. Install, validate and restore on failure

The candidate file names are deterministic. Use one operator shell for this section so the validated paths and rollback function remain available. The backup from section 3 must exist before the first install. Stage every candidate as a sibling of its destination and publish each complete file with a same-directory rename. Check syntax before reload or any Git/PM2 change:

```sh
set -e
test "$(sha256sum "$SITE" | awk '{print $1}')" = "$(node -p 'require(process.argv[1]).sha256.source' "$PREP/staff-asset-install.json")"
test -f "$BACKUP/dokterdibya.com.staff-assets.backup"
test ! -e "$MAP_DEST" && test ! -L "$MAP_DEST"
test ! -e "$LOCATION_DEST" && test ! -L "$LOCATION_DEST"
MAP_TEMP="$MAP_DEST.stage-$STAMP"
LOCATION_TEMP="$LOCATION_DEST.stage-$STAMP"
SITE_TEMP="$SITE.stage-$STAMP"
RESTORE_TEMP="$SITE.restore-$STAMP"
for candidate in "$MAP_TEMP" "$LOCATION_TEMP" "$SITE_TEMP" "$RESTORE_TEMP"; do
  test ! -e "$candidate" && test ! -L "$candidate" || exit 1
done
restore_staff_nginx() {
  install -m 0644 "$BACKUP/dokterdibya.com.staff-assets.backup" "$RESTORE_TEMP" || return 1
  mv -Tf -- "$RESTORE_TEMP" "$SITE" || return 1
  rm -f -- "$MAP_TEMP" "$LOCATION_TEMP" "$SITE_TEMP" "$MAP_DEST" "$LOCATION_DEST" || return 1
  nginx -t
}
if install -m 0644 "$PREP/dokterdibya-staff-assets-map.conf" "$MAP_TEMP" &&
   install -m 0644 "$PREP/dokterdibya-staff-assets-location.conf" "$LOCATION_TEMP" &&
   install -m 0644 "$PREP/dokterdibya.com.candidate" "$SITE_TEMP" &&
   mv -Tf -- "$MAP_TEMP" "$MAP_DEST" &&
   mv -Tf -- "$LOCATION_TEMP" "$LOCATION_DEST" &&
   mv -Tf -- "$SITE_TEMP" "$SITE" &&
   nginx -t; then
  :
else
  restore_staff_nginx || { echo 'Nginx restore validation failed' >&2; exit 1; }
  echo 'Nginx candidate rejected; checkout and PM2 unchanged' >&2
  exit 1
fi
```

The failure branch handles a partial install: it atomically restores the exact site backup, removes only the two destinations confirmed absent before installation plus their exact staging siblings, reruns `nginx -t`, and exits before checkout/PM2. `rm -f` tolerates snippets not yet installed. If restore validation fails, keep the application checkout unchanged and escalate the Nginx outage. Do not delete `$BACKUP` or any release snapshot. This syntax gate runs against the actual candidate before Nginx reload; the Task 2 disposable Nginx fixture/Chromium probe remains a separate pre-release CI gate.

## 5. Activate routing before application cutover

```sh
verify_pre_cutover() {
  for ORIGIN in https://dokterdibya.com https://www.dokterdibya.com; do
    node "$WORKTREE/staff/backend/scripts/verify-staff-asset-release.js" \
      --base-url "$ORIGIN" --release-base "$RELEASE_BASE" \
      --expected-current-version v413 \
      --version v413 --version v414 \
      --path scripts/realtime-sync.js --path scripts/patient-list-pages.js || return 1
  done
}
if systemctl reload nginx && verify_pre_cutover; then
  :
else
  restore_staff_nginx || { echo 'Nginx restore validation failed' >&2; exit 1; }
  systemctl reload nginx
  echo 'Pre-cutover release gate failed; checkout and PM2 unchanged' >&2
  exit 1
fi
```

The verifier checks **both existing production origins**; `www` serves the Staff shell directly and must not be treated as a redirect. It compares served v413/v414 bytes and immutable headers with validated local manifests, requires unversioned bytes to match declared current **v413** before checkout cutover, requires invalid `v0` to fail, and checks current HTML and API routing. It outputs only release version, relative path, status, byte count, and SHA-256. The failure branch restores Nginx and exits before Git/PM2 changes. On **each origin**, inspect real-browser v413 and v414 module traces plus v413 legacy imports with old and disabled workers. Both exact `/scripts/` bridge paths must resolve to the documented immutable Staff targets on that origin, while patient requests retain the patient route and cache policy. Reject cross-origin redirects, mixed release bytes, or a failed browser gate: call `restore_staff_nginx`, reload Nginx only after its syntax check passes, and stop before Git/PM2 changes.

After the routing gate passes, fast-forward the active checkout using the established non-destructive production procedure and reload PM2 exactly once. Reload from the ecosystem file, not only the process name: the active PM2 daemon otherwise retains its old 5-second `kill_timeout` even when the checked-out file says 330 seconds.

Before that cutover, install a dedicated status-only Nginx log for the HTTPS site. It records only epoch time and status code, including proxy-generated 502/504 and locations previously configured with `access_log off`; it does **not** record URLs or patient identifiers. Run the preparation script from the reviewed target worktree against the observed regular site file. Use a new, empty 0700 preparation directory and a separate exact backup; inspect the candidate diff and stop on any unexpected site change. Install the format snippet and candidate site via same-directory staging names, require `nginx -t`, reload Nginx, and repeat the two-origin pre-cutover verifier. On a syntax, reload, or routing failure, atomically restore this exact site backup and remove only the newly installed status-format snippet; keep the pre-existing immutable bridge. Do not cut over the application until this status log is verified to receive a status-only line from a read-only health request.

```sh
STATUS_FORMAT=/etc/nginx/snippets/dokterdibya-status-log-format.conf
SITE=/etc/nginx/sites-enabled/dokterdibya.com
test -f "$SITE" && test ! -L "$SITE"
test ! -e "$STATUS_FORMAT" && test ! -L "$STATUS_FORMAT"
STATUS_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STATUS_PREP="/var/tmp/dokterdibya-status-$STATUS_STAMP"
STATUS_BACKUP="/var/backups/dokterdibya/status-site-$STATUS_STAMP.conf"
test ! -e "$STATUS_PREP" && test ! -e "$STATUS_BACKUP"
install -d -m 0700 "$STATUS_PREP"
install -m 0600 "$SITE" "$STATUS_BACKUP"
node "$WORKTREE/staff/backend/scripts/prepare-nginx-release-status.js" \
  --site "$SITE" --candidate "$STATUS_PREP/site.candidate" \
  --format "$STATUS_PREP/format.candidate"
diff -u "$STATUS_BACKUP" "$STATUS_PREP/site.candidate" || test "$?" -eq 1
```

After reviewing that diff, publish only the exact staged paths, then verify before proceeding. The rollback below restores the site while retaining the already validated immutable-asset snippets.

```sh
STATUS_STAGE="$STATUS_FORMAT.stage-$STATUS_STAMP"
SITE_STAGE="$SITE.stage-status-$STATUS_STAMP"
SITE_RESTORE="$SITE.restore-status-$STATUS_STAMP"
for target in "$STATUS_STAGE" "$SITE_STAGE" "$SITE_RESTORE"; do
  test ! -e "$target" && test ! -L "$target" || exit 1
done
restore_status_nginx() {
  install -m 0644 "$STATUS_BACKUP" "$SITE_RESTORE" || return 1
  mv -Tf -- "$SITE_RESTORE" "$SITE" || return 1
  rm -f -- "$STATUS_STAGE" "$SITE_STAGE" "$STATUS_FORMAT" || return 1
  nginx -t && systemctl reload nginx
}
if install -m 0644 "$STATUS_PREP/format.candidate" "$STATUS_STAGE" &&
   install -m 0644 "$STATUS_PREP/site.candidate" "$SITE_STAGE" &&
   mv -Tf -- "$STATUS_STAGE" "$STATUS_FORMAT" &&
   mv -Tf -- "$SITE_STAGE" "$SITE" &&
   nginx -t && systemctl reload nginx; then
  :
else
  restore_status_nginx || { echo 'Nginx status-log restore failed' >&2; exit 1; }
  exit 1
fi
for ORIGIN in https://dokterdibya.com https://www.dokterdibya.com; do
  node "$WORKTREE/staff/backend/scripts/verify-staff-asset-release.js" \
    --base-url "$ORIGIN" --release-base "$RELEASE_BASE" \
    --expected-current-version v413 --version v413 --version v414 \
    --path scripts/realtime-sync.js --path scripts/patient-list-pages.js || {
      restore_status_nginx || echo 'Nginx status-log restore failed' >&2
      exit 1
    }
done
curl -fsS -o /dev/null https://dokterdibya.com/api/health
test -f /var/log/nginx/dokterdibya-status.log
tail -n 1 /var/log/nginx/dokterdibya-status.log | grep -Eq '^[0-9]{10}\.[0-9]{3} [1-5][0-9]{2}$'
```

The status logger is a separate Nginx precondition, not a substitute for the immutable-route test. Its live five-minute rate must be checked after cutover with the reviewed `check-nginx-release-status.js` script; the Express aggregate alone cannot detect proxy-generated 502/504.

```sh
cd /var/www/dokterdibya
git merge --ff-only "$TARGET_SHA"
test "$(git rev-parse HEAD)" = "$TARGET_SHA"
cd /var/www/dokterdibya/staff/backend
pm2 reload ecosystem.config.js --only dibyaklinik-backend --update-env
pm2 jlist | jq -e '[.[] | select(.name == "dibyaklinik-backend" and .pm2_env.status == "online" and .pm2_env.wait_ready == true and .pm2_env.kill_timeout >= 330000)] | length == 1'
CUTOVER_MS="$(date +%s%3N)"
```

If the runtime drain check fails, the cutover has failed; do not accept the release or retry with a process-name-only reload. Inspect PM2 and the rollback gate. If the established PM2 process name or checkout procedure differs, stop and reconcile the observed production configuration before issuing the cutover commands. Do not use `git reset --hard`.

## 6. Acceptance and rollback gates

Record exact deployed SHA, PM2 online status and pre/post restart and unstable counts. Run two spaced health and database connectivity checks using the existing local MySQL operator configuration; the public `/api/health` check alone is insufficient for DB evidence:

```sh
git -C /var/www/dokterdibya rev-parse HEAD
pm2 jlist
curl -fsS -o /dev/null https://dokterdibya.com/api/health
mysql -N -D dibyaklinik -e 'SELECT 1'
sleep 30
curl -fsS -o /dev/null https://dokterdibya.com/api/health
mysql -N -D dibyaklinik -e 'SELECT 1'
```

Repeat the release verifier on both origins after cutover with current **v414**. It must reject any remaining unversioned v413 bytes:

```sh
for ORIGIN in https://dokterdibya.com https://www.dokterdibya.com; do
  node "$WORKTREE/staff/backend/scripts/verify-staff-asset-release.js" \
    --base-url "$ORIGIN" --release-base "$RELEASE_BASE" \
    --expected-current-version v414 \
    --version v413 --version v414 \
    --path scripts/realtime-sync.js --path scripts/patient-list-pages.js || exit 1
done
```

Confirm on both origins that current HTML and service worker advertise v414 with no-store headers, an authenticated Staff browser has one-version module traffic and no unexpected host redirect, polling realtime is connected, browser console is clean, and the visible layout is unchanged. After the main-branch cutover, dispatch **Staff Performance Budget** in GitHub Actions and wait for its result before accepting the release. The workflow requests a short-lived GitHub OIDC identity scoped to this repository, branch and workflow; it sends that identity only to `/api/ci/performance-summary`, which returns allowlisted aggregate numbers. It measures the real Staff shell/assets in an isolated IPv6-loopback browser fixture with synthetic empty API responses. The fixture credential never reaches production. Do not create `STAFF_PERF_TOKEN` or run the CI command directly on the VPS: outside the approved GitHub-hosted job it fails closed.

If the workflow cannot obtain OIDC, cannot verify the aggregate response, detects unexpected fixture API calls, or fails any budget, treat it as a failed release gate and follow the rollback paragraph below. The browser fixture does not replace a legitimate authenticated Staff session on the live origins; both checks are required.

Compare equal-size, post-stabilization samples: warm fixture network requests ≤40, genuine failures 0, cached Dashboard↔Pasien activation p95 ≤1000 ms, and live Staff production p75 at least 25% better than baseline with p95 no more than 5% worse. The in-memory aggregate counter resets on PM2 reload and may need legitimate Staff traffic before its sample-count gate is meaningful; never generate synthetic patient calls to fill it. Over five minutes, require Nginx 5xx ≤1%, Socket.IO auth rejection ≤2% of handshake attempts, and no unplanned PM2 restart. Read the Socket.IO ratio as rejected / attempts from the numeric-only CI OIDC aggregate; expiry after an accepted connection is reported separately, not in this handshake numerator. Do not copy raw request URLs, tokens, or patient fields into release evidence.

After at least 300 seconds of post-cutover traffic, check the dedicated Nginx log on the VPS. This fails closed if the five-minute window has no observations at its beginning/end, the log contains anything besides timestamp and status, or the 5xx rate exceeds 1%:

```sh
node "$WORKTREE/staff/backend/scripts/check-nginx-release-status.js" --cutover-ms "$CUTOVER_MS"
```

Roll back on two failed health/DB checks, a release-related restart, excessive 5xx, failed performance gate, mixed asset hashes, or any cross-user/unauthorized clinical event. For an **application or performance rollback after the v414 cutover**, restore the previous application commit through the established safe rollback process and reload PM2 if needed, but **keep the validated immutable Nginx site, map, and location installed**. Restoring the old Nginx site at this point would make still-open v413/v414 Staff documents fetch mutable or missing module bytes. Confirm `nginx -t`, then verify the previous v413 HTML, both immutable releases, unversioned v413 bytes, the two legacy-import bridges, health/DB, and PM2 on both origins. Rerun the section 5 verifier with `--expected-current-version v413`; do not use the section 4 `restore_staff_nginx` function for this application-only rollback. **Retain both v413 and v414**: the v413 legacy credential bridge targets v414 even after application rollback. Do not perform synthetic clinical writes. The first legitimate clinical operation remains the before/after integrity verification point.

Use `restore_staff_nginx` only when the Nginx candidate itself fails syntax or routing verification **before application cutover**, as in sections 4–5, or as an emergency recovery from a demonstrated Nginx-specific outage. After v414 has been served, restoring the old Nginx site is an availability fallback, **not** an asset-coherent rollback: the old site cannot satisfy the two-version verifier or protect already-open v414 tabs. If that emergency fallback is necessary, record the failed asset-coherence gate, keep both release snapshots and the exact backup, and do not accept or resume the rollout until a validated versioned route is restored and verified on both origins. Never report the old-site fallback as passing the immutable-asset gate.

## 7. Retention and cleanup after acceptance

Retain at least five most recent verified releases, current and previous releases, and every version in `PROTECTED_STAFF_ASSET_RELEASES`. The repository's `selectStaffReleaseCleanup` reads and validates all candidate manifests, protects these versions, and only returns exact cleanup candidates; it never deletes a release. Review its output against the release inventory before a separately approved cleanup operation. A missing/invalid manifest or `.invalid` path blocks cleanup. Remove the temporary worktree and redundant staging database/user only after the full production gate passes. Preserve the timestamped production rollback backup.
