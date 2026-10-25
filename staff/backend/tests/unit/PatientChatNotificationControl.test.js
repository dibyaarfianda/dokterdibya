const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(permission = 'granted') {
    const subscription = { toJSON: () => ({ endpoint: 'https://push.test/sub', keys: { p256dh: 'public', auth: 'secret' } }), unsubscribe: jest.fn() };
    const registration = { pushManager: { getSubscription: jest.fn().mockResolvedValue(subscription), subscribe: jest.fn() } };
    const context = {
        Notification: { permission, requestPermission: jest.fn().mockResolvedValue(permission) },
        navigator: { serviceWorker: { getRegistration: jest.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) } },
        PushManager: function() {}, isSecureContext: true, Uint8Array, setTimeout, clearTimeout,
        fetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, settings: { enabled: false } }) }),
        exports: {},
    };
    context.window = context;
    const source = fs.readFileSync(path.resolve(__dirname, '../../../../public/scripts/patient-chat-notifications.js'), 'utf8');
    vm.runInNewContext(source.replace(/export /g, '') + '\nexports.create = createPatientChatNotificationController;', context);
    return { context, subscription, controller: context.exports.create({ getToken: () => 'test-session' }) };
}

test('initial settings/status check never requests permission or subscribes', async () => {
    const { context, controller } = load('default');
    expect(await controller.getSettings()).toEqual({ enabled: false });
    expect((await controller.getDeviceStatus()).ready).toBe(false);
    expect(context.Notification.requestPermission).not.toHaveBeenCalled();
});
test('disable only saves chat preference without removing shared push subscription', async () => {
    const { context, controller, subscription } = load();
    await controller.setEnabled(false);
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.fetch.mock.calls[0][0]).toBe('/api/community-chat/me/notifications');
    expect(JSON.parse(context.fetch.mock.calls[0][1].body)).toEqual({ enabled: false });
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
});
test('enable syncs existing subscription before saving opt-in', async () => {
    const { context, controller } = load();
    await controller.setEnabled(true);
    expect(context.fetch.mock.calls.map(args => args[0])).toEqual(['/api/patients/push-token', '/api/community-chat/me/notifications']);
});
test('denied and backend subscription errors never enable account setting', async () => {
    const denied = load('denied');
    await expect(denied.controller.setEnabled(true)).rejects.toThrow(/diblokir/);
    expect(denied.context.fetch).not.toHaveBeenCalled();
    const failed = load();
    failed.context.fetch.mockResolvedValue({ ok: false, json: async () => ({ success: false, message: 'offline' }) });
    await expect(failed.controller.setEnabled(true)).rejects.toThrow('offline');
    expect(failed.context.fetch).toHaveBeenCalledTimes(1);
});
