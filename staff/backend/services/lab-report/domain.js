'use strict';

const fail = (status, code, message) => { const error = new Error(message); Object.assign(error, { status, code }); throw error; };
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const aliases = {
    hemoglobin: 'hb', hemoglobinhb: 'hb', hemoglobinhgb: 'hb', haemoglobin: 'hb', hgb: 'hb', hb: 'hb', eritrosit: 'rbc', erytrosit: 'rbc', rbc: 'rbc',
    leukosit: 'wbc', leucosit: 'wbc', wbc: 'wbc', hematokrit: 'hct', hct: 'hct',
    trombosit: 'platelets', thrombosit: 'platelets', plt: 'platelets', platelets: 'platelets',
    sgot: 'ast', sgotast: 'ast', ast: 'ast', sgpt: 'alt', sgptalt: 'alt', alt: 'alt', bun: 'bun', ureum: 'urea', urea: 'urea',
    sk: 'creatinine', kreatinin: 'creatinine', kreatininserumsk: 'creatinine', serumkreatinin: 'creatinine', kreatininserum: 'creatinine', creatinine: 'creatinine',
    gda: 'glucose_random', guladarahacak: 'glucose_random', guladarahsewaktu: 'glucose_random',
    golongandarah: 'blood_group', rhesus: 'rhesus', hbsag: 'hbsag', hiv: 'hiv',
    syphilis: 'syphilis', shyphilis: 'syphilis', sifilis: 'syphilis'
};
function canonicalCode(value) {
    const clean = text(value, 100).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return aliases[clean] || clean || 'other';
}
function assertVisit(visits, patientId) {
    if (!visits.length) fail(404, 'VISIT_NOT_FOUND', 'DRD tidak ditemukan.');
    if (visits.length !== 1) fail(409, 'AMBIGUOUS_VISIT', 'DRD ambigu; perlu rekonsiliasi kunjungan.');
    const visit = visits[0];
    if (String(visit.patient_id) !== String(patientId)) fail(409, 'PATIENT_MISMATCH', 'DRD tidak sesuai pasien yang dipilih.');
    if (visit.visit_location !== 'klinik_private') fail(400, 'PRIVATE_CLINIC_REQUIRED', 'Hanya DRD Klinik Privat yang dapat dipilih.');
    return visit;
}
function numericValue(raw) {
    const value = raw.replace(/\s/g, '');
    if (!/^-?\d+(?:[.,]\d+)?$/.test(value) || /^-?\d{1,3}[.,]\d{3}$/.test(value)) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}
function normalizeReport(input = {}) {
    if (!Array.isArray(input.parameters) || input.parameters.length > 150) fail(400, 'INVALID_PARAMETERS', 'Daftar parameter tidak valid (maksimal 150).');
    const examinedAt = text(input.examined_at, 40);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(examinedAt) || !Number.isFinite(Date.parse(`${examinedAt}:00+07:00`))) {
        fail(400, 'INVALID_DATE', 'Tanggal dan waktu pemeriksaan wajib diisi.');
    }
    const dateParts = examinedAt.match(/\d+/g).map(Number);
    const calendar = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4]));
    if (calendar.getUTCFullYear() !== dateParts[0] || calendar.getUTCMonth() !== dateParts[1] - 1 || calendar.getUTCDate() !== dateParts[2] || calendar.getUTCHours() !== dateParts[3] || calendar.getUTCMinutes() !== dateParts[4]) fail(400, 'INVALID_DATE', 'Tanggal pemeriksaan tidak valid.');
    const parameters = input.parameters.map((p) => {
        if (!p || typeof p !== 'object' || Array.isArray(p)) fail(400, 'INVALID_PARAMETER', 'Data parameter tidak valid.');
        const raw = text(p.raw_value, 100);
        const parsed = numericValue(raw);
        const ambiguous = /^-?\d{1,3}[.,]\d{3}$/.test(raw);
        const override = ambiguous && p.numeric_confirmed_for === raw && p.reviewed === true && p.numeric_value !== '' && p.numeric_value !== null && p.numeric_value !== undefined
            ? Number(p.numeric_value) : null;
        const value = override !== null && Number.isFinite(override) ? override : parsed;
        return {
            code: canonicalCode(p.code?.startsWith('custom_') ? p.name : p.code || p.name), name: text(p.name, 100), panel: text(p.panel || 'Lainnya', 80),
            raw_value: raw, numeric_value: value, unit: text(p.unit, 60), reference: text(p.reference, 250),
            numeric_confirmed_for: ambiguous && value !== null ? raw : '',
            reference_context: text(p.reference_context, 100), note: text(p.note, 500),
            origin: p.origin === 'ocr' ? 'ocr' : 'manual', reviewed: p.reviewed === true,
            needs_review: (ambiguous && value === null) || (p.origin === 'ocr' && p.reviewed !== true),
            source_id: text(p.source_id, 80), source_page: Number.isInteger(p.source_page) ? p.source_page : null
        };
    });
    return {
        examined_at: examinedAt, technician: text(input.technician, 150), license: text(input.license, 150),
        doctor: text(input.doctor || 'dr. Dibya Arfianda, Sp.OG', 150), request_time: text(input.request_time, 50),
        notes: text(input.notes, 3000), parameters, sources: Array.isArray(input.sources) ? input.sources : [],
        source_warnings: Array.isArray(input.source_warnings) ? input.source_warnings.map(x => text(x, 300)).slice(0, 30) : [],
        identity_resolved: input.identity_resolved === true, review_confirmed: input.review_confirmed === true
    };
}
function assertPublishable(data) {
    if (!data.parameters.length || !data.parameters.some(p => p.raw_value)) fail(400, 'EMPTY_REPORT', 'Isi minimal satu parameter hasil.');
    if (data.parameters.some(p => !p.name || !p.raw_value)) fail(400, 'EMPTY_PARAMETER', 'Lengkapi atau hapus parameter tanpa hasil.');
    if (data.source_warnings.length && !data.identity_resolved) fail(400, 'SOURCE_REVIEW_REQUIRED', 'Selesaikan perbedaan identitas/tanggal sumber terlebih dahulu.');
    if (!data.review_confirmed || data.parameters.some(p => !p.reviewed || p.needs_review)) fail(400, 'REVIEW_REQUIRED', 'Periksa dan konfirmasi seluruh hasil sebelum diterbitkan.');
    if (!data.technician || !data.license) fail(400, 'ISSUER_REQUIRED', 'Nama petugas dan nomor izin wajib diisi.');
    if (new Set(data.parameters.map(p => p.code)).size !== data.parameters.length) fail(400, 'DUPLICATE_PARAMETER', 'Parameter ganda perlu diperiksa.');
}
function flag(parameter) {
    if (!parameter.reviewed || parameter.numeric_value === null) return '';
    const range = parameter.reference.replace(/,/g, '.').match(/^\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!range) return '';
    const low = Number(range[1]); const high = Number(range[2]);
    if (low > high) return '';
    return parameter.numeric_value < low ? 'L' : parameter.numeric_value > high ? 'H' : '';
}
function compareReports(current, previous) {
    const before = new Map((previous?.parameters || []).map(p => [p.code, p]));
    return current.parameters.map(p => {
        const old = before.get(p.code);
        const comparable = old && p.unit.trim() && p.unit.trim().toLowerCase() === old.unit.trim().toLowerCase()
            && p.numeric_value !== null && old.numeric_value !== null;
        return { ...p, previous: old || null, delta: comparable ? Number((p.numeric_value - old.numeric_value).toFixed(6)) : null };
    });
}
function assertVersion(row, version) {
    if (!Number.isSafeInteger(Number(version)) || Number(version) < 1) fail(428, 'VERSION_REQUIRED', 'Versi laporan wajib dikirim.');
    if (Number(row.version) !== Number(version)) fail(409, 'VERSION_CONFLICT', 'Laporan berubah. Muat ulang sebelum menyimpan.');
}
function validateSourceIds(ids, length) {
    if (!Array.isArray(ids) || ids.length !== length || ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) || new Set(ids).size !== ids.length) {
        fail(400, 'INVALID_SOURCE_IDS', 'Identitas berkas sumber tidak valid. Pilih ulang berkas.');
    }
    return ids;
}
module.exports = { fail, text, canonicalCode, assertVisit, normalizeReport, assertPublishable, compareReports, assertVersion, numericValue, flag, validateSourceIds };
