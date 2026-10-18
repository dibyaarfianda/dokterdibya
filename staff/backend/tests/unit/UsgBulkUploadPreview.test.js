'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextDecoder } = require('util');
const AdmZip = require('adm-zip');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/r2Storage', () => ({ uploadFile: jest.fn() }));
jest.mock('../../services/UsgClinicalPhotoService', () => ({ appendPhotos: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ verifyToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer fixture-token') return res.status(401).json({ success: false });
    next();
} }));

const db = require('../../db');
const service = require('../../services/UsgBulkUploadService');
const scripts = path.resolve(__dirname, '../../../public/scripts');

function zipFixture() {
    const zip = new AdmZip();
    zip.addFile('18102026/NY NIA/image.jpg', Buffer.alloc(2 * 1024 * 1024, 7));
    zip.addFile('18102026/NY NIA/scan.png', Buffer.from('second image'));
    zip.addFile('18102026/NY NIA/readme.txt', Buffer.from('ignore'));
    zip.addFile('17102026-100000_NY SITI/image.jpg', Buffer.from('wrong date'));
    zip.addFile('18102026/NY TIDAKCOCOK/image.jpg', Buffer.from('unmatched'));
    return zip.toBuffer();
}

function fileFrom(buffer) {
    const slices = [];
    return {
        size: buffer.length, slices,
        slice(start, end) {
            slices.push([start, end]);
            return { arrayBuffer: async () => Uint8Array.from(buffer.subarray(start, end)).buffer };
        }
    };
}

function loadReader() {
    const file = path.join(scripts, 'usg-zip-directory.js');
    const context = vm.createContext({ TextDecoder, DataView, Uint8Array, Error });
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8').replace(/export /g, ''), context);
    return context.readZipDirectory;
}

describe('USG preview without transferring image bytes', () => {
    beforeEach(() => {
        db.query.mockReset();
        db.query.mockResolvedValue([[{ patient_id: 'P1', full_name: 'NIA', mr_id: 'DRD1', scr_id: 1 }]]);
    });

    test('reads only the ZIP directory and returns the same metadata as the server ZIP parser', async () => {
        const read = loadReader();
        expect(typeof read).toBe('function');
        const buffer = zipFixture();
        const file = fileFrom(buffer);
        const entries = await read(file);
        expect(entries).toEqual(new AdmZip(buffer).getEntries().map(entry => ({
            entryName: entry.entryName, isDirectory: entry.isDirectory, size: entry.header.size
        })));
        expect(file.slices).toHaveLength(2);
        expect(JSON.stringify(entries).length).toBeLessThan(2000);
    });

    test('does not read compressed image bodies for a large ZIP', async () => {
        const read = loadReader();
        expect(typeof read).toBe('function');
        const zip = new AdmZip();
        zip.addFile('18102026/NY NIA/image.jpg', require('crypto').randomBytes(2 * 1024 * 1024));
        const file = fileFrom(zip.toBuffer());
        await read(file);
        expect(file.slices.reduce((total, [start, end]) => total + end - start, 0)).toBeLessThan(70000);
    });

    test('preserves a leading Unicode BOM in entry paths so execute can find the same ZIP entry', async () => {
        const read = loadReader();
        const zip = new AdmZip();
        zip.addFile('\uFEFF18102026/NY NIA/a.jpg', Buffer.from('image'));
        const buffer = zip.toBuffer();
        const entries = await read(fileFrom(buffer));
        expect(entries[0].entryName).toBe(new AdmZip(buffer).getEntries()[0].entryName);
        expect(new AdmZip(buffer).getEntry(entries[0].entryName)).not.toBeNull();
    });

    test('rejects invalid directories and marks unsupported ZIP64 for the existing ZIP fallback', async () => {
        const read = loadReader();
        expect(typeof read).toBe('function');
        await expect(read(fileFrom(Buffer.from('not a zip')))).rejects.toThrow(/ZIP/);
        const buffer = zipFixture();
        buffer.writeUInt16LE(0xffff, buffer.length - 12);
        await expect(read(fileFrom(buffer))).rejects.toMatchObject({ code: 'ZIP_DIRECTORY_UNSUPPORTED' });
    });

    test('manifest and ZIP preview produce identical patient/date/location matches without writes', async () => {
        expect(typeof service.previewFromZipEntries).toBe('function');
        const buffer = zipFixture();
        const entries = new AdmZip(buffer).getEntries().map(entry => ({
            entryName: entry.entryName, isDirectory: entry.isDirectory, size: entry.header.size
        }));
        const options = { date: '2026-10-18', hospital: 'klinik_private' };
        const legacy = await service.previewFromZipBuffer({ ...options, buffer });
        const manifest = await service.previewFromZipEntries({ ...options, entries });
        expect(manifest).toEqual(legacy);
        expect(manifest.folders.map(folder => folder.status).sort()).toEqual(['date_mismatch', 'matched', 'no_match']);
        expect(db.query.mock.calls.every(([sql]) => /^\s*SELECT/i.test(sql))).toBe(true);
        expect(require('../../services/r2Storage').uploadFile).not.toHaveBeenCalled();
        expect(require('../../services/UsgClinicalPhotoService').appendPhotos).not.toHaveBeenCalled();
    });

    test('rejects malformed manifest metadata before reading patient data', async () => {
        expect(typeof service.previewFromZipEntries).toBe('function');
        await expect(service.previewFromZipEntries({
            entries: [{ entryName: null, size: -1 }], date: '2026-10-18', hospital: 'klinik_private'
        })).rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('exposes authenticated, non-cached JSON preview with the existing result contract', async () => {
        const express = require('express');
        const app = express();
        app.use(express.json());
        app.use('/api/usg-bulk-upload', require('../../routes/usg-bulk-upload'));
        const request = require('supertest');
        await request(app).post('/api/usg-bulk-upload/preview-manifest').send({ entries: [] }).expect(401);
        const result = await request(app).post('/api/usg-bulk-upload/preview-manifest')
            .set('Authorization', 'Bearer fixture-token')
            .send({ entries: [{ entryName: 'NY NIA/a.jpg', isDirectory: false, size: 12 }], date: '2026-10-18', hospital: 'klinik_private' })
            .expect(200).expect('Cache-Control', 'no-store');
        expect(result.body).toMatchObject({ success: true, summary: { matched: 1, totalFiles: 1 } });
        await request(app).post('/api/usg-bulk-upload/preview-manifest')
            .set('Authorization', 'Bearer fixture-token').send({ entries: 'invalid' }).expect(400);
    });
});

function loadPage(request) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set(['d-none']);
            elements.set(id, { value: '2026-10-18', textContent: '', classList: {
                add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)
            } });
        }
        return elements.get(id);
    };
    const context = vm.createContext({
        window: { location: { hostname: 'dokterdibya.com' }, showError: jest.fn() },
        document: { getElementById: element }, console,
        getIdToken: async () => 'fixture-token', staffApiRequest: request,
        readZipDirectory: async () => [{ entryName: 'NY NIA/a.jpg', size: 12, isDirectory: false }],
        FormData: class { append() {} }, setTimeout, clearTimeout
    });
    const source = fs.readFileSync(path.join(scripts, 'usg-bulk-upload.js'), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
    vm.runInContext(source + '\ncurrentZipFile = { size: 21000000 }; selectedHospital = "klinik_private"; renderPreview = data => { window.rendered = data; };', context);
    return { context, element };
}

describe('USG preview UI request lifecycle', () => {
    test('sends directory JSON with a deadline instead of sending the ZIP image bytes', async () => {
        const data = { success: true, folders: [] };
        const request = jest.fn().mockResolvedValue(data);
        const { context, element } = loadPage(request);
        await context.previewUpload();
        expect(request).toHaveBeenCalledWith('/api/usg-bulk-upload/preview-manifest', expect.objectContaining({
            method: 'POST', timeoutMs: 30000, retries: 0
        }));
        expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
            entries: [{ entryName: 'NY NIA/a.jpg', size: 12, isDirectory: false }], date: '2026-10-18', hospital: 'klinik_private'
        });
        expect(context.window.rendered).toEqual(data);
        expect(element('loading-preview').classList.contains('d-none')).toBe(true);
    });

    test('restores the preview button and hides the spinner when the response times out', async () => {
        const error = new Error('Request timed out'); error.name = 'TimeoutError';
        const request = jest.fn().mockRejectedValue(error);
        const { context, element } = loadPage(request);
        await context.previewUpload();
        expect(request).toHaveBeenCalledTimes(1);
        expect(element('loading-preview').classList.contains('d-none')).toBe(true);
        expect(element('preview-btn-container').classList.contains('d-none')).toBe(false);
        expect(context.window.showError).toHaveBeenCalledWith(expect.stringMatching(/koneksi|waktu/i));
    });

    test('retains the ZIP upload fallback only for unsupported directory formats', async () => {
        const request = jest.fn().mockResolvedValue({ success: true });
        const { context } = loadPage(request);
        context.readZipDirectory = async () => { const error = new Error('ZIP64'); error.code = 'ZIP_DIRECTORY_UNSUPPORTED'; throw error; };
        await context.previewUpload();
        expect(request).toHaveBeenCalledWith('/api/usg-bulk-upload/preview', expect.objectContaining({ timeoutMs: 180000, retries: 0 }));
        expect(request).toHaveBeenCalledTimes(1);
    });

    test('prevents simultaneous preview requests while the first request is pending', async () => {
        let complete;
        const request = jest.fn(() => new Promise(resolve => { complete = resolve; }));
        const { context } = loadPage(request);
        const first = context.previewUpload();
        await Promise.resolve();
        await Promise.resolve();
        await context.previewUpload();
        expect(request).toHaveBeenCalledTimes(1);
        complete({ success: true });
        await first;
    });
});
