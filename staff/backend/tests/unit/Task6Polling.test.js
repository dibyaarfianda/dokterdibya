const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('staff notification badges pause hidden, coalesce in flight, and refresh once on visible', async () => {
    const listeners = {};
    let finish;
    const staffApiRequest = jest.fn(() => new Promise(resolve => { finish = () => resolve({ success: true, counts: {} }); }));
    const document = { visibilityState: 'visible', getElementById: () => null,
        addEventListener: (name, fn) => { listeners[name] = fn; } };
    const intervals = [];
    const window = { setTimeout: fn => { fn(); return 1; }, setInterval: fn => { intervals.push(fn); return 1; } };
    const ctx = vm.createContext({ document, window, localStorage: { getItem: () => null }, staffApiRequest,
        console: { error() {} }, Date, JSON });
    vm.runInContext(read('staff/public/scripts/shell/notification-badges.js').replace(/^import .*;\r?\n/gm, ''), ctx);
    ctx.scheduleNotificationBadges();
    await Promise.resolve();
    expect(staffApiRequest).toHaveBeenCalledTimes(1);
    document.visibilityState = 'hidden';
    listeners.visibilitychange();
    intervals[0]();
    expect(staffApiRequest).toHaveBeenCalledTimes(1);
    document.visibilityState = 'visible';
    listeners.visibilitychange();
    expect(staffApiRequest).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    expect(staffApiRequest).toHaveBeenCalledTimes(2);
});

test('patient home queue never polls hidden and refreshes once when visible', async () => {
    const source = read('public/scripts/patient-menu-shell.js');
    const queueFns = source.match(/async function loadLiveQueueHome\(\) \{[\s\S]*?\n        function initializeLiveQueueHome\(\) \{[\s\S]*?\n        \}/)?.[0];
    expect(queueFns).toBeTruthy();
    const listeners = {};
    const intervals = [];
    const section = { classList: { remove() {}, add() {} } };
    const fetch = jest.fn(async () => ({ json: async () => ({ success: true, is_queue_visible: false }) }));
    const document = { visibilityState: 'visible', getElementById: id => id === 'live-queue-home-section' ? section : null,
        addEventListener: (name, fn) => { listeners[name] = fn; } };
    const window = { clearInterval() {}, setInterval: fn => { intervals.push(fn); return 1; } };
    const ctx = vm.createContext({ document, window, fetch, getToken: () => 'synthetic', requestAnimationFrame() {},
        updateHomeActionGap() {}, Date, liveQueueHomeTimer: null,
        queueBusy: false, queuePending: false,
        queueHidden: false, queueBound: false });
    vm.runInContext(`${queueFns}\ninitializeLiveQueueHome();`, ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    document.visibilityState = 'hidden';
    listeners.visibilitychange();
    await intervals[0]();
    expect(fetch).toHaveBeenCalledTimes(1);
    document.visibilityState = 'visible';
    listeners.visibilitychange();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('staff notification count defers exactly one visible refresh across an in-flight read', async () => {
    const listeners = {};
    let finish;
    const staffApiRequest = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ success: true, count: 1 }); }))
        .mockResolvedValue({ success: true, count: 2 });
    const document = { visibilityState: 'visible', getElementById: () => null,
        addEventListener: (name, fn) => { listeners[name] = fn; } };
    const window = { auth: { currentUser: { id: 'synthetic' } } };
    const ctx = vm.createContext({ document, window, staffApiRequest, setInterval: () => 1, setTimeout: () => 1,
        console: { error() {} }, Date });
    vm.runInContext(read('staff/public/scripts/shell/notifications.js').replace(/^import .*;\r?\n/gm, ''), ctx);
    vm.runInContext('initNotificationSystem()', ctx);
    expect(staffApiRequest).toHaveBeenCalledTimes(1);
    document.visibilityState = 'hidden';
    listeners.visibilitychange();
    document.visibilityState = 'visible';
    listeners.visibilitychange();
    expect(staffApiRequest).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    expect(staffApiRequest).toHaveBeenCalledTimes(2);
});
