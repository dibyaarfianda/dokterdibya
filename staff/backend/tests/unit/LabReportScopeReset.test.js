const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');

test('access reset cancels a pending confirmation and releases the action lock', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../public/scripts/pages/laboratorium.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '').replace(/import.meta.url/g, JSON.stringify('https://example.test/staff/public/scripts/pages/laboratorium.js?v=v447'));
    const button = { addEventListener() {} };
    const dialog = { querySelector: () => button, addEventListener() {}, showModal() {}, close() {}, remove() {} };
    const context = vm.createContext({ window: { addEventListener() {} }, document: { createElement: () => dialog },
        URL, esc: value => value, TOKEN_KEY: 'test-token-key' });
    vm.runInContext(source, context);
    const confirmation = vm.runInContext("host={appendChild(){},innerHTML:''};busy=true;confirmAction('Publish fixture?')", context);
    vm.runInContext('clearAccountState()', context);
    expect(vm.runInContext('busy', context)).toBe(false);
    await expect(confirmation).resolves.toBe(false);
});
