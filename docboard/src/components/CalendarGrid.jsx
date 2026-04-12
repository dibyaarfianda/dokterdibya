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
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
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
