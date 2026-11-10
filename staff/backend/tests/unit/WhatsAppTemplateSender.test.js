const { createWhatsAppTemplateSender } = require('../../services/WhatsAppTemplateSender');
const { resolveTemplate } = require('../../config/whatsapp-templates');

function fakeDb({ optedOut = [], claimAffected = 1 } = {}) {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (/SELECT 1 FROM wa_opt_outs/.test(sql)) {
            return [optedOut.includes(params[0]) ? [{ 1: 1 }] : []];
        }
        if (/INSERT IGNORE INTO wa_messages/.test(sql)) return [{ affectedRows: claimAffected }];
        if (/UPDATE wa_messages/.test(sql)) return [{ affectedRows: 1 }];
        return [[]];
    });
    const inserts = () => calls.filter(c => /INSERT/.test(c.sql));
    const updates = () => calls.filter(c => /UPDATE wa_messages/.test(c.sql));
    return { query, calls, inserts, updates };
}

function fakeWhatsapp({ enabled = true, result = { success: true, method: 'meta', messageId: 'wamid.X' } } = {}) {
    return {
        meta: { enabled },
        formatPhoneNumber: (phone) => {
            if (!phone) return null;
            let d = String(phone).replace(/\D/g, '');
            if (d.startsWith('0')) d = '62' + d.slice(1);
            else if (d.startsWith('8')) d = '62' + d;
            return d;
        },
        sendViaMetaCloud: jest.fn(async () => result)
    };
}

const quiet = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const INPUT = {
    purpose: 'janji_h1',
    refType: 'sunday_appointment',
    refId: 42,
    patientId: 'P1',
    phone: '081234567890',
    values: { nama: 'Ani', tanggal: 'Minggu, 8 November 2026', jam: '09:30' }
};

function make(dbOpts, waOpts) {
    const db = fakeDb(dbOpts);
    const whatsapp = fakeWhatsapp(waOpts);
    return { db, whatsapp, sender: createWhatsAppTemplateSender({ db, whatsapp, logger: quiet }) };
}

test('skips without a log row when Meta is not configured', async () => {
    const { db, whatsapp, sender } = make({}, { enabled: false });
    expect(sender.isConfigured()).toBe(false);
    expect(await sender.send(INPUT)).toEqual({ status: 'failed', reason: 'meta_not_configured' });
    expect(db.inserts()).toHaveLength(0);
    expect(whatsapp.sendViaMetaCloud).not.toHaveBeenCalled();
});

test.each([null, undefined, ''])('fails with missing_ref and writes nothing for refId %j', async (refId) => {
    const db = fakeDb();
    const wa = fakeWhatsapp();
    const sender = createWhatsAppTemplateSender({ db, whatsapp: wa, logger: quiet });
    const res = await sender.send({ ...INPUT, refId });
    expect(res).toEqual({ status: 'failed', reason: 'missing_ref' });
    expect(db.calls).toHaveLength(0);
    expect(wa.sendViaMetaCloud).not.toHaveBeenCalled();
});

test('skips empty or invalid phone', async () => {
    const { db, sender } = make();
    expect(await sender.send({ ...INPUT, phone: '' })).toEqual({ status: 'skipped', reason: 'invalid_phone' });
    expect(await sender.send({ ...INPUT, phone: '12345' })).toEqual({ status: 'skipped', reason: 'invalid_phone' });
    expect(db.inserts()).toHaveLength(0);
});

test('opt-out matches across phone formats', async () => {
    const { db, whatsapp, sender } = make({ optedOut: ['6281234567890'] });
    const res = await sender.send({ ...INPUT, phone: '0812-3456-7890' });
    expect(res).toEqual({ status: 'skipped', reason: 'opted_out' });
    const ins = db.inserts();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).toMatch(/INSERT IGNORE/);
    expect(ins[0].sql).toMatch(/'skipped', 'opted_out'/);
    expect(ins[0].params).toContain('6281234567890');
    expect(whatsapp.sendViaMetaCloud).not.toHaveBeenCalled();
});

test('second claim for same purpose and ref is skipped', async () => {
    const { whatsapp, sender } = make({ claimAffected: 0 });
    expect(await sender.send(INPUT)).toEqual({ status: 'skipped', reason: 'already_claimed' });
    expect(whatsapp.sendViaMetaCloud).not.toHaveBeenCalled();
});

test('sends template and records message id', async () => {
    const { db, whatsapp, sender } = make();
    expect(await sender.send(INPUT)).toEqual({ status: 'sent', messageId: 'wamid.X' });
    expect(whatsapp.sendViaMetaCloud).toHaveBeenCalledWith('6281234567890', null, {
        templateName: 'janji_h1',
        templateLanguage: 'id',
        templateComponents: [{
            type: 'body',
            parameters: [
                { type: 'text', text: 'Ani' },
                { type: 'text', text: 'Minggu, 8 November 2026' },
                { type: 'text', text: '09:30' }
            ]
        }]
    });
    const claim = db.inserts()[0];
    expect(claim.sql).toMatch(/'claimed'/);
    expect(claim.params).toContain('42');
    const upd = db.updates()[0];
    expect(upd.sql).toMatch(/status = 'sent'/);
    expect(upd.params).toContain('wamid.X');
});

test('records Meta error as failed', async () => {
    const { db, sender } = make({}, { result: { success: false, error: 'x'.repeat(600) } });
    const res = await sender.send(INPUT);
    expect(res.status).toBe('failed');
    const upd = db.updates()[0];
    expect(upd.sql).toMatch(/status = 'failed'/);
    const msg = upd.params.find(p => typeof p === 'string' && p.startsWith('xxx'));
    expect(msg).toHaveLength(500);
});

test('unknown purpose fails without a log row', async () => {
    const { db, sender } = make();
    expect(await sender.send({ ...INPUT, purpose: 'nope' })).toEqual({ status: 'failed', reason: 'unknown_template' });
    expect(db.inserts()).toHaveLength(0);
});

test('test purpose uses base template', () => {
    expect(resolveTemplate('test_kontrol_h3').name).toBe('kontrol_h3');
    expect(resolveTemplate('unknown')).toBeNull();
});
