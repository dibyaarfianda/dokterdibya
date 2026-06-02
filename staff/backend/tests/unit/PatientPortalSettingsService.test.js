jest.mock('../../db', () => ({
    query: jest.fn()
}));

const db = require('../../db');
const PatientPortalSettingsService = require('../../services/PatientPortalSettingsService');

describe('PatientPortalSettingsService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns default settings when no row exists', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const settings = await PatientPortalSettingsService.getSettings('P2026001');

        expect(settings).toEqual({
            nickname: null,
            notification_sound: 'default'
        });
    });

    it('rejects unsupported notification sounds', async () => {
        await expect(PatientPortalSettingsService.saveSettings('P2026001', {
            nickname: 'Nanda',
            notification_sound: 'loud'
        })).rejects.toThrow('Suara notifikasi tidak valid');
    });

    it('rejects nicknames longer than 40 characters', async () => {
        await expect(PatientPortalSettingsService.saveSettings('P2026001', {
            nickname: 'Nama yang terlalu panjang untuk nickname portal',
            notification_sound: 'default'
        })).rejects.toThrow('Nickname maksimal 40 karakter');
    });

    it('trims nickname and upserts settings', async () => {
        db.query.mockResolvedValueOnce([[]]);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.query.mockResolvedValueOnce([[{
            nickname: 'Bunda',
            notification_sound: 'soft'
        }]]);

        const settings = await PatientPortalSettingsService.saveSettings('P2026001', {
            nickname: '  Bunda  ',
            notification_sound: 'soft'
        });

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO patient_portal_settings'), [
            'P2026001',
            'Bunda',
            'soft'
        ]);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO community_chat_profiles'), [
            'P2026001',
            'Bunda'
        ]);
        expect(settings).toEqual({
            nickname: 'Bunda',
            notification_sound: 'soft'
        });
    });
});
