#!/usr/bin/env bash
set -euo pipefail
ARCHIVE=${1:?absolute release tarball required}
COMMIT=${2:?full commit required}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$ARCHIVE" == /var/tmp/staff-preview-*.tar.gz ]] || exit 2
BASE=/var/www/dokterdibya-staff-preview
REPO=/var/www/dokterdibya
CONFIG=/etc/nginx/sites-enabled/dokterdibya.com
SNIPPET=/etc/nginx/snippets/dokterdibya-staff-preview.conf
[ ! -L "$BASE" ] || { echo 'Unexpected preview root symlink'; exit 2; }
mkdir -p "$BASE/releases" "$BASE/assets"
cd "$REPO"
git diff --quiet
git diff --cached --quiet
git fetch origin main
while IFS= read -r path; do
  case "$path" in staff-preview/*|docs/superpowers/plans/2026-10-18-staff-preview.md) ;; *) echo "Unexpected deployment diff: $path"; exit 2;; esac
done < <(git diff --name-only HEAD "$COMMIT")
STAFF_BEFORE=$(curl --max-time 20 -fsS https://dokterdibya.com/staff/public/index-adminlte.html | sha256sum | cut -d' ' -f1)
DOCBOARD_BEFORE=$(curl --max-time 20 -fsS https://dokterdibya.com/docboard/ | sha256sum | cut -d' ' -f1)
git merge --ff-only "$COMMIT"
RELEASE="$BASE/releases/$COMMIT"
if [ ! -d "$RELEASE" ]; then
  STAGE=$(mktemp -d "$BASE/releases/.staging-${COMMIT:0:8}-XXXX")
  tar -tzf "$ARCHIVE" | python3 -c 'import sys,posixpath; paths=sys.stdin.read().splitlines(); assert all(not p.startswith("/") and ".." not in p.split("/") for p in paths)'
  tar -xzf "$ARCHIVE" -C "$STAGE" --no-same-owner
  node staff-preview/scripts/verify-release.mjs "$STAGE" "$COMMIT"
  mv "$STAGE" "$RELEASE"
fi
node staff-preview/scripts/verify-release.mjs "$RELEASE" "$COMMIT"
for file in "$RELEASE"/assets/*; do
  dest="$BASE/assets/$(basename "$file")"
  if [ -f "$dest" ]; then cmp -s "$file" "$dest"; else cp "$file" "$dest"; fi
done
find "$RELEASE" "$BASE/assets" -type d -exec chmod 755 {} +
find "$RELEASE" "$BASE/assets" -type f -exec chmod 644 {} +
chown -R www-data:www-data "$RELEASE" "$BASE/assets"
BACKUP="$BASE/nginx-backup-$(date +%Y%m%d%H%M%S)"
cp "$CONFIG" "$BACKUP.conf"
if [ -f "$SNIPPET" ]; then cp "$SNIPPET" "$BACKUP.snippet"; fi
cat > "$SNIPPET" <<'NGINX'
location = /staff-preview { return 301 /staff-preview/; }
location = /staff-preview/ {
    alias /var/www/dokterdibya-staff-preview/current/index.html;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; frame-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'" always;
}
location = /staff-preview/index.html {
    alias /var/www/dokterdibya-staff-preview/current/index.html;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; frame-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'" always;
}
location ^~ /staff-preview/assets/ {
    alias /var/www/dokterdibya-staff-preview/assets/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options "nosniff" always;
}
location ^~ /staff-preview/ {
    alias /var/www/dokterdibya-staff-preview/current/;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
}
NGINX
python3 - "$CONFIG" <<'PY'
import sys
path=sys.argv[1]
source=open(path).read()
include='    include /etc/nginx/snippets/dokterdibya-staff-preview.conf;'
if include not in source:
    anchor='    root /var/www/dokterdibya/public;'
    assert source.count(anchor)==1
    source=source.replace(anchor,anchor+'\n'+include)
    open(path,'w').write(source)
PY
OLD=$(readlink "$BASE/current" || true)
if [ -n "$OLD" ]; then
  [[ "$(realpath "$OLD")" == "$BASE/releases/"* ]] || { echo 'Unexpected old release path'; exit 2; }
  printf '%s\n' "$OLD" > "$BASE/previous-release"
fi
ln -sfn "$RELEASE" "$BASE/current-next"
mv -Tf "$BASE/current-next" "$BASE/current"
if ! nginx -t; then
  cp "$BACKUP.conf" "$CONFIG"
  if [ -f "$BACKUP.snippet" ]; then cp "$BACKUP.snippet" "$SNIPPET"; fi
  if [ -n "$OLD" ]; then ln -sfn "$OLD" "$BASE/current-next"; mv -Tf "$BASE/current-next" "$BASE/current"; fi
  exit 1
fi
systemctl reload nginx
for origin in https://dokterdibya.com https://www.dokterdibya.com; do
  curl --max-time 20 -fsS "$origin/staff-preview/release.json" | node -e 'let t="";process.stdin.on("data",x=>t+=x).on("end",()=>{const r=JSON.parse(t);if(r.commit!==process.argv[1])process.exit(1);console.log("Live preview",r.version,r.commit)})' "$COMMIT"
done
STAFF_AFTER=$(curl --max-time 20 -fsS https://dokterdibya.com/staff/public/index-adminlte.html | sha256sum | cut -d' ' -f1)
DOCBOARD_AFTER=$(curl --max-time 20 -fsS https://dokterdibya.com/docboard/ | sha256sum | cut -d' ' -f1)
test "$STAFF_BEFORE" = "$STAFF_AFTER"
test "$DOCBOARD_BEFORE" = "$DOCBOARD_AFTER"
echo "Operational Staff/DocBoard served HTML unchanged: $STAFF_AFTER / $DOCBOARD_AFTER"
curl --max-time 20 -fsS https://dokterdibya.com/api/health
echo
echo "Preview published at $RELEASE; previous release retained."
