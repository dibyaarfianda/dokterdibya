import { docboardSession } from './docboard-session.js';
const API = '/api/assistant-daf';
const $ = (selector) => document.querySelector(selector);
const notice = $('#notice');
const dialog = $('#review-dialog');
const form = $('#confirm-form');
let selectedDraft = null;
let targetSchedules = [];
let unlocked = false;
let authEpoch = 0;
let lastActivity = Date.now();
let sharedText = '';
let authenticatorOpen = false;
let selectedPatientName = '';
let aiReady = false;
let aiBusy = false;

function updateAiControls() {
  const available = unlocked && aiReady && !aiBusy;
  $('#ai-question').disabled = !available;
  $('#ai-send').disabled = !available;
  $('#ai-propose').disabled = !available || !$('#ai-question').value.trim();
}

function clearPrivateUi() {
  unlocked = false; authEpoch++;
  document.querySelector('main').classList.add('locked');
  dialog.close(); form.reset(); selectedDraft = null; targetSchedules = []; selectedPatientName = '';
  $('#drafts').replaceChildren(); $('#source-preview').textContent = '';
  $('#patient-results').replaceChildren(); $('#patient-search').value = '';
  $('#selected-patient').textContent = ''; $('#shared-text').value = '';
  $('#device-list').replaceChildren(); $('#calendar-result').textContent = '';
  $('#monitor-devices').replaceChildren(); $('#monitor-chats').replaceChildren();
  $('#monitor-memory').replaceChildren(); $('#monitor-code').textContent = ''; $('#monitor-code').hidden = true;
  $('#ai-question').value = ''; $('#ai-answer').textContent = ''; $('#ai-answer').hidden = true;
  aiBusy = false; updateAiControls();
  $('#count').textContent = ''; sharedText = '';
  $('#connection').textContent = 'Terkunci';
  $('#security-settings').hidden = true; $('#security-settings').open = false;
  $('#unlock-button').hidden = false;
  $('#unlock-button').textContent = 'Buka dengan passkey';
  $('#unlock-button').dataset.mode = 'authenticate';
  for (const id of ['add-passkey', 'passkey-devices', 'push-enable', 'push-disable', 'calendar-link', 'calendar-revoke', 'lock-button']) $(`#${id}`).hidden = true;
}

function message(text, error = false) {
  notice.textContent = text;
  notice.classList.toggle('error', error);
}

function showTab(name) {
  for (const button of document.querySelectorAll('[data-tab]')) button.classList.toggle('active', button.dataset.tab === name);
  for (const section of document.querySelectorAll('#review, #share, #monitor, #discussion')) section.classList.toggle('hidden', section.id !== name);
  if (name === 'monitor' && unlocked) loadMonitor().catch((error) => message(error.message, true));
}

async function api(path, options = {}) {
  const epoch = authEpoch;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const body = await response.json();
  if (response.status === 401) clearPrivateUi();
  if (!response.ok) throw new Error(body.message || 'Permintaan gagal');
  if (epoch !== authEpoch && !['/passkey/auth/verify', '/passkey/register/verify', '/passkey/lock'].includes(path)) throw new Error('Asisten terkunci. Buka kembali untuk melanjutkan.');
  return body;
}

async function refreshPasskeyState() {
  const state = await api('/passkey/state');
  if (!state.unlocked && unlocked) clearPrivateUi();
  unlocked = state.unlocked;
  updateAiControls();
  document.querySelector('main').classList.toggle('locked', !unlocked);
  $('#connection').textContent = unlocked ? 'Passkey aktif' : 'Terkunci';
  $('#security-settings').hidden = !unlocked;
  $('#unlock-button').hidden = unlocked;
  $('#add-passkey').hidden = !unlocked;
  $('#passkey-devices').hidden = !unlocked;
  $('#push-enable').hidden = !unlocked;
  $('#push-disable').hidden = !unlocked;
  $('#calendar-link').hidden = !unlocked;
  $('#calendar-revoke').hidden = !unlocked;
  $('#lock-button').hidden = !unlocked;
  if (unlocked) {
    $('#unlock-explanation').textContent = 'Tampilan terkunci saat aplikasi ditinggalkan atau tidak digunakan selama 10 menit.';
    await loadDrafts();
    lastActivity = Date.now();
    if (sharedText) { $('#shared-text').value = sharedText; sharedText = ''; showTab('share'); }
  } else if (state.registered) {
    $('#unlock-explanation').textContent = 'Gunakan passkey terdaftar untuk membuka data jadwal.';
    $('#unlock-button').textContent = 'Buka dengan passkey';
    $('#unlock-button').dataset.mode = 'authenticate';
  } else {
    $('#unlock-explanation').textContent = 'Daftarkan passkey pertama setelah masuk di DocBoard pada perangkat ini.';
    $('#unlock-button').textContent = 'Daftarkan passkey';
    $('#unlock-button').dataset.mode = 'register';
  }
}

async function registerPasskey() {
  const token = docboardSession.getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const result = await api('/passkey/register/options', { method: 'POST', body: '{}', headers });
  let response;
  authenticatorOpen = true;
  try { response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: result.options }); }
  finally { authenticatorOpen = false; }
  await api('/passkey/register/verify', {
    method: 'POST', headers,
    body: JSON.stringify({ flow_id: result.flow_id, response })
  });
  message('Passkey tersimpan.');
  await refreshPasskeyState();
}

async function authenticatePasskey() {
  const result = await api('/passkey/auth/options', { method: 'POST', body: '{}' });
  let response;
  authenticatorOpen = true;
  try { response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: result.options }); }
  finally { authenticatorOpen = false; }
  await api('/passkey/auth/verify', {
    method: 'POST', body: JSON.stringify({ flow_id: result.flow_id, response })
  });
  await refreshPasskeyState();
}

function vapidBytes(value) {
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push tidak didukung perangkat ini');
  const key = await api('/push/key');
  if (!key.public_key) throw new Error('Pengingat push belum dikonfigurasi');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(key.public_key) });
  await api('/push/register', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
  message('Pengingat push aktif pada perangkat ini. Periksa juga langganan kalender H-1.');
}

async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await api('/push/unregister', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  }
  message('Pengingat push pada perangkat ini sudah dinonaktifkan.');
}

async function showPasskeyDevices() {
  const result = await api('/passkey/devices');
  const container = $('#device-list'); container.replaceChildren();
  for (const [index, device] of result.devices.entries()) {
    const row = document.createElement('p');
    const label = document.createElement('span');
    label.textContent = `Passkey ${index + 1} · ${new Date(device.created_at).toLocaleDateString('id-ID')} `;
    row.append(label);
    if (result.devices.length > 1) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Cabut';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Cabut passkey ini dan akhiri semua sesi Asisten DAF?')) return;
        try {
          await api(`/passkey/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
          container.replaceChildren(); await refreshPasskeyState();
        } catch (error) { message(error.message, true); }
      });
      row.append(remove);
    }
    container.append(row);
  }
}

function line(parent, text, tag = 'p') {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

function renderDrafts(drafts) {
  const container = $('#drafts');
  container.replaceChildren();
  $('#count').textContent = drafts.length ? `(${drafts.length})` : '';
  if (!drafts.length) { line(container, 'Belum ada usulan. Bagikan satu pesan atau tempel pesannya untuk mulai.'); return; }
  for (const draft of drafts) {
    const card = document.createElement('article');
    card.className = 'card';
    line(card, draft.proposal?.agenda || 'Agenda perlu diperiksa', 'h3');
    line(card, `${draft.proposal?.schedule_date || 'Tanggal belum jelas'} · ${draft.proposal?.start_time || 'Jam belum jelas'} · ${draft.proposal?.location || 'Lokasi belum jelas'}`);
    if (draft.proposal?.needs_review?.length) line(card, `Periksa: ${draft.proposal.needs_review.join(', ')}`, 'span').className = 'badge';
    if (draft.source_chat) line(card, `Sumber: ${draft.source_chat} · pemberitahuan Android`, 'span').className = 'badge';
    if (draft.ai_status === 'pending') line(card, 'AI sedang meninjau. Anda tetap dapat meninjau rincian sendiri.');
    if (draft.ai_status === 'failed') line(card, 'AI belum dapat meninjau. Periksa sendiri atau tunggu koneksi pulih.');
    if (draft.ai_review) line(card, `AI: ${draft.ai_review.is_schedule ? 'kemungkinan jadwal' : 'kemungkinan bukan jadwal'} · ${draft.ai_review.reason}`);
    if (draft.notification_truncated) line(card, 'Pratinjau pemberitahuan mungkin tidak lengkap.', 'span').className = 'badge';
    line(card, draft.source_text, 'div').className = 'source';
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Tinjau usulan';
    button.addEventListener('click', () => openDraft(draft));
    actions.append(button); card.append(actions); container.append(card);
  }
}

async function loadDrafts() {
  try {
    const result = await api('/drafts');
    renderDrafts(result.drafts);
  } catch (error) {
    $('#drafts').textContent = error.message;
  }
}

async function loadMonitor() {
  const result = await api('/monitor');
  $('#monitor-state').textContent = result.review_ready
    ? (result.review_usage.reviewed >= result.review_usage.daily_limit
      ? `Batas AI hari ini tercapai (${result.review_usage.daily_limit}). Usulan tetap tersedia untuk tinjauan Dokter; AI melanjutkan besok.`
      : `Peninjauan AI aktif: ${result.review_usage.reviewed}/${result.review_usage.daily_limit} pesan hari ini. Cakupan tetap terbatas pada pemberitahuan chat terpilih.`)
    : 'Peninjauan AI belum aktif. Pesan dari perangkat akan menunggu peninjauan.';
  const devices = $('#monitor-devices'); devices.replaceChildren();
  if (!result.devices.length) line(devices, 'Belum ada ponsel pendamping terpasang.');
  for (const device of result.devices) {
    const row = document.createElement('div'); row.className = 'card';
    line(row, device.device_label, 'h3');
    line(row, device.last_seen_at ? `Terakhir terhubung: ${new Date(device.last_seen_at).toLocaleString('id-ID')}` : 'Belum terhubung');
    const revoke = document.createElement('button'); revoke.type = 'button'; revoke.textContent = 'Cabut perangkat';
    revoke.addEventListener('click', async () => {
      if (!window.confirm(`Cabut ${device.device_label} dari pemantauan?`)) return;
      try { await api(`/monitor/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' }); await loadMonitor(); }
      catch (error) { message(error.message, true); }
    });
    row.append(revoke); devices.append(row);
  }
  const chats = $('#monitor-chats'); chats.replaceChildren();
  if (!result.chats.length) line(chats, 'Chat akan muncul setelah ada pemberitahuan baru pada ponsel pendamping.');
  for (const chat of result.chats) {
    const row = document.createElement('div'); row.className = 'card';
    line(row, chat.label, 'h3'); line(row, `Terakhir terlihat: ${new Date(chat.last_seen_at).toLocaleString('id-ID')}`);
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = chat.allowed ? 'Hentikan pemantauan' : 'Pantau chat ini';
    button.addEventListener('click', async () => {
      if (!chat.allowed && !window.confirm(`Pantau pemberitahuan dari ${chat.label}? Pastikan ini chat yang dimaksud.`)) return;
      try { await api(`/monitor/chats/${encodeURIComponent(chat.id)}`, {
        method: 'PUT', body: JSON.stringify({ allowed: !chat.allowed })
      }); await loadMonitor(); } catch (error) { message(error.message, true); }
    });
    row.append(button); chats.append(row);
  }
  const memory = $('#monitor-memory'); memory.replaceChildren();
  if (!result.memory.length) line(memory, 'Belum ada kebiasaan yang dipelajari.');
  for (const item of result.memory) line(memory,
    `${item.category} · ${item.location} · ${item.action} · ${item.observations} keputusan`);
}

async function loadSchedules() {
  const result = await api('/schedules');
  targetSchedules = result.schedules;
  const select = form.elements.target_schedule_id;
  select.replaceChildren(new Option('Pilih jadwal', ''));
  for (const schedule of targetSchedules) {
    const date = String(schedule.schedule_date || '').slice(0, 10);
    select.add(new Option(`${date} · ${schedule.start_time || '--:--'} · ${schedule.agenda} · ${schedule.location || '-'} · ${schedule.patient_ref_value ? `ID ${schedule.patient_ref_value}` : 'ID belum tertaut'}`, schedule.id));
  }
}

function syncForm() {
  const action = form.elements.action.value;
  const space = form.elements.space.value;
  $('#target-wrap').classList.toggle('hidden', action === 'create');
  $('#patient-picker').classList.toggle('hidden', action === 'cancel' || space !== 'tindakan');
  for (const name of ['agenda', 'category', 'schedule_date', 'start_time']) form.elements[name].required = action !== 'cancel';
  form.elements.target_schedule_id.required = action !== 'create';
  form.elements.location.required = action !== 'cancel' && space === 'tindakan';
}

async function openDraft(draft) {
  selectedDraft = draft;
  selectedPatientName = '';
  form.reset();
  const proposal = draft.proposal || {};
  for (const name of ['action', 'space', 'agenda', 'category', 'schedule_date', 'start_time', 'location']) {
    if (proposal[name] && form.elements[name]) form.elements[name].value = proposal[name];
  }
  form.elements.draft_id.value = draft.id;
  form.elements.patient_ref_value.value = '';
  form.elements.patient_facility.value = '';
  $('#selected-patient').textContent = 'Belum ada identitas terverifikasi';
  $('#patient-results').replaceChildren();
  $('#patient-search').value = '';
  $('#source-preview').textContent = draft.source_text;
  syncForm();
  try { await loadSchedules(); } catch (error) { message(error.message, true); }
  if (!unlocked) return;
  dialog.showModal();
}

let patientTimer;
async function searchPatients() {
  const query = $('#patient-search').value.trim();
  const facilityByLocation = { Melinda: 'rsia_melinda', Gambiran: 'rsud_gambiran', Bhayangkara: 'rs_bhayangkara' };
  const facility = facilityByLocation[form.elements.location.value];
  const container = $('#patient-results'); container.replaceChildren();
  selectedPatientName = '';
  form.elements.patient_ref_value.value = '';
  form.elements.patient_facility.value = '';
  $('#selected-patient').textContent = 'Belum ada identitas terverifikasi';
  if (query.length < 2 || !facility) { message('Pilih rumah sakit dan isi nomor RM lengkap.', true); return; }
  $('#patient-search-button').disabled = true;
  $('#patient-search-button').textContent = 'Memeriksa direktori rumah sakit…';
  try {
    const { patients } = await api('/patients/search', { method: 'POST', body: JSON.stringify({ q: query, facility }) });
    if ($('#patient-search').value.trim() !== query || facilityByLocation[form.elements.location.value] !== facility || !unlocked) return;
    const matching = patients.filter((patient) => patient.facility === facilityByLocation[form.elements.location.value]);
    for (const patient of matching) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${patient.full_name} · RM ${patient.hospital_mr_id} · ${form.elements.location.value}`;
      button.addEventListener('click', () => {
        form.elements.patient_ref_value.value = patient.hospital_mr_id;
        form.elements.patient_facility.value = patient.facility;
        selectedPatientName = patient.full_name;
        $('#selected-patient').textContent = `Terpilih: ${patient.full_name} · RM ${patient.hospital_mr_id}`;
        container.replaceChildren();
      });
      container.append(button);
    }
    if (!matching.length) line(container, 'Tidak ada nomor RM terverifikasi untuk fasilitas yang dipilih.');
  } catch (error) { message(error.message, true); }
  finally { $('#patient-search-button').disabled = false; $('#patient-search-button').textContent = 'Periksa nomor RM'; }
}

async function submitConfirmation(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.patient_name = selectedPatientName;
  if (data.space === 'tindakan' && data.action !== 'cancel' && !data.patient_ref_value) {
    message('Pilih satu pasien terverifikasi dari hasil pencarian.', true); return;
  }
  const target = targetSchedules.find((schedule) => String(schedule.id) === data.target_schedule_id);
  data.target_version = target?.version;
  const describe = (row) => `${row.agenda}\n${row.patient_name || 'Jadwal pribadi'}${row.patient_ref_value ? ` · RM ${row.patient_ref_value}` : ''}\n${row.schedule_date} pukul ${row.start_time} · ${row.location || '-'}`;
  const summary = data.action === 'cancel' ? `Batalkan jadwal ini?\n\n${describe(target || {})}`
    : data.action === 'update' ? `Konfirmasi perubahan:\n\nSEBELUM\n${describe(target || {})}\n\nSESUDAH\n${describe(data)}`
      : `Buat jadwal berikut?\n\n${describe(data)}`;
  if (!window.confirm(summary)) return;
  try {
    await api(`/drafts/${encodeURIComponent(data.draft_id)}/confirm`, { method: 'POST', body: JSON.stringify(data) });
    dialog.close(); message('Jadwal diperbarui setelah konfirmasi Anda.'); await loadDrafts();
  } catch (error) { message(error.message, true); }
}

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
$('#unlock-button').addEventListener('click', async () => {
  try {
    if ($('#unlock-button').dataset.mode === 'register') await registerPasskey();
    else await authenticatePasskey();
  } catch (error) { message(error.message || 'Passkey gagal', true); }
});
$('#add-passkey').addEventListener('click', async () => {
  try { await registerPasskey(); } catch (error) { message(error.message || 'Passkey gagal', true); }
});
$('#passkey-devices').addEventListener('click', () => showPasskeyDevices().catch((error) => message(error.message, true)));
$('#push-enable').addEventListener('click', () => enablePush().catch((error) => message(error.message, true)));
$('#push-disable').addEventListener('click', () => disablePush().catch((error) => message(error.message, true)));
$('#calendar-link').addEventListener('click', async () => {
  if (!window.confirm('Buat tautan kalender baru? Tautan sebelumnya akan dicabut. Siapa pun yang memiliki tautan ini dapat melihat waktu dan lokasi jadwal tanpa nama pasien.')) return;
  try {
    const result = await api('/calendar/token', { method: 'POST', body: '{}' });
    await navigator.clipboard.writeText(result.url);
    $('#calendar-result').textContent = 'Tautan disalin. Tambahkan sebagai kalender berlangganan pada aplikasi kalender Anda. Periksa apakah alarm H-1 benar-benar muncul.';
  } catch (error) { message(error.message, true); }
});
$('#calendar-revoke').addEventListener('click', async () => {
  if (!window.confirm('Cabut tautan kalender aktif? Kalender berlangganan tidak akan menerima pembaruan lagi.')) return;
  try {
    await api('/calendar/token', { method: 'DELETE' });
    $('#calendar-result').textContent = 'Tautan kalender dicabut.';
  } catch (error) { message(error.message, true); }
});
$('#lock-button').addEventListener('click', async () => {
  clearPrivateUi();
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_SHARE' });
  try {
    await api('/passkey/lock', { method: 'POST', body: '{}' });
    message('Asisten terkunci.');
  }
  catch (error) { message(error.message, true); }
});
$('#reload').addEventListener('click', loadDrafts);
$('#monitor-reload').addEventListener('click', () => loadMonitor().catch((error) => message(error.message, true)));
$('#monitor-pair').addEventListener('click', async () => {
  try {
    const pair = await api('/monitor/pair', { method: 'POST', body: '{}' });
    $('#monitor-code').textContent = `Kode pemasangan: ${pair.code} · berlaku ${pair.expires_minutes} menit. Masukkan hanya pada aplikasi pendamping Asisten DAF di ponsel cadangan.`;
    $('#monitor-code').hidden = false;
  } catch (error) { message(error.message, true); }
});
$('#monitor-clear-memory').addEventListener('click', async () => {
  if (!window.confirm('Hapus semua memori keputusan? Jadwal dan usulan tidak akan terhapus.')) return;
  try { await api('/monitor/memory', { method: 'DELETE' }); await loadMonitor(); }
  catch (error) { message(error.message, true); }
});
$('#close-dialog').addEventListener('click', () => dialog.close());
form.elements.action.addEventListener('change', syncForm);
form.elements.space.addEventListener('change', syncForm);
form.elements.target_schedule_id.addEventListener('change', () => {
  const target = targetSchedules.find((row) => String(row.id) === form.elements.target_schedule_id.value);
  if (!target) return;
  for (const name of ['space', 'agenda', 'category', 'schedule_date', 'start_time', 'location', 'patient_ref_type', 'patient_ref_value', 'patient_facility']) {
    form.elements[name].value = target[name] || '';
  }
  selectedPatientName = target.patient_name || '';
  $('#selected-patient').textContent = `${selectedPatientName || 'Identitas belum tertaut'} · RM ${target.patient_ref_value || '-'}`;
  $('#patient-results').replaceChildren();
  syncForm();
});
form.elements.location.addEventListener('change', () => {
  selectedPatientName = '';
  form.elements.patient_ref_value.value = '';
  form.elements.patient_facility.value = '';
  $('#selected-patient').textContent = 'Pilih ulang nomor RM untuk lokasi ini';
  $('#patient-results').replaceChildren();
});
$('#patient-search-button').addEventListener('click', searchPatients);
$('#patient-search').addEventListener('input', () => {
  selectedPatientName = ''; form.elements.patient_ref_value.value = ''; form.elements.patient_facility.value = '';
  $('#selected-patient').textContent = 'Periksa ulang nomor RM'; $('#patient-results').replaceChildren();
});
form.addEventListener('submit', submitConfirmation);
$('#ignore-draft').addEventListener('click', async () => {
  if (!selectedDraft || !window.confirm('Abaikan usulan ini?')) return;
  try { await api(`/drafts/${encodeURIComponent(selectedDraft.id)}/ignore`, { method: 'POST', body: '{}' }); dialog.close(); await loadDrafts(); }
  catch (error) { message(error.message, true); }
});
$('#share-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/drafts', { method: 'POST', body: JSON.stringify({ text: $('#shared-text').value }) });
    $('#shared-text').value = ''; message('Usulan masuk ke Perlu Ditinjau.'); showTab('review'); await loadDrafts();
  } catch (error) { message(error.message, true); }
});

$('#ai-question').addEventListener('input', updateAiControls);
$('#ai-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = $('#ai-question').value.trim();
  if (!question || !unlocked || !aiReady || aiBusy) return;
  aiBusy = true; updateAiControls();
  $('#ai-send').textContent = 'Menunggu jawaban…';
  $('#ai-answer').hidden = false;
  $('#ai-answer').textContent = 'AI sedang menjawab…';
  try {
    const result = await api('/ai/discuss', { method: 'POST', body: JSON.stringify({ text: question }) });
    if (unlocked) $('#ai-answer').textContent = result.answer;
  } catch (error) {
    if (unlocked) { $('#ai-answer').textContent = ''; $('#ai-answer').hidden = true; message(error.message, true); }
  } finally {
    aiBusy = false; $('#ai-send').textContent = 'Tanya AI'; updateAiControls();
  }
});
$('#ai-propose').addEventListener('click', async () => {
  const text = $('#ai-question').value.trim();
  if (!text || !unlocked || !aiReady || aiBusy) return;
  aiBusy = true; updateAiControls();
  try {
    await api('/drafts', { method: 'POST', body: JSON.stringify({ text }) });
    $('#ai-question').value = ''; $('#ai-answer').textContent = ''; $('#ai-answer').hidden = true;
    message('Pesan Anda masuk ke Perlu Ditinjau. Periksa semua rinciannya sebelum konfirmasi.');
    showTab('review'); await loadDrafts();
  } catch (error) { message(error.message, true); }
  finally { aiBusy = false; updateAiControls(); }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'SHARED_TEXT') return;
    history.replaceState(null, '', '/assistant-daf/');
    if (!event.data.text) { message('Pesan sementara sudah hilang. Bagikan ulang atau salin-tempel pesannya.', true); return; }
    if (unlocked) { $('#shared-text').value = event.data.text; showTab('share'); }
    else sharedText = event.data.text;
    message('Pesan diterima sementara di perangkat ini. Buka dengan passkey lalu periksa pesannya.');
  });
  navigator.serviceWorker.register('/assistant-daf/sw.js', { scope: '/assistant-daf/' }).then(() => navigator.serviceWorker.ready).then((registration) => {
    const token = new URLSearchParams(location.search).get('shared');
    if (token) (navigator.serviceWorker.controller || registration.active)?.postMessage({ type: 'TAKE_SHARE', token });
  }).catch(() => {});
}

for (const name of ['pointerdown', 'keydown']) document.addEventListener(name, () => { lastActivity = Date.now(); });
function backgroundLock() {
  if (authenticatorOpen || !unlocked) return;
  clearPrivateUi();
  navigator.sendBeacon?.(`${API}/passkey/lock`, new Blob(['{}'], { type: 'application/json' }));
}
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundLock(); });
window.addEventListener('pagehide', backgroundLock);
setInterval(() => {
  if (unlocked && Date.now() - lastActivity > 10 * 60 * 1000) backgroundLock();
}, 15000);

if (new URLSearchParams(location.search).has('share_error')) message('Aplikasi pengirim tidak menyediakan teks pesan.', true);
api('/status').then(async (result) => {
  aiReady = result.private_ai_ready === true;
  $('#ai-state').textContent = aiReady ? 'AI RunPod tersambung. Gunakan passkey untuk bertanya.' : 'AI RunPod belum aktif. Masukkan pesan dan tinjau usulan secara manual.';
  updateAiControls();
  if (!result.manual_share_ready) {
    $('#connection').textContent = 'Menunggu konfigurasi';
    $('#unlock-explanation').textContent = 'Penyimpanan terenkripsi dan passkey belum dikonfigurasi. Data pasien belum dapat diproses.';
    return;
  }
  // Every new page requires a fresh passkey; a prior cookie alone never reveals data.
  await api('/passkey/lock', { method: 'POST', body: '{}' });
  await refreshPasskeyState();
}).catch((error) => {
  $('#connection').textContent = 'Tidak tersedia';
  message(error.message, true);
});
