const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));
jest.mock('../../services/r2Storage', () => ({
    isR2Configured: jest.fn(() => true),
    getSignedDownloadUrl: jest.fn(async key => `https://signed.invalid/${encodeURIComponent(key)}`),
    getFileBuffer: jest.fn(async () => Buffer.from('private')),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    R2_PUBLIC_URL: ''
}));
jest.mock('../../services/whatsappService', () => ({
    sendDocumentNotification: jest.fn()
}));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));

const db = require('../../db');
const r2Storage = require('../../services/r2Storage');

function token(payload) {
    return `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}`;
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/patient-documents', require('../../routes/patient-documents'));
    app.use('/api/announcements', require('../../routes/announcements'));
    return app;
}

describe('patient ownership and document share containment', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = makeApp();
    });

    test('document tracking derives patient identity from JWT and ignores forged body identity', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM patient_documents')) return [[{ patient_id: 'patient-1' }]];
            return [{ affectedRows: 1 }];
        });

        const response = await request(app)
            .post('/api/patient-documents/17/track')
            .set('Authorization', token({ id: 'patient-1', role: 'patient' }))
            .send({ action: 'view', patientId: 'other-patient' });

        expect(response.status).toBe(200);
        const accessInsert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO patient_document_access_logs'));
        expect(accessInsert[1][1]).toBe('patient-1');
        expect(accessInsert[1]).not.toContain('other-patient');
    });

    test('document tracking rejects a document not owned by the authenticated patient', async () => {
        db.query.mockResolvedValue([[]]);

        const response = await request(app)
            .post('/api/patient-documents/17/track')
            .set('Authorization', token({ id: 'patient-1', user_type: 'patient' }))
            .send({ action: 'download', patientId: 'patient-1' });

        expect(response.status).toBe(404);
        expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO patient_document_access_logs'))).toBe(false);
    });

    test('raw document proxy rejects anonymous and patient-token access', async () => {
        const anonymous = await request(app).get('/api/patient-documents/file/private/key.pdf');
        const patient = await request(app)
            .get('/api/patient-documents/file/private/key.pdf')
            .set('Authorization', token({ id: 'patient-1', role: 'patient' }));

        expect(anonymous.status).toBe(401);
        expect(patient.status).toBe(403);
        expect(r2Storage.getFileBuffer).not.toHaveBeenCalled();
    });

    test('public share response returns an expiring signed URL instead of the raw proxy path', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM patient_document_shares')) {
                return [[{
                    id: 8,
                    document_id: 17,
                    patient_id: 'patient-1',
                    title: 'Dokumen',
                    file_name: 'document.pdf',
                    file_type: 'application/pdf',
                    file_path: 'private/key.pdf',
                    file_url: '/api/patient-documents/file/private/key.pdf',
                    expires_at: new Date(Date.now() + 60_000)
                }]];
            }
            return [{ affectedRows: 1 }];
        });

        const response = await request(app).get('/api/patient-documents/share/share-token');

        expect(response.status).toBe(200);
        expect(response.body.document.fileUrl).toBe('https://signed.invalid/private%2Fkey.pdf');
        expect(response.body.document.fileUrl).not.toContain('/api/patient-documents/file/');
        expect(r2Storage.getSignedDownloadUrl).toHaveBeenCalledWith(
            'private/key.pdf',
            expect.any(Number)
        );
        expect(r2Storage.getSignedDownloadUrl.mock.calls[0][1]).toBeLessThanOrEqual(60);
    });

    test('patient upload listing replaces the protected raw proxy with a signed URL', async () => {
        db.query.mockResolvedValueOnce([[{
            id: 17,
            file_path: 'patient-uploads/private.pdf',
            file_url: '/api/patient-documents/file/patient-uploads/private.pdf',
            source: 'patient',
            status: 'published'
        }]]);

        const response = await request(app)
            .get('/api/patient-documents/my-uploads')
            .set('Authorization', token({ id: 'patient-1', role: 'patient' }));

        expect(response.status).toBe(200);
        expect(response.body.documents[0].file_url).toBe('https://signed.invalid/patient-uploads%2Fprivate.pdf');
        expect(response.body.documents[0].file_path).toBeUndefined();
    });

    test('patient document content replaces the protected raw proxy with a signed URL', async () => {
        db.query.mockResolvedValueOnce([[{
            id: 17,
            document_type: 'lab_result',
            title: 'Lab',
            description: null,
            source_data: null,
            file_path: 'lab/private.pdf',
            file_url: '/api/patient-documents/file/lab/private.pdf',
            file_name: 'lab.pdf'
        }]]);

        const response = await request(app)
            .get('/api/patient-documents/17/content')
            .set('Authorization', token({ id: 'patient-1', user_type: 'patient' }));

        expect(response.status).toBe(200);
        expect(response.body.document.fileUrl).toBe('https://signed.invalid/lab%2Fprivate.pdf');
    });

    test('staff document listing also replaces raw proxy paths with signed URLs', async () => {
        db.query.mockResolvedValueOnce([[{
            id: 17,
            file_path: 'staff-view/private.pdf',
            file_url: '/api/patient-documents/file/staff-view/private.pdf'
        }]]);

        const response = await request(app)
            .get('/api/patient-documents/by-patient/patient-1')
            .set('Authorization', token({ id: 'staff-1', user_type: 'staff', role: 'dokter' }));

        expect(response.status).toBe(200);
        expect(response.body.documents[0].file_url).toBe('https://signed.invalid/staff-view%2Fprivate.pdf');
        expect(response.body.documents[0].file_path).toBeUndefined();
    });

    test('announcement like derives patient identity from JWT', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('SELECT id FROM announcement_likes')) return [[]];
            if (sql.includes('SELECT COALESCE(like_count')) return [[{ like_count: 1 }]];
            return [{ affectedRows: 1 }];
        });

        const response = await request(app)
            .post('/api/announcements/9/like')
            .set('Authorization', token({ id: 'patient-1', role: 'patient' }))
            .send({ patient_id: 'other-patient' });

        expect(response.status).toBe(200);
        const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO announcement_likes'));
        expect(insert[1]).toEqual(['9', 'patient-1']);
    });

    test('announcement like rejects anonymous requests', async () => {
        const response = await request(app)
            .post('/api/announcements/9/like')
            .send({ patient_id: 'patient-1' });

        expect(response.status).toBe(401);
        expect(db.query).not.toHaveBeenCalled();
    });
});
