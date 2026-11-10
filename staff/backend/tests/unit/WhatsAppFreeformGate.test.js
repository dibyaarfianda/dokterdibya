'use strict';

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const whatsappService = require('../../services/whatsappService');
const notification = require('../../utils/notification');

describe('Meta free-form gate (WA_META_FREEFORM_ENABLED)', () => {
    const saved = process.env.WA_META_FREEFORM_ENABLED;
    afterEach(() => {
        if (saved === undefined) delete process.env.WA_META_FREEFORM_ENABLED;
        else process.env.WA_META_FREEFORM_ENABLED = saved;
        jest.restoreAllMocks();
    });

    describe('whatsappService.sendAuto', () => {
        function arrange() {
            whatsappService.provider = 'meta';
            const meta = jest.spyOn(whatsappService, 'sendViaMetaCloud')
                .mockResolvedValue({ success: true, method: 'meta', messageId: 'w1' });
            const fonnte = jest.spyOn(whatsappService, 'sendViaFonnte')
                .mockResolvedValue({ success: false, error: 'off' });
            return { meta, fonnte };
        }

        test('does not call Meta when flag is unset; Fonnte then manual link still work', async () => {
            delete process.env.WA_META_FREEFORM_ENABLED;
            const { meta, fonnte } = arrange();
            const res = await whatsappService.sendAuto('081234567890', 'hi');
            expect(meta).not.toHaveBeenCalled();
            expect(fonnte).toHaveBeenCalled();
            expect(res.method).toBe('manual');
        });

        test('does not call Meta when flag is anything but "true"', async () => {
            process.env.WA_META_FREEFORM_ENABLED = '1';
            const { meta } = arrange();
            await whatsappService.sendAuto('081234567890', 'hi');
            expect(meta).not.toHaveBeenCalled();
        });

        test('calls Meta when flag is "true"', async () => {
            process.env.WA_META_FREEFORM_ENABLED = 'true';
            const { meta } = arrange();
            const res = await whatsappService.sendAuto('081234567890', 'hi');
            expect(meta).toHaveBeenCalledTimes(1);
            expect(res.method).toBe('meta');
        });
    });

    describe('notification.sendWhatsAppAuto', () => {
        function arrange() {
            notification.whatsappProvider = 'meta';
            notification.metaEnabled = true;
            notification.metaAccessToken = 'tok';
            notification.metaPhoneNumberId = '123';
            notification.fonnteEnabled = false;
            notification.whatsappEnabled = false;
            return jest.spyOn(notification, 'sendMetaCloud')
                .mockResolvedValue({ success: true, method: 'meta' });
        }

        test('does not call Meta when flag is unset', async () => {
            delete process.env.WA_META_FREEFORM_ENABLED;
            const meta = arrange();
            const res = await notification.sendWhatsAppAuto('081234567890', 'hi');
            expect(meta).not.toHaveBeenCalled();
            expect(res.method).toBe('manual');
        });

        test('calls Meta when flag is "true"', async () => {
            process.env.WA_META_FREEFORM_ENABLED = 'true';
            const meta = arrange();
            const res = await notification.sendWhatsAppAuto('081234567890', 'hi');
            expect(meta).toHaveBeenCalledTimes(1);
            expect(res.method).toBe('meta');
        });
    });
});
