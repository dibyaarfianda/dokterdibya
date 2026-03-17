import { useState, useRef, useEffect } from 'preact/hooks';
import { api } from '../services/api';
import { today, formatDateLocal } from '../utils/date';

export default function ExportButton() {
  const [open, setOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setShowDatePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function getWeekRange() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatDateLocal(monday), end: formatDateLocal(sunday) };
  }

  function getMonthRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDateLocal(first), end: formatDateLocal(last) };
  }

  function exportPDF(start, end) {
    const url = api.getExportPDFUrl(start, end);
    window.open(url, '_blank');
    setOpen(false);
    setShowDatePicker(false);
  }

  function handleCustomExport() {
    if (!startDate || !endDate) return;
    exportPDF(startDate, endDate);
  }

  return (
    <div class="export-btn-wrapper" ref={dropdownRef}>
      <button
        class="btn-icon"
        onClick={() => setOpen(!open)}
        title="Export PDF"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      {open && (
        <div class="export-dropdown">
          <div class="export-dropdown-title">Export PDF</div>

          <button class="export-option" onClick={() => exportPDF(...Object.values(getWeekRange()))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" />
            </svg>
            <span>Minggu Ini</span>
          </button>

          <button class="export-option" onClick={() => exportPDF(...Object.values(getMonthRange()))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" />
            </svg>
            <span>Bulan Ini</span>
          </button>

          <button
            class="export-option"
            onClick={() => setShowDatePicker(!showDatePicker)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Pilih Tanggal</span>
          </button>

          {showDatePicker && (
            <div class="export-date-picker">
              <div class="export-date-row">
                <label>Dari</label>
                <input
                  type="date"
                  value={startDate}
                  onInput={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div class="export-date-row">
                <label>Sampai</label>
                <input
                  type="date"
                  value={endDate}
                  onInput={(e) => setEndDate(e.target.value)}
                />
              </div>
              <button
                class="btn-small btn-full"
                disabled={!startDate || !endDate}
                onClick={handleCustomExport}
              >
                Export
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
