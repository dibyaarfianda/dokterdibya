jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const BASE_ENV = { ...process.env };

function loadService(env = {}) {
    jest.resetModules();
    process.env = { ...BASE_ENV, ...env };
    return require('../../services/whatsappService');
}

function metaAccepts(messageId = 'wamid.TEST') {
    return jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: messageId }] }) });
}

function metaRejects(message = 'Template not found') {
    return jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message } }) });
}

const META_ON = {
    WA_PROVIDER: 'meta',
    WHATSAPP_CLOUD_ENABLED: 'true',
    WHATSAPP_CLOUD_ACCESS_TOKEN: 'token',
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123',
    FONNTE_ENABLED: 'false'
};

afterEach(() => { process.env = { ...BASE_ENV }; delete global.fetch; });

describe('sendAuto delivery reporting', () => {
    test('an undelivered message is reported as not delivered, never as success', async () => {
        const service = loadService({ WHATSAPP_CLOUD_ENABLED: 'false', FONNTE_ENABLED: 'false' });
        const result = await service.sendAuto('081234567890', 'Halo');
        expect(result.delivered).toBe(false);
        expect(result.success).toBe(false);
        expect(result.method).toBe('manual');
        expect(result.waLink).toContain('https://wa.me/6281234567890');
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('a delivered message reports delivered with the provider message id', async () => {
        const service = loadService(META_ON);
        global.fetch = metaAccepts('wamid.ABC');
        const result = await service.sendAuto('081234567890', 'Halo');
        expect(result).toMatchObject({ success: true, delivered: true, method: 'meta', messageId: 'wamid.ABC' });
    });

    test('a rejected send falls back to a manual link and keeps the provider error', async () => {
        const service = loadService(META_ON);
        global.fetch = metaRejects('Template name does not exist');
        const result = await service.sendAuto('081234567890', 'Halo');
        expect(result.delivered).toBe(false);
        expect(result.errors.join(' ')).toContain('Template name does not exist');
    });
});

describe('template options', () => {
    test('no configured template name leaves the message as free text', () => {
        const service = loadService({});
        expect(service.templateOptions('documentReady', 'Siti', 2, 'https://x.test')).toEqual({});
    });

    test('a configured template keeps parameter positions and never sends an empty one', () => {
        const service = loadService({ WA_TEMPLATE_SURGERY_REMINDER: 'pengingat_operasi', WA_TEMPLATE_LANGUAGE: 'id' });
        const options = service.templateOptions('surgeryReminder', 'Siti Rahayu', '', 'RSIA Melinda', null);
        expect(options.templateName).toBe('pengingat_operasi');
        expect(options.templateLanguage).toBe('id');
        expect(options.templateComponents).toEqual([{
            type: 'body',
            parameters: [
                { type: 'text', text: 'Siti Rahayu' },
                { type: 'text', text: '-' },
                { type: 'text', text: 'RSIA Melinda' },
                { type: 'text', text: '-' }
            ]
        }]);
    });

    test('newlines are collapsed because Meta rejects parameters containing them', () => {
        const service = loadService({ WA_TEMPLATE_DOCUMENT_READY: 'dokumen_siap' });
        const options = service.templateOptions('documentReady', 'Siti\n  Rahayu');
        expect(options.templateComponents[0].parameters[0].text).toBe('Siti Rahayu');
    });
});

describe('patient notifications send as templates', () => {
    test('surgery reminder posts a template payload to Meta when one is configured', async () => {
        const service = loadService({ ...META_ON, WA_TEMPLATE_SURGERY_REMINDER: 'pengingat_operasi' });
        global.fetch = metaAccepts();
        await service.sendSurgeryReminder({ patient_name: 'Siti', surgery_time: '08:30:00', location: 'rsia_melinda', npo_status: 'Puasa 8 jam' }, '081234567890');
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.type).toBe('template');
        expect(body.template.name).toBe('pengingat_operasi');
        expect(body.template.components[0].parameters.map(p => p.text)).toEqual(['Siti', '08:30', 'RSIA Melinda', 'Puasa 8 jam']);
    });

    test('document notification posts a template payload with the portal link', async () => {
        const service = loadService({ ...META_ON, WA_TEMPLATE_DOCUMENT_READY: 'dokumen_siap' });
        global.fetch = metaAccepts();
        const result = await service.sendDocumentNotification({
            phone: '081234567890', patientName: 'Siti', documents: [{ title: 'USG' }, { title: 'Lab' }], shareToken: 'tok123'
        });
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.template.name).toBe('dokumen_siap');
        expect(body.template.components[0].parameters.map(p => p.text)).toEqual(['Siti', '2', expect.stringContaining('/shared-document/tok123')]);
        expect(result.delivered).toBe(true);
    });

    test('without an approved template the payload stays plain text', async () => {
        const service = loadService(META_ON);
        global.fetch = metaAccepts();
        await service.sendSurgeryReminder({ patient_name: 'Siti', surgery_time: '08:30:00', location: 'rsia_melinda' }, '081234567890');
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.type).toBe('text');
    });
});
