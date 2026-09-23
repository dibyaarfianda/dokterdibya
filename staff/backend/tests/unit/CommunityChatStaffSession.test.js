const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../../..');
function runSession(files) {
    const local = new Map();
    const context = { localStorage: { getItem: key => local.get(key) || null, setItem: (key,value) => local.set(key,value), removeItem: key => local.delete(key) }, sessionStorage: { getItem: () => null }, window: {} };
    for (const file of files) {
        const source = fs.existsSync(path.join(root,file)) ? fs.readFileSync(path.join(root,file),'utf8') : '';
        vm.runInNewContext(source.replace(/export /g,''), context);
    }
    return context;
}
test('shared DocBoard session helper preserves staff token separately from patient session', () => {
    const context = runSession(['public/scripts/docboard-session.js']);
    vm.runInNewContext('globalThis.api = typeof docboardSession !== "undefined" ? docboardSession : { getToken: () => null, setToken: () => {}, clearToken: () => {} }', context);
    context.localStorage.setItem('vps_auth_token', 'patient-session');
    context.api.setToken('staff-session');
    expect(context.api.getToken()).toBe('staff-session');
    context.api.clearToken();
    expect(context.api.getToken()).toBe(null);
    expect(context.localStorage.getItem('vps_auth_token')).toBe('patient-session');
});
