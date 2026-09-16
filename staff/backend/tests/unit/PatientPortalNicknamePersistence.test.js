const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../../../');
const shell = fs.readFileSync(path.join(root, 'public/scripts/patient-menu-shell.js'), 'utf8');
function extract(name, source = shell) {
    const match = new RegExp('(?:async )?function ' + name + '\\(').exec(source);
    if (!match) throw new Error('Missing function ' + name);
    const rest = source.slice(match.index);
    const next = /\n\s*(?:async )?function \w+\(/g;
    next.lastIndex = rest.indexOf('{') + 1;
    const end = next.exec(rest);
    return rest.slice(0, end ? end.index : rest.length);
}
function harness(values = {}, options = {}) {
    const storage = new Map(Object.entries(values));
    let patient = { id: 'P1' };
    const context = {
        portalSettings: { nickname: null, notification_sound: 'default' },
        currentProfile: null,
        getStoredProfile: () => ({}), getPatientUser: () => patient,
        getStoredPatient: () => patient, getToken: () => 'test-token',
        document: { getElementById: () => null },
        localStorage: {
            getItem: k => storage.get(k) || null,
            setItem: (k,v) => { if (options.storageBlocked) throw new Error('blocked'); storage.set(k,v); }
        },
        showToast: jest.fn(), logout: jest.fn(),
        window: { prompt: jest.fn(() => 'Bunda'), alert: jest.fn(), PatientSession: { isDemoMode: () => !!options.demo } },
        fetch: jest.fn(async () => ({ ok: true, json: async () => ({ success: true, settings: { nickname: null, notification_sound: 'soft' } }) }))
    };
    vm.createContext(context);
    const helper = path.join(root, 'public/scripts/patient-shell/portal-nickname.js');
    if (fs.existsSync(helper)) {
        vm.runInContext(fs.readFileSync(helper, 'utf8').replace(/export /g, ''), context);
        vm.runInContext('var portalNickname = createPortalNicknameStore({ getPatient: getPatientUser, storage: () => localStorage, warn: showToast });', context);
    }
    for (const name of ['getPortalDisplayName', 'applyPortalSettings', 'fetchPortalSettings', 'loadPortalSettings', 'savePortalNicknameOnly', 'ensurePortalNicknameOnLogin']) {
        vm.runInContext(extract(name), context);
    }
    return { c: context, storage, switchPatient: id => { patient = { id }; } };
}

describe('Home nickname persistence', () => {
    test('server null cannot erase nickname owned by the current patient', async () => {
        const { c } = harness({ 'patient_portal_nickname:P1': 'Bunda' });
        await c.loadPortalSettings();
        expect(c.portalSettings.nickname).toBe('Bunda');
        expect(c.portalSettings.notification_sound).toBe('soft');
        expect(await c.ensurePortalNicknameOnLogin()).toBe(true);
        expect(c.window.prompt).not.toHaveBeenCalled();
    });
    test('legacy cache without account identity cannot supply a nickname', async () => {
        const { c } = harness({ patient_portal_settings: JSON.stringify({ nickname: 'Other patient' }) });
        c.fetch.mockRejectedValue(new Error('offline'));
        await c.loadPortalSettings();
        expect(c.portalSettings.nickname).toBeFalsy();
    });
});

describe('Nickname save and navigation', () => {
    test('switching accounts cannot reuse previous nickname even offline', async () => {
        const { c, switchPatient } = harness({ 'patient_portal_nickname:P1': 'Bunda' });
        await c.loadPortalSettings();
        switchPatient('P2'); c.fetch.mockRejectedValue(new Error('offline'));
        await c.loadPortalSettings(); expect(c.portalSettings.nickname).toBeNull();
        switchPatient('P1'); await c.loadPortalSettings(); expect(c.portalSettings.nickname).toBe('Bunda');
    });
    test('real save trims nickname and preserves server sound contract', async () => {
        const { c, storage } = harness();
        c.fetch.mockImplementation(async (url, req) => ({ ok: true, json: async () => ({ success: true, settings: JSON.parse(req.body) }) }));
        const result = await c.savePortalNicknameOnly('  Bunda  ', 'bell');
        expect(result.persisted).toBe(true);
        expect(storage.get('patient_portal_nickname:P1')).toBe('Bunda');
        expect(JSON.parse(c.fetch.mock.calls[0][1].body)).toEqual({ nickname: 'Bunda', notification_sound: 'bell' });
    });
    test('server success without nickname is not treated as saved', async () => {
        const { c, storage } = harness();
        await expect(c.savePortalNicknameOnly('Bunda', 'default')).rejects.toThrow('belum tersimpan');
        expect(storage.has('patient_portal_nickname:P1')).toBe(false);
    });
    test('validation rejection and network failure preserve existing nickname', async () => {
        const { c, storage } = harness({ 'patient_portal_nickname:P1': 'Bunda' });
        c.fetch.mockResolvedValue({ ok: false, json: async () => ({ success: false, message: 'Nickname tidak diperbolehkan' }) });
        await expect(c.savePortalNicknameOnly('invalid', 'default')).rejects.toThrow('tidak diperbolehkan');
        c.fetch.mockRejectedValue(new Error('offline'));
        await expect(c.savePortalNicknameOnly('Other', 'default')).rejects.toThrow('offline');
        await c.loadPortalSettings();
        expect(c.portalSettings.nickname).toBe('Bunda');
        expect(storage.get('patient_portal_nickname:P1')).toBe('Bunda');
    });
    test('server nickname adopted once persists when server later returns null', async () => {
        const { c, storage } = harness();
        c.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, settings: { nickname: 'Bunda' } }) });
        await c.loadPortalSettings();
        expect(storage.get('patient_portal_nickname:P1')).toBe('Bunda');
        await c.loadPortalSettings(); expect(c.portalSettings.nickname).toBe('Bunda');
    });
    test('demo nickname survives reloading Home without settings API', async () => {
        const { c, storage } = harness({}, { demo: true });
        await c.loadPortalSettings(); await c.ensurePortalNicknameOnLogin();
        expect(storage.get('patient_portal_nickname:P1')).toBe('Bunda');
        const next = harness(Object.fromEntries(storage), { demo: true }).c;
        await next.loadPortalSettings(); await next.ensurePortalNicknameOnLogin();
        expect(next.window.prompt).not.toHaveBeenCalled(); expect(c.fetch).not.toHaveBeenCalled();
    });
    test.each(['', 'ab', 'x'.repeat(41)])('demo rejects invalid length %p', async value => {
        const { c, storage } = harness({}, { demo: true });
        await expect(c.savePortalNicknameOnly(value, 'default')).rejects.toThrow('3–40');
        expect(storage.has('patient_portal_nickname:P1')).toBe(false);
    });
    test('demo storage failure does not claim success', async () => {
        const { c } = harness({}, { demo: true, storageBlocked: true });
        await expect(c.savePortalNicknameOnly('Bunda', 'default')).rejects.toThrow('browser ini');
    });
    test('real server save warns if browser persistence fails', async () => {
        const { c } = harness({}, { storageBlocked: true });
        c.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, settings: { nickname: 'Bunda' } }) });
        const result = await c.savePortalNicknameOnly('Bunda', 'default'); c.applyPortalSettings(result.settings);
        expect(result.persisted).toBe(false); expect(c.portalSettings.nickname).toBe('Bunda');
        expect(c.showToast).toHaveBeenCalledWith(expect.stringContaining('browser ini'));
    });
    test('save response after account switch cannot contaminate another account', async () => {
        const { c, storage, switchPatient } = harness();
        c.fetch.mockImplementation(async () => { switchPatient('P2'); return { ok: true, json: async () => ({ success: true, settings: { nickname: 'Bunda' } }) }; });
        await expect(c.savePortalNicknameOnly('Bunda', 'default')).rejects.toThrow('Akun berubah'); expect(storage.size).toBe(0);
    });
});

describe('Tool page interoperability', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/patient-tool-shell.js'), 'utf8');
    function tool(values, options) {
        const h = harness(values, options), c = h.c;
        c.state = { portalSettings: { nickname: null, notification_sound: 'default' } };
        c.getPortalNicknameStore = async () => c.portalNickname; c.isMockToken = () => false;
        c.showShellToast = jest.fn(); c.openTopbarModal = jest.fn(); c.renderSettingsModal = () => '';
        vm.runInContext(extract('fetchPortalSettings', source), c);
        vm.runInContext(extract('savePortalSettings', source), c);
        return h;
    }
    test('tool settings preserve nickname against null server response', async () => {
        const { c } = tool({ 'patient_portal_nickname:P1': 'Bunda' });
        await c.fetchPortalSettings();
        expect(c.state.portalSettings).toEqual({ nickname: 'Bunda', notification_sound: 'soft' });
    });
    test.each([false, true])('tool save carries nickname and sound back Home, demo=%p', async demo => {
        const { c, storage } = tool({}, { demo });
        c.document.getElementById = id => ({ value: id === 'portal-nickname' ? 'Mama' : 'bell' });
        c.fetch.mockImplementation(async (url, req) => ({ ok: true, json: async () => ({ success: true, settings: JSON.parse(req.body) }) }));
        await c.savePortalSettings();
        if (demo) expect(c.fetch).not.toHaveBeenCalled();
        const home = harness(Object.fromEntries(storage), { demo }).c;
        await home.loadPortalSettings(); expect(home.portalSettings.nickname).toBe('Mama');
        expect(c.state.portalSettings.notification_sound).toBe('bell');
    });
});


describe('Intake helper remains available to Home profile loading', () => {
    test('uses the existing controller check for supported intake flags', () => {
        const c = vm.createContext({});
        vm.runInContext(fs.readFileSync(path.join(root, 'public/scripts/patient-shell/pwa-install-controller.js'), 'utf8').replace(/export /g, ''), c);
        const controller = c.createPatientPwaInstallController();
        for (const value of [true, 1, '1']) expect(controller.isIntakeCompleted({ intake_completed: value })).toBe(true);
        for (const value of [false, 0, null]) expect(controller.isIntakeCompleted({ intake_completed: value })).toBe(false);
        expect(shell).toContain('const isIntakeCompleted = patientPwaInstall.isIntakeCompleted;');
    });
});
