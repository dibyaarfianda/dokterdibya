const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.resolve(__dirname, '../../../../public/community-chat.html'), 'utf8');
const source = html.slice(html.indexOf('    async function openMessageContext(id)'), html.indexOf('    function appendMessage'));
test('a newer failed context request restores live mode even while an older request is pending', async () => {
    const pending = [];
    const context = {
        activeRoom: { slug: 'lobby' }, roomRequest: 0, contextMode: false, contextRequestPending: false,
        api: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
        scheduleRead: jest.fn(), queuedMessages: [], renderMessages: jest.fn(), CSS: { escape: x => x },
        el: { messages: { querySelector: () => null } }, document: { getElementById: () => ({ hidden: true }) },
    };
    vm.createContext(context); vm.runInContext(source, context);
    const old = context.openMessageContext(1);
    const newer = context.openMessageContext(2);
    pending[1].reject(new Error('deleted'));
    await expect(newer).rejects.toThrow('deleted');
    pending[0].resolve({ messages: [], latest_message_id: 0 });
    await old;
    expect(context.contextMode).toBe(false);
    expect(context.contextRequestPending).toBe(false);
    expect(context.renderMessages).not.toHaveBeenCalled();
});
