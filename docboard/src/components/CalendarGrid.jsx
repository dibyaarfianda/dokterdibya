import { getCalendarDays, isToday } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function CalendarGrid({ year, month, events, surgeryEvents, onDayClick }) {
  const days = getCalendarDays(year, month);
  const surgData = surgeryEvents || {};

  return (
    <div class="calendar-grid">
      <div class="calendar-header-row">
        {DAY_HEADERS.map(d => (
          <div key={d} class="calendar-header-cell">{d}</div>
        ))}
      </div>
      <div class="calendar-body">
        {days.map(day => {
          const dayEvents = events[day.date] || {};
          const locations = dayEvents.locations || [];
          const daySurg = surgData[day.date] || {};
          const surgLocs = daySurg.locations || [];
          const surgTotal = daySurg.total || 0;
          const todayClass = isToday(day.date) ? ' is-today' : '';
          const currentClass = day.isCurrentMonth ? '' : ' other-month';
          const hasEvents = locations.length > 0;
          const hasSurgery = surgLocs.length > 0;

          return (
            <div
              key={day.date}
              class={`calendar-cell${todayClass}${currentClass}${hasEvents || hasSurgery ? ' has-events' : ''}`}
              onClick={() => day.isCurrentMonth && onDayClick(day.date)}
            >
              <span class="calendar-day-number">{day.day}</span>
              {locations.length > 0 && (
                <div class="calendar-dots">
                  {locations.map(loc => (
                    <span
                      key={loc}
                      class="calendar-dot"
                      style={{ backgroundColor: LOCATIONS[loc]?.color || '#94A3B8' }}
                      title={LOCATIONS[loc]?.name}
                    />
                  ))}
                </div>
              )}
              {hasSurgery && (
                <div class="calendar-surgery-badge" title={`${surgTotal} tindakan`}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.2 14.4l-2.8 2.8c-1 1-1 2.6 0 3.6s2.6 1 3.6 0l2.8-2.8M16.8 9.6l2.8-2.8c1-1 1-2.6 0-3.6s-2.6-1-3.6 0l-2.8 2.8M8 16l8-8" />
                  </svg>
                  <span>{surgTotal}</span>
                </div>
              )}
              {dayEvents.totalPatients > 0 && (
                <span class="calendar-patient-count">{dayEvents.totalPatients}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
