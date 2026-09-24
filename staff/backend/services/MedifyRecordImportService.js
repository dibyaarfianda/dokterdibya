'use strict';

const records = require('./MedicalRecordService');
const { createPatientNotification } = require('../routes/patient-notifications');
const logger = require('../utils/logger');

const SOURCES = new Set(['rsia_melinda', 'rsud_gambiran']);
const clean = value => JSON.parse(JSON.stringify(value));

function convertDateFormat(value) {
    if (!value) return null;
    const match = String(value).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (!match) return value;
    let [, day, month, year] = match;
    if (year.length === 2) year = (Number(year) > 50 ? '19' : '20') + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function buildSections(parsedData, now = new Date()) {
    const source = parsedData || {};
    const stamp = now.toISOString().slice(0, 16);
    const sections = [];
    const add = (recordType, data, enabled) => { if (enabled) sections.push({ recordType, data: clean(data) }); };
    add('anamnesa', {
        record_datetime: stamp,
        keluhan_utama: source.subjective?.keluhan_utama,
        riwayat_kehamilan_saat_ini: source.subjective?.rps,
        detail_riwayat_penyakit: source.subjective?.rpd,
        riwayat_keluarga: source.subjective?.rpk,
        hpht: convertDateFormat(source.subjective?.hpht),
        hpl: convertDateFormat(source.subjective?.hpl),
        gravida: source.assessment?.gravida ?? source.subjective?.gravida,
        para: source.assessment?.para ?? source.subjective?.para,
        abortus: source.assessment?.abortus ?? source.subjective?.abortus,
        anak_hidup: source.assessment?.anak_hidup ?? source.subjective?.anak_hidup
    }, true);
    const physical = {
        record_datetime: stamp, keadaan_umum: source.objective?.keadaan_umum,
        tensi: source.objective?.tensi, nadi: source.objective?.nadi, suhu: source.objective?.suhu,
        spo2: source.objective?.spo2, rr: source.objective?.rr, gcs: source.objective?.gcs,
        tinggi_badan: source.objective?.tinggi_badan || source.identity?.tinggi_badan,
        berat_badan: source.objective?.berat_badan || source.identity?.berat_badan
    };
    add('physical_exam', physical, Boolean(physical.tensi || physical.nadi || physical.suhu || physical.keadaan_umum ||
        physical.tinggi_badan || physical.berat_badan));
    add('pemeriksaan_obstetri', { record_datetime: stamp, ...source.objective },
        Boolean(source.objective && Object.keys(source.objective).length));
    const usg = {
        record_datetime: stamp, hasil_usg: source.objective?.usg,
        berat_janin: source.objective?.berat_janin,
        presentasi: source.objective?.presentasi || source.assessment?.presentasi,
        plasenta: source.objective?.plasenta, ketuban: source.objective?.ketuban
    };
    add('usg', usg, Boolean(usg.hasil_usg || usg.berat_janin || usg.presentasi));
    const penunjang = { record_datetime: stamp, hasil_lab: source.objective?.hasil_lab,
        catatan: source.objective?.catatan_penunjang };
    add('penunjang', penunjang, Boolean(penunjang.hasil_lab));
    add('diagnosis', { record_datetime: stamp, ...source.assessment },
        Boolean(source.assessment && Object.keys(source.assessment).length));
    add('planning', { record_datetime: stamp, ...source.plan }, Boolean(source.plan && Object.keys(source.plan).length));
    return sections;
}

class MedifyRecordImportService {
    constructor(dependencies = {}) {
        this.records = dependencies.records || records;
        this.notify = dependencies.notify || createPatientNotification;
    }

    async saveParsedRecord({ patientId, source, parsedData, actor }) {
        if (!SOURCES.has(source)) throw new Error('Invalid Medify source');
        if (!patientId || !parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
            throw new Error('Invalid Medify patient or sections');
        }
        const sections = buildSections(parsedData);
        const result = await this.records.saveInternalSections({
            patientId, actor: actor || { id: 'medify-sync', name: 'Medify Sync' }, sections,
            resolveVisit: async connection => {
                const [patients] = await connection.query('SELECT id FROM patients WHERE id = ? FOR UPDATE', [patientId]);
                if (patients.length !== 1) throw new Error('Medify patient not found');
                const [visits] = await connection.query(
                    `SELECT id, mr_id FROM sunday_clinic_records WHERE patient_id = ? AND visit_location = ?
                     ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`, [patientId, source]);
                if (visits.length) return { mrId: visits[0].mr_id, patientId };
                const [advanced] = await connection.query(
                    `UPDATE sunday_clinic_mr_counters SET current_sequence = current_sequence + 1 WHERE category = 'unified'`);
                if (advanced.affectedRows !== 1) throw new Error('MR counter unavailable');
                const [counter] = await connection.query(
                    `SELECT current_sequence FROM sunday_clinic_mr_counters WHERE category = 'unified'`);
                const sequence = Number(counter[0]?.current_sequence);
                if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error('MR counter invalid');
                const mrId = `DRD${String(sequence).padStart(4, '0')}`;
                const now = new Date();
                const day = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
                await connection.query(
                    `INSERT INTO sunday_clinic_records
                     (mr_id, mr_sequence, patient_id, visit_location, import_source, folder_path, created_at, last_activity_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [mrId, sequence, patientId, source, `medify_${source}`, `${day}-${sequence}_${patientId}`]);
                return { mrId, patientId };
            },
            afterSections: (connection, { visit }) => connection.query(
                'UPDATE sunday_clinic_records SET last_activity_at = NOW() WHERE id = ?', [visit.id])
        });
        return { mrId: result.mrId, recordsSaved: result.data.length };
    }

    async publishResume({ patientId, mrId, resume, patientName, actor }) {
        if (!patientId || !mrId || !resume) throw new Error('Complete resume scope required');
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' });
        const title = `Resume Medis - ${patientName} - ${dateStr}`;
        const sourceData = JSON.stringify({ content: resume, generatedAt: now.toISOString() });
        await this.records.saveInternalSections({
            patientId, mrId, actor: actor || { id: 'medify-sync', name: 'Medify Sync' },
            sections: [{ recordType: 'resume_medis', data: { resume, saved_at: now.toISOString() } }],
            mutateDocuments: async (connection, row) => {
                const [documents] = await connection.query(
                    `SELECT id FROM patient_documents WHERE patient_id = ? AND mr_id = ? AND document_type = 'resume_medis'
                     ORDER BY id FOR UPDATE`, [row.patient_id, row.mr_id]);
                if (documents.length > 1) throw new Error('Ambiguous resume publication');
                if (documents.length) {
                    await connection.query(
                        `UPDATE patient_documents SET title = ?, file_url = ?, file_name = ?, source_data = ?, file_type = 'text/plain',
                         status = 'published', source = 'clinic', published_at = NOW(), updated_at = NOW()
                         WHERE id = ? AND patient_id = ? AND mr_id = ?`,
                        [title, `resume:${mrId}`, `resume_${mrId}.txt`, sourceData,
                            documents[0].id, row.patient_id, row.mr_id]);
                } else {
                    await connection.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_name, file_type, source_data,
                          status, source, description, created_at)
                         VALUES (?, ?, 'resume_medis', ?, ?, ?, 'text/plain', ?, 'published', 'clinic',
                          'Auto-generated from MEDIFY sync', NOW())`,
                        [row.patient_id, row.mr_id, title, `resume:${mrId}`, `resume_${mrId}.txt`, sourceData]);
                }
            }
        });
        try {
            await this.notify({ patient_id: patientId, type: 'document', title: 'Resume Medis Baru',
                message: 'Resume medis kunjungan telah tersedia di portal Anda.' });
        } catch (_) { logger.warn('Medify postcommit notification failed', { count: 1 }); }
        return true;
    }
}

module.exports = new MedifyRecordImportService();
module.exports.MedifyRecordImportService = MedifyRecordImportService;
module.exports.buildSections = buildSections;
