jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../db', () => ({ query: jest.fn().mockResolvedValue([[]]) }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../services/SundayClinicSchemaValidator', () => ({
    validateSundayClinicSchema: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));
jest.mock('../../realtime-sync', () => ({
    broadcastToStaff: jest.fn()
}));
jest.mock('../../services/WhatsAppReminderJobs', () => ({
    createWhatsAppReminderJobs: jest.fn()
}));

const cron = require('node-cron');
const logger = require('../../utils/logger');
const { createWhatsAppReminderJobs } = require('../../services/WhatsAppReminderJobs');
const { initSchedulers } = require('../../services/appointmentScheduler');

const FLAGS = ['WA_REMINDER_JANJI_ENABLED', 'WA_REMINDER_KONTROL_ENABLED'];
let savedEnv;
const EMPTY = { total: 0, sent: 0, skipped: 0, failed: 0 };
// Jobs object is memoized by the scheduler module, so it is created once and its mocks reset per test.
const jobs = {
    runJanjiH1: jest.fn(),
    runJanjiBelumKonfirmasi: jest.fn(),
    runKontrolH3: jest.fn()
};

function callbacksFor(expression) {
    return cron.schedule.mock.calls.filter(([expr]) => expr === expression).map(([, cb]) => cb);
}

beforeEach(() => {
    jest.clearAllMocks();
    savedEnv = {};
    FLAGS.forEach((f) => { savedEnv[f] = process.env[f]; delete process.env[f]; });
    Object.values(jobs).forEach((fn) => fn.mockReset().mockResolvedValue(EMPTY));
    createWhatsAppReminderJobs.mockReturnValue(jobs);
});

afterEach(() => {
    FLAGS.forEach((f) => {
        if (savedEnv[f] === undefined) delete process.env[f];
        else process.env[f] = savedEnv[f];
    });
});

test('registers three WhatsApp jobs in Asia/Jakarta', () => {
    initSchedulers();
    const calls = cron.schedule.mock.calls;
    const count = (expr) => calls.filter(([e, , o]) => e === expr && o?.timezone === 'Asia/Jakarta').length;
    expect(count('0 18 * * *')).toBe(2);
    expect(count('0 7 * * *')).toBe(2);
    expect(count('0 9 * * *')).toBe(1);
});

test('janji jobs do nothing unless WA_REMINDER_JANJI_ENABLED is true', async () => {
    initSchedulers();
    const h1 = callbacksFor('0 18 * * *').pop();
    const belum = callbacksFor('0 7 * * *').pop();

    await h1();
    await belum();
    expect(jobs.runJanjiH1).not.toHaveBeenCalled();
    expect(jobs.runJanjiBelumKonfirmasi).not.toHaveBeenCalled();

    process.env.WA_REMINDER_JANJI_ENABLED = 'true';
    await h1();
    await belum();
    expect(jobs.runJanjiH1).toHaveBeenCalledTimes(1);
    expect(jobs.runJanjiBelumKonfirmasi).toHaveBeenCalledTimes(1);
});

test('kontrol job respects WA_REMINDER_KONTROL_ENABLED', async () => {
    initSchedulers();
    const kontrol = callbacksFor('0 9 * * *').pop();

    await kontrol();
    expect(jobs.runKontrolH3).not.toHaveBeenCalled();

    process.env.WA_REMINDER_JANJI_ENABLED = 'true';
    await kontrol();
    expect(jobs.runKontrolH3).not.toHaveBeenCalled();

    process.env.WA_REMINDER_KONTROL_ENABLED = 'true';
    await kontrol();
    expect(jobs.runKontrolH3).toHaveBeenCalledTimes(1);
});

test('overlapping run is skipped and guard resets afterwards', async () => {
    process.env.WA_REMINDER_JANJI_ENABLED = 'true';
    let resolveRun;
    jobs.runJanjiH1.mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }));
    initSchedulers();
    const h1 = callbacksFor('0 18 * * *').pop();

    const first = h1();
    const second = h1();
    await second;
    expect(jobs.runJanjiH1).toHaveBeenCalledTimes(1);

    resolveRun({ total: 1, sent: 1, skipped: 0, failed: 0 });
    await first;
    expect(logger.info).toHaveBeenCalledWith('[Scheduler] WhatsApp janjiH1 result', { total: 1, sent: 1, skipped: 0, failed: 0 });

    await h1();
    expect(jobs.runJanjiH1).toHaveBeenCalledTimes(2);
});

test('a rejected run is logged, not thrown, and releases the guard', async () => {
    process.env.WA_REMINDER_JANJI_ENABLED = 'true';
    jobs.runJanjiH1.mockRejectedValueOnce(new Error('db down'));
    initSchedulers();
    const h1 = callbacksFor('0 18 * * *').pop();

    await expect(h1()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('[Scheduler] WhatsApp janjiH1 failed:', 'db down');

    await h1();
    expect(jobs.runJanjiH1).toHaveBeenCalledTimes(2);
});
