'use strict';

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { verifyStaffToken, requirePermission } = require('../middleware/auth');
const { LabReportService } = require('../services/lab-report/service');
const { extractLab } = require('../services/lab-report/ocr');
const { fail, assertVisit, validateSourceIds } = require('../services/lab-report/domain');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 8, fieldSize: 256 * 1024 },
    fileFilter: (_req, file, next) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype) ? next(null, true) : next(new Error('Unsupported file')) });
function validateFiles(files = []) {
    if (files.reduce((sum, file) => sum + file.buffer.length, 0) > 30 * 1024 * 1024) fail(400, 'FILES_TOO_LARGE', 'Total berkas maksimal 30 MB.');
    for (const file of files) {
        const bytes = file.buffer;
        const valid = file.mimetype === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
            : file.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
                : file.mimetype === 'image/webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
                    : bytes.subarray(0, 5).toString() === '%PDF-';
        if (!valid) fail(400, 'INVALID_FILE', 'Isi berkas tidak sesuai format gambar/PDF.');
    }
}
function createLabRouter({ service = new LabReportService(), extract = extractLab } = {}) {
    const router = express.Router();
    router.use(verifyStaffToken);
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const handler = fn => async (req, res) => {
        try { await fn(req, res); }
        catch (error) { res.status(error.status || 500).json({ success: false, code: error.code || 'LAB_REPORT_ERROR', message: error.status ? error.message : 'Layanan laboratorium belum dapat menyelesaikan permintaan. Coba kembali.' }); }
    };
    const multipart = (req, res, next) => req.is('multipart/form-data') ? upload.array('files', 10)(req, res, next) : next();
    const body = req => {
        validateFiles(req.files);
        let value = req.body;
        if (req.body.payload) { try { value = JSON.parse(req.body.payload); } catch (_) { fail(400, 'INVALID_PAYLOAD', 'Data laporan tidak valid.'); } }
        return { ...value, files: req.files || [], actor: req.user };
    };
    router.get('/visits', requirePermission('lab_exam.view'), handler(async (req, res) => res.json({ success: true, visits: await service.visits(req.query) })));
    router.get('/', requirePermission('lab_exam.view'), handler(async (req, res) => res.json({ success: true, reports: await service.list(req.query) })));
    router.post('/ocr', requirePermission('lab_exam.create'), rateLimit({ windowMs: 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false }), multipart,
        handler(async (req, res) => {
            validateFiles(req.files);
            let sourceIds;
            try { sourceIds = req.body.upload_ids ? JSON.parse(req.body.upload_ids) : (req.files || []).map(() => require('crypto').randomUUID()); }
            catch (_) { fail(400, 'INVALID_SOURCE_IDS', 'Identitas berkas sumber tidak valid.'); }
            validateSourceIds(sourceIds, (req.files || []).length);
            const [[patient]] = await service.pool.query('SELECT full_name FROM patients WHERE id=?', [req.body.patient_id]);
            const [visits] = await service.pool.query('SELECT * FROM sunday_clinic_records WHERE mr_id=? ORDER BY id', [req.body.mr_id]);
            assertVisit(visits, req.body.patient_id);
            if (!patient) fail(404, 'PATIENT_NOT_FOUND', 'Pasien tidak ditemukan.');
            res.json({ success: true, candidate: await extract({ files: req.files, sourceIds, patientName: patient.full_name, examinedAt: req.body.examined_at }) });
        }));
    router.post('/', requirePermission('lab_exam.create'), multipart, handler(async (req, res) => {
        const input = body(req);
        if (Object.hasOwn(input, 'id')) fail(400, 'CREATE_ID_FORBIDDEN', 'Gunakan jalur edit untuk laporan tersimpan.');
        res.json({ success: true, report: await service.save(input) });
    }));
    router.get('/:id', requirePermission('lab_exam.view'), handler(async (req, res) => res.json({ success: true, report: await service.get(req.params.id) })));
    router.patch('/:id', requirePermission('lab_exam.edit'), multipart, handler(async (req, res) => res.json({ success: true, report: await service.save({ ...body(req), id: req.params.id }) })));
    router.post('/:id/publish', requirePermission('patient_documents.create'), handler(async (req, res) => res.json({ success: true, report: await service.publish({ id: req.params.id, version: req.body.version, actor: req.user }) })));
    router.post('/:id/ocr', requirePermission('lab_exam.edit'), rateLimit({ windowMs: 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false }), handler(async (req, res) => {
        const sources = await service.ocrSources(req.params.id, req.body.source_ids); validateFiles(sources.files);
        res.json({ success: true, candidate: await extract({ ...sources, examinedAt: req.body.examined_at || sources.examinedAt }) });
    }));
    router.delete('/:id', requirePermission('medical_records.delete'), handler(async (req, res) => res.json(await service.remove({ id: req.params.id, version: req.body.version, actor: req.user }))));
    router.get('/:id/comparison', requirePermission('lab_exam.view'), handler(async (req, res) => res.json({ success: true, ...(await service.comparison(req.params.id, req.query.previous_id)) })));
    router.get('/:id/pdf', requirePermission('medical_records.export'), handler(async (req, res) => {
        const { buffer, filename } = await service.pdf(req.params.id, { comparison: req.query.comparison === '1', previousId: req.query.previous_id });
        res.type('pdf').set('Content-Disposition', `inline; filename="${filename}"`).send(buffer);
    }));
    router.use((error, _req, res, _next) => res.status(400).json({ success: false, message: error instanceof multer.MulterError ? 'Berkas maksimal 10 MB per file dan 10 file.' : 'Unggahan tidak valid.' }));
    return router;
}
module.exports = createLabRouter();
module.exports.createLabRouter = createLabRouter;
