/* Run only against a new isolated codex_lab_test_* database. No production data is copied. */
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const mysql = require('mysql2/promise');
const { LabReportService } = require('../../services/lab-report/service');
const { renderLabPdf } = require('../../services/lab-report/pdf');
const { flag } = require('../../services/lab-report/domain');
const database = process.argv.find(x => x.startsWith('--database='))?.slice(11);
const outputDir = process.argv.find(x => x.startsWith('--output='))?.slice(9);
if (!/^codex_lab_test_[a-z0-9]+$/.test(database || '') || !outputDir || !path.isAbsolute(outputDir)) throw new Error('Explicit isolated database and absolute output directory required');
const options = process.platform === 'win32' ? { host: '127.0.0.1', user: 'root' } : { socketPath: '/run/mysqld/mysqld.sock', user: 'root' };
const actor = { id: 'UJI01', user_type: 'staff' }; let pool; let admin;
async function main() {
    admin = await mysql.createConnection(options);
    const [existing] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [database]);
    assert.equal(existing.length, 0, 'test database must not already exist');
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ ...options, database, multipleStatements: true, dateStrings: true, timezone: '+07:00' });
    fs.mkdirSync(outputDir, { recursive: true });
    await pool.query(`CREATE TABLE patients (id VARCHAR(10) PRIMARY KEY, full_name VARCHAR(150),address VARCHAR(255),birth_date DATE);
        CREATE TABLE sunday_clinic_records (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,mr_id VARCHAR(20),patient_id VARCHAR(10),visit_location VARCHAR(50),created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE patient_documents (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,patient_id VARCHAR(10),mr_id VARCHAR(20),document_type VARCHAR(30),title VARCHAR(255),file_path VARCHAR(500),file_url VARCHAR(500),file_name VARCHAR(255),file_type VARCHAR(50),file_size INT,source_data LONGTEXT,source VARCHAR(20),status VARCHAR(20),published_at DATETIME,published_by VARCHAR(50),created_by VARCHAR(50),updated_by VARCHAR(50),updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO patients VALUES ('P001','PASIEN UJI SATU','Alamat fixture','1998-01-01'),('P002','PASIEN UJI DUA','Alamat fixture','1997-02-02');
        INSERT INTO sunday_clinic_records (mr_id,patient_id,visit_location) VALUES ('DRD001','P001','klinik_private'),('DRD002','P001','rsia_melinda'),('DRD003','P002','klinik_private'),('DRD004','P001','klinik_private');`);
    await pool.query(fs.readFileSync(path.join(__dirname, '../../migrations/20261018_structured_lab_reports.sql'), 'utf8'));
    // Verify that rerunning the additive migration is harmless.
    await pool.query(fs.readFileSync(path.join(__dirname, '../../migrations/20261018_structured_lab_reports.sql'), 'utf8'));
    let uploads = 0; let failUpload = false; const removed = []; const notifications = []; const buffers = new Map();
    const storage = { uploadFile: async (buffer, name, type, folder) => {
        if (failUpload) throw new Error('R2 unavailable');
        const key = `${folder}/${++uploads}-${name}`; buffers.set(key, buffer); return { key };
    }, deleteFile: async key => { removed.push(key); buffers.delete(key); }, getFileBuffer: async key => buffers.get(key), getSignedDownloadUrl: async key => `/qa-file/${encodeURIComponent(key)}` };
    const service = new LabReportService({ pool, storage, renderPdf: renderLabPdf, notify: async event => notifications.push(event), broadcast: async () => {}, warn: () => {} });
    const data = (raw = '10.0', date = '2026-10-18T15:00') => ({ examined_at: date, technician: 'PETUGAS UJI', license: 'IZIN UJI', doctor: 'DOKTER UJI',
        parameters: [{ code: 'hb', name: 'Hemoglobin', panel: 'Darah Lengkap', raw_value: raw, unit: 'g/dL', reference: '12.0-15.5', origin: 'manual', reviewed: true }], sources: [], review_confirmed: true });
    const save = (value = {}) => service.save({ patient_id: 'P001', mr_id: 'DRD001', data: data(), actor, ...value });
    await assert.rejects(() => save({ patient_id: 'P002' }), /pasien/i);
    await assert.rejects(() => save({ mr_id: 'DRD002' }), /Klinik Privat/i);
    assert.equal(uploads, 0);
    const createToken = require('node:crypto').randomUUID();
    let report = await save({ client_request_id: createToken }); assert.equal(report.version, 1); assert.equal(report.status, 'draft');
    const replay = await save({ client_request_id: createToken }); assert.equal(replay.id, report.id, 'a lost create response must not duplicate the report');
    await assert.rejects(() => save({ client_request_id: createToken, data: data('13.0') }), /sudah tersimpan/i);
    report = await service.publish({ id: report.id, version: report.version, actor });
    assert.match(report.lab_number, /^LAB-\d{8}-0001$/); const number = report.lab_number;
    assert.equal(report.published_data.parameters[0].raw_value, '10.0'); assert.equal(notifications.length, 1);
    const publishedUploads = uploads;
    await service.publish({ id: report.id, version: report.version, actor });
    assert.equal(uploads, publishedUploads); assert.equal(notifications.length, 1);
    report = await save({ id: report.id, version: report.version, data: data('11.0') });
    assert.equal(report.data.parameters[0].raw_value, '11.0'); assert.equal(report.published_data.parameters[0].raw_value, '10.0');
    await assert.rejects(() => save({ id: report.id, version: 1 }), /berubah/i);
    failUpload = true;
    await assert.rejects(() => service.publish({ id: report.id, version: report.version, actor }), /R2 unavailable/);
    assert.equal((await service.get(report.id)).published_data.parameters[0].raw_value, '10.0');
    failUpload = false;
    report = await service.publish({ id: report.id, version: report.version, actor });
    assert.equal(report.lab_number, number); assert.equal(report.published_version, 2);
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM patient_documents WHERE lab_report_id=?', [report.id]); assert.equal(count.total, 1);
    const previous = await save({ mr_id: 'DRD004', data: data('9.0', '2026-10-15T11:00') });
    await service.publish({ id: previous.id, version: previous.version, actor });
    const comparison = await service.comparison(report.id); assert.equal(comparison.previous.id, previous.id); assert.equal(comparison.rows[0].delta, 2);
    const other = await save({ patient_id: 'P002', mr_id: 'DRD003', data: data('8.0', '2026-10-14T11:00') });
    await service.publish({ id: other.id, version: other.version, actor });
    await assert.rejects(() => service.comparison(report.id, other.id), /pasien yang sama/i);
    const sourceFile = { buffer: Buffer.from('fixture source bytes'), originalname: 'uji.png', mimetype: 'image/png' };
    let sourceReport = await save({ files: [sourceFile], data: { ...data(), sources: [{ id: 'forged', key: 'private-other-patient.pdf' }] } });
    assert.equal(sourceReport.data.sources.length, 1); assert.notEqual(sourceReport.data.sources[0].id, 'forged');
    sourceReport = await save({ id: sourceReport.id, version: sourceReport.version, data: { ...sourceReport.data, sources: [{ id: 'foreign-id' }] } }); assert.equal(sourceReport.data.sources.length, 0);
    const stableA = require('node:crypto').randomUUID(), stableB = require('node:crypto').randomUUID();
    const stableData = data(); stableData.parameters[0].source_id = stableB;
    let stableReport = await save({ files: [sourceFile, sourceFile], upload_ids: [stableA, stableB], data: stableData });
    stableReport = await save({ id: stableReport.id, version: stableReport.version, data: { ...stableReport.data, sources: stableReport.data.sources.filter(s => s.id === stableB) } });
    assert.equal(stableReport.data.parameters[0].source_id, stableB);
    const stableOcr = await service.ocrSources(stableReport.id, [stableB]); assert.deepEqual(stableOcr.sourceIds, [stableB]);
    const rollback = await save();
    await pool.query("CREATE TRIGGER deny_lab_document BEFORE INSERT ON patient_documents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture metadata failure'");
    const beforeCleanup = removed.length;
    await assert.rejects(() => service.publish({ id: rollback.id, version: rollback.version, actor }), /fixture metadata failure/);
    await pool.query('DROP TRIGGER deny_lab_document');
    assert.equal((await service.get(rollback.id)).published_version, null); assert.equal(removed.length, beforeCleanup + 1);
    // Exercise the exact legacy sync adapter on the isolated connection.
    require.cache[require.resolve('../../db')] = { exports: pool };
    require.cache[require.resolve('../../routes/patient-notifications')] = { exports: { createPatientNotification: async () => {} } };
    const sync = require('../../services/PatientDocumentSyncService');
    const connection = await pool.getConnection();
    await sync.mutatePenunjangDocuments(connection, { patientId: 'P001', mrId: 'DRD001', files: [], actorUserId: actor.id }); connection.release();
    const [[preserved]] = await pool.query("SELECT COUNT(*) AS total FROM patient_documents WHERE lab_report_id=? AND status='published'", [report.id]); assert.equal(preserved.total, 1);
    const pdf = await service.pdf(report.id); fs.writeFileSync(path.join(outputDir, 'lab-result.pdf'), pdf.buffer);
    const comparisonPdf = await service.pdf(report.id, { comparison: true }); fs.writeFileSync(path.join(outputDir, 'lab-comparison.pdf'), comparisonPdf.buffer);
    const longData = data(); longData.parameters = Array.from({ length: 75 }, (_, i) => ({ ...longData.parameters[0], name: `Parameter uji panjang ${i + 1} dengan deskripsi pemeriksaan`, code: `test${i}`, note: i % 3 === 0 ? 'Keterangan pemeriksaan dan konteks rujukan yang panjang untuk memeriksa pergantian halaman.' : '' }));
    fs.writeFileSync(path.join(outputDir, 'lab-multipage-draft.pdf'), await renderLabPdf({ data: longData, patient: { name: 'PASIEN UJI DENGAN NAMA PANJANG UNTUK VALIDASI TATA LETAK PDF', patient_id: 'P001', mr_id: 'DRD001', birth_date: '1998-01-01' }, draft: true, version: 3 }));
    assert.equal(flag({ reviewed: true, numeric_value: 10, reference: '12-15' }), 'L');
    await service.remove({ id: report.id, version: report.version, actor });
    await assert.rejects(() => service.get(report.id), /tidak ditemukan/);
    const [[deleted]] = await pool.query('SELECT status FROM patient_documents WHERE lab_report_id=?', [report.id]); assert.equal(deleted.status, 'deleted');
    const [[revisions]] = await pool.query('SELECT COUNT(*) AS total FROM lab_report_revisions WHERE report_id=?', [report.id]); assert.ok(revisions.total >= 5);
    console.log(JSON.stringify({ success: true, checks: ['scope','draft','publish','idempotency','correction','version-conflict','r2-failure','comparison','source-ownership','db-rollback','legacy-sync','pdf','soft-delete','audit','migration-idempotency'], pdf_directory: outputDir, notification_count: notifications.length }));
    if (process.argv.includes('--serve')) {
        process.env.JWT_SECRET = 'isolated-lab-qa-session-only';
        const express = require('express'); const jwt = require('jsonwebtoken');
        const { ROLE_IDS } = require('../../constants/roles');
        const token = jwt.sign({ ...actor, role_id: ROLE_IDS.DOKTER }, process.env.JWT_SECRET, { expiresIn: '2h' });
        const app = express(); app.use(express.json());
        app.get('/staff/public/scripts/vps-auth-v2.js', (_req, res) => res.type('js').send(`export const TOKEN_KEY='isolated_qa_token';export async function getIdToken(){return ${JSON.stringify(token)}}`));
        app.use('/staff/public', express.static(path.resolve(__dirname, '../../../public')));
        app.get('/qa-file/:key', (req, res) => { const buffer = buffers.get(req.params.key); if (!buffer) return res.sendStatus(404); res.type(req.params.key.endsWith('.pdf') ? 'pdf' : 'png').send(buffer); });
        app.use('/api/lab-reports', require('../../routes/lab-reports').createLabRouter({ service, extract: async args => ({
            parameters: [{ code: 'hb', name: 'Hemoglobin', raw_value: '9.370', unit: 'g/dL', reference: '12.0-15.5', panel: 'Darah Lengkap', origin: 'ocr', reviewed: false, source_id: args.sourceIds[0], source_page: 1 }], source_warnings: ['Fixture OCR: cocokkan identitas sumber.'], detected_names: ['PASIEN UJI SATU']
        }) }));
        app.get('/', (req, res) => res.type('html').send(`<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laboratorium QA Terisolasi</title></head><body style="margin:0"><button id="qa-remount">QA Kembali dari menu lain</button><button id="qa-switch">QA Buka hasil lain</button><div id="laboratorium-page"></div><script>window.hasAccountPermission=p=>${req.query.readonly === '1' ? "p==='lab_exam.view'" : 'true'};</script><script type="module">import {mountLaboratorium} from '/staff/public/scripts/pages/laboratorium.js'; const host=document.getElementById('laboratorium-page'); document.getElementById('qa-remount').onclick=()=>mountLaboratorium(host); document.getElementById('qa-switch').onclick=()=>mountLaboratorium(host,{reportId:${previous.id}}); await mountLaboratorium(host);</script></body></html>`));
        const server = app.listen(4023, '127.0.0.1', () => console.log('QA server ready at http://127.0.0.1:4023'));
        await new Promise(resolve => { process.once('SIGTERM', () => server.close(resolve)); process.once('SIGINT', () => server.close(resolve)); });
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
    if (pool) await pool.end();
    if (admin) { if (pool) await admin.query(`DROP DATABASE \`${database}\``); await admin.end(); }
});
