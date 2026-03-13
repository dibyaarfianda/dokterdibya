const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Format date to YYYY-MM-DD using local timezone (GMT+7)
export function formatDateLocal(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function today() {
  return formatDateLocal(new Date());
}

export function getDayName(date, full = false) {
  const d = new Date(date);
  return full ? DAYS_FULL[d.getDay()] : DAYS_ID[d.getDay()];
}

export function getMonthName(month, full = true) {
  return full ? MONTHS_ID[month] : MONTHS_SHORT[month];
}

export function formatDateDisplay(date) {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(date) {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatTime(timeStr) {
  if (!timeStr) return '-';
  return timeStr.substring(0, 5); // HH:MM from HH:MM:SS
}

export function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const days = [];

  // Previous month padding
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({
      date: formatDateLocal(new Date(year, month - 1, prevLast - i)),
      day: prevLast - i,
      isCurrentMonth: false
    });
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    days.push({
      date: formatDateLocal(new Date(year, month, d)),
      day: d,
      isCurrentMonth: true
    });
  }

  // Next month padding (fill to 42 = 6 rows)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      date: formatDateLocal(new Date(year, month + 1, d)),
      day: d,
      isCurrentMonth: false
    });
  }

  return days;
}

export function isToday(dateStr) {
  return dateStr === today();
}

export function relativeTime(dateStr) {
  if (!dateStr) return '-';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return formatDateShort(dateStr);
}
