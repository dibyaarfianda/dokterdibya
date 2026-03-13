import { signal } from '@preact/signals';

// Calendar state
export const currentYear = signal(new Date().getFullYear());
export const currentMonth = signal(new Date().getMonth());
export const calendarData = signal({}); // { 'YYYY-MM-DD': { locations: [...] } }
export const calendarLoading = signal(false);

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
