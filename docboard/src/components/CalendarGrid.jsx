import { getCalendarDays, isToday } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function CalendarGrid({ year, month, events, onDayClick }) {
  const days = getCalendarDays(year, month);

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
          const todayClass = isToday(day.date) ? ' is-today' : '';
          const currentClass = day.isCurrentMonth ? '' : ' other-month';
          const hasEvents = locations.length > 0;

          return (
            <div
              key={day.date}
              class={`calendar-cell${todayClass}${currentClass}${hasEvents ? ' has-events' : ''}`}
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
