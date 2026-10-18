'use strict';

const crypto = require('crypto');
const { fail, text, assertVisit, assertVersion, normalizeReport, assertPublishable, compareReports, validateSourceIds } = require('./domain');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const positiveId = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) fail(400, 'INVALID_ID', 'ID laporan tidak valid.'); return id; };

class LabReportService {
    constructor(options = {}) {
        this.pool = options.pool || require('../../db');
        this.storage = options.storage || require('../r2Storage');
        this.renderPdf = options.renderPdf || ((...args) => require('./pdf').renderLabPdf(...args));
        this.notify = options.notify || (event => require('../../routes/patient-notifications').createPatientNotification(event));
        this.broadcast = options.broadcast || (patientId => require('../../realtime-sync').broadcastToRoom(`patient:${patientId}`, { type: 'document:patient_updated', document_type: 'lab_result' }));
        this.warn = options.warn || (() => require('../../utils/logger').warn('Lab report postcommit notification unavailable'));
    }
    async transaction(work) {
        const connection = await this.pool.getConnection();
        try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
        catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
    }
    actor(actor) {
        if (!actor?.id || actor.user_type === 'patient') fail(403, 'STAFF_REQUIRED', 'Akun staff wajib digunakan.');
        return text(actor.id, 50);
    }
    async visits({ search = '', patient_id = '' } = {}) {
        const term = `%${text(search, 100)}%`;
        const [rows] = await this.pool.query(`SELECT v.id AS visit_id, v.mr_id, v.patient_id, p.full_name AS patient_name,
            DATE_FORMAT(p.birth_date,'%Y-%m-%d') AS birth_date, DATE_FORMAT(v.created_at,'%Y-%m-%dT%H:%i') AS visit_date
            FROM sunday_clinic_records v JOIN patients p ON p.id=v.patient_id
            WHERE v.visit_location='klinik_private' AND (?='' OR v.patient_id=?)
            AND (p.full_name LIKE ? OR v.mr_id LIKE ? OR v.patient_id LIKE ?)
            ORDER BY v.created_at DESC, v.id DESC LIMIT 100`, [patient_id, patient_id, term, term, term]);
        return rows;
    }
    async visit(connection, mrId, patientId) {
        const [visits] = await connection.query('SELECT * FROM sunday_clinic_records WHERE mr_id=? ORDER BY id FOR UPDATE', [text(mrId, 20)]);
        return assertVisit(visits, patientId);
    }
    async raw(id, connection = this.pool, lock = false) {
        const [rows] = await connection.query(`SELECT r.*, p.full_name AS patient_name, p.address AS patient_address,
            DATE_FORMAT(p.birth_date,'%Y-%m-%d') AS birth_date, v.visit_location
            FROM lab_reports r JOIN sunday_clinic_records v ON v.id=r.visit_id AND v.patient_id=r.patient_id AND v.mr_id=r.mr_id
            JOIN patients p ON p.id=r.patient_id WHERE r.id=? AND r.status<>'deleted'${lock ? ' FOR UPDATE' : ''}`, [positiveId(id)]);
        if (!rows.length) fail(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan.');
        assertVisit(rows, rows[0].patient_id);
        return rows[0];
    }
    async list({ search = '', patient_id = '', mr_id = '' } = {}) {
        const term = `%${text(search, 100)}%`;
        const [rows] = await this.pool.query(`SELECT r.id,r.patient_id,r.mr_id,r.status,r.version,r.published_version,r.lab_number,
            r.updated_at,p.full_name AS patient_name,JSON_UNQUOTE(JSON_EXTRACT(r.report_data,'$.examined_at')) AS examined_at
            FROM lab_reports r JOIN patients p ON p.id=r.patient_id
            JOIN sunday_clinic_records v ON v.id=r.visit_id AND v.patient_id=r.patient_id AND v.mr_id=r.mr_id
            WHERE r.status<>'deleted' AND v.visit_location='klinik_private' AND (?='' OR r.patient_id=?) AND (?='' OR r.mr_id=?)
            AND (p.full_name LIKE ? OR r.mr_id LIKE ? OR r.lab_number LIKE ?) ORDER BY r.updated_at DESC,r.id DESC LIMIT 100`,
        [patient_id, patient_id, mr_id, mr_id, term, term, term]);
        return rows;
    }
    async present(row) {
        const data = parse(row.report_data);
        const sources = await Promise.all((data.sources || []).map(async source => ({
            id: source.id, name: source.name, type: source.type, size: source.size,
            url: await this.storage.getSignedDownloadUrl(source.key, 300)
        })));
        return { id: row.id, patient_id: row.patient_id, mr_id: row.mr_id, visit_id: row.visit_id,
            patient_name: row.patient_name, birth_date: row.birth_date, lab_number: row.lab_number,
            version: row.version, published_version: row.published_version, status: row.status,
            data: { ...data, sources }, published_data: row.published_data ? { ...parse(row.published_data), sources: undefined } : null };
    }
    async get(id) { return this.present(await this.raw(id)); }
    async ocrSources(id, sourceIds) {
        const row = await this.raw(id); const data = parse(row.report_data);
        if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 10 || sourceIds.some(sourceId => !data.sources.some(source => source.id === sourceId))) fail(400, 'INVALID_SOURCES', 'Pilih berkas sumber milik laporan ini.');
        const sources = sourceIds.map(sourceId => data.sources.find(source => source.id === sourceId));
        const files = await Promise.all(sources.map(async source => ({ buffer: await this.storage.getFileBuffer(source.key), mimetype: source.type, originalname: source.name })));
        return { files, sourceIds, patientName: row.patient_name, examinedAt: data.examined_at };
    }
    async revision(connection, row, action, data, actor) {
        await connection.query('INSERT INTO lab_report_revisions (report_id,version,action,snapshot,actor_id) VALUES (?,?,?,?,?)',
            [row.id, row.version, action, JSON.stringify(data), actor]);
    }
    async cleanup(keys) {
        await Promise.all(keys.map(key => this.storage.deleteFile(key).catch(() => {})));
    }
    async save({ id, patient_id, mr_id, data, version, files = [], upload_ids, client_request_id, actor }) {
        const actorId = this.actor(actor); const uploadedKeys = [];
        const sourceIds = upload_ids === undefined ? files.map(() => crypto.randomUUID()) : validateSourceIds(upload_ids, files.length);
        const normalizedInput = normalizeReport(data);
        const requestId = client_request_id || crypto.randomUUID();
        if (!id && !/^[a-f0-9-]{36}$/i.test(requestId)) fail(400, 'INVALID_REQUEST_ID', 'Identitas penyimpanan tidak valid.');
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ patient_id, mr_id, data: normalizedInput, sourceIds,
            files: files.map(file => ({ name: file.originalname, type: file.mimetype, sha: crypto.createHash('sha256').update(file.buffer).digest('hex') })) })).digest('hex');
        let reportId;
        try {
            reportId = await this.transaction(async connection => {
                let row;
                if (id) {
                    row = await this.raw(id, connection, true); assertVersion(row, version);
                    if (row.patient_id !== patient_id || row.mr_id !== mr_id) fail(409, 'REPORT_SCOPE_IMMUTABLE', 'Pasien dan DRD laporan tersimpan tidak dapat diganti. Buat laporan baru.');
                }
                const visit = await this.visit(connection, mr_id, patient_id);
                if (!id) {
                    const [[existing]] = await connection.query('SELECT id,client_payload_hash FROM lab_reports WHERE client_request_id=? FOR UPDATE', [requestId]);
                    if (existing) {
                        if (existing.client_payload_hash !== payloadHash) fail(409, 'CREATE_REPLAY_CHANGED', 'Draf sebelumnya sudah tersimpan. Buka daftar hasil sebelum mengubahnya lagi.');
                        return existing.id;
                    }
                }
                const previous = row ? parse(row.report_data) : { sources: [] };
                const normalized = normalizedInput;
                // Only server-owned source IDs from this report may be retained.
                const requestedIds = new Set(normalized.sources.map(s => s.id));
                normalized.sources = previous.sources.filter(s => requestedIds.has(s.id));
                const totalBytes = normalized.sources.reduce((sum, source) => sum + Number(source.size || 0), 0) + files.reduce((sum, file) => sum + file.buffer.length, 0);
                if (totalBytes > 30 * 1024 * 1024) fail(400, 'FILES_TOO_LARGE', 'Total seluruh berkas sumber maksimal 30 MB.');
                if (normalized.sources.length + files.length > 10) fail(400, 'TOO_MANY_SOURCES', 'Maksimal sepuluh berkas sumber.');
                const newSources = [];
                for (const [fileIndex, file] of files.entries()) {
                    const sourceId = sourceIds[fileIndex];
                    if (normalized.sources.some(source => source.id === sourceId)) fail(400, 'DUPLICATE_SOURCE', 'Identitas berkas sumber ganda.');
                    const uploaded = await this.storage.uploadFile(file.buffer, `${sourceId}.${file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.split('/')[1]}`, file.mimetype, 'lab-reports/sources');
                    uploadedKeys.push(uploaded.key);
                    newSources.push({ id: sourceId, key: uploaded.key, name: text(file.originalname, 160), type: file.mimetype, size: file.buffer.length });
                }
                normalized.sources.push(...newSources);
                normalized.parameters = normalized.parameters.map(p => {
                    const index = /^upload-(\d+)$/.exec(p.source_id);
                    if (index) return { ...p, source_id: newSources[Number(index[1]) - 1]?.id || '' };
                    return { ...p, source_id: normalized.sources.some(s => s.id === p.source_id) ? p.source_id : '' };
                });
                if (normalized.sources.length > 10) fail(400, 'TOO_MANY_SOURCES', 'Maksimal sepuluh berkas sumber.');
                if (row) {
                    row.version = Number(row.version) + 1;
                    await connection.query('UPDATE lab_reports SET report_data=?,version=?,updated_by=? WHERE id=?', [JSON.stringify(normalized), row.version, actorId, row.id]);
                } else {
                    const [result] = await connection.query(`INSERT INTO lab_reports (visit_id,patient_id,mr_id,report_data,created_by,updated_by,client_request_id,client_payload_hash) VALUES (?,?,?,?,?,?,?,?)`,
                        [visit.id, patient_id, mr_id, JSON.stringify(normalized), actorId, actorId, requestId, payloadHash]);
                    row = { id: result.insertId, version: 1 };
                }
                await this.revision(connection, row, 'save', normalized, actorId);
                return row.id;
            });
        } catch (error) { await this.cleanup(uploadedKeys); throw error; }
        return this.get(reportId);
    }
    async publish({ id, version, actor }) {
        const actorId = this.actor(actor); const uploadedKeys = [];
        let event;
        try {
            event = await this.transaction(async connection => {
                const row = await this.raw(id, connection, true); assertVersion(row, version);
                if (Number(row.published_version) === Number(row.version)) return { id: row.id, changed: false };
                const data = parse(row.report_data); assertPublishable(data);
                let labNumber = row.lab_number;
                if (!labNumber) {
                    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
                    await connection.query('INSERT INTO lab_report_sequences (date_key,last_number) VALUES (?,0) ON DUPLICATE KEY UPDATE date_key=VALUES(date_key)', [dateKey]);
                    const [[sequence]] = await connection.query('SELECT last_number FROM lab_report_sequences WHERE date_key=? FOR UPDATE', [dateKey]);
                    const number = Number(sequence.last_number) + 1;
                    await connection.query('UPDATE lab_report_sequences SET last_number=? WHERE date_key=?', [number, dateKey]);
                    labNumber = `LAB-${dateKey}-${String(number).padStart(4, '0')}`;
                }
                const patient = { name: row.patient_name, birth_date: row.birth_date, address: row.patient_address, patient_id: row.patient_id, mr_id: row.mr_id };
                const snapshot = { ...data, patient_snapshot: patient, lab_number: labNumber };
                const buffer = await this.renderPdf({ data: snapshot, patient, labNumber, version: row.version, draft: false });
                const uploaded = await this.storage.uploadFile(buffer, `${labNumber}-v${row.version}.pdf`, 'application/pdf', `lab-reports/${row.id}/v${row.version}`);
                uploadedKeys.push(uploaded.key);
                await connection.query(`UPDATE lab_reports SET status='published',lab_number=?,published_version=version,published_data=?,pdf_key=?,published_by=?,published_at=NOW() WHERE id=?`,
                    [labNumber, JSON.stringify(snapshot), uploaded.key, actorId, row.id]);
                await connection.query(`INSERT INTO patient_documents (patient_id,mr_id,lab_report_id,document_type,title,file_path,file_url,file_name,file_type,file_size,source_data,source,status,published_at,published_by,created_by)
                    VALUES (?,?,?,'lab_result',?,?,?,?, 'application/pdf',?,?,'clinic','published',NOW(),?,?)
                    ON DUPLICATE KEY UPDATE title=VALUES(title),file_path=VALUES(file_path),file_url=VALUES(file_url),file_name=VALUES(file_name),file_size=VALUES(file_size),source_data=VALUES(source_data),status='published',published_at=NOW(),published_by=VALUES(published_by),updated_by=VALUES(published_by)`,
                [row.patient_id, row.mr_id, row.id, `Hasil Lab ${data.examined_at.slice(0, 10)} - ${labNumber}`, uploaded.key, uploaded.key,
                    `${labNumber}.pdf`, buffer.length, JSON.stringify({ lab_report_id: row.id, version: row.version, examined_at: data.examined_at }), actorId, actorId]);
                await this.revision(connection, row, 'publish', snapshot, actorId);
                return { id: row.id, changed: true, patientId: row.patient_id, correction: Boolean(row.published_version) };
            });
        } catch (error) { await this.cleanup(uploadedKeys); throw error; }
        let notificationWarning = false;
        if (event.changed) {
            try {
                await this.notify({ patient_id: event.patientId, type: 'document', title: event.correction ? 'Hasil Lab Diperbarui' : 'Hasil Lab Baru',
                    message: 'Hasil laboratorium Anda telah tersedia.', link: '/hasil-lab.html', icon: 'fa fa-flask', icon_color: 'text-info' });
            } catch (_) { notificationWarning = true; this.warn(); }
            try { await this.broadcast(event.patientId); } catch (_) { this.warn(); }
        }
        return { ...(await this.get(event.id)), notification_warning: notificationWarning };
    }
    async remove({ id, version, actor }) {
        const actorId = this.actor(actor);
        const patientId = await this.transaction(async connection => {
            const row = await this.raw(id, connection, true); assertVersion(row, version);
            await this.revision(connection, row, 'delete', parse(row.report_data), actorId);
            await connection.query("UPDATE lab_reports SET status='deleted',version=version+1,updated_by=? WHERE id=?", [actorId, row.id]);
            await connection.query("UPDATE patient_documents SET status='deleted',updated_by=? WHERE lab_report_id=?", [actorId, row.id]);
            return row.patient_id;
        });
        try { await this.broadcast(patientId); } catch (_) { this.warn(); }
        return { success: true };
    }
    async comparison(id, previousId) {
        const row = await this.raw(id); const current = parse(row.report_data);
        const [candidates] = await this.pool.query(`SELECT id,lab_number,published_version,published_data FROM lab_reports
            WHERE patient_id=? AND status='published' AND id<>? AND published_data IS NOT NULL
            AND JSON_UNQUOTE(JSON_EXTRACT(published_data,'$.examined_at'))<=?
            ORDER BY JSON_UNQUOTE(JSON_EXTRACT(published_data,'$.examined_at')) DESC,id DESC LIMIT 100`, [row.patient_id, row.id, current.examined_at]);
        const previous = previousId ? candidates.find(c => Number(c.id) === positiveId(previousId)) : candidates[0];
        if (previousId && !previous) fail(400, 'INVALID_COMPARISON', 'Pembanding harus hasil terdahulu pasien yang sama.');
        const previousData = previous ? parse(previous.published_data) : null;
        return { report: await this.present(row), previous: previous ? { id: previous.id, lab_number: previous.lab_number, examined_at: previousData.examined_at } : null,
            candidates: candidates.map(c => ({ id: c.id, lab_number: c.lab_number, examined_at: parse(c.published_data).examined_at })), rows: compareReports(current, previousData) };
    }
    async pdf(id, { comparison = false, previousId } = {}) {
        const row = await this.raw(id); const data = parse(row.report_data);
        const result = comparison ? await this.comparison(id, previousId) : null;
        if (comparison && !result.previous) fail(400, 'NO_COMPARISON', 'Belum ada hasil terstruktur sebelumnya.');
        const draft = Number(row.published_version) !== Number(row.version);
        const patient = { name: row.patient_name, birth_date: row.birth_date, address: row.patient_address, patient_id: row.patient_id, mr_id: row.mr_id };
        const buffer = await this.renderPdf({ data, patient, labNumber: row.lab_number, version: row.version, draft, comparison: result });
        return { buffer, filename: `${comparison ? 'Komparasi' : 'Lab'}-${row.lab_number || `Draf-${row.id}`}-v${row.version}.pdf` };
    }
}
module.exports = { LabReportService };
