const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

function parseMonitorDate(value) {
  if (value instanceof Date) return value;
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00+07:00`);
  }
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?$/);
  if (local) {
    return new Date(`${local[1]}T${local[2].padStart(2, '0')}:${local[3]}:${local[4] || '00'}${local[5] || ''}+07:00`);
  }
  return new Date(raw);
}

export function jakartaDateString(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(value, days) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = parseMonitorDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDate(value) {
  if (!value) return '-';
  const date = parseMonitorDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
