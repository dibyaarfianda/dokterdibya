const webhook = require('../../scripts/clinic-monitor-webhook');
const status = require('../../scripts/clinic-monitor-status');

describe('clinic monitor webhook registration command', () => {
    const original = { ...process.env };
    afterEach(() => { process.env = { ...original }; });

    test('only an https base without credentials, query or hash is accepted', () => {
        expect(webhook.webhookUrl('https://dokterdibya.com')).toBe(`https://dokterdibya.com${webhook.WEBHOOK_PATH}`);
        expect(webhook.webhookUrl('https://dokterdibya.com/staff/')).toBe(`https://dokterdibya.com${webhook.WEBHOOK_PATH}`);
        for (const base of ['http://dokterdibya.com', 'https://user:pass@dokterdibya.com', 'https://dokterdibya.com/?a=1', 'https://dokterdibya.com/#x', 'dokterdibya.com', '', undefined]) {
            expect(() => webhook.webhookUrl(base)).toThrow();
        }
    });

    test('registration sends the configured secret, limits updates and drops stale pairing messages', async () => {
        process.env.CLINIC_MONITOR_TELEGRAM_BOT_TOKEN = 'bot-token';
        process.env.CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET = 'webhook-secret';
        const request = jest.fn().mockResolvedValue(true);
        const output = await webhook.main(['set', 'https://dokterdibya.com'], request);
        expect(request).toHaveBeenCalledWith('setWebhook', {
            url: `https://dokterdibya.com${webhook.WEBHOOK_PATH}`,
            secret_token: 'webhook-secret',
            allowed_updates: ['message'],
            drop_pending_updates: true
        });
        expect(output).not.toContain('webhook-secret');
        expect(output).not.toContain('bot-token');
    });

    test('registration refuses to proceed while the webhook secret is unconfigured', async () => {
        process.env.CLINIC_MONITOR_TELEGRAM_BOT_TOKEN = 'bot-token';
        delete process.env.CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET;
        const request = jest.fn();
        await expect(webhook.main(['set', 'https://dokterdibya.com'], request)).rejects.toThrow('TELEGRAM_NOT_CONFIGURED');
        expect(request).not.toHaveBeenCalled();
    });

    test('an unknown command reports usage instead of calling Telegram', async () => {
        const request = jest.fn();
        await expect(webhook.main(['enable'], request)).rejects.toThrow('USAGE');
        expect(request).not.toHaveBeenCalled();
    });
});

describe('clinic monitor status command', () => {
    const dashboard = {
        patients: [
            { patient_name: 'Siti Rahayu', ward: 'Melati 3', birth_date: '1991-04-02', active: true, discharge_at: null },
            { patient_name: 'Rina Hartati', ward: 'Anggrek 1', birth_date: '1988-11-30', active: false, discharge_at: '2026-09-18T02:00:00.000Z' },
            { patient_name: 'Ayu Pratiwi', ward: 'Dahlia 2', birth_date: '1995-01-09', active: false, identity_conflict: true }
        ],
        events: [
            { patient_name: 'Siti Rahayu', event_type: 'IGD' },
            { patient_name: 'Rina Hartati', event_type: 'IGD' },
            { patient_name: 'Rina Hartati', event_type: 'discharged' }
        ],
        pending_matches: [
            { patient_name: 'Dewi Lestari', hospital_mr_id: '0012345', reason: 'missing_exact_identity' },
            { patient_name: 'Nina Mujiati', hospital_mr_id: '0032751', reason: 'missing_exact_identity' },
            { patient_name: 'Lia Kusuma', hospital_mr_id: '0032752', reason: 'ambiguous' }
        ],
        sources: [
            { facility: 'gambiran', unit: 'IGD', status: 'ok', verified: true, last_success_at: '2026-09-19T03:00:00.000Z' },
            { facility: 'melinda', unit: 'RI', status: 'error', verified: false, last_success_at: null }
        ],
        telegram: { configured: true, connected: false },
        activation: { ready: false, enabled: false, blockers: ['unverified:melinda:RI', 'telegram_not_connected'], active_facilities: ['gambiran', 'melinda'], skipped_facilities: ['bhayangkara'] }
    };

    test('status output carries no patient identity', () => {
        const output = status.format(dashboard);
        for (const secret of ['Siti Rahayu', 'Rina Hartati', 'Ayu Pratiwi', 'Dewi Lestari', 'Nina Mujiati', 'Lia Kusuma',
            'Melati 3', 'Anggrek 1', 'Dahlia 2', '1991-04-02', '1988-11-30', '1995-01-09', '0012345', '0032751', '0032752']) {
            expect(output).not.toContain(secret);
        }
    });

    test('status counts matching outcomes so a clear configuration cannot look like a working pipeline', () => {
        const output = status.format(dashboard);
        expect(output).toContain('episodes: 3 total, 1 active, 1 discharged, 1 identity conflict');
        expect(output).toContain('events by type: IGD=2, discharged=1');
        expect(output).toContain('unmatched patients by reason: ambiguous=1, missing_exact_identity=2');
    });

    test('no blockers never claims patients are being matched', () => {
        const output = status.format({ ...dashboard, activation: { ...dashboard.activation, ready: true, enabled: true, blockers: [] } });
        expect(output).toContain('this does not prove patients are being matched');
    });

    test('an empty monitor reports every tally as none instead of failing', () => {
        const output = status.format({ ...dashboard, patients: [], events: [], pending_matches: [] });
        expect(output).toContain('episodes: 0 total, 0 active, 0 discharged, 0 identity conflict');
        expect(output).toContain('events by type: (none)');
        expect(output).toContain('unmatched patients by reason: (none)');
    });

    test('status output names every blocker, source state and skipped hospital', () => {
        const output = status.format(dashboard);
        expect(output).toContain('notifications enabled=false ready=false');
        expect(output).toContain('telegram configured=true connected=false');
        expect(output).toContain('skipped hospitals: bhayangkara');
        expect(output).toContain('source gambiran/IGD: verified=true status=ok last_success=2026-09-19T03:00:00.000Z');
        expect(output).toContain('source melinda/RI: verified=false status=error last_success=(never)');
        expect(output).toContain('blockers: unverified:melinda:RI, telegram_not_connected');
    });

    test('a fully cleared monitor reports no blockers', () => {
        const output = status.format({ ...dashboard, activation: { ...dashboard.activation, ready: true, enabled: true, blockers: [] } });
        expect(output).toContain('no activation blockers');
    });
});
