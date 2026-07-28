import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { formatDateDisplay, getDayName } from '../utils/date';
import { isPushSubscribed, isPushSupported, subscribeToPush } from '../utils/push';
import { ALARM_SOUNDS, playAlarmSound } from '../utils/alarmSound';

const TYPE_META = {
  operasi: { label: 'Operasi', color: '#BE123C', bg: '#FFF1F2' },
  tindakan: { label: 'Tindakan', color: '#047857', bg: '#ECFDF5' },
  ilmiah: { label: 'Ilmiah', color: '#1D4ED8', bg: '#EEF2FF' },
  pribadi: { label: 'Pribadi', color: '#C2410C', bg: '#FFF7ED' }
};

const ALARM_STATUS = {
  scheduled: { label: 'Aktif', className: 'active' },
  sending: { label: 'Mengirim', className: 'sending' },
  sent: { label: 'Sudah berbunyi', className: 'sent' },
  failed: { label: 'Gagal terkirim', className: 'failed' }
};

function wibTimeParts() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function minuteValue(time) {
  if (!time || !/^\d{2}:\d{2}/.test(time)) return null;
  const [hour, minute] = time.substring(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

function timeValue(minutes) {
  const bounded = Math.min(1439, Math.max(0, minutes));
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`;
}

function defaultAlarmTime(event) {
  const now = wibTimeParts();
  const nowMinutes = now.hour * 60 + now.minute;
  const eventMinutes = minuteValue(event.event_time);
  if (eventMinutes !== null && eventMinutes - 30 > nowMinutes) {
    return timeValue(eventMinutes - 30);
  }
  const nextFiveMinutes = Math.ceil((nowMinutes + 1) / 5) * 5;
  return timeValue(nextFiveMinutes);
}

function AlarmIcon({ active = false }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export default function TodayAlarms() {
  const [date, setDate] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [editingKey, setEditingKey] = useState('');
  const [draft, setDraft] = useState({ alarm_time: '', sound_key: 'gentle' });
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState(null);
  const pushSupported = isPushSupported();

  useEffect(() => {
    loadToday();
    checkPush();
  }, []);

  const counts = useMemo(() => {
    const result = { operasi: 0, tindakan: 0, ilmiah: 0, pribadi: 0 };
    events.forEach(event => {
      result[event.source_type] = (result[event.source_type] || 0) + 1;
    });
    return result;
  }, [events]);

  async function loadToday() {
    setLoading(true);
    setLoadError('');
    try {
      const result = await api.getTodayAlarms();
      setDate(result.date || '');
      setEvents(result.events || []);
    } catch (error) {
      setLoadError(error.message || 'Gagal memuat agenda hari ini');
    } finally {
      setLoading(false);
    }
  }

  async function checkPush() {
    if (!pushSupported) {
      setPushLoading(false);
      return;
    }
    try {
      setPushEnabled(await isPushSubscribed());
    } finally {
      setPushLoading(false);
    }
  }

  async function enableLockscreen() {
    setPushLoading(true);
    setMessage(null);
    try {
      await subscribeToPush();
      setPushEnabled(true);
      setMessage({ type: 'success', text: 'Alarm lockscreen aktif di perangkat ini.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Notifikasi lockscreen gagal diaktifkan.' });
    } finally {
      setPushLoading(false);
    }
  }

  function openEditor(event) {
    if (!event.alarmable) return;
    setMessage(null);
    setEditingKey(event.key);
    setDraft({
      alarm_time: event.alarm?.alarm_time || defaultAlarmTime(event),
      sound_key: event.alarm?.sound_key || 'gentle'
    });
  }

  async function previewSound(soundKey) {
    setDraft(current => ({ ...current, sound_key: soundKey }));
    try {
      await playAlarmSound(soundKey);
    } catch {
      setMessage({ type: 'error', text: 'Preview nada tidak dapat diputar di perangkat ini.' });
    }
  }

  async function saveAlarm(event) {
    setSavingKey(event.key);
    setMessage(null);
    try {
      if (!pushEnabled) {
        await subscribeToPush();
        setPushEnabled(true);
      }
      const result = await api.saveTodayAlarm({
        source_type: event.source_type,
        source_id: event.source_id,
        alarm_time: draft.alarm_time,
        sound_key: draft.sound_key
      });
      setEvents(current => current.map(item => (
        item.key === event.key ? { ...item, alarm: result.alarm } : item
      )));
      setEditingKey('');
      setMessage({ type: 'success', text: `Alarm ${draft.alarm_time} sudah aktif.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Alarm gagal disimpan.' });
    } finally {
      setSavingKey('');
    }
  }

  async function removeAlarm(event) {
    if (!event.alarm?.id) return;
    setSavingKey(event.key);
    setMessage(null);
    try {
      await api.deleteTodayAlarm(event.alarm.id);
      setEvents(current => current.map(item => (
        item.key === event.key ? { ...item, alarm: null } : item
      )));
      setEditingKey('');
      setMessage({ type: 'success', text: 'Alarm dihapus.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Alarm gagal dihapus.' });
    } finally {
      setSavingKey('');
    }
  }

  const alarmCount = events.filter(event => event.alarm?.status === 'scheduled').length;

  return (
    <div class="view-today-alarms">
      <header class="alarm-page-header">
        <button class="back-btn" type="button" onClick={() => route('/docboard/')} aria-label="Kembali">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div>
          <h1>Alarm Hari Ini</h1>
          <p>{date ? `${getDayName(date, true)}, ${formatDateDisplay(date)}` : 'Agenda hari ini'}</p>
        </div>
        <div class="alarm-header-count">
          <strong>{alarmCount}</strong>
          <span>aktif</span>
        </div>
      </header>

      <section class={`alarm-lockscreen-card ${pushEnabled ? 'enabled' : ''}`}>
        <div class="alarm-lockscreen-icon"><AlarmIcon active={pushEnabled} /></div>
        <div class="alarm-lockscreen-copy">
          <strong>{pushEnabled ? 'Lockscreen aktif' : 'Aktifkan alarm lockscreen'}</strong>
          <span>
            {!pushSupported
              ? 'Browser ini belum mendukung push notification.'
              : pushEnabled
                ? 'Alarm dapat muncul saat DocBoard ditutup.'
                : 'Izinkan notifikasi agar alarm muncul saat layar terkunci.'}
          </span>
        </div>
        {!pushEnabled && pushSupported && (
          <button type="button" onClick={enableLockscreen} disabled={pushLoading}>
            {pushLoading ? 'Memeriksa...' : 'Aktifkan'}
          </button>
        )}
      </section>

      <div class="alarm-sound-note">
        Nada pilihan diputar saat DocBoard aktif. Di lockscreen, suara mengikuti pengaturan notifikasi perangkat.
      </div>

      {message && <div class={`alarm-message ${message.type}`}>{message.text}</div>}

      <div class="alarm-type-summary" aria-label="Ringkasan agenda">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <div class="alarm-type-chip" key={key} style={{ color: meta.color, background: meta.bg }}>
            <strong>{counts[key] || 0}</strong>
            <span>{meta.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div class="alarm-loading-list">
          {[1, 2, 3].map(item => <div class="alarm-skeleton" key={item} />)}
        </div>
      ) : loadError ? (
        <div class="alarm-empty-state">
          <strong>Agenda belum dapat dimuat</strong>
          <span>{loadError}</span>
          <button type="button" onClick={loadToday}>Coba lagi</button>
        </div>
      ) : events.length === 0 ? (
        <div class="alarm-empty-state">
          <AlarmIcon />
          <strong>Tidak ada acara hari ini</strong>
          <span>Operasi, tindakan, ilmiah, dan agenda pribadi akan muncul di sini.</span>
        </div>
      ) : (
        <div class="alarm-event-list">
          {events.map(event => {
            const meta = TYPE_META[event.source_type] || TYPE_META.ilmiah;
            const status = event.alarm ? (ALARM_STATUS[event.alarm.status] || ALARM_STATUS.scheduled) : null;
            const isEditing = editingKey === event.key;
            const sound = ALARM_SOUNDS.find(item => item.key === event.alarm?.sound_key);
            return (
              <article class={`alarm-event-card ${event.alarm ? 'has-alarm' : ''}`} key={event.key}>
                <div class="alarm-event-main">
                  <div class="alarm-event-time">
                    <strong>{event.event_time || '--:--'}</strong>
                    <span style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                  </div>
                  <button class="alarm-event-detail" type="button" onClick={() => route(event.url)}>
                    <strong>{event.title}</strong>
                    <span>{[event.subtitle, event.location].filter(Boolean).join(' • ') || 'Tanpa detail'}</span>
                  </button>
                  <button
                    class={`alarm-event-action ${event.alarm ? 'active' : ''}`}
                    type="button"
                    onClick={() => openEditor(event)}
                    disabled={!event.alarmable || event.alarm?.status === 'sent'}
                    aria-label={event.alarm ? 'Ubah alarm' : 'Atur alarm'}
                  >
                    <AlarmIcon active={!!event.alarm} />
                  </button>
                </div>

                {event.alarm && !isEditing && (
                  <div class="alarm-event-status">
                    <div>
                      <span class={`alarm-status-dot ${status.className}`} />
                      <strong>{status.label} {event.alarm.alarm_time}</strong>
                      <span>• {sound?.label || 'Lembut'}</span>
                    </div>
                    {event.alarm.last_error && <small>{event.alarm.last_error}</small>}
                    {event.alarm.status !== 'sent' && (
                      <button type="button" onClick={() => openEditor(event)}>Ubah</button>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div class="alarm-editor">
                    <label class="alarm-time-field">
                      <span>Jam alarm</span>
                      <input
                        type="time"
                        value={draft.alarm_time}
                        onInput={eventInput => setDraft(current => ({ ...current, alarm_time: eventInput.currentTarget.value }))}
                        required
                      />
                    </label>
                    <div class="alarm-sound-picker">
                      <span>Pilih nada</span>
                      <div>
                        {ALARM_SOUNDS.map(option => (
                          <button
                            type="button"
                            class={draft.sound_key === option.key ? 'selected' : ''}
                            key={option.key}
                            onClick={() => previewSound(option.key)}
                          >
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div class="alarm-editor-actions">
                      {event.alarm && (
                        <button
                          class="alarm-delete-btn"
                          type="button"
                          onClick={() => removeAlarm(event)}
                          disabled={savingKey === event.key}
                        >
                          Hapus
                        </button>
                      )}
                      <button class="alarm-cancel-btn" type="button" onClick={() => setEditingKey('')}>Batal</button>
                      <button
                        class="alarm-save-btn"
                        type="button"
                        onClick={() => saveAlarm(event)}
                        disabled={!draft.alarm_time || savingKey === event.key}
                      >
                        {savingKey === event.key ? 'Menyimpan...' : 'Aktifkan alarm'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
