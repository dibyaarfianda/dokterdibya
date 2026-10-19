import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import CalendarGrid from '../components/CalendarGrid';
import WeeklyView from '../components/WeeklyView';
import { SkeletonCalendar } from '../components/SkeletonLoader';
import SurgeryRefreshWarning from '../components/SurgeryRefreshWarning';
import { api, getSpaceScheduleCalendar } from '../services/api';
import { currentYear, currentMonth, calendarData, calendarLoading, calendarView, currentWeekStart, surgeryCalendarData, spaceScheduleCalendarData, surgeryScheduleRevision, surgeryRefreshFailed, surgeryRefreshPending, loadCalendarMonths } from '../stores/schedule';
import { getMonthName, today, getWeekStart, getCalendarMonths } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

export default function Calendar() {
  const isEmbedded = document.documentElement.classList.contains('docboard-embedded');
  const [dualMonth, setDualMonth] = useState(() => isEmbedded && window.matchMedia('(min-width: 768px)').matches);
  const year = currentYear.value;
  const month = currentMonth.value;
  const months = getCalendarMonths(year, month, dualMonth ? 2 : 1);

  useEffect(() => {
    if (!isEmbedded) return;
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDualMonth(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [isEmbedded]);

  useEffect(() => {
    let active = true;
    calendarLoading.value = true;
    loadCalendarMonths(months, async (y, m) => (await api.getCalendar(y, m)).days || {})
      .then(days => { if (active) calendarData.value = days; })
      .catch(err => console.error('Failed to load calendar:', err))
      .finally(() => { if (active) calendarLoading.value = false; });
    return () => { active = false; };
  }, [year, month, dualMonth]);

  // An external surgery change refreshes only the surgery calendar.
  useEffect(() => {
    let active = true;
    async function loadSurgeryCalendar() {
      surgeryRefreshPending.value = true;
      try {
        const days = await loadCalendarMonths(months, async (y, m) => (await api.getSurgeryCalendar(y, m)).days || {});
        if (active) {
          surgeryCalendarData.value = days;
          surgeryRefreshFailed.value = false;
        }
      } catch (err) {
        if (active) surgeryRefreshFailed.value = true;
        console.error('Failed to load surgery calendar:', err);
      } finally {
        if (active) surgeryRefreshPending.value = false;
      }
    }
    loadSurgeryCalendar();
    return () => { active = false; surgeryRefreshPending.value = false; };
  }, [year, month, dualMonth, surgeryScheduleRevision.value]);

  useEffect(() => {
    let active = true;
    loadCalendarMonths(months, getSpaceScheduleCalendar)
      .then(days => { if (active) spaceScheduleCalendarData.value = days; })
      .catch(err => console.error('Failed to load space schedule calendar:', err));
    return () => { active = false; };
  }, [year, month, dualMonth]);

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

  return (
    <div class="view-calendar">
      <SurgeryRefreshWarning />
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

      <button class="today-alarm-shortcut" type="button" onClick={() => route('/docboard/alarms')}>
        <span class="today-alarm-shortcut-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <span>
          <strong>Alarm agenda hari ini</strong>
          <small>Operasi, tindakan, ilmiah & pribadi</small>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </button>

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
            <button class="month-nav-btn" aria-label="Bulan sebelumnya" onClick={prevMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <button class="month-nav-title" onClick={goToToday}>
              {getMonthName(currentMonth.value)} {currentYear.value}
              {dualMonth && ` – ${getMonthName(months[1].month)} ${months[1].year}`}
            </button>
            <button class="month-nav-btn" aria-label="Bulan berikutnya" onClick={nextMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>
          </div>

          {/* Calendar grid */}
          <div class="calendar-months">
            {months.map(({ year: y, month: m }) => (
              <section class="calendar-month-panel" key={`${y}-${m}`} aria-label={`${getMonthName(m)} ${y}`}>
                {dualMonth && <h2 class="calendar-month-title">{getMonthName(m)} {y}</h2>}
                {calendarLoading.value ? <SkeletonCalendar /> : (
                  <CalendarGrid
                    year={y}
                    month={m}
                    events={calendarData.value}
                    surgeryEvents={surgeryCalendarData.value}
                    spaceEvents={spaceScheduleCalendarData.value}
                    onDayClick={handleDayClick}
                  />
                )}
              </section>
            ))}
          </div>
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
