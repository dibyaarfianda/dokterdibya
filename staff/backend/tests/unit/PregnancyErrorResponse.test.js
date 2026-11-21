'use strict';

const { pregnancyErrorResponse } = require('../../services/PregnancyErrorResponse');
const { PregnancyOutcomeError } = require('../../services/PregnancyOutcomeService');
const { PregnancyEpisodeError } = require('../../services/PregnancyEpisodeService');

describe('pregnancyErrorResponse', () => {
    test('maps PregnancyOutcomeError and PregnancyEpisodeError to their status and message', () => {
        expect(pregnancyErrorResponse(new PregnancyOutcomeError(404, 'Penandaan tidak ditemukan'), 'generik'))
            .toMatchObject({ status: 404, body: { success: false, message: 'Penandaan tidak ditemukan' }, log: false });
        expect(pregnancyErrorResponse(new PregnancyEpisodeError(400, 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut'), 'generik'))
            .toMatchObject({ status: 400, body: { success: false, message: 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut' } });
    });

    test('unknown errors become a generic 500 without the internal message', () => {
        const res = pregnancyErrorResponse(new Error('ER_SECRET table x'), 'Gagal menandai pasien melahirkan');
        expect(res.status).toBe(500);
        expect(res.log).toBe(true);
        expect(res.body).toEqual({ success: false, message: 'Gagal menandai pasien melahirkan' });
        expect(JSON.stringify(res.body)).not.toContain('ER_SECRET');
    });

    test('a non-numeric or out-of-range status is treated as unknown', () => {
        const e = new Error('x'); e.status = 'bad';
        expect(pregnancyErrorResponse(e, 'g').status).toBe(500);
    });
});
