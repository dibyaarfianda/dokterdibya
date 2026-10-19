import { signal } from '@preact/signals';

// Publish the complete visible range together; a failed month keeps the old data.
export async function loadCalendarMonths(months, loadMonth) {
  const days = await Promise.all(months.map(({ year, month }) => loadMonth(year, month + 1)));
  return Object.assign({}, ...days);
}

// Calendar state
export const currentYear = signal(new Date().getFullYear());
export const currentMonth = signal(new Date().getMonth());
export const calendarData = signal({}); // { 'YYYY-MM-DD': { locations: [...] } }
export const calendarLoading = signal(false);

// Weekly view state
export const calendarView = signal('month'); // 'month' | 'week'
export const currentWeekStart = signal(null); // Monday of current week (Date object)

// Day detail state
export const selectedDate = signal(null);
export const dayDetail = signal(null);
export const dayLoading = signal(false);

// Today's patients
export const todayData = signal(null);
export const todayLoading = signal(false);

// Sync status
export const syncStatus = signal({});

// Notifications
export const notifications = signal([]);
export const unreadCount = signal(0);

// Surgery
export const surgeryCalendarData = signal({});
export const upcomingSurgeries = signal([]);
export const operationTypes = signal([]);
export const surgeryScheduleRevision = signal(0);
export const surgeryRefreshFailed = signal(false);
export const surgeryRefreshPending = signal(false);

const SURGERY_SCHEDULE_REVISION_KEY = 'docboard_schedule_revision_v1';

// Planning publishes this marker after a successful schedule change. Reconcile
// against storage itself so queued older events cannot restore a stale revision.
export function subscribeToSurgeryScheduleChanges(onRevision, {
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  storage,
  shouldRetry = () => surgeryRefreshFailed.value && !surgeryRefreshPending.value,
} = {}) {
  try {
    storage ??= windowTarget?.localStorage;
  } catch {
    // Some embedded/private browsers deny localStorage access.
  }

  function readRevision() {
    try {
      const marker = JSON.parse(storage?.getItem(SURGERY_SCHEDULE_REVISION_KEY) || 'null');
      return typeof marker?.revision === 'string' && marker.revision.trim() ? marker.revision : null;
    } catch {
      return null;
    }
  }

  let lastRevision = readRevision();
  function reconcile(retryFailed = false) {
    if (documentTarget?.visibilityState === 'hidden') return;
    const revision = readRevision();
    const changed = revision && revision !== lastRevision;
    if (!changed && !(retryFailed && shouldRetry())) return;
    if (changed) lastRevision = revision;
    onRevision(revision);
  }
  const retryOnReturn = () => reconcile(true);
  function onStorage(event) {
    if (event.key !== SURGERY_SCHEDULE_REVISION_KEY || event.newValue === null) return;
    if (event.storageArea && event.storageArea !== storage) return;
    reconcile();
  }

  windowTarget?.addEventListener('storage', onStorage);
  windowTarget?.addEventListener('focus', retryOnReturn);
  windowTarget?.addEventListener('online', retryOnReturn);
  documentTarget?.addEventListener('visibilitychange', retryOnReturn);
  return () => {
    windowTarget?.removeEventListener('storage', onStorage);
    windowTarget?.removeEventListener('focus', retryOnReturn);
    windowTarget?.removeEventListener('online', retryOnReturn);
    documentTarget?.removeEventListener('visibilitychange', retryOnReturn);
  };
}

// Scientific/personal schedules
export const spaceScheduleCalendarData = signal({});

// AI Briefing
export const briefingData = signal(null);
export const briefingLoading = signal(false);
