'use strict';

const crypto = require('crypto');

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/[\r\n]+/g, '\\n')
    .replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function utcStamp(day, clock) {
  if (!/^\d{8}$/.test(day) || !/^\d{6}$/.test(clock)) return null;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6)) - 1;
  const date = Number(day.slice(6, 8));
  const hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(2, 4));
  const second = Number(clock.slice(4, 6));
  const time = new Date(Date.UTC(year, month, date, hour - 7, minute, second));
  return time.toISOString().replace(/[-:]/g, '').replace('.000', '');
}

function buildCalendar(schedules, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('.000', '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Asisten DAF//Private Schedule//ID',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Asisten DAF'];
  for (const row of schedules) {
    const start = utcStamp(String(row.schedule_day || ''), String(row.start_clock || ''));
    if (!start) continue;
    const endDate = new Date(start.slice(0, 4) + '-' + start.slice(4, 6) + '-' + start.slice(6, 8)
      + 'T' + start.slice(9, 11) + ':' + start.slice(11, 13) + ':' + start.slice(13, 15) + 'Z');
    endDate.setUTCHours(endDate.getUTCHours() + 1);
    const end = endDate.toISOString().replace(/[-:]/g, '').replace('.000', '');
    lines.push('BEGIN:VEVENT', `UID:assistant-daf-${crypto.createHash('sha256').update(String(row.id)).digest('hex').slice(0, 20)}@private`,
      `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${end}`,
      'SUMMARY:Tindakan terjadwal', `LOCATION:${escapeIcs(['Melinda', 'Gambiran', 'Bhayangkara', 'Klinik Privat'].includes(row.location) ? row.location : '')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Pengingat jadwal tindakan',
      'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { buildCalendar };
