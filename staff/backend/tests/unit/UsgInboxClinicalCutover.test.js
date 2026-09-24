'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/usg-inbox-processor.js'), 'utf8');
const mockDb = { query: jest.fn() };
const mockR2 = { uploadFile: jest.fn() };
const mockClinicalPhotos = { appendPhotos: jest.fn(), compensateUploaded: jest.fn() };
jest.mock('../../db', () => mockDb);
jest.mock('../../services/r2Storage', () => mockR2);
jest.mock('../../services/UsgClinicalPhotoService', () => mockClinicalPhotos);
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const inbox = require('../../scripts/usg-inbox-processor');

test('inbox processor is importable without starting cron work and delegates clinical photo claim', () => {
    expect(source).toMatch(/if \(require\.main === module\) main\(\)/);
    expect(source).toMatch(/clinicalPhotos\.appendPhotos\(/);
    expect(source).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+medical_records\b/i);
});

beforeEach(() => jest.clearAllMocks());

test('inbox refuses an absent visit before uploading and uses a system actor for existing visits', async () => {
    mockDb.query.mockResolvedValueOnce([[]]);
    await expect(inbox.getOrCreateMedicalRecord('fixture-a', 'rsia_melinda', '2026-09-24'))
        .rejects.toThrow('Canonical visit is required');
    expect(mockR2.uploadFile).not.toHaveBeenCalled();
    mockDb.query.mockResolvedValueOnce([[{ id: 1, mr_id: 'TEST001' }]]);
    expect(await inbox.getOrCreateMedicalRecord('fixture-a', 'rsia_melinda', '2026-09-24'))
        .toMatchObject({ mrId: 'TEST001', isNew: false });
    expect(mockDb.query.mock.calls[1][1]).toEqual(['fixture-a', 'rsia_melinda', '2026-09-24', '2026-09-24', '2026-09-24']);
    await inbox.saveUsgRecord('fixture-a', 'TEST001', ['usg/24092026/new.jpg'], '2026-09-24');
    expect(mockClinicalPhotos.appendPhotos).toHaveBeenCalledWith(expect.objectContaining({
        patientId: 'fixture-a', mrId: 'TEST001', photos: ['usg/24092026/new.jpg'],
        actor: { id: 'usg-inbox', name: 'USG Inbox' }
    }));
});

test('second R2 upload failure compensates only the newly uploaded first key', async () => {
    const fileSystem = require('fs').promises;
    const list = jest.spyOn(fileSystem, 'readdir').mockResolvedValue(['one.jpg', 'two.jpg']);
    const read = jest.spyOn(fileSystem, 'readFile').mockResolvedValue(Buffer.from('synthetic'));
    mockR2.uploadFile.mockResolvedValueOnce({ key: 'usg/24092026/new.jpg' })
        .mockRejectedValueOnce(new Error('R2 unavailable'));
    mockClinicalPhotos.compensateUploaded.mockResolvedValue({ attempted: 1, failed: 0 });
    try {
        await expect(inbox.uploadImages('/synthetic', 'TEST001', 'Synthetic', '2026-09-24'))
            .rejects.toThrow('R2 unavailable');
        expect(mockClinicalPhotos.compensateUploaded).toHaveBeenCalledWith(['usg/24092026/new.jpg']);
    } finally { list.mockRestore(); read.mockRestore(); }
});
