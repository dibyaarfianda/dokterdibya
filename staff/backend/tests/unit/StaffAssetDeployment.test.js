const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { buildStaffReleaseManifest } = require('../../services/staffAssetRelease');
const { PROTECTED_STAFF_ASSET_RELEASES } = require('../../services/staffAssetNginxConfig');
const { prepareStaffNginxInstallation, verifyPublishedStaffRelease, selectStaffReleaseCleanup } = require('../../services/staffAssetDeployment');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const mapPath = '/etc/nginx/snippets/dokterdibya-staff-assets-map.conf';
const locationPath = '/etc/nginx/snippets/dokterdibya-staff-assets-location.conf';
const legacyMap = 'map $arg_v $staff_asset_cache_control {\n    default "public, max-age=31536000, immutable";\n    ""      "no-cache, must-revalidate";\n}\n';
const marker = '# IMPORTANT: Staff static files - must come BEFORE /staff/ proxy';
const patientMarker = '# Patient portal static assets (fonts/images 30 days)';
// Exact Staff range read from the production site config on 2026-09-25 (read-only).
const legacyStaff = `${marker}\n    # Using ^~ to ensure it takes priority over other prefix matches\n    location ^~ /staff/public/ {\n        alias /var/www/dokterdibya/staff/public/;\n\n        # No cache for Sunday Clinic HTML (path relative to parent location)\n        location = /staff/public/sunday-clinic.html {\n            proxy_pass http://127.0.0.1:3000;\n            proxy_http_version 1.1;\n            proxy_set_header Host $host;\n            proxy_set_header X-Real-IP $remote_addr;\n            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n            proxy_set_header X-Forwarded-Proto $scheme;\n            add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;\n            add_header Pragma "no-cache" always;\n            add_header Expires "0" always;\n        }\n\n        # No cache for service worker\n        location = /staff/public/sw.js {\n            alias /var/www/dokterdibya/staff/public/sw.js;\n            add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;\n            add_header Pragma "no-cache" always;\n            add_header Expires "0" always;\n            add_header Service-Worker-Allowed "/" always;\n        }\n\n        # Canonical modules revalidate; explicitly versioned modules are immutable\n        location ~ ^/staff/public/scripts/sunday-clinic/.+\\.js$ {\n            add_header Cache-Control $staff_asset_cache_control always;\n        }\n\n        # Long cache for fonts/images (30 days)\n        location ~* ^/staff/public/.+\\.(woff|woff2|ttf|eot|svg|ico|png|jpg|jpeg|gif|webp)$ {\n            expires 30d;\n            add_header Cache-Control "public, max-age=2592000, immutable";\n            access_log off;\n        }\n\n        # Canonical modules revalidate; explicitly versioned assets are immutable\n        location ~* ^/staff/public/.+\\.(js|css)$ {\n            add_header Cache-Control $staff_asset_cache_control always;\n        }\n\n        try_files $uri $uri/ =404;\n    }\n\n    `;
const legacySite = `${legacyMap}\nserver {\n    listen 443 ssl http2;\n    location ^~ /api/ { proxy_pass http://localhost:3000; }\n    ${legacyStaff}${patientMarker}\n    location ~* ^/.+\\.(woff|woff2|ttf|eot|ico|png|jpg|jpeg|gif|webp)$ {\n        expires 30d;\n        add_header Cache-Control "public, max-age=2592000, immutable";\n        try_files $uri =404;\n    }\n}\n`;
let temp;
beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-deploy-')); });
afterEach(() => { fs.rmSync(temp, { recursive: true, force: true }); });

function prepInput(siteText = legacySite) {
    const siteConfig = path.join(temp, 'dokterdibya.com');
    const outputDirectory = path.join(temp, 'candidate');
    const backupDirectory = path.join(temp, 'backup');
    fs.writeFileSync(siteConfig, siteText);
    fs.mkdirSync(outputDirectory);
    fs.mkdirSync(backupDirectory);
    return { siteConfig, mapConfig: 'map $arg_v $staff_asset_cache_control { default "no-store"; }\n',
        locationConfig: 'location ^~ /staff/public/ { try_files $uri =404; }\n',
        mapIncludePath: mapPath, locationIncludePath: locationPath, outputDirectory, backupDirectory };
}

test('prepares exact single replacements with source-preserving backup and restore manifest', async () => {
    const input = prepInput();
    const result = await prepareStaffNginxInstallation(input);
    const expected = legacySite.replace(legacyMap, `include ${mapPath};\n`)
        .replace(legacyStaff, `${marker}\ninclude ${locationPath};\n\n    `);
    expect(fs.readFileSync(result.candidateSite, 'utf8')).toBe(expected);
    expect(fs.readFileSync(result.backupSite, 'utf8')).toBe(legacySite);
    expect(fs.readFileSync(input.siteConfig, 'utf8')).toBe(legacySite);
    expect(result.sha256.source).toBe(sha(legacySite));
    expect(result.sha256.candidate).toBe(sha(expected));
    expect(result.sha256.map).toBe(sha(input.mapConfig));
    expect(result.sha256.location).toBe(sha(input.locationConfig));
    expect(path.relative(input.outputDirectory, result.candidateSite)).not.toMatch(/^\.\./);
    const manifest = JSON.parse(fs.readFileSync(result.installManifest, 'utf8'));
    expect(manifest.install).toEqual(expect.arrayContaining([
        { source: result.candidateSite, destination: input.siteConfig },
        { source: result.mapCandidate, destination: mapPath },
        { source: result.locationCandidate, destination: locationPath }
    ]));
    expect(manifest.restore).toContainEqual({ source: result.backupSite, destination: input.siteConfig });
    expect(manifest.protectedReleases).toEqual(PROTECTED_STAFF_ASSET_RELEASES);
});

test.each([
    ['missing map', text => text.replace(legacyMap, '')],
    ['duplicate map', text => `${legacyMap}${text}`],
    ['missing Staff region', text => text.replace(legacyStaff, '')],
    ['duplicate Staff marker', text => text.replace(legacyStaff, `${legacyStaff}${legacyStaff}`)],
    ['missing patient boundary', text => text.replace(patientMarker, '')]
])('rejects %s without modifying source', async (_name, change) => {
    const value = change(legacySite);
    const input = prepInput(value);
    await expect(prepareStaffNginxInstallation(input)).rejects.toThrow();
    expect(fs.readFileSync(input.siteConfig, 'utf8')).toBe(value);
    expect(fs.readdirSync(input.outputDirectory)).toEqual([]);
});

test.each([
    ['a duplicate Staff public block', `location ^~ /staff/public/ { root /tmp/other; }\n    `],
    ['an unrelated API sibling', `location /api/clinical/ { proxy_pass http://127.0.0.1:3000; }\n    `],
    ['an unrelated patient sibling', `location = /scripts/patient.js { root /var/www/dokterdibya/public; }\n    `]
])('rejects %s between Staff and patient markers without deleting the route', async (_name, extra) => {
    const source = legacySite.replace(patientMarker, `${extra}${patientMarker}`);
    const input = prepInput(source);
    await expect(prepareStaffNginxInstallation(input)).rejects.toThrow(/Staff|location/i);
    expect(fs.readFileSync(input.siteConfig, 'utf8')).toBe(source);
    expect(fs.readdirSync(input.outputDirectory)).toEqual([]);
});

test('rejects path aliasing, relative paths, injection and symlinked inputs and directories', async () => {
    const input = prepInput();
    for (const unsafe of [
        { siteConfig: 'relative.conf' }, { outputDirectory: 'relative' }, { backupDirectory: 'relative' },
        { outputDirectory: input.siteConfig }, { mapIncludePath: '/tmp/map.conf' },
        { mapIncludePath: `${mapPath}\nreturn 200` }, { locationIncludePath: `${locationPath};return 200` }
    ]) await expect(prepareStaffNginxInstallation({ ...input, ...unsafe })).rejects.toThrow();
    const siteLink = path.join(temp, 'site-link');
    try {
        fs.symlinkSync(input.siteConfig, siteLink, 'file');
        await expect(prepareStaffNginxInstallation({ ...input, siteConfig: siteLink })).rejects.toThrow();
    } catch (error) { if (error.code !== 'EPERM' || process.platform !== 'win32') throw error; }
    const outputLink = path.join(temp, 'output-link');
    fs.symlinkSync(input.outputDirectory, outputLink, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(prepareStaffNginxInstallation({ ...input, outputDirectory: outputLink })).rejects.toThrow();
    const backupLink = path.join(temp, 'backup-link');
    fs.symlinkSync(input.backupDirectory, backupLink, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(prepareStaffNginxInstallation({ ...input, backupDirectory: backupLink })).rejects.toThrow();
});

test('check-only CLI validates without producing files and rejects omitted flags', () => {
    const input = prepInput();
    const script = path.resolve(__dirname, '../../scripts/prepare-staff-asset-nginx.js');
    const args = [script, '--site-config', input.siteConfig, '--map-config', path.join(temp, 'map.conf'),
        '--location-config', path.join(temp, 'location.conf'), '--map-include-path', mapPath,
        '--location-include-path', locationPath, '--output-directory', input.outputDirectory,
        '--backup-directory', input.backupDirectory];
    fs.writeFileSync(path.join(temp, 'map.conf'), input.mapConfig);
    fs.writeFileSync(path.join(temp, 'location.conf'), input.locationConfig);
    expect(spawnSync(process.execPath, args.slice(0, -2), { encoding: 'utf8' }).status).not.toBe(0);
    expect(spawnSync(process.execPath, [...args, '--check-only'], { encoding: 'utf8' }).status).toBe(0);
    expect(fs.readdirSync(input.outputDirectory)).toEqual([]);
    expect(fs.readdirSync(input.backupDirectory)).toEqual([]);
});

test('refuses an already occupied include destination before candidate creation', async () => {
    const input = prepInput();
    const lstat = fs.promises.lstat;
    const spy = jest.spyOn(fs.promises, 'lstat').mockImplementation(target => {
        if (target === mapPath) return Promise.resolve({ isFile: () => true, isSymbolicLink: () => false });
        return lstat(target);
    });
    try {
        await expect(prepareStaffNginxInstallation(input)).rejects.toThrow(/include/i);
        expect(fs.readdirSync(input.outputDirectory)).toEqual([]);
    } finally { spy.mockRestore(); }
});

async function releaseFixture() {
    const releaseBase = path.join(temp, 'releases');
    const paths = ['scripts/app.js', 'styles/app.css'];
    for (const version of ['v413', 'v414']) {
        const publicRoot = path.join(releaseBase, version, 'staff', 'public');
        fs.mkdirSync(path.join(publicRoot, 'scripts'), { recursive: true });
        fs.mkdirSync(path.join(publicRoot, 'styles'));
        fs.writeFileSync(path.join(publicRoot, paths[0]), `app-${version}`);
        fs.writeFileSync(path.join(publicRoot, paths[1]), `css-${version}`);
        const manifest = await buildStaffReleaseManifest({ publicRoot, version, sourceCommit: 'a'.repeat(40) });
        fs.writeFileSync(path.join(releaseBase, version, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    return { releaseBase, paths, versions: ['v413', 'v414'], expectedCurrentVersion: 'v414' };
}

async function serverFixture(releaseBase, override = () => null, currentVersion = 'v414') {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const alternative = override(url);
        if (alternative) {
            res.writeHead(alternative.status, alternative.headers || {});
            res.end(alternative.body || '');
            return;
        }
        if (url.pathname === '/staff/public/index-adminlte.html') {
            res.writeHead(200, { 'Cache-Control': 'no-store' }); res.end('<html>current</html>'); return;
        }
        if (url.pathname === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end('{"status":"ok"}'); return;
        }
        const version = url.searchParams.get('v');
        const selected = version || currentVersion;
        if (!/^v(?:413|414)$/.test(selected) || !url.pathname.startsWith('/staff/public/')) {
            res.writeHead(404); res.end(); return;
        }
        const file = path.join(releaseBase, selected, url.pathname);
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate' });
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('verifies both immutable releases, unversioned current, HTML and API boundaries', async () => {
    const input = await releaseFixture(); const server = await serverFixture(input.releaseBase);
    try {
        const result = await verifyPublishedStaffRelease({ ...input, baseUrl: server.baseUrl });
        expect(result.ok).toBe(true);
        expect(result.assets.filter(row => row.version !== 'current')).toHaveLength(4);
        expect(result.assets.find(row => row.version === 'v413' && row.path === 'scripts/app.js').sha256).toBe(sha('app-v413'));
        expect(JSON.stringify(result)).not.toContain('?v=');
    } finally { await server.close(); }
});

test('requires the declared pre-cutover current version instead of accepting another staged version', async () => {
    const input = await releaseFixture(); const server = await serverFixture(input.releaseBase);
    try {
        await expect(verifyPublishedStaffRelease({ ...input, expectedCurrentVersion: 'v413', baseUrl: server.baseUrl }))
            .rejects.toThrow(/current/i);
    } finally { await server.close(); }
});

test('accepts v413 before cutover and v414 after cutover only when declared explicitly', async () => {
    const input = await releaseFixture(); const before = await serverFixture(input.releaseBase, () => null, 'v413');
    try { await expect(verifyPublishedStaffRelease({ ...input, expectedCurrentVersion: 'v413', baseUrl: before.baseUrl })).resolves.toMatchObject({ ok: true }); }
    finally { await before.close(); }
    const after = await serverFixture(input.releaseBase);
    try { await expect(verifyPublishedStaffRelease({ ...input, expectedCurrentVersion: 'v414', baseUrl: after.baseUrl })).resolves.toMatchObject({ ok: true }); }
    finally { await after.close(); }
});

test('verifier CLI requires and enforces expected current version', async () => {
    const input = await releaseFixture(); const server = await serverFixture(input.releaseBase);
    const script = path.resolve(__dirname, '../../scripts/verify-staff-asset-release.js');
    const args = [script, '--base-url', server.baseUrl, '--release-base', input.releaseBase,
        '--version', 'v413', '--version', 'v414', '--path', 'scripts/app.js'];
    const run = values => new Promise(resolve => {
        const child = spawn(process.execPath, values, { stdio: 'ignore' });
        child.on('close', code => resolve(code));
    });
    try {
        expect(await run(args)).not.toBe(0);
        expect(await run([...args, '--expected-current-version', 'v413'])).not.toBe(0);
        expect(await run([...args, '--expected-current-version', 'v414'])).toBe(0);
    } finally { await server.close(); }
});

test.each(['staff', path.join('staff', 'public')])('rejects symlinked intermediate release root %s before HTTP', async segment => {
    const input = await releaseFixture();
    const link = path.join(input.releaseBase, 'v413', segment);
    const actual = `${link}-real`;
    fs.renameSync(link, actual);
    fs.symlinkSync(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(verifyPublishedStaffRelease({ ...input, baseUrl: 'http://127.0.0.1:9' })).rejects.toThrow(/symlink/i);
});

test.each([
    ['swapped bytes', url => url.searchParams.get('v') === 'v413' && url.pathname.endsWith('app.js') ? { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, body: 'app-v414' } : null],
    ['missing release', url => url.searchParams.get('v') === 'v413' ? { status: 404 } : null],
    ['invalid version succeeds', url => url.searchParams.get('v') === 'v0' ? { status: 200, body: 'wrong' } : null],
    ['HTML immutable cache', url => url.pathname.endsWith('index-adminlte.html') ? { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, body: '<html/>' } : null],
    ['API served as static', url => url.pathname === '/api/health' ? { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, body: 'app-v414' } : null],
    ['API cache regression', url => url.pathname === '/api/health' ? { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }, body: '{"status":"ok"}' } : null],
    ['HTTP 5xx', url => url.pathname.endsWith('app.js') ? { status: 503 } : null]
])('fails closed when %s', async (_name, override) => {
    const input = await releaseFixture(); const server = await serverFixture(input.releaseBase, override);
    try { await expect(verifyPublishedStaffRelease({ ...input, baseUrl: server.baseUrl })).rejects.toThrow(); }
    finally { await server.close(); }
});

test('rejects present or symlinked .invalid and unsafe selections before HTTP', async () => {
    const input = await releaseFixture(); const server = await serverFixture(input.releaseBase);
    try {
        for (const paths of [['../secret.js'], ['/scripts/app.js'], ['styles/app.css'], ['scripts/app.js?x=1']]) {
            await expect(verifyPublishedStaffRelease({ ...input, paths, baseUrl: server.baseUrl })).rejects.toThrow();
        }
        const invalid = path.join(input.releaseBase, '.invalid');
        fs.mkdirSync(invalid);
        await expect(verifyPublishedStaffRelease({ ...input, baseUrl: server.baseUrl })).rejects.toThrow();
        fs.rmdirSync(invalid);
        fs.symlinkSync(path.join(input.releaseBase, 'v413'), invalid, process.platform === 'win32' ? 'junction' : 'dir');
        await expect(verifyPublishedStaffRelease({ ...input, baseUrl: server.baseUrl })).rejects.toThrow();
    } finally { await server.close(); }
});

test('cleanup protects current, previous, and both bridge releases with valid manifests', async () => {
    const input = await releaseFixture();
    const candidates = await selectStaffReleaseCleanup({ releaseBase: input.releaseBase, currentVersion: 'v414', previousVersion: 'v413', retainCount: 1 });
    expect(candidates).toEqual([]);
    expect(PROTECTED_STAFF_ASSET_RELEASES).toEqual(expect.arrayContaining(['v413', 'v414']));
});

test('cleanup keeps the five newest plus bridge targets and refuses a corrupt old manifest', async () => {
    const input = await releaseFixture();
    for (const version of ['v410', 'v411', 'v412', 'v415', 'v416', 'v417', 'v418']) {
        const publicRoot = path.join(input.releaseBase, version, 'staff', 'public');
        fs.mkdirSync(path.join(publicRoot, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(publicRoot, 'scripts', 'app.js'), version);
        const manifest = await buildStaffReleaseManifest({ publicRoot, version, sourceCommit: 'b'.repeat(40) });
        fs.writeFileSync(path.join(input.releaseBase, version, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const candidates = await selectStaffReleaseCleanup({ releaseBase: input.releaseBase,
        currentVersion: 'v418', previousVersion: 'v417', retainCount: 1 });
    expect(candidates.map(candidate => path.basename(candidate))).toEqual(['v412', 'v411', 'v410']);
    fs.writeFileSync(path.join(input.releaseBase, 'v410', 'staff', 'public', 'scripts', 'app.js'), 'changed');
    await expect(selectStaffReleaseCleanup({ releaseBase: input.releaseBase,
        currentVersion: 'v418', previousVersion: 'v417' })).rejects.toThrow(/manifest/i);
});

test('production cutover runbook targets the observed DOKTERDIBYA PM2 process', () => {
    const runbook = fs.readFileSync(path.resolve(__dirname, '../../../../deployment/STAFF_ASSET_RELEASES.md'), 'utf8');
    expect(runbook).toContain('pm2 reload dibyaklinik-backend');
    expect(runbook).not.toContain('pm2 reload dokterdibya_codex');
});
