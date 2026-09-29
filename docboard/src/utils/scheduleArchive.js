const jakartaClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function getJakartaNow(now = new Date()) {
  const parts = Object.fromEntries(jakartaClock.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function isArchivedProcedure(item, clock) {
  if (item.status === 'done' || item.status === 'cancelled') return true;
  if (!item.schedule_date) return false;
  if (item.schedule_date < clock.date) return true;
  if (item.schedule_date > clock.date) return false;
  const deadline = item.end_time || item.start_time;
  return Boolean(deadline && deadline.slice(0, 5) < clock.time);
}
