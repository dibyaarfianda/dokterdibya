import { getCalendarDays, isToday } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const EVENT_BARS = [
  { key: 'operasi', label: 'Operasi', className: 'operasi' },
  { key: 'tindakan', label: 'Tindakan', className: 'tindakan' },
  { key: 'ilmiah', label: 'Ilmiah', className: 'ilmiah' },
  { key: 'pribadi', label: 'Pribadi', className: 'pribadi' },
];

export default function CalendarGrid({ year, month, events, surgeryEvents, spaceEvents, onDayClick }) {
  const days = getCalendarDays(year, month);
  const surgData = surgeryEvents || {};
  const spaceData = spaceEvents || {};

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
          const daySpace = spaceData[day.date] || {};
          const spaceTotal = daySpace.total || 0;
          const eventBars = EVENT_BARS.filter(bar => {
            if (bar.key === 'operasi') return surgTotal > 0;
            return (daySpace.spaces?.[bar.key] || 0) > 0;
          });
          const todayClass = isToday(day.date) ? ' is-today' : '';
          const currentClass = day.isCurrentMonth ? '' : ' other-month';
          const hasEvents = locations.length > 0;
          const hasSurgery = surgLocs.length > 0;
          const hasSpaceSchedule = spaceTotal > 0;

          return (
            <div
              key={day.date}
              class={`calendar-cell${todayClass}${currentClass}${hasEvents || hasSurgery || hasSpaceSchedule ? ' has-events' : ''}`}
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
              {eventBars.length > 0 && (
                <div class="calendar-event-bars" aria-label={eventBars.map(bar => bar.label).join(', ')}>
                  {eventBars.map(bar => (
                    <span
                      key={bar.key}
                      class={`calendar-event-bar ${bar.className}`}
                      title={bar.label}
                    />
                  ))}
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
