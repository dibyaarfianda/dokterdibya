const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function parseLocalDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const dateOnly = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
  }
  return new Date(date);
}

// Format date to YYYY-MM-DD using local timezone (GMT+7)
export function formatDateLocal(date) {
  const d = parseLocalDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeDateInput(date) {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return formatDateLocal(date);
}

export function today() {
  return formatDateLocal(new Date());
}

export function getDayName(date, full = false) {
  const d = parseLocalDate(date);
  return full ? DAYS_FULL[d.getDay()] : DAYS_ID[d.getDay()];
}

export function getMonthName(month, full = true) {
  return full ? MONTHS_ID[month] : MONTHS_SHORT[month];
}

export function formatDateDisplay(date) {
  const d = parseLocalDate(date);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(date) {
  const d = parseLocalDate(date);
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

// Get Monday of the week containing the given date
export function getWeekStart(date) {
  const d = parseLocalDate(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // Adjust so Monday=start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Get array of 7 date strings (Mon-Sun) for the week containing the given date
export function getWeekDays(date) {
  const monday = getWeekStart(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: formatDateLocal(d),
      day: d.getDate(),
      dayName: DAYS_ID[d.getDay()],
      dayNameFull: DAYS_FULL[d.getDay()],
      dateObj: d
    });
  }
  return days;
}

// Format week label like "10 - 16 Mar 2026"
export function getWeekLabel(weekStart) {
  const monday = new Date(weekStart);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDay = monday.getDate();
  const endDay = sunday.getDate();
  const startMonth = monday.getMonth();
  const endMonth = sunday.getMonth();
  const startYear = monday.getFullYear();
  const endYear = sunday.getFullYear();

  if (startYear !== endYear) {
    return `${startDay} ${MONTHS_SHORT[startMonth]} ${startYear} - ${endDay} ${MONTHS_SHORT[endMonth]} ${endYear}`;
  } else if (startMonth !== endMonth) {
    return `${startDay} ${MONTHS_SHORT[startMonth]} - ${endDay} ${MONTHS_SHORT[endMonth]} ${endYear}`;
  } else {
    return `${startDay} - ${endDay} ${MONTHS_SHORT[endMonth]} ${endYear}`;
  }
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
