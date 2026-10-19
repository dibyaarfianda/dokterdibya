const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fixture() {
    const badges = ['tanya', 'community', 'more'].map(key => ({
        dataset: { conversationBadge: key }, textContent: '', hidden: false,
        classList: { toggle: jest.fn() }, setAttribute: jest.fn()
    }));
    const jobs = new Map();
    const window = {
        currentStaffUser: { id: 'doctor', is_doctor_protected: true },
        staffPollingCoordinator: { register: (key, options) => jobs.set(key, options), trigger: jest.fn() },
        addEventListener() {}, dispatchEvent() {},
        staffMobileQuickMenu: { selected: () => ['tanya'] }
    };
    const context = vm.createContext({ window, document: { querySelectorAll: () => badges, addEventListener() {} },
        getIdToken: async () => 'token', fetch: jest.fn(), CustomEvent: function() {} });
    const file = path.resolve(__dirname, '../../../public/scripts/shell/conversation-badges.js');
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
    return { window, badges, jobs, context };
}

test('conversation counts start from shell startup, without waiting for the lazy question page', () => {
    const f = fixture();
    expect(f.window.staffConversationBadges).toBeDefined();
    f.window.staffConversationBadges.init();
    expect([...f.jobs.keys()]).toEqual(['staff-tanya-badge', 'staff-community-badge']);
});

test('positive, zero, invalid, and large counts update every navigation surface', () => {
    const f = fixture();
    expect(f.window.staffConversationBadges).toBeDefined();
    const api = f.window.staffConversationBadges;
    api.update('tanya', 3);
    api.update('community', 102);
    expect(f.badges.map(b => b.textContent)).toEqual(['3', '99+', '99+']);
    api.update('tanya', 0);
    api.update('community', -4);
    expect(f.badges.every(b => b.hidden)).toBe(true);
    api.update('tanya', 'invalid');
    expect(f.badges[0].hidden).toBe(true);
});

test('badge polling uses the existing authenticated counts and clears stale zeroes', async () => {
    const f = fixture();
    expect(f.window.staffConversationBadges).toBeDefined();
    f.window.staffConversationBadges.init();
    f.context.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, count: 2 }) });
    await f.jobs.get('staff-tanya-badge').run({});
    expect(f.context.fetch.mock.calls[0][0]).toMatch(/^\/api\/patient-questions\/staff\/count/);
    expect(f.badges[0].textContent).toBe('2');
    f.context.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, total: 7 }) });
    await f.jobs.get('staff-community-badge').run({});
    expect(f.context.fetch.mock.calls[1][0]).toMatch(/^\/api\/community-chat\/unread/);
    expect(f.badges[1].textContent).toBe('7');
});

test('revoked permissions discard an in-flight count response', async () => {
    const f = fixture();
    expect(f.window.staffConversationBadges).toBeDefined();
    f.window.staffConversationBadges.init();
    let resolve;
    f.context.fetch.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = f.jobs.get('staff-tanya-badge').run({});
    await Promise.resolve();
    f.window.currentStaffUser = { id: 'other', navigation: [] };
    resolve({ ok: true, json: async () => ({ success: true, count: 9 }) });
    await pending;
    expect(f.badges[0].textContent).toBe('');
});

test('unauthorized accounts do not fetch protected counts', async () => {
    const f = fixture();
    f.window.currentStaffUser = { id: 'staff', navigation: [] };
    f.window.staffConversationBadges.init();
    for (const job of f.jobs.values()) await job.run({});
    expect(f.context.fetch).not.toHaveBeenCalled();
    expect(f.badges.every(b => b.hidden)).toBe(true);
});

test('a failed refresh preserves the last confirmed count', async () => {
    const f = fixture();
    f.window.staffConversationBadges.init();
    f.window.staffConversationBadges.update('tanya', 4);
    f.context.fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(f.jobs.get('staff-tanya-badge').run({})).rejects.toThrow('503');
    expect(f.badges[0].textContent).toBe('4');
});
