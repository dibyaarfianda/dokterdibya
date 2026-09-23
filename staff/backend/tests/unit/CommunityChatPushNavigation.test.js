const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../../../public/sw.js'), 'utf8');
function worker(clients) {
    const handlers = {};
    const context = { URL, clients, self: { location: { origin: 'https://sisiwanita.id' }, addEventListener: (name, callback) => { handlers[name] = callback; } } };
    vm.runInNewContext(source, context);
    return handlers;
}
test('chat push click navigates an existing patient window to the exact room and message', async () => {
    const client = { url: 'https://sisiwanita.id/patient-menu.html', focus: jest.fn(), navigate: jest.fn() };
    const handlers = worker({ matchAll: async () => [client], openWindow: jest.fn() });
    let completion;
    handlers.notificationclick({ notification: { close() {}, data: { url: '/community-chat.html?room=lobby&message=42' } }, waitUntil: promise => { completion = promise; } });
    await completion;
    expect(client.navigate).toHaveBeenCalledWith('https://sisiwanita.id/community-chat.html?room=lobby&message=42');
    expect(client.focus).toHaveBeenCalledTimes(1);
});
test('closed-app push opens a new window; external URLs are not trusted', async () => {
    const clients = { matchAll: async () => [], openWindow: jest.fn() };
    const handlers = worker(clients);
    let completion;
    handlers.notificationclick({ notification: { close() {}, data: { url: 'https://external.invalid/' } }, waitUntil: promise => { completion = promise; } });
    await completion;
    expect(clients.openWindow).toHaveBeenCalledWith('https://sisiwanita.id/patient-menu.html');
});
