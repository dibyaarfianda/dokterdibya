import { useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import CalendarGrid from '../components/CalendarGrid';
import WeeklyView from '../components/WeeklyView';
import MorningBriefing from '../components/MorningBriefing';
import { SkeletonCalendar } from '../components/SkeletonLoader';
import { api, getSpaceScheduleCalendar } from '../services/api';
import { currentYear, currentMonth, calendarData, calendarLoading, calendarView, currentWeekStart, surgeryCalendarData, spaceScheduleCalendarData } from '../stores/schedule';
import { getMonthName, today, getWeekStart } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

export default function Calendar() {
  useEffect(() => {
    loadCalendar();
  }, [currentYear.value, currentMonth.value]);

  // Load surgery calendar data alongside regular calendar
  useEffect(() => {
    loadSurgeryCalendar();
    loadSpaceScheduleCalendar();
  }, [currentYear.value, currentMonth.value]);

  async function loadCalendar() {
    calendarLoading.value = true;
    try {
      const data = await api.getCalendar(currentYear.value, currentMonth.value + 1);
      calendarData.value = data.days || {};
    } catch (err) {
      console.error('Failed to load calendar:', err);
    } finally {
      calendarLoading.value = false;
    }
  }

  async function loadSurgeryCalendar() {
    try {
      const data = await api.getSurgeryCalendar(currentYear.value, currentMonth.value + 1);
      surgeryCalendarData.value = data.days || {};
    } catch (err) {
      console.error('Failed to load surgery calendar:', err);
    }
  }

  async function loadSpaceScheduleCalendar() {
    try {
      spaceScheduleCalendarData.value = await getSpaceScheduleCalendar(currentYear.value, currentMonth.value + 1);
    } catch (err) {
      console.error('Failed to load space schedule calendar:', err);
    }
  }

  function prevMonth() {
    if (currentMonth.value === 0) {
      currentMonth.value = 11;
      currentYear.value = currentYear.value - 1;
    } else {
      currentMonth.value = currentMonth.value - 1;
    }
  }

  function nextMonth() {
    if (currentMonth.value === 11) {
      currentMonth.value = 0;
      currentYear.value = currentYear.value + 1;
    } else {
      currentMonth.value = currentMonth.value + 1;
    }
  }

  function goToToday() {
    const now = new Date();
    currentYear.value = now.getFullYear();
    currentMonth.value = now.getMonth();
  }

  function handleDayClick(date) {
    route(`/docboard/day/${date}`);
  }

  function switchView(view) {
    calendarView.value = view;
    if (view === 'week' && !currentWeekStart.value) {
      currentWeekStart.value = getWeekStart(new Date());
    }
  }

  const todayStr = today();
  const todayEvents = calendarData.value[todayStr];
  const isWeekView = calendarView.value === 'week';
  const now = new Date();
  const isCurrentMonth = currentYear.value === now.getFullYear() && currentMonth.value === now.getMonth();

  return (
    <div class="view-calendar">
      {/* Today summary card */}
      <div class="today-summary" onClick={() => handleDayClick(todayStr)}>
        <div class="today-summary-left">
          <span class="today-label">Hari Ini</span>
          <span class="today-count">
            {todayEvents?.totalPatients || 0} pasien
          </span>
        </div>
        <div class="today-locations">
          {todayEvents?.locations?.map(loc => (
            <span
              key={loc}
              class="location-chip"
              style={{ backgroundColor: LOCATIONS[loc]?.colorLight, color: LOCATIONS[loc]?.color }}
            >
              {LOCATIONS[loc]?.shortName}
            </span>
          ))}
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </div>

      {/* AI Morning Briefing - only on current month */}
      {isCurrentMonth && <MorningBriefing />}

      {/* View toggle */}
      <div class="view-toggle">
        <button
          class={`view-toggle-btn${!isWeekView ? ' active' : ''}`}
          onClick={() => switchView('month')}
        >
          Bulan
        </button>
        <button
          class={`view-toggle-btn${isWeekView ? ' active' : ''}`}
          onClick={() => switchView('week')}
        >
          Minggu
        </button>
      </div>

      {isWeekView ? (
        /* Weekly view */
        calendarLoading.value ? (
          <SkeletonCalendar />
        ) : (
          <WeeklyView />
        )
      ) : (
        <>
          {/* Month navigation */}
          <div class="month-nav">
            <button class="month-nav-btn" onClick={prevMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <button class="month-nav-title" onClick={goToToday}>
              {getMonthName(currentMonth.value)} {currentYear.value}
            </button>
            <button class="month-nav-btn" onClick={nextMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>
          </div>

          {/* Calendar grid */}
          {calendarLoading.value ? (
            <SkeletonCalendar />
          ) : (
            <CalendarGrid
              year={currentYear.value}
              month={currentMonth.value}
              events={calendarData.value}
              surgeryEvents={surgeryCalendarData.value}
              spaceEvents={spaceScheduleCalendarData.value}
              onDayClick={handleDayClick}
            />
          )}
        </>
      )}

      {/* Location legend */}
      <div class="location-legend">
        {Object.entries(LOCATIONS).map(([key, loc]) => (
          <div key={key} class="legend-item">
            <span class="legend-dot" style={{ backgroundColor: loc.color }} />
            <span class="legend-label">{loc.shortName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
