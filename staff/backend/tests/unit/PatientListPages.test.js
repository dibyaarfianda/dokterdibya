const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicRoot = path.resolve(__dirname, '../../../public/scripts');

function loadHelper() {
    const source = fs.readFileSync(path.join(publicRoot, 'patient-list-pages.js'), 'utf8')
        .replace('export async function loadAllPatientPages', 'async function loadAllPatientPages');
    const context = { URL, module: { exports: {} }, window: { location: { origin: 'https://example.test' } } };
    vm.runInNewContext(`${source}\nmodule.exports = loadAllPatientPages;`, context);
    return context.module.exports;
}

test('all-record loader follows every bounded cursor and never publishes a partial page', async () => {
    const load = loadHelper();
    const requested = [];
    const result = await load('/api/patients?view=basic&fresh=1', async url => {
        requested.push(url);
        const cursor = new URL(url, 'https://example.test').searchParams.get('cursor');
        return { success: true,
            data: cursor ? [{ id: 'P101' }] : Array.from({ length: 100 }, (_, index) => ({ id: `P${index + 1}` })),
            pagination: { nextCursor: cursor ? null : 'next' } };
    });
    expect(result.data).toHaveLength(101);
    expect(result.data[0].id).toBe('P1');
    expect(result.data[100].id).toBe('P101');
    expect(requested).toHaveLength(2);
    expect(requested.every(url => new URL(url, 'https://example.test').searchParams.get('limit') === '100')).toBe(true);
    expect(new URL(requested[1], 'https://example.test').searchParams.get('cursor')).toBe('next');
    await expect(load('/api/patients', async () => ({ success: false, data: [], pagination: {} }))).rejects.toThrow();
});

test('all-record loader rejects failed later pages and repeated cursors', async () => {
    const load = loadHelper();
    let calls = 0;
    await expect(load('/api/patients', async () => {
        calls++;
        return calls === 1
            ? { success: true, data: [{ id: 'P1' }], pagination: { nextCursor: 'next' } }
            : { success: false, data: [], pagination: { nextCursor: null } };
    })).rejects.toThrow();
    await expect(load('/api/patients', async () => ({
        success: true, data: [], pagination: { nextCursor: 'repeat' }
    }))).rejects.toThrow('Invalid patient page cursor');
});

test('every enumerated all-record patient caller uses the shared cursor loader', () => {
    const files = [
        'patients.js', 'appointments.js', 'billing.js', 'main.js',
        'legacy/patient-tools.js', 'sunday-clinic/utils/medical-import.js',
        'pages/birth-content-page.js'
    ];
    for (const file of files) {
        const source = fs.readFileSync(path.join(publicRoot, file), 'utf8');
        expect(source).toContain('loadAllPatientPages');
        expect(source).not.toMatch(/\/api\/patients\?[^`'"\n]*limit=(?:500|1000)/);
    }
});
