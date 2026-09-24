const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('browser RUM beacon contains fixed page and coarse error only', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/rum.js'), 'utf8');
    const listeners = {};
    let payload;
    const window = {
        location: { origin: 'https://example.test' }, __currentPage: 'Synthetic Patient Name',
        __userRole: 'Synthetic Patient Name', fetch: async (_url, options) => { payload = JSON.parse(options.body); return { status: 200 }; },
        addEventListener: (name, handler) => { listeners[name] = handler; }
    };
    const document = { visibilityState: 'hidden', addEventListener: (name, handler) => { listeners[name] = handler; } };
    vm.runInNewContext(source, { window, document, navigator: {}, fetch: window.fetch, performance: { now: () => 0 },
        setInterval() {}, setTimeout() {}, URL, Date, Math, console: { error() {} } });
    window.__rum.trackError({ message: 'Unable to save Synthetic Patient Name DRD778899 synthetic@example.test clinical prose',
        stack: 'at Synthetic Patient Name:778899' }, 'window_error');
    listeners.visibilitychange();
    await Promise.resolve();
    expect(payload.page).toBe('other');
    expect(payload.role).toBe('staff');
    expect(payload.errors).toHaveLength(1);
    expect(payload.errors[0]).toMatchObject({ type: 'window_error', message: 'Client error' });
    for (const privateText of ['Synthetic Patient Name', 'DRD778899', 'synthetic@example.test', 'clinical prose', '778899']) {
        expect(JSON.stringify(payload)).not.toContain(privateText);
    }
});
