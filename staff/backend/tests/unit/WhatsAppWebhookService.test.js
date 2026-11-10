const crypto = require('crypto');
const {
    verifySignature,
    createWhatsAppWebhookService
} = require('../../services/WhatsAppWebhookService');

function fakeDb() {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }];
    });
    const find = (re) => calls.filter(c => re.test(c.sql));
    return { query, calls, find };
}

const quiet = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const formatPhone = (p) => {
    let d = String(p).replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    return d;
};

function build(db = fakeDb()) {
    return { db, svc: createWhatsAppWebhookService({ db, logger: quiet, formatPhone }) };
}

function statusPayload(...statuses) {
    return { entry: [{ changes: [{ value: { statuses } }] }] };
}
function messagePayload(...messages) {
    return { entry: [{ changes: [{ value: { messages } }] }] };
}

describe('verifySignature', () => {
    const secret = 'topsecret';
    const body = Buffer.from('{"a":1}');
    const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

    test('accepts matching HMAC', () => {
        expect(verifySignature(body, good, secret)).toBe(true);
    });
    test('rejects wrong signature', () => {
        const bad = 'sha256=' + crypto.createHmac('sha256', 'other').update(body).digest('hex');
        expect(verifySignature(body, bad, secret)).toBe(false);
        expect(verifySignature(body, 'sha256=abc', secret)).toBe(false);
    });
    test('rejects missing header', () => {
        expect(verifySignature(body, undefined, secret)).toBe(false);
    });
    test('rejects empty secret', () => {
        expect(verifySignature(body, good, '')).toBe(false);
        expect(verifySignature(body, good, undefined)).toBe(false);
    });
});

describe('WhatsAppWebhookService.handlePayload', () => {
    test('status updates never move backwards', async () => {
        const { svc, db } = build();
        const res = await svc.handlePayload(statusPayload(
            { id: 'wamid.A', status: 'delivered' },
            { id: 'wamid.A', status: 'read' },
            { id: 'wamid.A', status: 'delivered' }
        ));
        expect(res).toEqual({ statuses: 3, inbound: 0, optOuts: 0 });
        const updates = db.find(/UPDATE wa_messages/);
        expect(updates).toHaveLength(3);
        const second = updates[2];
        expect(second.sql).toMatch(/FIELD\(status/);
        expect(second.params).toContain('delivered');
        expect(second.params).toContain('wamid.A');
        expect(second.sql).toMatch(/status <> 'failed'/);
    });

    test('failed overwrites and stores error title', async () => {
        const { svc, db } = build();
        await svc.handlePayload(statusPayload(
            { id: 'wamid.B', status: 'failed', errors: [{ title: 'Message undeliverable' }] }
        ));
        const [u] = db.find(/UPDATE wa_messages/);
        expect(u.params).toEqual(expect.arrayContaining(['failed', 'Message undeliverable', 'wamid.B']));
        expect(u.sql).not.toMatch(/FIELD\(status/);
    });

    test('ignores unknown status values', async () => {
        const { svc, db } = build();
        const res = await svc.handlePayload(statusPayload({ id: 'wamid.C', status: 'deleted' }));
        expect(res.statuses).toBe(0);
        expect(db.calls).toHaveLength(0);
    });

    test.each(['STOP', ' berhenti ', 'Stop', 'Stop.', 'STOP!', 'Berhenti 🙏', '"stop"'])('inbound %j opts out', async (text) => {
        const { svc, db } = build();
        const res = await svc.handlePayload(messagePayload(
            { id: 'wamid.in1', from: '6281234567890', type: 'text', text: { body: text } }
        ));
        expect(res).toEqual({ statuses: 0, inbound: 1, optOuts: 1 });
        const [o] = db.find(/INSERT IGNORE INTO wa_opt_outs/);
        expect(o.params).toEqual(['6281234567890', 'inbound_stop']);
    });

    test('non-exact STOP text does not opt out', async () => {
        const { svc, db } = build();
        const res = await svc.handlePayload(messagePayload(
            { id: 'wamid.in2', from: '6281234567890', type: 'text', text: { body: 'stop dulu ya' } }
        ));
        expect(res).toEqual({ statuses: 0, inbound: 1, optOuts: 0 });
        expect(db.find(/wa_opt_outs/)).toHaveLength(0);
    });

    test('a failing inbound insert cannot lose a STOP (opt-out runs first)', async () => {
        const db = fakeDb();
        db.query.mockImplementation(async (sql, params) => {
            db.calls.push({ sql, params });
            if (/INSERT IGNORE INTO wa_messages/.test(sql)) throw Object.assign(new Error('secret 6281234567890'), { code: 'ER_X' });
            return [{ affectedRows: 1 }];
        });
        const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
        const svc = createWhatsAppWebhookService({ db, logger, formatPhone });
        const res = await svc.handlePayload(messagePayload(
            { id: 'wamid.in9', from: '6281234567890', type: 'text', text: { body: 'STOP' } }
        ));
        expect(res.optOuts).toBe(1);
        expect(db.find(/INSERT IGNORE INTO wa_opt_outs/)).toHaveLength(1);
        const order = db.calls.map(c => (/wa_opt_outs/.test(c.sql) ? 'opt' : 'msg'));
        expect(order[0]).toBe('opt');
        expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/secret|6281/);
        expect(JSON.stringify(logger.warn.mock.calls)).toMatch(/ER_X/);
    });

    test('inbound text stored once, body truncated to 1000', async () => {
        const { svc, db } = build();
        await svc.handlePayload(messagePayload(
            { id: 'wamid.in3', from: '081234567890', type: 'text', text: { body: 'x'.repeat(1500) } }
        ));
        const [ins] = db.find(/INSERT IGNORE INTO wa_messages/);
        expect(ins.sql).toMatch(/'inbound'/);
        expect(ins.sql).toMatch(/'received'/);
        expect(ins.params).toContain('6281234567890');
        expect(ins.params).toContain('wamid.in3');
        const body = ins.params.find(p => typeof p === 'string' && p.startsWith('xxx'));
        expect(body).toHaveLength(1000);
    });

    test('ignores non-text messages and empty entries', async () => {
        const { svc, db } = build();
        const zero = { statuses: 0, inbound: 0, optOuts: 0 };
        await expect(svc.handlePayload({ entry: [] })).resolves.toEqual(zero);
        await expect(svc.handlePayload(messagePayload({ type: 'image' }))).resolves.toEqual(zero);
        await expect(svc.handlePayload({})).resolves.toEqual(zero);
        expect(db.calls).toHaveLength(0);
    });

    test('one failing event is logged without body and processing continues', async () => {
        const db = fakeDb();
        let n = 0;
        db.query.mockImplementation(async () => {
            if (n++ === 0) throw new Error('boom 6281');
            return [{ affectedRows: 1 }];
        });
        const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
        const svc = createWhatsAppWebhookService({ db, logger, formatPhone });
        const res = await svc.handlePayload(statusPayload(
            { id: 'wamid.D', status: 'sent' },
            { id: 'wamid.E', status: 'read' }
        ));
        expect(res.statuses).toBe(1);
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/6281/);
    });
});
