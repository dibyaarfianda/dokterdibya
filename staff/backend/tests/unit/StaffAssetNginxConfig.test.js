const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { renderStaffAssetNginx } = require('../../services/staffAssetNginxConfig');

const roots = { releaseBase: '/var/www/dokterdibya-staff-releases', currentRoot: '/var/www/dokterdibya' };

// Interpret only the map grammar emitted by this renderer. Real Nginx is a separate CI gate.
function evaluateMaps(config, args, referer = '') {
    const arg = args.match(/(?:^|&)v=([^&]*)/i);
    const vars = { args, arg_v: arg ? arg[1] : '', http_referer: referer };
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
        ['foo=1', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413', ''],
        ['v=v414', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413', ''],
        ...['https://external.test/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com.evil.test/staff/public/scripts/root.js?v=v413', 'http://dokterdibya.com/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413&secret=x', 'https://dokterdibya.com/staff/public/scripts/root.js?v=', 'https://dokterdibya.com/staff/public/index.html?v=v413'].map(ref => ['', ref, ''])
    ])('validates module referrer %s %s', (query, referrer, version) => {
        expect(evaluateMaps(renderStaffAssetNginx(roots).mapConfig, query, referrer).staff_module_redirect_version).toBe(version);
    });

    test('keeps current HTML, service worker and production proxy ahead of release scripts', () => {
        const { locationConfig: config } = renderStaffAssetNginx(roots);
        const locations = [...config.matchAll(/location\s+([^\{]+)\{/g)].map(match => match[1].trim());
        expect(locations).toEqual(['^~ /staff/public/', '= /staff/public/sw.js', '= /staff/public/sunday-clinic.html', '~ [.]html$', '~ ^/staff/public/scripts/.+[.]js$']);
        expect(config).toContain('proxy_pass http://127.0.0.1:3000;');
        for (const directive of ['proxy_http_version 1.1;', 'proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;']) expect(config).toContain(directive);
        expect(config.match(/root \/var\/www\/dokterdibya;/g)).toHaveLength(2);
        expect(config.match(/no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0/g)).toHaveLength(3);
        expect(config.match(/try_files \$uri =404;/g)).toHaveLength(4);
        expect(config).toContain('return 307 $uri?v=$staff_module_redirect_version;');
        expect(config).not.toMatch(/location[^\n]*(?:api|socket|uploads|patient|docboard)/i);
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
