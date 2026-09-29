'use strict';
const crypto = require('crypto');
function day(value) {
  if (value instanceof Date) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  return String(value || '').slice(0, 10);
}
function snapshot(row) {
  const result = {};
  for (const key of ['id', 'user_id', 'space', 'agenda', 'category', 'location', 'patient_ref_type', 'patient_ref_value', 'patient_facility', 'patient_name', 'status']) result[key] = String(row[key] || '');
  result.schedule_date = day(row.schedule_date);
  result.start_time = String(row.start_time || '').slice(0, 5);
  result.end_time = String(row.end_time || '').slice(0, 5);
  result.updated_at = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '');
  return result;
}
function version(row) { return crypto.createHash('sha256').update(JSON.stringify(snapshot(row))).digest('hex'); }
module.exports = { snapshot, version, day };
