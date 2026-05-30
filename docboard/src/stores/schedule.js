import { signal } from '@preact/signals';

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

// Scientific/personal schedules
export const spaceScheduleCalendarData = signal({});

// AI Briefing
export const briefingData = signal(null);
export const briefingLoading = signal(false);
