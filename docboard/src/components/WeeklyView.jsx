import { route } from 'preact-router';
import { getWeekDays, getWeekLabel, getWeekStart, isToday, formatDateLocal } from '../utils/date';
import { LOCATIONS } from '../utils/constants';
import { currentWeekStart, calendarData, surgeryCalendarData, spaceScheduleCalendarData } from '../stores/schedule';

export default function WeeklyView() {
  // Initialize week start if not set
  if (!currentWeekStart.value) {
    currentWeekStart.value = getWeekStart(new Date());
  }

  const weekDays = getWeekDays(currentWeekStart.value);
  const weekLabel = getWeekLabel(currentWeekStart.value);

  function prevWeek() {
    const prev = new Date(currentWeekStart.value);
    prev.setDate(prev.getDate() - 7);
    currentWeekStart.value = prev;
  }

  function nextWeek() {
    const next = new Date(currentWeekStart.value);
    next.setDate(next.getDate() + 7);
    currentWeekStart.value = next;
  }

  function goToThisWeek() {
    currentWeekStart.value = getWeekStart(new Date());
  }

  function handleDayClick(dateStr) {
    route(`/docboard/day/${dateStr}`);
  }

  return (
    <div class="week-view">
      {/* Week navigation */}
      <div class="month-nav">
        <button class="month-nav-btn" onClick={prevWeek}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <button class="month-nav-title" onClick={goToThisWeek}>
          {weekLabel}
        </button>
        <button class="month-nav-btn" onClick={nextWeek}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
      </div>

      {/* Day cards */}
      <div class="week-days">
        {weekDays.map(day => {
          const dayEvents = calendarData.value[day.date] || {};
          const locations = dayEvents.locations || [];
          const totalPatients = dayEvents.totalPatients || 0;
          const surgeryDay = surgeryCalendarData.value[day.date];
          const surgeryCount = surgeryDay?.count || 0;
          const spaceDay = spaceScheduleCalendarData.value[day.date];
          const spaceCount = spaceDay?.total || 0;
          const todayActive = isToday(day.date);

          return (
            <div
              key={day.date}
              class={`week-day-card${todayActive ? ' is-today' : ''}${totalPatients > 0 ? ' has-events' : ''}`}
              onClick={() => handleDayClick(day.date)}
            >
              <div class="week-day-header">
                <span class="week-day-name">{day.dayName}</span>
                <span class="week-day-number">{day.day}</span>
              </div>

              <div class="week-day-body">
                {/* Location dots */}
                {locations.length > 0 && (
                  <div class="week-day-dots">
                    {locations.map(loc => (
                      <span
                        key={loc}
                        class="week-dot"
                        style={{ backgroundColor: LOCATIONS[loc]?.color || '#94A3B8' }}
                        title={LOCATIONS[loc]?.name}
                      />
                    ))}
                  </div>
                )}

                {/* Patient count */}
                {totalPatients > 0 && (
                  <span class="week-day-patients">{totalPatients} pasien</span>
                )}

                {/* Surgery count */}
                {surgeryCount > 0 && (
                  <div class="week-day-surgery">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    <span>{surgeryCount}</span>
                  </div>
                )}

                {spaceCount > 0 && (
                  <div class="week-day-space">
                    <span>{spaceCount} agenda</span>
                  </div>
                )}

                {/* Empty state */}
                {totalPatients === 0 && surgeryCount === 0 && spaceCount === 0 && (
                  <span class="week-day-empty">-</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
