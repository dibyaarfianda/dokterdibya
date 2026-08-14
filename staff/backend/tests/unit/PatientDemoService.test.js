jest.mock('../../db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const PatientDemoService = require('../../services/PatientDemoService');

describe('PatientDemoService baseline', () => {
    test('materializes synthetic dates relative to WIB without real patient identity', () => {
        const fixedWibNow = new Date('2026-08-14T12:00:00.000Z');
        const state = PatientDemoService.buildBaseline(fixedWibNow);

        expect(state.schemaVersion).toBe('2026.08.14-1');
        expect(state.profile.id).toBe('DEMO-PATIENT');
        expect(state.profile.email.endsWith('.invalid')).toBe(true);
        expect(state.pregnancy.edd).toBe('2026-12-04');
        expect(state.bookings[0].date).toBe('2026-08-21');
        expect(state.documents.every((item) => item.file_url.startsWith('/demo-assets/'))).toBe(true);
        expect(JSON.stringify(state)).not.toMatch(/@gmail\.com|@yahoo\.com|@hotmail\.com/i);
    });

    test('rejects unknown top-level state keys', () => {
        const state = PatientDemoService.buildBaseline();
        expect(() => PatientDemoService.validateState({ ...state, productionPatientId: 123 })).toThrow('Unknown demo state key');
    });
});
