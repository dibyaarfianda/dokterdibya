const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const { renderStaffAssetNginx, PROTECTED_STAFF_ASSET_RELEASES } = require('../../services/staffAssetNginxConfig');

const roots = { releaseBase: '/var/www/dokterdibya-staff-releases', currentRoot: '/var/www/dokterdibya' };

// Interpret only the map grammar emitted by this renderer. Real Nginx is a separate CI gate.
function evaluateMaps(config, args, referer = '', requestUri = '') {
    const arg = args.match(/(?:^|&)v=([^&]*)/i);
    const vars = { args, arg_v: arg ? arg[1] : '', http_referer: referer, request_uri: requestUri };
    const expand = value => value.replace(/\$(\w+)/g, (_, name) => vars[name] || '');
    for (const block of config.matchAll(/map\s+("[^"]*"|\S+)\s+\$(\w+)\s*\{([^}]+)\}/g)) {
        const input = expand(block[1].replace(/^"|"$/g, ''));
        let result;
        let fallback;
        for (const row of block[3].matchAll(/^\s*("[^"]*"|\S+)\s+("[^"]*"|\S+);\s*$/gm)) {
            const key = row[1].replace(/^"|"$/g, '');
            const value = row[2].replace(/^"|"$/g, '');
            if (key === 'default') { fallback = value; continue; }
            const insensitive = key.startsWith('~*');
            const match = key.startsWith('~') ? input.match(new RegExp(key.slice(insensitive ? 2 : 1), insensitive ? 'i' : '')) : null;
            if (key === input || match) {
                if (match) match.slice(1).forEach((capture, index) => { vars[index + 1] = capture; });
                result = expand(value); break;
            }
        }
        vars[block[2]] = result === undefined ? expand(fallback) : result;
    }
    return vars;
}

describe('Staff Nginx release routing', () => {
    test('elevates browser OS dependency installation and returns the shared cache to the runner', () => {
        const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-panel-ci.yml'), 'utf8'));
        const steps = workflow.jobs['staff-asset-nginx'].steps;
        const installIndex = steps.findIndex(step => step.run?.includes('browsers install chrome --install-deps'));
        expect(installIndex).toBeGreaterThan(-1);
        const commands = steps[installIndex].run.trim().split('\n').map(line => line.trim());
        const browserIndex = commands.findIndex(line => line.includes('browsers install chrome --install-deps'));
        // --install-deps checks getuid() itself; a preceding sudo apt-get is insufficient.
        expect(commands[browserIndex]).toMatch(/^sudo env "PATH=\$PATH" "PUPPETEER_CACHE_DIR=\$PUPPETEER_CACHE_DIR" "\$\(command -v npx\)" puppeteer browsers install chrome --install-deps$/);
        const cacheIndex = commands.findIndex(line => /^PUPPETEER_CACHE_DIR="\$RUNNER_TEMP\/[A-Za-z0-9_-]+"$/.test(line));
        expect(cacheIndex).toBeGreaterThanOrEqual(0);
        expect(cacheIndex).toBeLessThan(browserIndex);
        const mkdirIndex = commands.indexOf('mkdir -p "$PUPPETEER_CACHE_DIR"');
        expect(mkdirIndex).toBeGreaterThan(cacheIndex);
        expect(mkdirIndex).toBeLessThan(browserIndex);
        expect(commands.slice(cacheIndex, browserIndex)).toContain('echo "PUPPETEER_CACHE_DIR=$PUPPETEER_CACHE_DIR" >> "$GITHUB_ENV"');
        expect(commands.slice(browserIndex + 1)).toContain('sudo chown -R "$(id -u):$(id -g)" "$PUPPETEER_CACHE_DIR"');
        expect(steps[installIndex].run).not.toMatch(/chmod/);
        const probeIndex = steps.findIndex(step => step.run?.includes('--probe-nginx'));
        expect(probeIndex).toBeGreaterThan(installIndex);
        expect(steps[probeIndex].run).toMatch(/^node /);
        expect(steps.find(step => step.run?.includes('nginx -s quit')).if).toBe('always()');
    });

    test.each([
        ['', '/var/www/dokterdibya', 'no-cache, must-revalidate'],
        ['foo=1', '/var/www/dokterdibya', 'no-cache, must-revalidate'],
        ['preview=x&vfoo=x', '/var/www/dokterdibya', 'no-cache, must-revalidate'],
        ['v=v413', '/var/www/dokterdibya-staff-releases/v413', 'public, max-age=31536000, immutable'],
        ['foo=1&v=v414&bar=2', '/var/www/dokterdibya-staff-releases/v414', 'public, max-age=31536000, immutable'],
        ...['v', 'V', 'V=', 'foo=1&v', 'v=&V', 'v=v413&v', 'V&v=v413', 'v=', 'V=v413', 'v=V413', 'v=v0', 'v=v0413', 'v=v413&v=v414', 'v=v413&V=v414', 'V=v413&v=v414', 'v=v413&x=1&v=v414', 'v=v413%2f..', 'v=v413%26v=v414'].map(query => [query, '/var/www/dokterdibya-staff-releases/.invalid', 'no-store'])
    ])('maps raw args %s without falling back to current', (query, root, cache) => {
        const state = evaluateMaps(renderStaffAssetNginx(roots).mapConfig, query);
        expect(state.staff_asset_root).toBe(root);
        expect(state.staff_asset_cache_control).toBe(cache);
    });

    test.each([
        ['', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413', 'v413'],
        ['', 'https://dokterdibya.com/staff/public/scripts/deep/mid.js?v=v414', 'v414'],
        ['', 'https://www.dokterdibya.com/staff/public/scripts/root.js?v=v413', 'v413'],
        ['', 'https://www.dokterdibya.com/staff/public/scripts/deep/mid.js?v=v414', 'v414'],
        ['foo=1', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413', ''],
        ['v=v414', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413', ''],
        ...['https://external.test/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com.evil.test/staff/public/scripts/root.js?v=v413', 'https://www.dokterdibya.com.evil.test/staff/public/scripts/root.js?v=v413', 'https://evilwww.dokterdibya.com/staff/public/scripts/root.js?v=v413', 'http://www.dokterdibya.com/staff/public/scripts/root.js?v=v413', 'http://dokterdibya.com/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413&secret=x', 'https://dokterdibya.com/staff/public/scripts/root.js?v=', 'https://dokterdibya.com/staff/public/index.html?v=v413'].map(ref => ['', ref, ''])
    ])('validates module referrer %s %s', (query, referrer, version) => {
        expect(evaluateMaps(renderStaffAssetNginx(roots).mapConfig, query, referrer).staff_module_redirect_version).toBe(version);
    });

    test.each([
        ['/scripts/socket-credentials.js', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', '/staff/public/scripts/socket-credentials.js?v=v414'],
        ['/scripts/patient-list-pages.js', 'https://dokterdibya.com/staff/public/scripts/legacy/patient-tools.js?v=v413', '/staff/public/scripts/patient-list-pages.js?v=v413'],
        ['/scripts/patient-list-pages.js', 'https://dokterdibya.com/staff/public/scripts/sunday-clinic/utils/medical-import.js?v=v413', '/staff/public/scripts/patient-list-pages.js?v=v413'],
        ['/scripts/socket-credentials.js', 'https://www.dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', '/staff/public/scripts/socket-credentials.js?v=v414'],
        ['/scripts/patient-list-pages.js', 'https://www.dokterdibya.com/staff/public/scripts/legacy/patient-tools.js?v=v413', '/staff/public/scripts/patient-list-pages.js?v=v413'],
        ['/scripts/other.js', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', ''],
        ['/scripts/socket-credentials.js?x=1', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', ''],
        ...['', 'https://external.test/staff/public/scripts/realtime-sync.js?v=v413', 'https://dokterdibya.com.evil.test/staff/public/scripts/realtime-sync.js?v=v413', 'https://www.dokterdibya.com.evil.test/staff/public/scripts/realtime-sync.js?v=v413', 'https://evilwww.dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', 'http://www.dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', 'http://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413', 'https://dokterdibya.com/public/scripts/patient-session.js?v=v413', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v414', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413&x=1', 'https://dokterdibya.com/staff/public/scripts/realtime-sync.js?v=v413#fragment', 'https://dokterdibya.com/staff/public/scripts/../other.js?v=v413'].map(ref => ['/scripts/socket-credentials.js', ref, ''])
    ])('bridges only exact legacy root request %s from %s', (uri, referrer, target) => {
        expect(evaluateMaps(renderStaffAssetNginx(roots).mapConfig, '', referrer, uri).staff_legacy_redirect || '').toBe(target);
    });

    test('preserves the live patient Cache-Control header for both nonmatching root requests', () => {
        const { locationConfig } = renderStaffAssetNginx(roots);
        for (const name of ['socket-credentials.js', 'patient-list-pages.js']) {
            const block = locationConfig.match(new RegExp(`location = /scripts/${name.replace('.', '[.]')} \\{([\\s\\S]*?)\\n\\}`));
            expect(block).not.toBeNull();
            expect(block[1]).toContain('root /var/www/dokterdibya/public;');
            expect(block[1]).toContain('add_header Cache-Control "no-store, no-cache, must-revalidate" always;');
            expect(block[1]).toContain('try_files $uri =404;');
        }
    });

    test('protects every immutable release referenced by a hardcoded legacy bridge target', () => {
        const rendered = renderStaffAssetNginx(roots);
        const targets = [...`${rendered.mapConfig}\n${rendered.locationConfig}`.matchAll(/\/staff\/public\/scripts\/[^"\s;?]+[?]v=(v[1-9][0-9]*)/g)];
        expect(targets.map(match => match[1]).sort()).toEqual(['v413', 'v414']);
        expect(Object.isFrozen(PROTECTED_STAFF_ASSET_RELEASES)).toBe(true);
        for (const target of targets) expect(PROTECTED_STAFF_ASSET_RELEASES).toContain(target[1]);
    });

    test('keeps current HTML, service worker and production proxy ahead of release scripts', () => {
        const { locationConfig: config } = renderStaffAssetNginx(roots);
        const locations = [...config.matchAll(/location\s+([^\{]+)\{/g)].map(match => match[1].trim());
        expect(locations).toEqual(['^~ /staff/public/', '= /staff/public/sw.js', '= /staff/public/sunday-clinic.html', '~ [.]html$', '~ ^/staff/public/scripts/.+[.]js$', '= /scripts/socket-credentials.js', '= /scripts/patient-list-pages.js']);
        expect(config).toContain('proxy_pass http://127.0.0.1:3000;');
        for (const directive of ['proxy_http_version 1.1;', 'proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;']) expect(config).toContain(directive);
        expect(config.match(/root \/var\/www\/dokterdibya;/g)).toHaveLength(2);
        expect(config.match(/root \/var\/www\/dokterdibya\/public;/g)).toHaveLength(2);
        expect(config.match(/no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0/g)).toHaveLength(3);
        expect(config.match(/try_files \$uri =404;/g)).toHaveLength(6);
        expect(config).toContain('return 307 $uri?v=$staff_module_redirect_version;');
        expect(config).not.toMatch(/location[^\n]*(?:api|uploads|docboard)/i);
        expect(config).not.toMatch(/(?:alias|rewrite)\s/);
    });

    test.each(['relative', '/var/../www', '/var/./www', '/tmp/a\nb', '/tmp/a\n', '/tmp/a\r', '/tmp/a;b', '/tmp/a b', '/tmp/$(id)', '/tmp/`id`', '/tmp/a\\b', '/tmp/a#b', '/', ''])('rejects unsafe Linux path %j', value => {
        expect(() => renderStaffAssetNginx({ ...roots, releaseBase: value })).toThrow();
        expect(() => renderStaffAssetNginx({ ...roots, currentRoot: value })).toThrow();
    });

    test('rejects equal roots including normalized aliases', () => {
        expect(() => renderStaffAssetNginx({ releaseBase: '/var/www/current/', currentRoot: '/var//www/current' })).toThrow();
    });

    test('is deterministic, substitutes only roots and emits final newlines', () => {
        const config = renderStaffAssetNginx(roots);
        expect(config).toEqual(renderStaffAssetNginx(roots));
        for (const value of Object.values(config)) { expect(value.endsWith('\n')).toBe(true); expect(value).not.toMatch(/__[A-Z_]+__/); }
    });

    test('refuses an unresolved template token', () => {
        const read = fs.readFileSync;
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
            const text = read(file, ...args);
            return String(file).endsWith('.conf.template') ? `${text}\n__UNKNOWN_TOKEN__\n` : text;
        });
        try { expect(() => renderStaffAssetNginx(roots)).toThrow('Unresolved'); }
        finally { spy.mockRestore(); }
    });

    test('CLI requires distinct outputs and replaces each via completed sibling file', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-nginx-cli-'));
        const map = path.join(directory, 'map.conf');
        const location = path.join(directory, 'location.conf');
        const script = path.resolve(__dirname, '../../scripts/render-staff-asset-nginx.js');
        const baseArgs = ['--release-base', roots.releaseBase, '--current-root', roots.currentRoot];
        try {
            expect(spawnSync(process.execPath, [script, ...baseArgs], { encoding: 'utf8' }).status).toBe(1);
            expect(spawnSync(process.execPath, [script, ...baseArgs, '--map-output', map, '--location-output', map], { encoding: 'utf8' }).status).toBe(1);
            const args = [script, ...baseArgs, '--map-output', map, '--location-output', location];
            expect(spawnSync(process.execPath, args, { encoding: 'utf8' }).status).toBe(0);
            expect(spawnSync(process.execPath, args, { encoding: 'utf8' }).status).toBe(0);
            const rendered = renderStaffAssetNginx(roots);
            expect(fs.readFileSync(map, 'utf8')).toBe(rendered.mapConfig);
            expect(fs.readFileSync(location, 'utf8')).toBe(rendered.locationConfig);
            expect(fs.readdirSync(directory).sort()).toEqual(['location.conf', 'map.conf']);
        } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
});
