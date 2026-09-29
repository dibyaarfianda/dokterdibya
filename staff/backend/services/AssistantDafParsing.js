'use strict';

const HOSPITALS = [
  { pattern: /\bmelinda\b/i, value: 'Melinda' },
  { pattern: /\bgambiran\b/i, value: 'Gambiran' },
  { pattern: /\bbhayangkara\b/i, value: 'Bhayangkara' },
  { pattern: /\bklinik\s+privat\b/i, value: 'Klinik Privat' }
];

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function jakartaDay(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function extractDate(text, now) {
  const dates = [...text.matchAll(/\b(?:20\d\d-\d\d-\d\d|\d{1,2}[/-]\d{1,2}[/-]20\d\d)\b/g)];
  if (dates.length > 1) return '';
  const iso = text.match(/\b(20\d\d-\d\d-\d\d)\b/);
  if (iso && validDate(iso[1])) return iso[1];
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b/);
  if (dmy) {
    const value = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return validDate(value) ? value : '';
  }
  // Forwarded messages do not carry a trustworthy original timestamp.
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return '';
  const base = jakartaDay(now);
  if (/\blusa\b/i.test(text)) return shiftDate(base, 2);
  if (/\bbesok\b/i.test(text)) return shiftDate(base, 1);
  if (/\bhari ini\b/i.test(text)) return base;
  return '';
}

function extractTime(text) {
  if ([...text.matchAll(/\b(?:jam|pukul)\s*\d/gi)].length > 1 || /\b(?:siang|sore|malam|dhuhur|dzuhur|zuhur|magrib|maghrib|subuh|isya)\b/i.test(text)) return '';
  const match = text.match(/\b(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?\b/i);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseScheduleMessage(input, now = null) {
  const text = String(input || '').slice(0, 10000);
  const locations = HOSPITALS.filter(({ pattern }) => pattern.test(text));
  const location = locations.length === 1 ? locations[0].value : '';
  const category = /\bsc\b|sectio|sesar/i.test(text) ? 'SC'
    : /kuret/i.test(text) ? 'Kuret'
      : /\biud\b/i.test(text) ? 'IUD' : '';
  const action = /\b(batal|batalkan)\b/i.test(text) ? 'cancel'
    : /\b(geser|pindah|ubah)\b/i.test(text) ? 'update' : 'create';
  const result = {
    action,
    space: category ? 'tindakan' : 'pribadi',
    agenda: category || '',
    category,
    schedule_date: extractDate(text, now),
    start_time: extractTime(text),
    location,
    patient_ref_type: '',
    patient_ref_value: '',
    patient_facility: '',
    patient_name: '',
    needs_review: []
  };
  if (!result.schedule_date) result.needs_review.push('tanggal belum jelas');
  if (!result.start_time) result.needs_review.push('jam belum jelas');
  if (!now && /\b(besok|lusa|hari ini)\b/i.test(text)) result.needs_review.push('tanggal pesan asli perlu diperiksa');
  if (result.space === 'tindakan') {
    if (!location) result.needs_review.push('lokasi belum jelas');
    result.needs_review.push('identitas pasien belum terverifikasi');
  }
  if (action !== 'create') result.needs_review.push('jadwal yang akan diubah harus dipilih');
  return result;
}

function validateConfirmedDraft(data) {
  const errors = [];
  if (!['tindakan', 'pribadi'].includes(data.space)) errors.push('jenis jadwal tidak valid');
  if (!validDate(data.schedule_date)) errors.push('tanggal tidak valid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.start_time || ''))) errors.push('jam tidak valid');
  if (data.end_time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.end_time) || data.end_time <= data.start_time)) errors.push('jam selesai tidak valid');
  if (!String(data.agenda || '').trim() || !String(data.category || '').trim()) errors.push('agenda diperlukan');
  if (data.space === 'tindakan') {
    if (!HOSPITALS.some(({ value }) => value === data.location)) errors.push('lokasi tindakan tidak valid');
    if (!(['comm_patient', 'hospital_mr'].includes(data.patient_ref_type) && String(data.patient_ref_value || '').trim()
      && (data.patient_ref_type === 'comm_patient' || String(data.patient_facility || '').trim()))) {
      errors.push('identitas pasien diperlukan');
    }
  }
  return errors;
}

function duplicateKey(data) {
  return [data.space, data.patient_ref_type, String(data.patient_ref_value || '').trim().toUpperCase(),
    data.patient_facility || '', String(data.category || '').trim().toLowerCase(), data.schedule_date].join('|');
}

module.exports = { parseScheduleMessage, validateConfirmedDraft, duplicateKey, validDate };
