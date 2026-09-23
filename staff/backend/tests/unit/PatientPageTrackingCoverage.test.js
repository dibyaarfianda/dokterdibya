const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

describe('patient page tracking coverage', () => {
    test('authenticated patient content pages automatically load the shared tracker', () => {
        const appendedScripts = [];
        const document = {
            readyState: 'complete',
            title: 'Estimasi Biaya - SISIwanita',
            head: {
                appendChild: element => appendedScripts.push(element)
            },
            createElement: tagName => ({ tagName }),
            getElementById: () => null
        };
        const window = {
            document,
            location: { pathname: '/estimasi-biaya-kehamilan.html' },
            localStorage: createStorage({ vps_auth_token: 'patient-token' }),
            sessionStorage: createStorage()
        };

        vm.runInNewContext(read('public', 'scripts', 'patient-session.js'), {
            window,
            console: { warn: jest.fn() }
        });

        expect(appendedScripts).toHaveLength(1);
        expect(appendedScripts[0]).toMatchObject({
            tagName: 'script',
            src: '/js/patient-tracker.js?v=20260923activity1',
            async: true
        });
    });

    test('loading the shared tracker more than once records only one page view', () => {
        const requests = [];
        const window = {
            PatientSession: { getToken: () => 'patient-token' },
            location: { pathname: '/estimasi-biaya-kehamilan.html' }
        };
        const context = {
            window,
            location: window.location,
            document: { title: 'Estimasi Biaya - SISIwanita' },
            fetch: (url, options) => {
                requests.push({ url, options });
                return Promise.resolve({ ok: true });
            }
        };
        const tracker = read('public', 'js', 'patient-tracker.js');

        vm.runInNewContext(tracker, context);
        vm.runInNewContext(tracker, context);

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe('/api/patients/track-page');
        expect(JSON.parse(requests[0].options.body)).toEqual({
            page_name: 'SISIwanita - Estimasi Biaya Kehamilan'
        });
    });
});
