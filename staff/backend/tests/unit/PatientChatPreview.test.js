const fs = require('fs');
const path = require('path');
const vm = require('vm');
const file = path.resolve(__dirname, '../../../../public/scripts/patient-chat-preview.js');

function setup() {
    const values = new Map();
    const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
    let token = 'session-a', now = 1000;
    const context = { console, Date, JSON };
    vm.createContext(context);
    vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/export /g, '') : '', context);
    expect(typeof context.createPatientChatPreview).toBe('function');
    return { values, storage, changeToken: value => { token = value; }, advance: ms => { now += ms; },
        create: (owner = 'patient-a') => context.createPatientChatPreview({ owner, getToken: () => token, storage, now: () => now }) };
}
const snapshot = { room: { id: 1, slug: 'lobby', name: 'Lobby' }, messages: [{ id: 1, message: 'Halo' }] };

test('shows the last lobby snapshot synchronously across page reloads', () => {
    const s = setup(); s.create().save(snapshot);
    expect(s.create().read()).toEqual(snapshot);
});
test('does not share a snapshot with a different patient or changed credentials', () => {
    const s = setup(), cache = s.create(); cache.save(snapshot);
    expect(s.create('patient-b').read()).toBeNull();
    s.changeToken('session-b');
    expect(cache.read()).toBeNull();
    cache.save(snapshot);
    expect(s.values.size).toBe(0);
});
test('expires snapshots and only keeps the latest 80 public lobby messages', () => {
    const s = setup(), cache = s.create();
    cache.save({ ...snapshot, messages: Array.from({ length: 120 }, (_, id) => ({ id })) });
    expect(cache.read().messages).toHaveLength(80);
    expect(cache.read().messages[0].id).toBe(40);
    s.advance(15 * 60 * 1000 + 1);
    expect(cache.read()).toBeNull();
    cache.save({ ...snapshot, room: { slug: 'private', is_direct: 1 } });
    expect(cache.read()).toBeNull();
});
test('blocked storage and corrupt snapshots do not prevent opening chat', () => {
    const s = setup(), cache = s.create();
    s.storage.getItem = () => { throw new Error('blocked'); };
    s.storage.setItem = () => { throw new Error('quota'); };
    s.storage.removeItem = () => { throw new Error('blocked'); };
    expect(cache.read()).toBeNull();
    expect(() => cache.save(snapshot)).not.toThrow();
    expect(() => cache.clear()).not.toThrow();
});
