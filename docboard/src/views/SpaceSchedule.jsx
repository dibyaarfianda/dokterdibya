import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { addSpaceSchedule, listSpaceSchedules, updateSpaceScheduleStatus } from '../services/api';
import { formatDateDisplay, getDayName, today } from '../utils/date';

const spaces = {
  ilmiah: {
    title: 'Jadwal Ilmiah',
    subtitle: 'Pertemuan staff Obgyn, journal club, seminar, audit klinik, dan diskusi kasus.',
    action: 'Tambah agenda',
    categoryLabel: 'Jenis kegiatan',
    participantLabel: 'Peserta',
    agendaPlaceholder: 'Pertemuan dengan staff Obgyn',
    locationPlaceholder: 'Ruang rapat, klinik, Zoom',
    participantPlaceholder: 'Staff Obgyn, dokter, bidan, tim terkait',
    categories: ['Pertemuan Staff', 'Journal Club', 'Diskusi Kasus', 'Webinar', 'Simposium', 'Audit Klinik', 'Riset'],
  },
  pribadi: {
    title: 'Jadwal Pribadi',
    subtitle: 'Janji keluarga, agenda rumah, pengingat penting, dan blok waktu di luar jadwal klinik.',
    action: 'Tambah agenda',
    categoryLabel: 'Jenis agenda',
    participantLabel: 'Dengan',
    agendaPlaceholder: 'Janji dengan istri',
    locationPlaceholder: 'Rumah, restoran, lokasi janji',
    participantPlaceholder: 'Istri, keluarga, atau nama terkait',
    categories: ['Keluarga', 'Janji Pribadi', 'Urusan Rumah', 'Pengingat', 'Istirahat', 'Lainnya'],
  },
};

const statusMeta = {
  scheduled: { label: 'Terjadwal', color: '#F59E0B', bg: '#FEF3C7' },
  confirmed: { label: 'Konfirmasi', color: '#3B82F6', bg: '#DBEAFE' },
  done: { label: 'Selesai', color: '#22C55E', bg: '#DCFCE7' },
  cancelled: { label: 'Batal', color: '#EF4444', bg: '#FEE2E2' },
};

function createEmptyForm(config) {
  return {
    agenda: '',
    category: config.categories[0],
    schedule_date: today(),
    start_time: '',
    end_time: '',
    location: '',
    participants: '',
    notes: '',
  };
}

function parseDateLocal(dateString) {
  if (!dateString || dateString === 'tanpa-tanggal') return null;
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatScheduleDate(dateString) {
  const date = parseDateLocal(dateString);
  if (!date) return 'Tanpa tanggal';
  return `${getDayName(date, true)}, ${formatDateDisplay(date)}`;
}

function formatStartTime(item) {
  return item.start_time || item.end_time || '--:--';
}

function formatEndTime(item) {
  if (!item.start_time || !item.end_time) return '';
  return `sampai ${item.end_time}`;
}

function sortSchedules(schedules) {
  return [...schedules].sort((first, second) => {
    const firstTime = `${first.schedule_date || '9999-12-31'}T${first.start_time || '00:00'}`;
    const secondTime = `${second.schedule_date || '9999-12-31'}T${second.start_time || '00:00'}`;
    return firstTime.localeCompare(secondTime);
  });
}

export default function SpaceSchedule({ space = 'ilmiah' }) {
  const config = spaces[space] || spaces.ilmiah;
  const [schedules, setSchedules] = useState(() => listSpaceSchedules(space));
  const [form, setForm] = useState(() => createEmptyForm(config));
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setSchedules(listSpaceSchedules(space));
    setForm(createEmptyForm(config));
    setShowForm(false);
    setExpandedId(null);
  }, [space]);

  const stats = useMemo(() => {
    const todayDate = today();
    return {
      today: schedules.filter((item) => item.schedule_date === todayDate && item.status !== 'cancelled').length,
      active: schedules.filter((item) => item.status !== 'done' && item.status !== 'cancelled').length,
      done: schedules.filter((item) => item.status === 'done').length,
    };
  }, [schedules]);

  const groupedSchedules = useMemo(() => {
    const groups = new Map();
    schedules.forEach((item) => {
      const dateKey = item.schedule_date || 'tanpa-tanggal';
      const items = groups.get(dateKey) || [];
      groups.set(dateKey, [...items, item]);
    });
    return [...groups.entries()].map(([date, items]) => ({ date, items }));
  }, [schedules]);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.currentTarget.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const schedule = addSpaceSchedule(space, {
      agenda: form.agenda.trim(),
      category: form.category,
      schedule_date: form.schedule_date,
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location.trim(),
      participants: form.participants.trim(),
      notes: form.notes.trim(),
    });

    setSchedules((current) => sortSchedules([...current, schedule]));
    setForm(createEmptyForm(config));
    setShowForm(false);
    setExpandedId(schedule.id);
  };

  const handleStatus = (event, id, status) => {
    event.stopPropagation();
    setSchedules(updateSpaceScheduleStatus(space, id, status));
  };

  const openSpace = (targetSpace) => {
    route(targetSpace === 'ilmiah' ? '/docboard/scientific' : '/docboard/personal');
  };

  return (
    <div class="view-space-schedule">
      <div class="page-header space-page-header">
        <div>
          <h1 class="page-title">{config.title}</h1>
          <div class="page-subtitle">{config.subtitle}</div>
        </div>
        <button class="btn-icon-primary" onClick={() => setShowForm(true)} aria-label={config.action}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div class="view-toggle space-toggle" role="tablist" aria-label="Pilih ruang jadwal">
        <button class={`view-toggle-btn${space === 'ilmiah' ? ' active' : ''}`} onClick={() => openSpace('ilmiah')}>
          Ilmiah
        </button>
        <button class={`view-toggle-btn${space === 'pribadi' ? ' active' : ''}`} onClick={() => openSpace('pribadi')}>
          Pribadi
        </button>
      </div>

      <div class="space-summary-card">
        <div class="space-summary-main">
          <span class="today-label">Hari Ini</span>
          <span class="today-count">{stats.today} agenda</span>
        </div>
        <div class="space-summary-chips">
          <span>{stats.active} aktif</span>
          <span>{stats.done} selesai</span>
        </div>
      </div>

      {showForm && (
        <form class="space-form-card" onSubmit={handleSubmit}>
          <div class="form-section-title">{config.action}</div>
          <div class="form-group">
            <label>Agenda</label>
            <input value={form.agenda} onInput={handleChange('agenda')} placeholder={config.agendaPlaceholder} required />
          </div>

          <div class="space-form-row">
            <div class="form-group">
              <label>Tanggal</label>
              <input type="date" value={form.schedule_date} onInput={handleChange('schedule_date')} required />
            </div>
            <div class="form-group">
              <label>{config.categoryLabel}</label>
              <select value={form.category} onInput={handleChange('category')}>
                {config.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </div>

          <div class="space-form-row">
            <div class="form-group">
              <label>Mulai</label>
              <input type="time" value={form.start_time} onInput={handleChange('start_time')} />
            </div>
            <div class="form-group">
              <label>Selesai</label>
              <input type="time" value={form.end_time} onInput={handleChange('end_time')} />
            </div>
          </div>

          <div class="form-group">
            <label>Lokasi</label>
            <input value={form.location} onInput={handleChange('location')} placeholder={config.locationPlaceholder} />
          </div>

          <div class="form-group">
            <label>{config.participantLabel}</label>
            <input value={form.participants} onInput={handleChange('participants')} placeholder={config.participantPlaceholder} />
          </div>

          <div class="form-group">
            <label>Catatan jadwal</label>
            <textarea value={form.notes} onInput={handleChange('notes')} placeholder="Keterangan singkat jadwal" />
          </div>

          <div class="space-form-actions">
            <button class="btn-secondary" type="button" onClick={() => setShowForm(false)}>Batal</button>
            <button class="btn-primary" type="submit">Simpan</button>
          </div>
        </form>
      )}

      {schedules.length === 0 ? (
        <div class="empty-state">
          <p>Belum ada jadwal</p>
          <button class="btn-primary" onClick={() => setShowForm(true)}>+ Tambah agenda</button>
        </div>
      ) : (
        <div class="space-groups">
          {groupedSchedules.map((group) => (
            <div class="surgery-group" key={group.date}>
              <div class={`surgery-date-header ${group.date === today() ? 'today' : ''}`}>
                <span class="surgery-date-day">{formatScheduleDate(group.date)}</span>
                <span class="surgery-date-count">{group.items.length} agenda</span>
              </div>

              {group.items.map((item) => {
                const status = statusMeta[item.status] || statusMeta.scheduled;
                const isExpanded = expandedId === item.id;
                return (
                  <article class={`space-agenda-card ${isExpanded ? 'expanded' : ''}`} key={item.id} onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                    <div class="space-agenda-left">
                      <span class="space-agenda-time">{formatStartTime(item)}</span>
                      <span class={`space-agenda-dot ${space}`} />
                    </div>
                    <div class="space-agenda-body">
                      <div class="space-agenda-title">{item.agenda}</div>
                      <div class="space-agenda-meta">
                        <span class="space-category-badge">{item.category}</span>
                        {formatEndTime(item) && <span>{formatEndTime(item)}</span>}
                        {item.location && <span>{item.location}</span>}
                      </div>
                      {item.participants && <div class="space-agenda-submeta">{item.participants}</div>}
                      {isExpanded && item.notes && <div class="space-agenda-notes">{item.notes}</div>}
                      {isExpanded && (
                        <div class="space-status-actions">
                          <button type="button" onClick={(event) => handleStatus(event, item.id, 'confirmed')}>Konfirmasi</button>
                          <button type="button" onClick={(event) => handleStatus(event, item.id, 'done')}>Selesai</button>
                          <button type="button" onClick={(event) => handleStatus(event, item.id, 'cancelled')}>Batal</button>
                        </div>
                      )}
                    </div>
                    <div class="space-agenda-right">
                      <span class="status-badge" style={{ color: status.color, backgroundColor: status.bg }}>
                        {status.label}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <button class="fab" onClick={() => setShowForm(true)} aria-label={config.action}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}