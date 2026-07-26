'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: {},
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    findRecordByMrId: jest.fn(),
    normalizeMrId: jest.fn((value) => String(value || '').toUpperCase()),
    sundayClinicMedifySyncQueue: { enqueueDiagnosis: jest.fn() },
    MEDIFY_SOAP_SYNC_SECTIONS: new Set()
}));

jest.mock('../../services/sunday-clinic/queue', () => ({
    updateQueueStatus: jest.fn()
}));

const {
    mergeConcurrentRecordData
} = require('../../services/sunday-clinic/records');

describe('Sunday Clinic concurrent section save', () => {
    test('keeps a prior staff save when the next staff changed a different field', () => {
        const base = {
            keluhan_utama: 'Kontrol',
            alergi_obat: '-',
            pemeriksaan: {
                tekanan_darah: '120/80',
                nadi: '80'
            }
        };
        const latest = {
            ...base,
            alergi_obat: 'Penisilin',
            pemeriksaan: {
                tekanan_darah: '120/80',
                nadi: '88'
            }
        };
        const incoming = {
            ...base,
            keluhan_utama: 'Kontrol trimester III'
        };

        expect(mergeConcurrentRecordData(latest, base, incoming)).toEqual({
            keluhan_utama: 'Kontrol trimester III',
            alergi_obat: 'Penisilin',
            pemeriksaan: {
                tekanan_darah: '120/80',
                nadi: '88'
            }
        });
    });

    test('uses the last save when both staff changed the same field', () => {
        expect(mergeConcurrentRecordData(
            { diagnosis: 'Versi staf A' },
            { diagnosis: 'Versi awal' },
            { diagnosis: 'Versi staf B' }
        )).toEqual({ diagnosis: 'Versi staf B' });
    });

    test('merges partial legacy payloads without deleting existing fields', () => {
        expect(mergeConcurrentRecordData(
            { photos: [{ url: 'lama.jpg' }], notes: 'Pertahankan' },
            {},
            { photos: [{ url: 'baru.jpg' }] }
        )).toEqual({
            photos: [{ url: 'baru.jpg' }],
            notes: 'Pertahankan'
        });
    });

    test('tracks unsaved form input and sends the loaded base snapshot', () => {
        const publicRoot = path.join(__dirname, '../../../public/scripts/sunday-clinic');
        const mainSource = fs.readFileSync(path.join(publicRoot, 'main.js'), 'utf8');
        const apiClientSource = fs.readFileSync(
            path.join(publicRoot, 'utils/api-client.js'),
            'utf8'
        );

        expect(mainSource).toContain("container.addEventListener('input', markFormDirty, true)");
        expect(mainSource).toContain("container.addEventListener('change', markFormDirty, true)");
        expect(mainSource).toContain('stateManager.markDirty()');
        expect(mainSource).toContain("(stateManager.get('dirtyRevision') || 0) !== refreshRevision");
        expect(apiClientSource).toContain('__concurrent_merge_v1: true');
        expect(apiClientSource).toContain('base_data: baseData');
        expect(apiClientSource).toContain('stateManager.replaceSectionData(section, response.data.record_data)');
        expect(apiClientSource).toContain('stateManager.markClean(saveRevision)');
    });
});
