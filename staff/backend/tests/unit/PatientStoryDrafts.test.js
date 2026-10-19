const fs = require('fs');
const path = require('path');
const publicRoot = path.resolve(__dirname, '../../../../public');
const controllerPath = path.join(publicRoot, 'scripts/patient-story-drafts.js');
const Drafts = fs.existsSync(controllerPath) ? require(controllerPath) : {};
const content = (body = 'Tulisan sebelum telepon') => ({ title: 'Pengalaman saya', body, category: 'kehamilan', author_mode: 'anonim' });
function storage() {
    const map = new Map();
    return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
}
function fixture(options = {}) {
    let owner = 'PATIENT-A';
    let server = { version: 0, state: 'empty', draft_id: null, content: null };
    let offline = false;
    let deliveries = 0;
    let loseResponse = false;
    const api = async (method, body) => {
        if (offline) throw new Error('offline');
        if (method === 'GET') return { ...server };
        if (method === 'SUBMIT' && server.state === 'submitted' && server.draft_id === body.draft_id) return { ...server, story_id: 'receipt-1' };
        if (body.base_version !== server.version) { const e = new Error('conflict'); e.code = 'DRAFT_CONFLICT'; e.data = { ...server }; throw e; }
        if (method === 'SUBMIT') deliveries++;
        server = { version: server.version + 1, state: method === 'DELETE' ? 'deleted' : method === 'SUBMIT' ? 'submitted' : 'active', draft_id: body.draft_id, content: method === 'PUT' ? { ...body.content } : null, mutation_id: body.mutation_id, updated_at: new Date().toISOString(), ...(method === 'SUBMIT' ? { story_id: 'receipt-1' } : {}) };
        if (loseResponse && method === 'SUBMIT') { loseResponse = false; throw new Error('connection lost after commit'); }
        return { ...server };
    };
    const device = options.storage || storage();
    const states = [];
    function create(extra = {}) {
        expect(typeof Drafts.createController).toBe('function');
        return Drafts.createController({ owner: () => owner, storage: device, api, onChange: s => states.push(s), ...extra });
    }
    return { create, device, states, offline: value => offline = value, owner: value => owner = value, remote: value => server = value, server: () => server, deliveries: () => deliveries, loseResponse: () => loseResponse = true };
}
afterEach(() => jest.useRealTimers());
test('editor is wired to durable autosave instead of resetting every open', () => {
    const html = fs.readFileSync(path.join(publicRoot, 'ruang-cerita.html'), 'utf8');
    expect(html).toContain('/scripts/patient-story-drafts.js?v=');
    expect(html).toContain('draftStatus');
    expect(html).not.toContain("document.getElementById('storyForm').reset()");
});
test('patient route boundary permits only the intended draft methods', () => {
    const { isPatientAllowedRoute } = require('../../security/patientRouteAccess');
    expect(isPatientAllowedRoute('PUT', '/api/patient-stories/draft')).toBe(true);
    expect(isPatientAllowedRoute('DELETE', '/api/patient-stories/draft')).toBe(true);
    expect(isPatientAllowedRoute('POST', '/api/patient-stories/draft/submit')).toBe(true);
    expect(isPatientAllowedRoute('PUT', '/api/patient-stories/admin/1')).toBe(false);
});
test('each keystroke survives an immediate reload before a network request', async () => {
    const f = fixture(); const a = f.create(); await a.init();
    f.offline(true); a.edit(content());
    const b = f.create(); await b.init();
    expect(b.state().content).toEqual(content());
    expect(b.state().dirty).toBe(true);
    a.destroy(); b.destroy();
});
test('all four fields sync exactly, including blank and whitespace edits', async () => {
    const f = fixture(); const a = f.create(); await a.init();
    a.edit({ ...content('  \n'), title: '', category: 'kesuburan', author_mode: 'nickname' }); await a.sync();
    expect(f.server().content).toEqual({ title: '', body: '  \n', category: 'kesuburan', author_mode: 'nickname' });
    expect(a.state().status).toBe('synced'); a.destroy();
});
test('an offline local copy syncs on reconnect and restores on another device', async () => {
    const f = fixture(); const a = f.create(); await a.init(); f.offline(true); a.edit(content()); await a.sync();
    expect(a.state().status).toBe('local'); f.offline(false); await a.sync();
    const b = f.create(); await b.init(); expect(b.state().content).toEqual(content()); a.destroy(); b.destroy();
});
test('remote conflicts never replace local text and explicit resolution uses latest version', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content('Local'));
    f.remote({ version: 1, state: 'active', draft_id: 'remote-draft', content: content('Other device') }); await a.sync();
    expect(a.state().conflict.content.body).toBe('Other device'); expect(a.state().content.body).toBe('Local');
    await a.keepMine(); expect(f.server().content.body).toBe('Local'); a.destroy();
});
test('two offline editors retain both variants after both close', async () => {
    const f = fixture(); const a = f.create(); const b = f.create(); await a.init(); await b.init(); f.offline(true);
    a.edit(content('Tab A')); b.edit(content('Tab B')); a.destroy(); b.destroy();
    const c = f.create(); await c.init();
    const bodies = [c.state().content, ...c.state().alternatives.map(r => r.content)].filter(Boolean).map(r => r.body);
    expect(bodies).toEqual(expect.arrayContaining(['Tab A', 'Tab B'])); c.destroy();
});
test('storage failure cannot be described as safely saved locally', async () => {
    const f = fixture({ storage: { get length() { return 0; }, getItem: () => null, setItem: () => { throw new Error('quota'); }, key: () => null, removeItem: () => {} } });
    const a = f.create(); await a.init(); f.offline(true); a.edit(content()); await a.sync();
    expect(a.state().status).toBe('error'); expect(a.state().content).toEqual(content()); a.destroy();
});
test('account change clears the visible editor and never sends old text as the new patient', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content()); f.owner('PATIENT-B'); await a.sync();
    expect(a.state().locked).toBe(true); expect(a.state().content.body).toBe(''); expect(f.server().state).toBe('empty'); a.destroy();
});
test('late response after account change cannot repaint old text', async () => {
    const f = fixture(); let complete; const a = f.create({ api: () => new Promise(resolve => { complete = resolve; }) });
    const pending = a.init(); f.owner('PATIENT-B'); complete({ version: 1, state: 'active', draft_id: 'old', content: content() }); await pending;
    expect(a.state().locked).toBe(true); expect(a.state().content.body).toBe(''); a.destroy();
});
test('offline deletion stays pending across reload and deletes on reconnect', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content()); await a.sync(); f.offline(true); await a.remove();
    const b = f.create(); await b.init(); expect(b.state().content.body).toBe(''); f.offline(false); await b.sync(); expect(f.server().state).toBe('deleted'); a.destroy(); b.destroy();
});
test('lost submission response keeps the draft; retry produces one receipt only', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content()); await a.sync(); f.loseResponse();
    await expect(a.submit()).rejects.toThrow(); expect(a.state().content).toEqual(content());
    const b = f.create(); await b.init(); await b.submit(); expect(f.deliveries()).toBe(1); expect(b.state().content.body).toBe(''); a.destroy(); b.destroy();
});
test('choosing server preserves the displaced local variant for recovery', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content('My local copy'));
    f.remote({ version: 1, state: 'active', draft_id: 'remote-draft', content: content('Server copy') });
    await a.sync(); await a.useServer();
    expect(a.state().content.body).toBe('Server copy');
    const alternative = a.state().alternatives.find(r => r.content.body === 'My local copy');
    expect(alternative).toBeDefined(); a.useAlternative(alternative.local_id);
    expect(a.state().content.body).toBe('My local copy'); a.destroy();
});
test('continuous typing still backs up to the server within ten seconds', async () => {
    jest.useFakeTimers(); const f = fixture(); const a = f.create(); await a.init();
    for (let i = 0; i < 11; i++) { a.edit(content('character ' + i)); await jest.advanceTimersByTimeAsync(1000); }
    expect(f.server().state).toBe('active'); a.destroy();
});
test('deleting a restored draft cannot restore the same device copy again', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content()); await a.sync(); a.destroy();
    const b = f.create(); await b.init(); await b.remove(); b.destroy();
    const c = f.create(); await c.init(); expect(c.state().content.body).toBe(''); expect(c.state().alternatives).toHaveLength(0); expect(c.state().pendingDelete).toBe(false); c.destroy();
});
test('opening a second tab after an offline edit cannot consume the first tab recovery copy', async () => {
    const f = fixture(); const a = f.create(); await a.init(); f.offline(true); a.edit(content('Offline A'));
    const b = f.create(); await b.init(); b.edit(content('Offline B')); a.destroy(); b.destroy();
    const c = f.create(); await c.init();
    expect([c.state().content, ...c.state().alternatives.map(r => r.content)].map(c => c.body)).toEqual(expect.arrayContaining(['Offline A', 'Offline B'])); c.destroy();
});
test('a definitively rejected submission unlocks conflict resolution instead of trapping delivery forever', async () => {
    const f = fixture(); let rejectSubmit;
    const a = f.create({ api: async (method, body) => {
        if (method === 'GET') return { version: 0, state: 'empty', content: null };
        if (method === 'PUT') return { version: 1, state: 'active', content: body.content, draft_id: body.draft_id, mutation_id: body.mutation_id };
        return new Promise((_resolve, reject) => { rejectSubmit = reject; });
    } });
    await a.init(); a.edit(content()); await a.sync(); const pending = a.submit(); await Promise.resolve();
    rejectSubmit(Object.assign(new Error('conflict'), { code: 'DRAFT_CONFLICT', data: { version: 2, state: 'active', draft_id: 'remote', content: content('Other') } }));
    await expect(pending).rejects.toThrow('conflict');
    expect(a.state().pendingSubmit).toBe(false); expect(a.state().conflict.content.body).toBe('Other');
    a.edit(content('Still editable')); expect(a.state().content.body).toBe('Still editable'); a.destroy();
});
test('an acknowledged server deletion also removes clean device copies before offline reopen', async () => {
    const f = fixture(); const a = f.create(); await a.init(); a.edit(content('Deleted text')); await a.sync();
    f.remote({ version: 2, state: 'deleted', draft_id: f.server().draft_id, content: null }); await a.refresh(); a.destroy(); f.offline(true);
    const b = f.create(); await b.init(); expect(b.state().content.body).toBe(''); b.destroy();
});
