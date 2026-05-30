import { useEffect, useMemo, useState } from 'preact/hooks';
import { addSpaceSchedule, listSpaceSchedules, updateSpaceScheduleStatus } from '../services/api';
import { formatDateDisplay, getDayName, today } from '../utils/date';

const spaces = {
  ilmiah: {
    eyebrow: 'Jadwal ilmiah',
    title: 'Agenda Ilmiah',
    description: 'Untuk pertemuan staff Obgyn, journal club, diskusi kasus, seminar, audit klinik, dan agenda ilmiah lainnya.',
    action: 'Tambah jadwal ilmiah',
    switchLabel: 'Buka Pribadi',
    switchPath: '/docboard/personal',
    categoryLabel: 'Jenis kegiatan',
    participantLabel: 'Peserta',
    agendaPlaceholder: 'Pertemuan dengan staff Obgyn',
    locationPlaceholder: 'Ruang rapat, klinik, Zoom',
    participantPlaceholder: 'Staff Obgyn, dokter, bidan, tim terkait',
    categories: ['Pertemuan Staff', 'Journal Club', 'Diskusi Kasus', 'Webinar', 'Simposium', 'Audit Klinik', 'Riset'],
  },
  pribadi: {
    eyebrow: 'Jadwal pribadi',
    title: 'Agenda Pribadi',
    description: 'Untuk janji keluarga, agenda rumah, urusan pribadi, pengingat penting, dan blok waktu di luar jadwal klinik.',
    action: 'Tambah jadwal pribadi',
    switchLabel: 'Buka Ilmiah',
    switchPath: '/docboard/scientific',
    categoryLabel: 'Jenis agenda',
    participantLabel: 'Dengan',
    agendaPlaceholder: 'Janji dengan istri',
    locationPlaceholder: 'Rumah, restoran, lokasi janji',
    participantPlaceholder: 'Istri, keluarga, atau nama terkait',
    categories: ['Keluarga', 'Janji Pribadi', 'Urusan Rumah', 'Pengingat', 'Istirahat', 'Lainnya'],
  },
};

const statusLabels = {
  scheduled: 'Terjadwal',
  confirmed: 'Terkonfirmasi',
  done: 'Selesai',
  cancelled: 'Batal',
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

function formatTimeRange(item) {
  if (!item.start_time && !item.end_time) return 'Jam belum diisi';
  if (item.start_time && item.end_time) return `${item.start_time} - ${item.end_time}`;
  return item.start_time || item.end_time;
}

function sortSchedules(schedules) {
  return [...schedules].sort((first, second) => {
    const firstTime = `${first.schedule_date || '9999-12-31'}T${first.start_time || '00:00'}`;
    const secondTime = `${second.schedule_date || '9999-12-31'}T${second.start_time || '00:00'}`;
    return firstTime.localeCompare(secondTime);
  });
}

export default function KnowledgeSpace({ space = 'ilmiah' }) {
  const config = spaces[space] || spaces.ilmiah;
  const [schedules, setSchedules] = useState(() => listSpaceSchedules(space));
  const [form, setForm] = useState(() => createEmptyForm(config));

  useEffect(() => {
    setSchedules(listSpaceSchedules(space));
    setForm(createEmptyForm(config));
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
  };

  const handleStatus = (id, status) => {
    setSchedules(updateSpaceScheduleStatus(space, id, status));
  };

  return (
    <div class="page space-schedule-page stack">
      <section class={`space-schedule-hero ${space}`}>
        <div>
          <span class="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <a href={config.switchPath} class="secondary-action">
          {config.switchLabel}
        </a>
      </section>

      <section class="space-schedule-stats">
        <div class="space-stat">
          <span>Hari ini</span>
          <strong>{stats.today}</strong>
        </div>
        <div class="space-stat">
          <span>Aktif</span>
          <strong>{stats.active}</strong>
        </div>
        <div class="space-stat">
          <span>Selesai</span>
          <strong>{stats.done}</strong>
        </div>
      </section>

      <section class="space-schedule-layout">
        <form class="panel stack space-schedule-form" onSubmit={handleSubmit}>
          <div class="section-title">
            <div>
              <span>{config.action}</span>
              <h2>Penjadwalan</h2>
            </div>
          </div>

          <label class="field">
            <span>Agenda</span>
            <input
              value={form.agenda}
              onInput={handleChange('agenda')}
              placeholder={config.agendaPlaceholder}
              required
            />
          </label>

          <div class="field-grid">
            <label class="field">
              <span>Tanggal</span>
              <input
                type="date"
                value={form.schedule_date}
                onInput={handleChange('schedule_date')}
                required
              />
            </label>
            <label class="field">
              <span>{config.categoryLabel}</span>
              <select value={form.category} onInput={handleChange('category')}>
                {config.categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>Mulai</span>
              <input type="time" value={form.start_time} onInput={handleChange('start_time')} />
            </label>
            <label class="field">
              <span>Selesai</span>
              <input type="time" value={form.end_time} onInput={handleChange('end_time')} />
            </label>
          </div>

          <label class="field">
            <span>Lokasi</span>
            <input
              value={form.location}
              onInput={handleChange('location')}
              placeholder={config.locationPlaceholder}
            />
          </label>

          <label class="field">
            <span>{config.participantLabel}</span>
            <input
              value={form.participants}
              onInput={handleChange('participants')}
              placeholder={config.participantPlaceholder}
            />
          </label>

          <label class="field">
            <span>Catatan jadwal</span>
            <textarea
              value={form.notes}
              onInput={handleChange('notes')}
              placeholder="Keterangan singkat jadwal"
            />
          </label>

          <div class="form-actions">
            <button class="btn-primary" type="submit">{config.action}</button>
          </div>
        </form>

        <div class="panel space-schedule-list stack">
          <div class="section-title">
            <div>
              <span>Agenda</span>
              <h2>{schedules.length} jadwal</h2>
            </div>
          </div>

          {schedules.length === 0 && (
            <div class="empty-state">
              <p>Belum ada jadwal.</p>
            </div>
          )}

          {groupedSchedules.map((group) => (
            <section class="space-day-group" key={group.date}>
              <div class="space-day-title">{formatScheduleDate(group.date)}</div>
              <div class="space-day-list">
                {group.items.map((item) => (
                  <article class={`space-schedule-item status-${item.status}`} key={item.id}>
                    <div class="space-schedule-time">
                      <strong>{formatTimeRange(item)}</strong>
                      <span>{item.category}</span>
                    </div>
                    <div class="space-schedule-body">
                      <div class="space-schedule-row">
                        <h3>{item.agenda}</h3>
                        <span class={`space-status status-${item.status}`}>
                          {statusLabels[item.status] || item.status}
                        </span>
                      </div>
                      <div class="space-schedule-meta">
                        {item.location && <span>{item.location}</span>}
                        {item.participants && <span>{item.participants}</span>}
                      </div>
                      {item.notes && <p>{item.notes}</p>}
                      <div class="space-status-actions">
                        <button type="button" onClick={() => handleStatus(item.id, 'confirmed')}>Konfirmasi</button>
                        <button type="button" onClick={() => handleStatus(item.id, 'done')}>Selesai</button>
                        <button type="button" onClick={() => handleStatus(item.id, 'cancelled')}>Batal</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}