const AdmZip = require('adm-zip');

const WIB_OFFSET = '+07:00';
const ACTIVE_CREDENTIAL_KEY = /^(?:_token|csrf(?:_token)?|token|password|cookie|authorization|session)$/i;
const EVENT_DISPLAY_METADATA_KEYS = new Set([
  'id', 'event_id', 'uuid', 'case_id', 'source_file_id', 'created_at', 'updated_at',
  'occurred_at', 'recorded_at', 'date_time', 'datetime', 'timestamp', 'time_at',
  'date', 'time', 'tanggal', 'jam', 'record_date', 'record_time', 'author',
  'author_role', 'created_by_name', 'petugas', 'dokter', 'provider', 'category',
  'source_section', 'exists',
]);
const EVENT_TITLE_KEYS = new Set(['title', 'name', 'label', 'jenis', 'type', 'tindakan', 'assessment', 'diagnosis']);

const CATEGORY_PRIORITY = {
  admission: 10,
  identity: 15,
  assessment: 20,
  diagnosis: 30,
  vital: 40,
  cppt: 50,
  consultation: 60,
  investigation: 70,
  radiology: 75,
  medication: 80,
  anesthesia: 90,
  operation: 100,
  nursing: 110,
  nutrition: 115,
  discharge: 120,
  other: 900,
};

const SECTION_DEFINITIONS = [
  ['initial_assessments', 'assessment', 'Asesmen Awal'],
  ['initial_assessment', 'assessment', 'Asesmen Awal'],
  ['anamnesis', 'assessment', 'Anamnesis'],
  ['physical_examinations', 'assessment', 'Pemeriksaan Fisik'],
  ['diagnoses', 'diagnosis', 'Diagnosis'],
  ['cppt', 'cppt', 'CPPT'],
  ['consultations', 'consultation', 'Konsultasi'],
  ['vitals', 'vital', 'Tanda Vital'],
  ['vital_signs', 'vital', 'Tanda Vital'],
  ['observations', 'vital', 'Observasi Klinis'],
  ['intake_output', 'vital', 'Intake dan Output'],
  ['laboratory', 'investigation', 'Laboratorium'],
  ['laboratories', 'investigation', 'Laboratorium'],
  ['pathology', 'investigation', 'Patologi Anatomi'],
  ['investigations', 'investigation', 'Pemeriksaan Penunjang'],
  ['penunjang.results', 'investigation', 'Pemeriksaan Penunjang'],
  ['radiology', 'radiology', 'Radiologi'],
  ['prescriptions', 'medication', 'Resep'],
  ['medication_administration', 'medication', 'Pemberian Obat'],
  ['medications', 'medication', 'Pengobatan'],
  ['anesthesia', 'anesthesia', 'Anestesi'],
  ['anesthesia_reports', 'anesthesia', 'Laporan Anestesi'],
  ['procedures', 'operation', 'Tindakan'],
  ['operations', 'operation', 'Operasi'],
  ['nursing', 'nursing', 'Keperawatan'],
  ['nutrition', 'nutrition', 'Gizi'],
  ['discharge', 'discharge', 'Pulang'],
  ['discharge_summary', 'discharge', 'Ringkasan Pulang'],
  ['resume', 'discharge', 'Ringkasan Pulang'],
  ['referrals', 'discharge', 'Rujukan'],
  ['follow_up', 'discharge', 'Tindak Lanjut'],
];

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeMedicalRecordNumber(input) {
  const original = trim(input);
  if (!original) throw validationError('Nomor RM wajib diisi');
  if (!/^[\d\s-]+$/.test(original)) {
    throw validationError('Pencarian hanya menerima Nomor RM, bukan nama pasien');
  }
  const rawDigits = original.replace(/\D/g, '');
  if (rawDigits.length < 4 || rawDigits.length > 20 || /^0+$/.test(rawDigits)) {
    throw validationError('Nomor RM tidak valid');
  }
  const searchDigits = rawDigits.replace(/^0+/, '');
  const displayDigits = searchDigits.padStart(Math.max(10, searchDigits.length), '0');
  const display = displayDigits.length === 10
    ? displayDigits.match(/.{2}/g).join('-')
    : displayDigits;
  return { input: original, digits: searchDigits, display };
}

function cleanForStorage(value) {
  if (Array.isArray(value)) return value.map(cleanForStorage);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (ACTIVE_CREDENTIAL_KEY.test(key)) continue;
    output[key] = cleanForStorage(child);
  }
  return output;
}

function valueAtPath(source, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], source);
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function normalizeTimestamp(value, fallbackDate = null, fallbackTime = null) {
  let raw = trim(value);
  if (!raw && fallbackDate) raw = `${trim(fallbackDate)} ${trim(fallbackTime) || '00:00:00'}`;
  if (!raw) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) raw = `${match[3]}-${match[2]}-${match[1]}T${String(match[4] || '00').padStart(2, '0')}:${match[5] || '00'}:${match[6] || '00'}${WIB_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(raw)) {
    raw = `${raw.replace(/\s+/, 'T')}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? '' : WIB_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    raw = `${raw}T00:00:00${WIB_OFFSET}`;
  }
  const epoch = Date.parse(raw);
  return Number.isFinite(epoch) ? { iso: new Date(epoch).toISOString(), epoch, source: trim(value) || raw } : null;
}

function eventTimestamp(item) {
  const fields = ['occurred_at', 'created_at', 'updated_at', 'recorded_at', 'date_time', 'datetime', 'timestamp', 'time_at', 'date', 'tanggal', 'createdAt'];
  for (const field of fields) {
    const normalized = normalizeTimestamp(item?.[field]);
    if (normalized) return normalized;
  }
  return normalizeTimestamp(null, item?.record_date || item?.tanggal_tindakan, item?.record_time || item?.jam);
}

function humanize(value) {
  return trim(value).replace(/\[\d+\]/g, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function titleForItem(item, fallback) {
  return trim(item?.title || item?.name || item?.label || item?.jenis || item?.type || item?.tindakan || item?.assessment || item?.diagnosis) || fallback;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isEmptyStructuredValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.every(isEmptyStructuredValue);
  if (value && typeof value === 'object') return Object.values(value).every(isEmptyStructuredValue);
  return false;
}

function eventDisplayData(event) {
  const source = event?.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {};
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (EVENT_DISPLAY_METADATA_KEYS.has(key) || isEmptyStructuredValue(value)) continue;
    if (EVENT_TITLE_KEYS.has(key) && trim(value) && trim(value) === trim(event.title)) continue;
    output[key] = value;
  }
  if (Object.keys(output).length === 1 && output.fields && typeof output.fields === 'object' && !Array.isArray(output.fields)) {
    return output.fields;
  }
  return output;
}

function titleCarriesClinicalData(event) {
  return Object.entries(event?.data || {}).some(([key, value]) => (
    EVENT_TITLE_KEYS.has(key) && trim(value) && trim(value) === trim(event.title)
  ));
}

function isRenderableEvent(event) {
  return !isEmptyStructuredValue(eventDisplayData(event)) || titleCarriesClinicalData(event);
}

function normalizeEvent(item, defaults = {}) {
  const clean = cleanForStorage(item || {});
  const timestamp = eventTimestamp(clean);
  const category = trim(clean.category || defaults.category || 'other').toLowerCase();
  const sourceId = trim(clean.id || clean.event_id || clean.uuid) || null;
  return {
    id: sourceId || trim(defaults.id) || null,
    source_id: sourceId,
    case_id: trim(clean.case_id || defaults.case_id) || null,
    encounter_index: Number.isFinite(defaults.encounter_index) ? defaults.encounter_index : null,
    category: CATEGORY_PRIORITY[category] ? category : defaults.category || 'other',
    title: titleForItem(clean, defaults.title || 'Catatan Klinis'),
    occurred_at: timestamp?.iso || null,
    occurred_at_source: timestamp?.source || null,
    source_section: trim(clean.source_section || defaults.source_section) || null,
    author: trim(clean.author || clean.created_by_name || clean.petugas || clean.dokter || clean.provider) || null,
    author_role: trim(clean.author_role || clean.profession || clean.role) || null,
    data: clean,
    _epoch: timestamp?.epoch ?? Number.POSITIVE_INFINITY,
  };
}

function buildTimeline(snapshot) {
  const events = [];
  const encounters = ensureArray(snapshot?.encounters || snapshot?.cases);
  const sources = [{ source: snapshot, case_id: null, encounter_index: -1 }, ...encounters.map((source, encounter_index) => ({
    source,
    case_id: trim(source.case_id || source.id),
    encounter_index,
  }))];

  for (const context of sources) {
    const explicit = ensureArray(context.source?.timeline || context.source?.events);
    explicit.forEach((item, index) => events.push(normalizeEvent(item, {
      id: `timeline-${context.encounter_index}-${index}`,
      case_id: context.case_id,
      encounter_index: context.encounter_index,
      category: trim(item?.category).toLowerCase() || 'other',
      title: 'Catatan Klinis',
      source_section: 'timeline',
    })));

    for (const [path, category, title] of SECTION_DEFINITIONS) {
      ensureArray(valueAtPath(context.source, path)).forEach((item, index) => {
        events.push(normalizeEvent(item, {
          id: `${path}-${context.encounter_index}-${index}`,
          case_id: context.case_id,
          encounter_index: context.encounter_index,
          category,
          title,
          source_section: path,
        }));
      });
    }
  }

  const deduped = [];
  const sourceIndex = new Map();
  const semanticIndex = new Map();
  for (const event of events.filter(isRenderableEvent)) {
    const sourceKey = event.source_id ? `${event.category}:${event.source_id}` : null;
    const semanticKey = [
      event.category,
      event.occurred_at || '',
      trim(event.author).toLowerCase(),
      trim(event.author_role).toLowerCase(),
      trim(event.title).toLowerCase(),
      stableJson(eventDisplayData(event)),
    ].join(':');
    let existing = sourceKey ? sourceIndex.get(sourceKey) : null;
    const semanticMatch = semanticIndex.get(semanticKey);
    if (!existing && semanticMatch && semanticMatch.case_id !== event.case_id) existing = semanticMatch;
    if (!existing) {
      deduped.push(event);
      if (sourceKey) sourceIndex.set(sourceKey, event);
      if (!semanticIndex.has(semanticKey)) semanticIndex.set(semanticKey, event);
      continue;
    }
    const sourceCases = [...new Set([
      ...(existing.source_case_ids || []),
      existing.case_id,
      ...(event.source_case_ids || []),
      event.case_id,
    ].filter(Boolean))];
    if (sourceCases.length > 1) existing.source_case_ids = sourceCases;
    if (sourceKey) sourceIndex.set(sourceKey, existing);
    semanticIndex.set(semanticKey, existing);
  }
  return deduped.sort((left, right) => (
    left._epoch - right._epoch
    || (left.encounter_index ?? 999999) - (right.encounter_index ?? 999999)
    || (CATEGORY_PRIORITY[left.category] || 900) - (CATEGORY_PRIORITY[right.category] || 900)
    || String(left.id || '').localeCompare(String(right.id || ''))
  )).map(({ _epoch, ...event }) => event);
}

function formatWib(value) {
  const epoch = Date.parse(value || '');
  if (!Number.isFinite(epoch)) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(epoch)).replace(' pukul ', ' ') + ' WIB';
}

function formatScalar(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  return String(value);
}

function formatStructured(value, indent = '') {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (item && typeof item === 'object') return [`${indent}${index + 1}.`, ...formatStructured(item, `${indent}   `)];
      return [`${indent}${index + 1}. ${formatScalar(item)}`];
    });
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      if (child === null || child === undefined || child === '') return [];
      if (typeof child === 'object') return [`${indent}${humanize(key)}:`, ...formatStructured(child, `${indent}   `)];
      return [`${indent}${humanize(key)}: ${formatScalar(child)}`];
    });
  }
  return [`${indent}${formatScalar(value)}`];
}

function patientIdentity(snapshot, mr) {
  const encounters = ensureArray(snapshot?.encounters || snapshot?.cases);
  const identity = cleanForStorage(snapshot?.patient || snapshot?.identity || encounters[0]?.patient || {});
  return {
    ...identity,
    medical_record_number: mr.display,
    medify_search_number: mr.digits,
  };
}

function encounterSummary(encounter, index) {
  const admitted = encounter.admission_at || encounter.started_at || encounter.mrs_at || encounter.date;
  const discharged = encounter.discharge_at || encounter.ended_at || encounter.krs_at;
  return [
    `Kunjungan ${index + 1}: ${trim(encounter.case_id || encounter.id) || 'Case ID tidak tersedia'}`,
    `Jenis/Lokasi: ${trim(encounter.type || encounter.care_type || encounter.location || encounter.unit) || '-'}`,
    `Masuk: ${admitted ? formatWib(normalizeTimestamp(admitted)?.iso) : '-'}`,
    `Keluar: ${discharged ? formatWib(normalizeTimestamp(discharged)?.iso) : '-'}`,
    `DPJP: ${trim(encounter.dpjp_name || encounter.doctor_name || encounter.dpjp) || '-'}`,
    `Diagnosis: ${trim(encounter.diagnosis || encounter.primary_diagnosis) || '-'}`,
  ];
}

function buildResumeText({ snapshot, medicalRecord, timeline, warnings = [], files = [], generatedAt = new Date().toISOString() }) {
  const identity = patientIdentity(snapshot, medicalRecord);
  const encounters = ensureArray(snapshot?.encounters || snapshot?.cases);
  const lines = [
    'RAHASIA MEDIS - AKSES TERBATAS',
    'RESUME MEDIS LONGITUDINAL',
    `Fasilitas: RSUD Gambiran / Medify`,
    `Nomor RM: ${medicalRecord.display}`,
    `Dibuat: ${formatWib(generatedAt)}`,
    '',
    '## IDENTITAS PASIEN',
    ...formatStructured(identity),
    '',
    '## RIWAYAT KUNJUNGAN',
  ];
  if (!encounters.length) lines.push('Tidak ada kunjungan yang ditemukan.');
  encounters.forEach((encounter, index) => lines.push(...encounterSummary(encounter, index), ''));

  lines.push('## PERJALANAN KLINIS KRONOLOGIS');
  if (!timeline.length) lines.push('Tidak ada entri klinis bertanggal yang tersedia.');
  for (const event of timeline.filter(item => item.occurred_at)) {
    lines.push(`[${formatWib(event.occurred_at)}] ${humanize(event.category)} - ${event.title}`);
    const sourceCases = event.source_case_ids?.length ? event.source_case_ids : (event.case_id ? [event.case_id] : []);
    if (sourceCases.length === 1) lines.push(`Case ID: ${sourceCases[0]}`);
    else if (sourceCases.length > 1) lines.push(`Case ID sumber: ${sourceCases.join(', ')}`);
    if (event.author) lines.push(`Petugas: ${event.author}${event.author_role ? ` (${event.author_role})` : ''}`);
    lines.push(...formatStructured(eventDisplayData(event), '  '), '');
  }

  const undated = timeline.filter(item => !item.occurred_at);
  lines.push('## WAKTU TIDAK TERSEDIA');
  if (!undated.length) lines.push('Tidak ada entri tanpa tanggal/jam.');
  for (const event of undated) {
    lines.push(`${humanize(event.category)} - ${event.title}`);
    const sourceCases = event.source_case_ids?.length ? event.source_case_ids : (event.case_id ? [event.case_id] : []);
    if (sourceCases.length === 1) lines.push(`Case ID: ${sourceCases[0]}`);
    else if (sourceCases.length > 1) lines.push(`Case ID sumber: ${sourceCases.join(', ')}`);
    if (event.author) lines.push(`Petugas: ${event.author}${event.author_role ? ` (${event.author_role})` : ''}`);
    lines.push(...formatStructured(eventDisplayData(event), '  '), '');
  }

  lines.push('## STATUS AKHIR DAN TINDAK LANJ');
  const discharge = snapshot?.final_status || snapshot?.discharge_summary || snapshot?.resume || snapshot?.discharge;
  lines.push(...(formatStructured(discharge).length ? formatStructured(discharge) : ['Status akhir atau tindak lanjut belum tersedia.']), '');
  lines.push('## LAMPIRAN DAN KELENGKAPAN DATA');
  lines.push(`Jumlah kunjungan: ${encounters.length}`);
  lines.push(`Jumlah entri timeline: ${timeline.length}`);
  lines.push(`Jumlah berkas asli: ${files.length}`);
  files.forEach((file, index) => lines.push(`${index + 1}. ${file.filename || file.title || file.id || 'Berkas'} | ${file.category || 'dokumen'} | ${file.case_id || '-'} | ${file.mime_type || file.mimeType || '-'}`));
  lines.push('', 'Peringatan kelengkapan:');
  if (!warnings.length) lines.push('Tidak ada peringatan yang dilaporkan sumber.');
  warnings.forEach((warning, index) => lines.push(`${index + 1}. ${trim(warning)}`));
  lines.push('', 'Dokumen ini disusun secara deterministik dari data sumber Medify. Tidak ada diagnosis atau interpretasi klinis baru yang ditambahkan.');
  return `${lines.join('\r\n').trim()}\r\n`;
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function replaceParagraphText(paragraphXml, value) {
  let first = true;
  return paragraphXml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, match => {
    const open = match.match(/^<w:t(?:\s[^>]*)?>/)?.[0] || '<w:t>';
    const text = first ? escapeXml(value) : '';
    first = false;
    const normalizedOpen = open.includes('xml:space=') ? open : open.replace('>', ' xml:space="preserve">');
    return `${normalizedOpen}${text}</w:t>`;
  });
}

function buildDocxFromTemplate(templatePath, resumeText) {
  const zip = new AdmZip(templatePath);
  const documentEntry = zip.getEntry('word/document.xml');
  if (!documentEntry) throw new Error('Template DOCX tidak memiliki word/document.xml');
  const documentXml = documentEntry.getData().toString('utf8');
  const templates = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match => match[0]);
  if (templates.length < 29) throw new Error('Struktur template legal memorandum tidak sesuai');
  const titleTemplate = templates[1];
  const headingTemplate = templates[10];
  const bodyTemplate = templates[18];
  const blankTemplate = templates[8];
  const paragraphs = [];
  for (const rawLine of String(resumeText).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === 'RAHASIA MEDIS - AKSES TERBATAS') continue;
    if (line === 'RESUME MEDIS LONGITUDINAL') paragraphs.push(replaceParagraphText(titleTemplate, line));
    else if (line.startsWith('## ')) paragraphs.push(replaceParagraphText(headingTemplate, line.slice(3)));
    else if (!line.trim()) paragraphs.push(blankTemplate);
    else paragraphs.push(replaceParagraphText(bodyTemplate, line));
  }
  const sectionProperties = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0];
  if (!sectionProperties) throw new Error('Template DOCX tidak memiliki section properties');
  const nextDocumentXml = documentXml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${paragraphs.join('')}${sectionProperties}</w:body>`);
  zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));

  const headerEntry = zip.getEntry('word/header1.xml');
  if (headerEntry) {
    let first = true;
    const headerXml = headerEntry.getData().toString('utf8').replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, match => {
      const open = match.match(/^<w:t(?:\s[^>]*)?>/)?.[0] || '<w:t>';
      const text = first ? 'RAHASIA MEDIS - AKSES TERBATAS' : '';
      first = false;
      const normalizedOpen = open.includes('xml:space=') ? open : open.replace('>', ' xml:space="preserve">');
      return `${normalizedOpen}${text}</w:t>`;
    });
    zip.updateFile('word/header1.xml', Buffer.from(headerXml, 'utf8'));
  }
  const coreEntry = zip.getEntry('docProps/core.xml');
  if (coreEntry) {
    const coreXml = coreEntry.getData().toString('utf8')
      .replace(/<dc:title>[\s\S]*?<\/dc:title>/, '<dc:title>Resume Medis Longitudinal</dc:title>')
      .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>DocBoard</dc:creator>')
      .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>DocBoard</cp:lastModifiedBy>');
    zip.updateFile('docProps/core.xml', Buffer.from(coreXml, 'utf8'));
  }
  return zip.toBuffer();
}

module.exports = {
  normalizeMedicalRecordNumber,
  cleanForStorage,
  normalizeTimestamp,
  buildTimeline,
  buildResumeText,
  buildDocxFromTemplate,
  formatWib,
  formatStructured,
};
