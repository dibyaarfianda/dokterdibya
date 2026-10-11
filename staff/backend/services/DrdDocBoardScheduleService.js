'use strict';

const db = require('../db');
const defaultSurgeryService = require('./SurgeryService');
const defaultDocBoardService = require('./DocBoardService');
const defaultPushService = require('./DocBoardPushService');
const defaultRulesService = require('./DocBoardCommandCenter');
const { parseScheduleMessage, validDate } = require('./AssistantDafParsing');

const PROCEDURE_CATEGORIES = Object.freeze([
  'Pasang IUD',
  'Lepas Pasang IUD',
  'Lepas IUD',
  'Pasang Implan',
  'Lepas Pasang Implan',
  'Lepas Implan',
  'Cuci Vagina',
  'Pap Smear/IVA',
  'Stripping Membrane',
  'Induksi Foley Balon',
  'USG VK',
  'USG Poli',
]);

const LOCATIONS = Object.freeze([
  { value: 'klinik_private', label: 'Klinik Privat', procedureLabel: 'Klinik Privat' },
  { value: 'rsia_melinda', label: 'RSIA Melinda', procedureLabel: 'Melinda' },
  { value: 'rsud_gambiran', label: 'RSUD Gambiran', procedureLabel: 'Gambiran' },
  { value: 'rs_bhayangkara', label: 'RS Bhayangkara', procedureLabel: 'Bhayangkara' },
]);

const PROCEDURE_PATTERNS = Object.freeze([
  ['Lepas Pasang IUD', /\blepas\s*(?:(?:dan|\/)\s*)?pasang\s+iud\b/i],
  ['Lepas IUD', /\blepas\s+iud\b/i],
  ['Pasang IUD', /\bpasang\s+iud\b/i],
  ['Lepas Pasang Implan', /\blepas\s*(?:dan\s*)?pasang\s+implan\b/i],
  ['Lepas Implan', /\blepas\s+implan\b/i],
  ['Pasang Implan', /\bpasang\s+implan\b/i],
  ['Cuci Vagina', /\bcuci\s+vagina\b/i],
  ['Pap Smear/IVA', /\b(?:pap\s*smear|iva)\b/i],
  ['Stripping Membrane', /\bstripping(?:\s+(?:of\s+)?membrane)?\b/i],
  ['Induksi Foley Balon', /\b(?:induksi\s+)?foley\s*(?:balon|balloon)?\b/i],
  ['USG VK', /\busg\s+vk\b/i],
  ['USG Poli', /\busg\s+poli\b/i],
]);

const PROCEDURE_ONLY_OPERATION_CODES = new Set([
  'P-IUD', 'L-IUD', 'LP-IUD', 'IUD',
  'P-IMP', 'L-IMP', 'LP-IMP', 'IMP',
  'CUCI-VAGINA', 'PAP-SMEAR', 'IVA',
  'STRIPPING', 'STRIPPING-MEMBRANE',
  'FOLEY', 'FOLEY-BALLOON',
  'USG-VK', 'USG-POLI',
]);

const PROCEDURE_ONLY_OPERATION_LABELS = Object.freeze([
  /^(?:pasang|lepas|lepas pasang)\s+iud$/,
  /^iud$/,
  /^(?:pasang|lepas|lepas pasang)\s+implan(?:t)?$/,
  /^cuci vagina$/,
  /^(?:pap smear(?: iva)?|iva)$/,
  /^stripping(?: of)? membrane$/,
  /^(?:induksi )?foley(?: balon| balloon)?$/,
  /^usg (?:vk|poli)$/,
]);

const LOCATION_FROM_PARSER = Object.freeze({
  'Klinik Privat': 'klinik_private',
  Melinda: 'rsia_melinda',
  Gambiran: 'rsud_gambiran',
  Bhayangkara: 'rs_bhayangkara',
});

class DrdDocBoardScheduleError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function fail(statusCode, code, message) {
  throw new DrdDocBoardScheduleError(statusCode, code, message);
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function textValue(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return String(value.text || value.name || value.diagnosis || '').trim();
  return String(value || '').trim();
}

function buildDiagnosisText(diagnosis = {}) {
  const primary = textValue(diagnosis.diagnosis_utama || diagnosis.diagnosis || diagnosis.primary_diagnosis);
  const secondary = textValue(diagnosis.diagnosis_sekunder);
  if (primary || secondary) return [primary, secondary].filter(Boolean).join('\n');
  if (Array.isArray(diagnosis.diagnoses)) {
    return diagnosis.diagnoses.map(textValue).filter(Boolean).join('\n');
  }
  return '';
}

function recordRank(row) {
  const version = Number(row.version || 0);
  const timestamp = Date.parse(row.updated_at || row.created_at || '') || 0;
  return [Number.isFinite(version) ? version : 0, timestamp, Number(row.id || 0)];
}

function selectLatestSections(rows = []) {
  const sorted = [...rows].sort((first, second) => {
    const a = recordRank(first);
    const b = recordRank(second);
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  });
  const byType = {};
  for (const row of sorted) {
    if (!row?.record_type || byType[row.record_type]) continue;
    byType[row.record_type] = { ...row, data: parseJson(row.record_data) };
  }
  return byType;
}

function dateParts(value) {
  const normalized = value instanceof Date && !Number.isNaN(value.getTime()) ? jakartaDate(value) : String(value || '');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const text = `${match[1]}-${match[2]}-${match[3]}`;
  if (!validDate(text)) return null;
  return { text, ms: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) };
}

function addDays(dateText, days) {
  const parsed = dateParts(dateText);
  if (!parsed) return '';
  return new Date(parsed.ms + days * 86400000).toISOString().slice(0, 10);
}

function diffDays(from, to) {
  const start = dateParts(from);
  const end = dateParts(to);
  if (!start || !end) return null;
  return Math.round((end.ms - start.ms) / 86400000);
}

function parseSavedGestationalDays(value) {
  const text = String(value || '').trim();
  const words = text.match(/(\d{1,2})\s*minggu(?:\s*(\d)\s*hari)?/i);
  const compact = text.match(/\b(\d{1,2})\s*[+]\s*(\d)\b/);
  const match = words || compact;
  if (!match) return null;
  const weeks = Number(match[1]);
  const days = Number(match[2] || 0);
  if (weeks > 45 || days > 6) return null;
  return weeks * 7 + days;
}

function gestationalResult(totalDays, source) {
  if (!Number.isInteger(totalDays) || totalDays < 0 || totalDays > 315) {
    return { label: '', weeks: null, days: null, source: '', warning: 'Usia kehamilan perlu diverifikasi.' };
  }
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return { label: `${weeks} minggu ${days} hari`, weeks, days, source, warning: '' };
}

function projectGestationalAge(anamnesa = {}, scheduleDate, options = {}) {
  if (!options.pregnant || !dateParts(scheduleDate)) {
    return { label: '', weeks: null, days: null, source: '', warning: '' };
  }

  const candidates = [];
  const hpht = dateParts(anamnesa.hpht);
  const hpl = dateParts(anamnesa.hpl);
  if (hpht) candidates.push({ source: 'hpht', days: diffDays(hpht.text, scheduleDate) });
  if (hpl) candidates.push({ source: 'hpl', days: 280 - diffDays(scheduleDate, hpl.text) });

  const savedDays = parseSavedGestationalDays(anamnesa.usia_kehamilan);
  const sourceDate = dateParts(anamnesa.record_datetime || anamnesa.record_date || options.sourceDate);
  if (savedDays !== null && sourceDate) {
    candidates.push({ source: 'usia_kehamilan', days: savedDays + diffDays(sourceDate.text, scheduleDate) });
  }

  if (!candidates.length || candidates.some((candidate) => !Number.isInteger(candidate.days) || candidate.days < 0 || candidate.days > 315)) {
    return { label: '', weeks: null, days: null, source: '', warning: 'Usia kehamilan perlu diverifikasi.' };
  }

  const preferred = candidates.find((candidate) => candidate.source === 'hpht')
    || candidates.find((candidate) => candidate.source === 'hpl')
    || candidates[0];
  if (candidates.some((candidate) => Math.abs(candidate.days - preferred.days) > 7)) {
    return { label: '', weeks: null, days: null, source: '', warning: 'Usia kehamilan perlu diverifikasi.' };
  }
  return gestationalResult(preferred.days, preferred.source);
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function operationMatches(text, operationTypes = []) {
  const normalizedText = ` ${normalizeSearch(text)} `;
  if (!normalizedText.trim()) return [];
  return operationTypes.filter((type) => {
    const candidates = [type.code, type.name_id, type.name]
      .map(normalizeSearch)
      .filter((value) => value.length >= 2 && value !== 'other op' && value !== 'lainnya');
    return candidates.some((candidate) => normalizedText.includes(` ${candidate} `));
  }).map((type) => Number(type.id)).filter(Number.isInteger);
}

function parsePlanningSuggestions(rencana, now = new Date(), operationTypes = []) {
  const text = textValue(rencana);
  const parsed = parseScheduleMessage(text, now);
  const explicitDates = [...text.matchAll(/\b(?:20\d\d-\d\d-\d\d|\d{1,2}[/-]\d{1,2}[/-]20\d\d)\b/g)].length;
  const relativeDates = ['hari ini', 'besok', 'lusa'].filter((label) => new RegExp(`\\b${label}\\b`, 'i').test(text)).length;
  const scheduleDate = explicitDates + relativeDates > 1 ? '' : parsed.schedule_date;
  let procedureScanText = text;
  const procedures = [];
  for (const [category, pattern] of PROCEDURE_PATTERNS) {
    const match = procedureScanText.match(pattern);
    if (!match) continue;
    procedures.push(category);
    if (category.startsWith('Lepas Pasang')) {
      procedureScanText = `${procedureScanText.slice(0, match.index)} ${procedureScanText.slice(match.index + match[0].length)}`;
    }
  }
  const operationTypeIds = operationMatches(text, operationTypes);
  const procedureCategory = procedures.length === 1 ? procedures[0] : '';
  const kind = procedureCategory && !operationTypeIds.length ? 'procedure'
    : operationTypeIds.length && !procedureCategory ? 'surgery' : '';
  const warnings = [];
  if (!scheduleDate && text) warnings.push('Tanggal dari Rencana belum jelas.');
  if (!parsed.start_time && text) warnings.push('Jam dari Rencana belum jelas.');
  if (!parsed.location && text) warnings.push('Lokasi dari Rencana belum jelas.');
  if (procedures.length > 1) warnings.push('Lebih dari satu jenis tindakan terdeteksi.');
  if (procedureCategory && operationTypeIds.length) warnings.push('Rencana memuat operasi dan tindakan; pilih tujuan secara manual.');
  return {
    scheduleDate: scheduleDate || '',
    scheduleTime: parsed.start_time || '',
    location: LOCATION_FROM_PARSER[parsed.location] || '',
    kind,
    procedureCategory,
    operationTypeIds,
    warnings,
  };
}

function jakartaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function calculateAge(birthDate, today) {
  const birth = dateParts(birthDate);
  const current = dateParts(today);
  if (!birth || !current || birth.ms > current.ms) return null;
  const [by, bm, bd] = birth.text.split('-').map(Number);
  const [cy, cm, cd] = current.text.split('-').map(Number);
  return cy - by - (cm < bm || (cm === bm && cd < bd) ? 1 : 0);
}

function labSummary(lab = {}) {
  if (Array.isArray(lab.results)) {
    return lab.results.map((row) => {
      const name = row.test_name || row.name || '';
      const value = row.value ?? row.result ?? '';
      return `${name}: ${value}${row.unit ? ` ${row.unit}` : ''}`.trim();
    }).filter((line) => line !== ':').join('\n');
  }
  return textValue(lab.summary || lab.interpretation);
}

function usgSummary(usg = {}) {
  const parts = [];
  if (usg.usg_type) parts.push(`Tipe: ${usg.usg_type}`);
  if (usg.gestational_age_weeks !== undefined && usg.gestational_age_weeks !== '') {
    parts.push(`UK: ${usg.gestational_age_weeks}w${usg.gestational_age_days ? `${usg.gestational_age_days}d` : ''}`);
  }
  if (usg.efw) parts.push(`EFW: ${usg.efw}g`);
  if (usg.findings) parts.push(textValue(usg.findings));
  return parts.join(', ');
}

class DrdDocBoardRepository {
  constructor(pool = db) {
    this.db = pool;
  }

  async loadSnapshot(mrId, today) {
    const [visits] = await this.db.query(
      `SELECT scr.id, scr.mr_id, scr.patient_id, scr.mr_category, scr.visit_location,
              scr.created_at, scr.updated_at, p.full_name, p.birth_date, p.age, p.allergy, p.is_pregnant
         FROM sunday_clinic_records scr
         LEFT JOIN patients p ON p.id = scr.patient_id
        WHERE scr.mr_id = ?
        ORDER BY scr.id DESC
        LIMIT 2`,
      [mrId],
    );
    if (!visits.length) return null;
    if (visits.length > 1) fail(409, 'AMBIGUOUS_DRD', 'DRD terhubung ke lebih dari satu kunjungan.');
    const visit = visits[0];
    const [[medicalRows], [operationTypes]] = await Promise.all([
      this.db.query(
        `SELECT id, patient_id, mr_id, record_type, record_data, version, created_at, updated_at
           FROM medical_records
          WHERE mr_id = ? AND patient_id = ?
            AND record_type IN ('anamnesa','planning','diagnosis','lab','usg','physical_exam')
          ORDER BY version DESC, updated_at DESC, created_at DESC, id DESC`,
        [mrId, visit.patient_id],
      ),
      this.db.query(
        `SELECT id, code, name, name_id, category, sort_order
           FROM surgery_operation_types
          WHERE is_active = 1
          ORDER BY category, sort_order, id`,
      ),
    ]);
    const sections = selectLatestSections(medicalRows);
    return {
      mrId,
      patient: {
        id: visit.patient_id,
        name: visit.full_name || '',
        age: visit.age ?? calculateAge(visit.birth_date, today),
        allergy: visit.allergy || '',
        isPregnant: visit.is_pregnant === 1 || visit.is_pregnant === true,
      },
      visit: {
        category: visit.mr_category || '',
        location: visit.visit_location || '',
        createdAt: visit.created_at,
      },
      planning: sections.planning?.data || {},
      diagnosis: sections.diagnosis?.data || {},
      anamnesa: sections.anamnesa?.data || {},
      anamnesaRecordedAt: sections.anamnesa?.updated_at || sections.anamnesa?.created_at || null,
      labResults: labSummary(sections.lab?.data || {}),
      usgResults: usgSummary(sections.usg?.data || {}),
      operationTypes,
    };
  }

  async findExistingSurgery({ mrId, scheduleDate, location }) {
    const [rows] = await this.db.query(
      `SELECT id FROM surgery_schedules
        WHERE mr_id = ? AND surgery_date = ? AND location = ? AND status <> 'cancelled'
        ORDER BY id DESC LIMIT 1`,
      [mrId, scheduleDate, location],
    );
    return rows[0] || null;
  }

  async findExistingProcedure({ mrId, patientFacility, category, scheduleDate }) {
    const [rows] = await this.db.query(
      `SELECT * FROM docboard_space_schedules
        WHERE space = 'tindakan' AND patient_ref_type = 'drd' AND patient_ref_value = ?
          AND patient_facility = ? AND category = ? AND schedule_date = ? AND status <> 'cancelled'
        ORDER BY id DESC LIMIT 1`,
      [mrId, patientFacility, category, scheduleDate],
    );
    return rows[0] || null;
  }
}

function pregnancyLikely(snapshot, diagnosisText) {
  return snapshot.patient?.isPregnant === true
    || snapshot.visit?.category === 'obstetri'
    || Boolean(snapshot.anamnesa?.hpl || snapshot.anamnesa?.usia_kehamilan)
    || /\b(?:hamil|kehamilan|gravida|trimester|g\d+\s*p\d+)\b/i.test(diagnosisText);
}

function procedureLocation(location) {
  return LOCATIONS.find((item) => item.value === location)?.procedureLabel || '';
}

function operationLabel(type) {
  return textValue(type?.code || type?.name_id || type?.name);
}

function isOtherOperationType(type) {
  return String(type?.code || '').trim().toUpperCase() === 'OTHER-OP';
}

function normalizeOperationLabel(value) {
  return textValue(value).toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProcedureOnlyOperationLabel(value) {
  const label = normalizeOperationLabel(value);
  return Boolean(label) && PROCEDURE_ONLY_OPERATION_LABELS.some((pattern) => pattern.test(label));
}

function isProcedureOnlyOperationType(type) {
  const code = String(type?.code || '').trim().toUpperCase();
  return PROCEDURE_ONLY_OPERATION_CODES.has(code)
    || isProcedureOnlyOperationLabel(type?.name)
    || isProcedureOnlyOperationLabel(type?.name_id);
}

class DrdDocBoardScheduleService {
  constructor(options = {}) {
    this.repository = options.repository || new DrdDocBoardRepository(options.db || db);
    this.surgeryService = options.surgeryService || defaultSurgeryService;
    this.docboardService = options.docboardService || defaultDocBoardService;
    this.pushService = options.pushService || defaultPushService;
    this.rulesService = options.rulesService || defaultRulesService;
    this.now = options.now || (() => new Date());
  }

  normalizeMrId(value) {
    const mrId = String(value || '').trim().toUpperCase();
    if (!/^[A-Z]+\d+$/.test(mrId) || mrId.length > 20) fail(400, 'INVALID_DRD', 'Nomor DRD tidak valid.');
    return mrId;
  }

  async preview({ mr_id: mrIdValue, schedule_date: requestedDate } = {}) {
    const mrId = this.normalizeMrId(mrIdValue);
    const today = jakartaDate(this.now());
    if (requestedDate && !validDate(requestedDate)) fail(400, 'INVALID_DATE', 'Tanggal jadwal tidak valid.');
    const snapshot = await this.repository.loadSnapshot(mrId, today);
    if (!snapshot) fail(404, 'DRD_NOT_FOUND', 'DRD tidak ditemukan.');

    const baseDiagnosis = buildDiagnosisText(snapshot.diagnosis);
    const rencana = textValue(snapshot.planning?.rencana || snapshot.planning?.instruksi);
    const suggestions = parsePlanningSuggestions(rencana, this.now(), snapshot.operationTypes);
    const scheduleDate = requestedDate || suggestions.scheduleDate;
    const pregnant = pregnancyLikely(snapshot, baseDiagnosis);
    const pregnancy = projectGestationalAge(snapshot.anamnesa, scheduleDate, {
      pregnant,
      sourceDate: snapshot.anamnesaRecordedAt || snapshot.visit?.createdAt,
    });
    const diagnosis = [
      baseDiagnosis,
      pregnancy.label ? `Perkiraan UK saat jadwal: ${pregnancy.label}` : '',
    ].filter(Boolean).join('\n');
    const warnings = [...suggestions.warnings];
    if (!baseDiagnosis) warnings.unshift('Diagnosis DRD belum disimpan. Simpan bagian Diagnosis terlebih dahulu.');
    if (pregnancy.warning) warnings.push(pregnancy.warning);

    return {
      mr_id: mrId,
      today,
      patient: snapshot.patient,
      visit: snapshot.visit,
      planning: { rencana },
      base_diagnosis: baseDiagnosis,
      diagnosis,
      pregnancy: { pregnant, ...pregnancy },
      suggestions: { ...suggestions, scheduleDate },
      options: {
        locations: LOCATIONS,
        procedure_categories: PROCEDURE_CATEGORIES,
        operation_types: snapshot.operationTypes.filter((type) => (
          !isOtherOperationType(type) && !isProcedureOnlyOperationType(type)
        )),
      },
      warnings: [...new Set(warnings)],
      can_create: Boolean(baseDiagnosis),
      _snapshot: snapshot,
    };
  }

  validateCreate(data, preview) {
    if (!preview.can_create) fail(422, 'DIAGNOSIS_REQUIRED', 'Diagnosis DRD belum disimpan. Simpan bagian Diagnosis terlebih dahulu.');
    if (!['surgery', 'procedure'].includes(data.kind)) fail(400, 'INVALID_KIND', 'Pilih Operasi atau Tindakan.');
    if (!validDate(data.schedule_date)) fail(400, 'INVALID_DATE', 'Tanggal jadwal tidak valid.');
    if (data.schedule_date < preview.today) fail(400, 'PAST_DATE', 'Tanggal jadwal tidak boleh sebelum hari ini.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.schedule_time || ''))) fail(400, 'INVALID_TIME', 'Jam jadwal wajib diisi.');
    if (!LOCATIONS.some((item) => item.value === data.location)) fail(400, 'INVALID_LOCATION', 'Lokasi jadwal tidak valid.');
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(String(data.idempotency_key || ''))) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Kunci penyimpanan jadwal tidak valid.');
  }

  result(kind, schedule, created, duplicate = false) {
    const id = String(schedule.id);
    return {
      kind,
      id,
      created,
      duplicate,
      href: kind === 'surgery' ? `/docboard/surgery/${id}` : `/docboard/procedures?schedule=${encodeURIComponent(id)}`,
      summary: schedule,
    };
  }

  async create(data = {}, userId) {
    const preview = await this.preview({ mr_id: data.mr_id, schedule_date: data.schedule_date });
    this.validateCreate(data, preview);
    const snapshot = preview._snapshot;

    if (data.kind === 'surgery') {
      const activeIds = new Set(snapshot.operationTypes
        .filter((type) => !isOtherOperationType(type) && !isProcedureOnlyOperationType(type))
        .map((type) => Number(type.id)));
      const selectedIds = [...new Set((Array.isArray(data.operation_type_ids) ? data.operation_type_ids : [])
        .map(Number).filter((id) => Number.isInteger(id) && activeIds.has(id)))];
      const customLabels = String(data.operation_type_other || '').split(/\r?\n|\+/)
        .map((value) => value.trim()).filter(Boolean);
      if (customLabels.some(isProcedureOnlyOperationLabel)) {
        fail(400, 'INVALID_OPERATION', 'Kategori tindakan DocBoard harus dijadwalkan sebagai Tindakan, bukan Operasi.');
      }
      const invalidRequested = (Array.isArray(data.operation_type_ids) ? data.operation_type_ids : [])
        .map(Number).some((id) => !activeIds.has(id));
      if (invalidRequested) fail(400, 'INVALID_OPERATION', 'Jenis operasi tidak aktif, tidak valid, atau merupakan kategori tindakan DocBoard.');
      if (!selectedIds.length && !customLabels.length) fail(400, 'OPERATION_REQUIRED', 'Jenis operasi wajib dipilih atau ditulis.');

      const duplicate = await this.repository.findExistingSurgery({
        mrId: preview.mr_id, scheduleDate: data.schedule_date, location: data.location,
      });
      if (duplicate) {
        const existing = await this.surgeryService.getSurgeryById(duplicate.id);
        return this.result('surgery', existing || duplicate, false, true);
      }

      const selectedTypes = snapshot.operationTypes.filter((type) => selectedIds.includes(Number(type.id)));
      const labels = [...selectedTypes.map(operationLabel).filter(Boolean), ...customLabels];
      const fallback = snapshot.operationTypes.find(isOtherOperationType);
      const primaryId = selectedIds[0] || Number(fallback?.id) || null;
      const surgery = await this.surgeryService.createSurgery({
        patient_name: snapshot.patient.name,
        patient_age: snapshot.patient.age,
        patient_id: snapshot.patient.id,
        mr_id: preview.mr_id,
        diagnosis: preview.diagnosis,
        lab_results: snapshot.labResults || null,
        radiology_results: null,
        usg_results: snapshot.usgResults || null,
        operation_type_id: primaryId,
        operation_type_other: labels.length > 1 || customLabels.length ? labels.join(' + ') : null,
        location: data.location,
        surgery_date: data.schedule_date,
        surgery_time: data.schedule_time,
        special_notes: snapshot.patient.allergy && snapshot.patient.allergy !== '-'
          ? `Alergi: ${snapshot.patient.allergy}` : null,
        idempotency_key: data.idempotency_key,
      }, userId);
      Promise.resolve(this.pushService?.sendNewBookingNotification?.(surgery)).catch(() => {});
      Promise.resolve(this.rulesService?.evaluateRules?.('surgery_created', surgery)).catch(() => {});
      return this.result('surgery', surgery, true);
    }

    if (!PROCEDURE_CATEGORIES.includes(data.procedure_category)) {
      fail(400, 'INVALID_PROCEDURE', 'Jenis tindakan tidak valid.');
    }
    const duplicate = await this.repository.findExistingProcedure({
      mrId: preview.mr_id,
      patientFacility: snapshot.visit.location,
      category: data.procedure_category,
      scheduleDate: data.schedule_date,
    });
    if (duplicate) return this.result('procedure', duplicate, false, true);

    const notes = [
      `DRD: ${preview.mr_id}`,
      `Diagnosis DRD:\n${preview.diagnosis}`,
      preview.planning.rencana ? `Rencana DRD:\n${preview.planning.rencana}` : '',
    ].filter(Boolean).join('\n\n');
    try {
      const schedule = await this.docboardService.createSpaceSchedule(userId, {
        space: 'tindakan',
        agenda: `${data.procedure_category} - ${snapshot.patient.name}`,
        category: data.procedure_category,
        schedule_date: data.schedule_date,
        start_time: data.schedule_time,
        location: procedureLocation(data.location),
        participants: '',
        notes,
        status: 'scheduled',
        patient_ref_type: 'drd',
        patient_ref_value: preview.mr_id,
        patient_facility: snapshot.visit.location,
        patient_name: snapshot.patient.name,
      }, { trustedPatientRef: true });
      return this.result('procedure', schedule, true);
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const existing = await this.repository.findExistingProcedure({
        mrId: preview.mr_id,
        patientFacility: snapshot.visit.location,
        category: data.procedure_category,
        scheduleDate: data.schedule_date,
      });
      if (!existing) throw error;
      return this.result('procedure', existing, false, true);
    }
  }
}

module.exports = {
  DrdDocBoardScheduleService,
  DrdDocBoardRepository,
  DrdDocBoardScheduleError,
  PROCEDURE_CATEGORIES,
  LOCATIONS,
  buildDiagnosisText,
  projectGestationalAge,
  parsePlanningSuggestions,
  selectLatestSections,
  jakartaDate,
};
