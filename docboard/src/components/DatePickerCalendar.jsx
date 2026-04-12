import { useState, useEffect, useRef } from 'preact/hooks';
import { api } from '../services/api';
import { getCalendarDays, isToday, formatDateLocal, getMonthName, formatDateDisplay } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function DatePickerCalendar({ value, onSelect, required }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Determine initial viewing month from value or today
  const initDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [calendarData, setCalendarData] = useState({});
  const [loadingCal, setLoadingCal] = useState(false);

  // Fetch calendar data when month changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCal(true);
    api.getSurgeryCalendar(viewYear, viewMonth + 1).then(data => {
      if (!cancelled) {
        setCalendarData(data.calendar || {});
        setLoadingCal(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingCal(false);
    });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth, open]);

  // Update view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const days = getCalendarDays(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDate = (dateStr) => {
    onSelect(dateStr);
    setOpen(false);
  };

  const displayValue = value ? formatDateDisplay(value) : '';

  return (
    <div class="datepicker-wrap" ref={ref}>
      <div class="datepicker-input" onClick={() => setOpen(!open)}>
        <input
          type="text"
          value={displayValue}
          placeholder="Pilih tanggal"
          readOnly
          required={required}
        />
        <span class="datepicker-icon">📅</span>
      </div>

      {open && (
        <div class="datepicker-dropdown">
          <div class="datepicker-nav">
            <button type="button" onClick={prevMonth}>‹</button>
            <span class="datepicker-month-label">
              {getMonthName(viewMonth)} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}>›</button>
          </div>

          <div class="datepicker-header-row">
            {DAY_HEADERS.map(d => (
              <div key={d} class="datepicker-header-cell">{d}</div>
            ))}
          </div>

          <div class="datepicker-body">
            {days.map(day => {
              const evt = calendarData[day.date] || {};
              const locs = evt.locations || [];
              const total = evt.totalPatients || 0;
              const isSel = day.date === value;
              const todayC = isToday(day.date) ? ' dp-today' : '';
              const curC = day.isCurrentMonth ? '' : ' dp-other';
              const selC = isSel ? ' dp-selected' : '';
              const hasC = locs.length > 0 ? ' dp-has-event' : '';

              return (
                <div
                  key={day.date}
                  class={`datepicker-cell${todayC}${curC}${selC}${hasC}`}
                  onClick={() => day.isCurrentMonth && selectDate(day.date)}
                >
                  <span class="dp-day-num">{day.day}</span>
                  {locs.length > 0 && (
                    <div class="dp-dots">
                      {locs.map(loc => (
                        <span
                          key={loc}
                          class="dp-dot"
                          style={{ backgroundColor: LOCATIONS[loc]?.color || '#94A3B8' }}
                        />
                      ))}
                    </div>
                  )}
                  {total > 0 && (
                    <span class="dp-count">{total}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div class="datepicker-legend">
            {Object.entries(LOCATIONS).map(([key, loc]) => (
              <div key={key} class="dp-legend-item">
                <span class="dp-dot" style={{ backgroundColor: loc.color }} />
                <span>{loc.shortName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
