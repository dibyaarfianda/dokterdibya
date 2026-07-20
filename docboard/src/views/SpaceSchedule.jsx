import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import {
  addSpaceSchedule,
  deleteSpaceSchedule,
  listSpaceSchedules,
  updateSpaceSchedule,
  updateSpaceScheduleStatus,
} from '../services/api';
import { user } from '../stores/auth';
import { formatDateDisplay, getDayName, today } from '../utils/date';
import { isNandaUser } from '../utils/access';

const SCHEDULE_COMPLETION_ALLOWED_EMAILS = ['nanda.arfianda@gmail.com'];

function hasAllowedEmail(currentUser, allowedEmails) {
  const email = String(currentUser?.email || '').toLowerCase();
  return allowedEmails.includes(email);
}

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
  tindakan: {
    title: 'Jadwal Tindakan',
    subtitle: 'Jadwal tindakan klinik dan poli seperti IUD, implan, pap smear/IVA, USG, dan tindakan VK.',
    action: 'Tambah tindakan',
    categoryLabel: 'Jenis tindakan',
    participantLabel: 'Pasien / pendamping',
    agendaPlaceholder: 'Nama pasien atau ringkasan tindakan',
    locationPlaceholder: 'Klinik, VK, poli, atau rumah sakit',
    participantPlaceholder: 'Nama pasien, pendamping, atau staff terkait',
    categories: [
      'Pasang IUD',
      'Lepas Pasang IUD',
      'Lepas IUD',
      'Pasang Implan',
      'Lepas Pasang Implan',
      'Lepas Implan',
      'Cuci Vagina',
      'Pap Smear/IVA',
      'Stripping Membrane',
      'Induksi Foley Balon',
      'USG VK',
      'USG Poli',
    ],
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

function createFormFromSchedule(schedule, config) {
  return {
    agenda: schedule.agenda || '',
    category: schedule.category || config.categories[0],
    schedule_date: schedule.schedule_date || today(),
    start_time: schedule.start_time || '',
    end_time: schedule.end_time || '',
    location: schedule.location || '',
    participants: schedule.participants || '',
    notes: schedule.notes || '',
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
  const canFinalizeSchedule = hasAllowedEmail(user.value, SCHEDULE_COMPLETION_ALLOWED_EMAILS)
    || String(user.value?.id || '') === 'UDZAQUCQWZ';
  const canViewPrivateSchedule = isNandaUser(user.value);
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm(config));
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (space === 'pribadi' && !canViewPrivateSchedule) {
      route('/docboard/procedures');
      return () => { active = false; };
    }
    setLoading(true);
    listSpaceSchedules(space).then((items) => {
      if (active) setSchedules(items);
    }).finally(() => {
      if (active) setLoading(false);
    });
    setForm(createEmptyForm(config));
    setShowForm(false);
    setExpandedId(null);
    setEditingId(null);
    return () => { active = false; };
  }, [space]);

  const reloadSchedules = async () => {
    const items = await listSpaceSchedules(space);
    setSchedules(items);
    return items;
  };

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      agenda: form.agenda.trim(),
      category: form.category,
      schedule_date: form.schedule_date,
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location.trim(),
      participants: form.participants.trim(),
      notes: form.notes.trim(),
    };

    if (editingId) {
      const updated = await updateSpaceSchedule(space, editingId, payload);
      const items = await reloadSchedules();
      setForm(createEmptyForm(config));
      setShowForm(false);
      setExpandedId(updated?.id || editingId);
      setEditingId(null);
      if (!items.some((item) => item.id === editingId) && updated) {
        setSchedules((current) => sortSchedules([...current, updated]));
      }
      return;
    }

    const schedule = await addSpaceSchedule(space, payload);

    await reloadSchedules();
    setForm(createEmptyForm(config));
    setShowForm(false);
    setExpandedId(schedule.id);
  };

  const openCreateForm = () => {
    setForm(createEmptyForm(config));
    setEditingId(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setForm(createEmptyForm(config));
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (event, item) => {
    event.stopPropagation();
    setForm(createFormFromSchedule(item, config));
    setEditingId(item.id);
    setShowForm(true);
    setExpandedId(item.id);
  };

  const handleDelete = async (event, item) => {
    event.stopPropagation();
    if (!canFinalizeSchedule) {
      window.alert('Hanya nanda.arfianda@gmail.com yang bisa menghapus jadwal.');
      return;
    }
    if (!window.confirm(`Hapus jadwal "${item.agenda}"?`)) return;
    await deleteSpaceSchedule(space, item.id);
    await reloadSchedules();
    if (editingId === item.id) {
      setForm(createEmptyForm(config));
      setShowForm(false);
      setEditingId(null);
    }
    setExpandedId(null);
  };

  const handleStatus = async (event, id, status) => {
    event.stopPropagation();
    if (status === 'done' && !canFinalizeSchedule) {
      window.alert('Hanya nanda.arfianda@gmail.com yang bisa menyelesaikan jadwal.');
      return;
    }
    await updateSpaceScheduleStatus(space, id, status);
    await reloadSchedules();
  };

  const openSpace = (targetSpace) => {
    if (targetSpace === 'pribadi' && !canViewPrivateSchedule) return;
    const routes = {
      ilmiah: '/docboard/scientific',
      tindakan: '/docboard/procedures',
      pribadi: '/docboard/personal',
    };
    route(routes[targetSpace] || routes.ilmiah);
  };

  return (
    <div class="view-space-schedule">
      <div class="view-header space-view-header">
        <h1>{config.title}</h1>
        <div class="view-header-actions">
          <button class="btn-icon-primary" onClick={openCreateForm} aria-label={config.action}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="view-toggle space-toggle" role="tablist" aria-label="Pilih ruang jadwal">
        <button class={`view-toggle-btn${space === 'ilmiah' ? ' active' : ''}`} onClick={() => openSpace('ilmiah')}>
          Ilmiah
        </button>
        <button class={`view-toggle-btn${space === 'tindakan' ? ' active' : ''}`} onClick={() => openSpace('tindakan')}>
          Tindakan
        </button>
        {canViewPrivateSchedule && (
          <button class={`view-toggle-btn${space === 'pribadi' ? ' active' : ''}`} onClick={() => openSpace('pribadi')}>
            Pribadi
          </button>
        )}
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
          <div class="form-section-title">{editingId ? 'Edit agenda' : config.action}</div>
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
            <button class="btn-secondary" type="button" onClick={closeForm}>Batal</button>
            <button class="btn-primary" type="submit">{editingId ? 'Update' : 'Simpan'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div class="loading-state"><div class="spinner" /></div>
      ) : schedules.length === 0 ? (
        <div class="empty-state">
          <p>Belum ada jadwal</p>
          <button class="btn-primary" onClick={openCreateForm}>+ Tambah agenda</button>
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
                      {(item.creator_display_name || item.creator_name) && (
                        <div class="space-agenda-submeta">Entry oleh {item.creator_display_name || item.creator_name}</div>
                      )}
                      {item.participants && <div class="space-agenda-submeta">{item.participants}</div>}
                      {isExpanded && item.notes && <div class="space-agenda-notes">{item.notes}</div>}
                      {isExpanded && (
                        <div class="space-status-actions">
                          <button type="button" onClick={(event) => handleEdit(event, item)}>Edit</button>
                          <button type="button" onClick={(event) => handleStatus(event, item.id, 'confirmed')}>Konfirmasi</button>
                          {canFinalizeSchedule && (
                            <button type="button" onClick={(event) => handleStatus(event, item.id, 'done')}>Selesai</button>
                          )}
                          <button type="button" onClick={(event) => handleStatus(event, item.id, 'cancelled')}>Batal</button>
                          {canFinalizeSchedule && (
                            <button type="button" class="danger" onClick={(event) => handleDelete(event, item)}>Hapus</button>
                          )}
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

      <button class="fab" onClick={openCreateForm} aria-label={config.action}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
