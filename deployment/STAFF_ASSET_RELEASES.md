# Staff asset releases: staged cutover and rollback

This runbook is for the reviewed v413 → v414 production change. Run commands on the VPS as an operator with the existing deployment access. Stop on any nonzero exit, unexpected path, hash mismatch, or failed browser/health gate. The preparation command writes candidate files only; the operator installs them after inspection. Do not record credentials, tokens, patient identifiers, query values, or manifest file lists in evidence.

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
git fetch origin main
test "$(git rev-parse HEAD)" = "$CURRENT_SHA"
test "$(git cat-file -t "$TARGET_SHA")" = commit
SHORT_SHA="$(git rev-parse --short=12 "$TARGET_SHA")"
WORKTREE="/var/tmp/dokterdibya-wave3-assets-$SHORT_SHA"
test ! -e "$WORKTREE"
git worktree add --detach "$WORKTREE" "$TARGET_SHA"
test "$(git -C "$WORKTREE" rev-parse HEAD)" = "$TARGET_SHA"
```

This creates the target tree without changing the active checkout. Stop if the current commit or target differs from the approved release.

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
if systemctl reload nginx &&
   node "$WORKTREE/staff/backend/scripts/verify-staff-asset-release.js" \
     --base-url https://dokterdibya.com --release-base "$RELEASE_BASE" \
     --expected-current-version v413 \
     --version v413 --version v414 \
     --path scripts/realtime-sync.js --path scripts/patient-list-pages.js; then
  :
else
  restore_staff_nginx || { echo 'Nginx restore validation failed' >&2; exit 1; }
  systemctl reload nginx
  echo 'Pre-cutover release gate failed; checkout and PM2 unchanged' >&2
  exit 1
fi
```

The verifier compares served v413/v414 bytes and immutable headers with validated local manifests, requires unversioned bytes to match declared current **v413** before checkout cutover, requires invalid `v0` to fail, and checks current HTML and API routing. It outputs only release version, relative path, status, byte count, and SHA-256. The failure branch restores Nginx and exits before Git/PM2 changes. Also inspect a real browser's v413 and v414 module traces, including old/disabled worker legacy imports; both exact `/scripts/` bridge paths must resolve to the documented immutable Staff targets while patient requests retain the patient route and cache policy. If this browser gate fails, call `restore_staff_nginx`, reload Nginx only after its syntax check passes, and stop before Git/PM2 changes.

After the routing gate passes, fast-forward the active checkout using the established non-destructive production procedure and reload PM2 exactly once:

```sh
cd /var/www/dokterdibya
git merge --ff-only "$TARGET_SHA"
test "$(git rev-parse HEAD)" = "$TARGET_SHA"
pm2 reload dokterdibya_codex
```

If the established PM2 process name or checkout procedure differs, stop and reconcile the observed production configuration before issuing the cutover commands. Do not use `git reset --hard`.

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

Repeat the release verifier after cutover with current **v414**. It must reject any remaining unversioned v413 bytes:

```sh
node "$WORKTREE/staff/backend/scripts/verify-staff-asset-release.js" \
  --base-url https://dokterdibya.com --release-base "$RELEASE_BASE" \
  --expected-current-version v414 \
  --version v413 --version v414 \
  --path scripts/realtime-sync.js --path scripts/patient-list-pages.js
```

Confirm current HTML and service worker advertise v414 with no-store headers, an authenticated Staff browser has one-version module traffic, polling realtime is connected, browser console is clean, and the visible layout is unchanged. Run the configured authenticated performance command from the backend directory; the Staff token must already be supplied by the protected operator/CI environment and must never be written into the command or evidence:

```sh
cd /var/www/dokterdibya/staff/backend
test -n "$STAFF_PERF_TOKEN"
node scripts/perf-budget-check.js --base-url https://dokterdibya.com --page-url https://dokterdibya.com/staff/public/index-adminlte.html
```

Compare equal-size, post-stabilization samples: warm network requests ≤40, genuine failures 0, cached activation p95 ≤1000 ms, production p75 at least 25% better than baseline, and p95 no more than 5% worse. Over five minutes, require Nginx 5xx ≤1%, Socket.IO auth errors ≤2% of sessions, and no unplanned PM2 restart. Obtain the five-minute rates from existing aggregated operational metrics without copying raw request URLs, tokens, or patient fields into release evidence.

Roll back on two failed health/DB checks, a release-related restart, excessive 5xx, failed performance gate, mixed asset hashes, or any cross-user/unauthorized clinical event. Restore the previous application commit through the established safe rollback process, reload PM2 if needed, call the exact `restore_staff_nginx` function from section 4, and reload Nginx only if its `nginx -t` succeeds. Then verify the previous HTML and rerun the release verifier with `--expected-current-version v413`. **Retain both v413 and v414**: the v413 legacy credential bridge targets v414 even after application rollback. Do not perform synthetic clinical writes. The first legitimate clinical operation remains the before/after integrity verification point.

## 7. Retention and cleanup after acceptance

Retain at least five most recent verified releases, current and previous releases, and every version in `PROTECTED_STAFF_ASSET_RELEASES`. The repository's `selectStaffReleaseCleanup` reads and validates all candidate manifests, protects these versions, and only returns exact cleanup candidates; it never deletes a release. Review its output against the release inventory before a separately approved cleanup operation. A missing/invalid manifest or `.invalid` path blocks cleanup. Remove the temporary worktree and redundant staging database/user only after the full production gate passes. Preserve the timestamped production rollback backup.
