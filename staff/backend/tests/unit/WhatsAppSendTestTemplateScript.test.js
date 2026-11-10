const { main } = require('../../scripts/whatsapp-send-test-template');

function makeOut() {
    const lines = [];
    const push = (...a) => lines.push(a.join(' '));
    return { log: push, error: push, lines };
}

describe('whatsapp-send-test-template CLI', () => {
    const TOKEN = 'SECRET_TOKEN_VALUE_123';
    let prevToken;
    beforeEach(() => {
        prevToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
        process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = TOKEN;
    });
    afterEach(() => {
        if (prevToken === undefined) delete process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
        else process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = prevToken;
    });

    test('missing arguments -> exit 2, sender not called', async () => {
        const sender = { send: jest.fn() };
        const out = makeOut();
        expect(await main(['628123'], { sender, out })).toBe(2);
        expect(await main([], { sender, out })).toBe(2);
        expect(sender.send).not.toHaveBeenCalled();
    });

    test('unknown template -> exit 2, sender not called', async () => {
        const sender = { send: jest.fn() };
        expect(await main(['628123', 'nope'], { sender, out: makeOut() })).toBe(2);
        expect(sender.send).not.toHaveBeenCalled();
    });

    test('sent -> exit 0, prints status and message id, no token', async () => {
        const sender = { send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 'wamid.X' }) };
        const out = makeOut();
        expect(await main(['628123', 'janji_h1'], { sender, out })).toBe(0);
        const text = out.lines.join('\n');
        expect(text).toContain('sent');
        expect(text).toContain('wamid.X');
        expect(text).not.toContain(TOKEN);
        const arg = sender.send.mock.calls[0][0];
        expect(arg).toMatchObject({ purpose: 'test_janji_h1', refType: 'test', patientId: null, phone: '628123' });
        expect(arg.refId).toMatch(/^\d+$/);
        expect(arg.values.nama).toBe('Uji Coba');
        expect(arg.values.jam).toBe('09:00');
        expect(typeof arg.values.tanggal).toBe('string');
    });

    test('values only include params of the template', async () => {
        const sender = { send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 'w' }) };
        await main(['628123', 'kontrol_h3'], { sender, out: makeOut() });
        expect(Object.keys(sender.send.mock.calls[0][0].values).sort()).toEqual(['nama', 'tanggal']);
    });

    test('failed -> exit 1; skipped -> exit 1', async () => {
        const out = makeOut();
        const failed = { send: jest.fn().mockResolvedValue({ status: 'failed', reason: 'meta_error' }) };
        expect(await main(['628123', 'janji_h1'], { sender: failed, out })).toBe(1);
        expect(out.lines.join('\n')).toContain('reason=meta_error');
        const skipped = { send: jest.fn().mockResolvedValue({ status: 'skipped', reason: 'opted_out' }) };
        expect(await main(['628123', 'janji_h1'], { sender: skipped, out })).toBe(1);
    });
});
