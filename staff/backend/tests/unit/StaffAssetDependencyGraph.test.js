const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const staffPublic = path.join(repositoryRoot, 'staff/public');
const shell = fs.readFileSync(path.join(staffPublic, 'index-adminlte.html'), 'utf8');

function scriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const name = path.join(directory, entry.name);
        return entry.isDirectory() ? scriptFiles(name) : entry.isFile() && name.endsWith('.js') ? [name] : [];
    });
}

function executableSpecifiers(source) {
    const values = [];
    for (const match of source.matchAll(/\bimport\s*(?:\(\s*|(?:[^;\n]*?\bfrom\s*)?)["']([^"']+)["']|(?:\.src|\bsrc)\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["']|\bloadScript\s*\(\s*["']([^"']+)["']|\bsetAttribute\s*\(\s*["']src["']\s*,\s*["']([^"']+\.js(?:\?[^"']*)?)["']/g)) {
        values.push(match[1] || match[2] || match[3] || match[4]);
    }
    for (const match of source.matchAll(/\bimport\s*\(\s*`([^`$]+)`\s*\)/g)) values.push(match[1]);
    return values;
}

test('graph scanner recognizes quoted and backtick literal imports that escape Staff assets', () => {
    const fixture = [
        "import '/scripts/single.js';",
        'import "/scripts/double.js";',
        'await import(`/scripts/backtick.js`);'
    ].join('\n');
    expect(executableSpecifiers(fixture)).toEqual([
        '/scripts/single.js', '/scripts/double.js', '/scripts/backtick.js'
    ]);
});

test('authenticated Staff executable graph stays below its versioned public root', () => {
    const escaped = [];
    const floatingCdn = [];
    for (const file of scriptFiles(path.join(staffPublic, 'scripts'))) {
        const source = fs.readFileSync(file, 'utf8');
        for (const specifier of executableSpecifiers(source)) {
            const scriptPath = path.relative(staffPublic, file).replaceAll('\\', '/');
            const resolved = new URL(specifier, `https://dokterdibya.com/staff/public/${scriptPath}`);
            if (resolved.origin === 'https://dokterdibya.com' && !resolved.pathname.startsWith('/staff/public/')) {
                escaped.push(`${scriptPath}: ${specifier}`);
            }
            if (resolved.protocol === 'http:') floatingCdn.push(`${scriptPath}: ${specifier}`);
            if (specifier.startsWith('https://') && resolved.hostname.endsWith('.xendit.co')
                && specifier !== 'https://js.xendit.co/v1/xendit.min.js') floatingCdn.push(`${scriptPath}: ${specifier}`);
            else if (specifier.startsWith('https://') && !(/@[0-9]+\.[0-9]+\.[0-9]+(?:\/|$)/.test(new URL(specifier).pathname)
                || /\/[0-9]+\.[0-9]+\.[0-9]+\/(?:js\/)?[^/]+\.js$/.test(new URL(specifier).pathname)
                || specifier === 'https://js.xendit.co/v1/xendit.min.js')) {
                floatingCdn.push(`${scriptPath}: ${specifier}`);
            }
        }
    }
    expect(escaped).toEqual([]);
    expect(floatingCdn).toEqual([]);
});

test('authenticated shell local script entries use one exact current release', () => {
    const entries = [...shell.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
    const version = shell.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
    expect(version).toMatch(/^v\d+$/);
    expect(entries.length).toBeGreaterThan(8);
    const invalid = entries.filter(src => {
        const url = new URL(src, 'https://dokterdibya.com/staff/public/index-adminlte.html');
        if (url.origin !== 'https://dokterdibya.com') return false;
        return url.search !== `?v=${version}` || !url.pathname.startsWith('/staff/public/');
    });
    expect(invalid).toEqual([]);
});

test('authenticated shell executable CDN URLs are fixed releases', () => {
    const entries = [...shell.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https:\/\/[^"']+)["'][^>]*>/gi)].map(match => match[1]);
    expect(entries.length).toBeGreaterThan(3);
    const floating = entries.filter(url => {
        const parsed = new URL(url);
        return !(/@[0-9]+\.[0-9]+\.[0-9]+(?:\/|$)/.test(parsed.pathname)
            || /\/4\.5\.4\/socket\.io\.min\.js$/.test(parsed.pathname));
    });
    expect(floating).toEqual([]);
});

test('authenticated shell keeps AdminLTE stylesheet on the exact JavaScript release', () => {
    const js = shell.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/admin-lte@([^/]+)\/dist\/js\/adminlte\.min\.js/)?.[1];
    const css = shell.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/admin-lte@([^/]+)\/dist\/css\/adminlte\.min\.css/)?.[1];
    expect(js).toBe('3.2.0');
    expect(css).toBe(js);
});
