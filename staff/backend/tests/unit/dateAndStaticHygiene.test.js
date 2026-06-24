const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const { formatDateLocal, formatDateCompact } = require('../../utils/date');

function read(filePath) {
    return fs.readFileSync(path.join(repoRoot, filePath), 'utf8').replace(/\r\n/g, '\n');
}

function listFiles(dir, predicate) {
    const result = [];
    const root = path.join(repoRoot, dir);
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (predicate(fullPath)) {
                result.push(path.relative(repoRoot, fullPath).replace(/\\/g, '/'));
            }
        }
    };
    visit(root);
    return result;
}

describe('date and static asset hygiene', () => {
    test('backend date helper formats dates in WIB date-only contracts', () => {
        const utcEveningBeforeWibDate = new Date('2025-12-14T18:00:00.000Z');

        expect(formatDateLocal(utcEveningBeforeWibDate)).toBe('2025-12-15');
        expect(formatDateCompact(utcEveningBeforeWibDate)).toBe('20251215');
    });

    test('backend active routes and services use local date-only formatter', () => {
        const files = [
            ...listFiles('staff/backend/routes', file => file.endsWith('.js')),
            ...listFiles('staff/backend/services', file => file.endsWith('.js'))
        ];

        const offenders = files.filter(file => read(file).includes(".toISOString().split('T')[0]"));

        expect(offenders).toEqual([]);
    });

    test('web-facing active sources avoid UTC toISOString for date-only values', () => {
        const files = [
            ...listFiles('staff/public', file => file.endsWith('.js') || file.endsWith('.html')),
            ...listFiles('public', file => file.endsWith('.js') || file.endsWith('.html'))
        ].filter(file => !file.includes('/unused/'));

        const offenders = files.filter(file => read(file).includes(".toISOString().split('T')[0]"));

        expect(offenders).toEqual([]);
    });

    test('staff active scripts use centralized auth token helpers', () => {
        const files = listFiles('staff/public/scripts', file => {
            const normalized = file.replace(/\\/g, '/');
            return normalized.endsWith('.js')
                && !normalized.includes('/unused/')
                && !normalized.endsWith('/vps-auth-v2.js')
                && !normalized.endsWith('/shell/credentials.js');
        });

        const directTokenReads = files.filter(file => {
            const content = read(file);
            return /localStorage\.getItem\(['"][^'"]*(?:token|Token)[^'"]*['"]\)|sessionStorage\.getItem\(['"][^'"]*(?:token|Token)[^'"]*['"]\)/.test(content);
        });

        expect(directTokenReads).toEqual([]);
    });

    test('public web roots do not expose backup, broken, or unused diagnostic files', () => {
        const files = [
            ...listFiles('public', file => true),
            ...listFiles('staff/public', file => true)
        ];

        const exposed = files.filter(file => {
            const normalized = file.replace(/\\/g, '/');
            if (normalized.includes('/images/mata-backup.png')) return true;
            if (normalized.includes('/unused/')) return true;
            return /\.(bak|backup|broken|old)(?:$|[-.])/.test(normalized)
                || /(?:^|\/).* copy\./.test(normalized)
                || normalized.includes('old-monolithic');
        });

        expect(exposed).toEqual([]);
    });

    test('Android app sources do not hardcode the legacy VPS HTTP endpoint', () => {
        const roots = ['android-app', 'mobile-app', 'android-native', 'staff-mobile-app'];
        const files = roots
            .filter(root => fs.existsSync(path.join(repoRoot, root)))
            .flatMap(root => listFiles(root, file => !file.includes(`${path.sep}build${path.sep}`)));

        const offenders = files.filter(file => read(file).includes('http://72.60.78.188'));

        expect(offenders).toEqual([]);
    });
});
