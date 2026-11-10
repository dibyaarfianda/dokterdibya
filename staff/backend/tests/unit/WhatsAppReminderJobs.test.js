const DibyaDateTime = require('../../../public/scripts/date-time-format.js');
const realSettings = require('../../services/booking-session-settings');
const { createWhatsAppReminderJobs } = require('../../services/WhatsAppReminderJobs');

const FMT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const NOW = () => new Date(2026, 10, 7, 18, 0);
const SETTINGS = [{ session: 1, label: '09:00 - 11:00 (Pagi)', startTime: '09:00', slotDuration: 10 }];
const PREFLIGHT = /SELECT 1 FROM wa_messages LIMIT 1/;

function makeDb({ rows = [], preflightError = null } = {}) {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (PREFLIGHT.test(sql)) {
            if (preflightError) throw preflightError;
            return [[{ 1: 1 }]];
        }
        return [rows];
    });
    return { query, calls, recipientCall: () => calls.find(c => !PREFLIGHT.test(c.sql)) };
}

function makeSender(results) {
    const queue = Array.isArray(results) ? [...results] : null;
    return {
        isConfigured: jest.fn(() => true),
        send: jest.fn(async () => (queue ? queue.shift() : results || { status: 'sent', messageId: 'w' }))
    };
}

function build(overrides = {}) {
    const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
    const sleep = jest.fn(async () => {});
    const sessionSettings = overrides.sessionSettings || {
        getSessionSettings: jest.fn(async () => SETTINGS),
        findSessionSetting: realSettings.findSessionSetting,
        getSlotTimeFromSettings: realSettings.getSlotTimeFromSettings,
        getSessionLabelFromSettings: realSettings.getSessionLabelFromSettings
    };
    const db = overrides.db || makeDb();
    const sender = overrides.sender || makeSender();
    const jobs = createWhatsAppReminderJobs({ db, sender, sessionSettings, logger, now: NOW, sleep });
    return { jobs, db, sender, logger, sleep, sessionSettings };
}

const apptRow = (extra = {}) => ({
    id: 101, patient_id: 'P1', patient_name: 'Ani', patient_phone: '0812',
    session: 1, slot_number: 4, appointment_date: new Date(2026, 10, 8), ...extra
});

describe('WhatsAppReminderJobs', () => {
    test('janji H-1 targets tomorrow with slot time', async () => {
        const { jobs, db, sender } = build({ db: makeDb({ rows: [apptRow()] }) });
        const res = await jobs.runJanjiH1();
        const q = db.recipientCall();
        expect(q.params).toContain('2026-11-08');
        expect(q.sql).toMatch(/status IN \('pending_confirmation','confirmed'\)/);
        expect(q.sql).toMatch(/disabled_practice_dates/);
        expect(sender.send).toHaveBeenCalledWith({
            purpose: 'janji_h1', refType: 'sunday_appointment', refId: '101', patientId: 'P1', phone: '0812',
            values: { nama: 'Ani', tanggal: DibyaDateTime.date(new Date(2026, 10, 8), FMT), jam: '09:30' }
        });
        expect(res).toEqual({ total: 1, sent: 1, skipped: 0, failed: 0 });
    });

    test('janji H-1 falls back to session label when slot time is null', async () => {
        const sessionSettings = {
            getSessionSettings: async () => SETTINGS,
            findSessionSetting: realSettings.findSessionSetting,
            getSlotTimeFromSettings: () => null,
            getSessionLabelFromSettings: realSettings.getSessionLabelFromSettings
        };
        const { jobs, sender } = build({ db: makeDb({ rows: [apptRow()] }), sessionSettings });
        await jobs.runJanjiH1();
        expect(sender.send.mock.calls[0][0].values.jam).toBe('09:00 - 11:00 (Pagi)');
    });

    test('janji H-1 reads session settings strictly', async () => {
        const { jobs, sessionSettings } = build({ db: makeDb({ rows: [apptRow()] }) });
        await jobs.runJanjiH1();
        expect(sessionSettings.getSessionSettings).toHaveBeenCalledWith({ strict: true });
    });

    test('janji H-1 rejects when session settings cannot be loaded', async () => {
        const sessionSettings = {
            getSessionSettings: async () => { throw new Error('db down'); },
            findSessionSetting: realSettings.findSessionSetting,
            getSlotTimeFromSettings: realSettings.getSlotTimeFromSettings,
            getSessionLabelFromSettings: realSettings.getSessionLabelFromSettings
        };
        const { jobs, sender } = build({ db: makeDb({ rows: [apptRow()] }), sessionSettings });
        await expect(jobs.runJanjiH1()).rejects.toThrow('db down');
        expect(sender.send).not.toHaveBeenCalled();
    });

    test('janji H-1 uses dash for an unknown or deactivated session (no legacy hours)', async () => {
        const { jobs, sender } = build({ db: makeDb({ rows: [apptRow({ session: 3 })] }) });
        await jobs.runJanjiH1();
        expect(sender.send.mock.calls[0][0].values.jam).toBe('-');
    });

    test('belum konfirmasi targets today pending only', async () => {
        const { jobs, db, sender } = build({ db: makeDb({ rows: [apptRow()] }) });
        await jobs.runJanjiBelumKonfirmasi();
        const q = db.recipientCall();
        expect(q.params).toContain('2026-11-07');
        expect(q.sql).toMatch(/status = 'pending_confirmation'/);
        expect(q.sql).not.toMatch(/'confirmed'/);
        expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'janji_belum_konfirmasi', values: { nama: 'Ani', jam: '09:30' }
        }));
    });

    test('kontrol H-3 targets today plus 3 and sends kontrol template', async () => {
        const row = { record_id: 55, patient_id: 'P2', full_name: 'Budi', phone: '0813', kontrol_date: '2026-11-10' };
        const { jobs, db, sender } = build({ db: makeDb({ rows: [row] }) });
        await jobs.runKontrolH3();
        expect(db.recipientCall().params).toEqual(['2026-11-10', '2026-11-07', '2026-11-10']);
        expect(sender.send).toHaveBeenCalledWith({
            purpose: 'kontrol_h3', refType: 'medical_record', refId: '55', patientId: 'P2', phone: '0813',
            values: { nama: 'Budi', tanggal: DibyaDateTime.date(new Date(2026, 10, 10), FMT) }
        });
    });

    test('kontrol H-3 SQL skips planning rows when the patient has a newer visit', async () => {
        const { jobs, db } = build({ db: makeDb({ rows: [] }) });
        await jobs.runKontrolH3();
        const q = db.recipientCall();
        expect(q.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM sunday_clinic_records newer\s+WHERE newer\.patient_id = scr\.patient_id\s+AND newer\.created_at > scr\.created_at\)/);
        expect((q.sql.match(/\?/g) || []).length).toBe(q.params.length);
    });

    test('kontrol H-3 skips rows with empty phone without sending', async () => {
        const row = { record_id: 56, patient_id: 'P3', full_name: 'Cici', phone: '', kontrol_date: '2026-11-10' };
        const { jobs, sender } = build({ db: makeDb({ rows: [row] }) });
        const res = await jobs.runKontrolH3();
        expect(sender.send).not.toHaveBeenCalled();
        expect(res).toEqual({ total: 1, sent: 0, skipped: 1, failed: 0 });
    });

    test('uses only latest planning per mr_id', async () => {
        const { jobs, db } = build();
        await jobs.runKontrolH3();
        const sql = db.recipientCall().sql;
        expect(sql).toMatch(/MAX\(id\) AS latest_id/);
        expect(sql).toMatch(/latest\.latest_id = mr\.id/);
    });

    test('stops before querying when Meta is not configured', async () => {
        const sender = makeSender();
        sender.isConfigured.mockReturnValue(false);
        const { jobs, db, logger } = build({ sender });
        expect(await jobs.runJanjiH1()).toEqual({ disabled: true, reason: 'meta_not_configured' });
        expect(db.query).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('stops when wa_messages table is missing', async () => {
        const db = makeDb({ preflightError: Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE' }) });
        const { jobs, logger } = build({ db });
        expect(await jobs.runKontrolH3()).toEqual({ disabled: true, reason: 'table_missing' });
        expect(db.recipientCall()).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('rethrows other preflight errors', async () => {
        const db = makeDb({ preflightError: Object.assign(new Error('boom'), { code: 'ECONNRESET' }) });
        const { jobs } = build({ db });
        await expect(jobs.runJanjiH1()).rejects.toThrow('boom');
    });

    test('counts results and sleeps between messages', async () => {
        const rows = [apptRow({ id: 1 }), apptRow({ id: 2 }), apptRow({ id: 3 })];
        const sender = makeSender([{ status: 'sent' }, { status: 'skipped' }, { status: 'failed' }]);
        const { jobs, sleep } = build({ db: makeDb({ rows }), sender });
        expect(await jobs.runJanjiH1()).toEqual({ total: 3, sent: 1, skipped: 1, failed: 1 });
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(1000);
    });

    test('a rejecting send counts as failed, is logged without PII, and the loop continues', async () => {
        const rows = [apptRow({ id: 1 }), apptRow({ id: 2 })];
        const sender = makeSender();
        sender.send.mockRejectedValueOnce(new Error('db down 0812 Ani'));
        const { jobs, logger } = build({ db: makeDb({ rows }), sender });
        expect(await jobs.runJanjiH1()).toEqual({ total: 2, sent: 1, skipped: 0, failed: 1 });
        const logged = JSON.stringify(logger.error.mock.calls);
        expect(logged).toContain('1');
        expect(logged).not.toMatch(/0812|Ani|db down/);
    });

    test('idempotent across two runs', async () => {
        const sender = makeSender([{ status: 'sent' }, { status: 'skipped' }]);
        const { jobs } = build({ db: makeDb({ rows: [apptRow()] }), sender });
        const a = await jobs.runJanjiH1();
        const b = await jobs.runJanjiH1();
        expect(a.sent + b.sent).toBe(1);
    });
});
