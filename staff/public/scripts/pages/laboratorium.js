import { getIdToken, TOKEN_KEY } from '../vps-auth-v2.js';
import { escapeHtml as esc } from '../safe-render.js';
import { mergeOcrCandidates, statusLabel, currentWib, PANELS, removeLabSource, sameLabContext, mergeSourceWarnings, labSourceBytes, labPrincipal } from './lab-report-form.js';

let host; let report = null; let data; let selectedVisit = null; let visits = []; let pendingFiles = []; let previews = [];
let candidate = null; let generation = 0; let dirty = false; let busy = false; let context = {}; let controller = null;
let creationToken = '';
let owner = '';
let cancelConfirmation = null;
const can = permission => window.hasAccountPermission ? window.hasAccountPermission(permission) : false;
const pretty = value => String(value || '').replace('T', ' ');
const defaults = () => { creationToken = crypto.randomUUID(); return ({ examined_at: currentWib(), technician: 'ACHMAD SHOLEH, A.MD.', license: '503/0126/SIP-SIK/419.104/2024',
    doctor: 'dr. Dibya Arfianda, Sp.OG', request_time: '', notes: '', parameters: [], sources: [], source_warnings: [], identity_resolved: false, review_confirmed: false }); };
function clearPreviews() { previews.forEach(url => URL.revokeObjectURL(url)); previews = []; }
function clearAccountState() {
    cancelConfirmation?.(); busy = false;
    generation++; controller?.abort(); clearPreviews(); report = null; data = null; selectedVisit = null; visits = []; pendingFiles = []; candidate = null; dirty = false; context = {}; creationToken = ''; owner = '';
    if (host) frame('<p class="lr-empty-small">Sesi atau hak akses berubah. Buka kembali menu Laboratorium.</p>');
}
async function verifyOwner(token, bind = false) {
    const principal = labPrincipal(token || await getIdToken(), window.currentStaffUser || window.auth?.currentUser);
    if (!principal || (owner && principal !== owner)) { clearAccountState(); throw new Error('Akun berubah. Buka kembali menu Laboratorium.'); }
    if (bind) owner = principal;
    return principal;
}
window.addEventListener('auth:credentials-changed', () => { if (owner) verifyOwner().catch(() => {}); });
window.addEventListener('storage', event => { if (owner && (!event.key || event.key === TOKEN_KEY)) verifyOwner().catch(() => {}); });
window.addEventListener('staff:access-changed', () => { if (owner) clearAccountState(); });
function confirmAction(prompt) {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog'); dialog.className = 'lr-dialog';
        dialog.innerHTML = `<h2>Konfirmasi</h2><p>${esc(prompt)}</p><div class="lr-buttons"><button type="button" class="lr-btn" data-answer="no">Batal</button><button type="button" class="lr-btn lr-primary" data-answer="yes">Lanjutkan</button></div>`;
        const finish = value => { cancelConfirmation = null; dialog.close(); dialog.remove(); resolve(value); };
        cancelConfirmation = () => finish(false);
        dialog.querySelector('[data-answer="yes"]').addEventListener('click', () => finish(true));
        dialog.querySelector('[data-answer="no"]').addEventListener('click', () => finish(false));
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        host.appendChild(dialog); dialog.showModal();
    });
}
async function request(path = '', options = {}) {
    const token = await getIdToken();
    const principal = await verifyOwner(token); const mine = generation;
    const headers = { Authorization: `Bearer ${token}`, ...options.headers };
    if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    const response = await fetch(`/api/lab-reports${path}`, { cache: 'no-store', ...options, headers });
    const result = await response.json();
    await verifyOwner();
    if (mine !== generation || principal !== owner) throw new DOMException('Sesi berubah.', 'AbortError');
    if (!response.ok || !result.success) { const error = new Error(result.message || 'Permintaan gagal.'); error.code = result.code; throw error; }
    return result;
}
function message(text, error = false) {
    const box = host.querySelector('[data-lab-message]'); if (!box) return;
    box.hidden = false; box.className = `lr-message ${error ? 'lr-error' : 'lr-success'}`; box.textContent = text;
}
function frame(body) {
    host.innerHTML = `<div class="lr-shell"><header class="lr-top"><div><span class="lr-kicker">KLINIK PRIVAT</span><h1>Laboratorium</h1></div><img src="${asset('images/laboratorium/dpc-lab-logo.png')}" alt="dr. Dibya Private Clinic"></header><div data-lab-message hidden role="status" aria-live="polite"></div>${body}</div>`;
}
function asset(relative) { const url = new URL(`../../${relative}`, import.meta.url); url.search = new URL(import.meta.url).search; return url.href; }
async function showList() {
    if (dirty && !await confirmAction('Ada isian belum disimpan. Kembali ke daftar?')) return;
    generation++; dirty = false; controller?.abort(); clearPreviews(); pendingFiles = []; candidate = null; report = null;
    frame(`<div class="lr-toolbar"><input id="lr-list-search" type="search" placeholder="Cari nama, DRD, atau nomor lab" aria-label="Cari laporan"><button type="button" class="lr-btn" data-action="search-list">Cari</button>${can('lab_exam.create') ? '<button type="button" class="lr-btn lr-primary" data-action="new">+ Tambah Hasil</button>' : ''}</div><div id="lr-list" aria-live="polite">Memuat laporan...</div>`);
    await loadList();
}
async function loadList() {
    const currentGeneration = generation;
    const search = host.querySelector('#lr-list-search')?.value || '';
    const query = new URLSearchParams({ search, mr_id: context.mrId || '' });
    const result = await request(`?${query}`);
    if (generation !== currentGeneration) return;
    const list = host.querySelector('#lr-list'); if (!list) return;
    list.innerHTML = result.reports.length ? result.reports.map(row => `<button type="button" class="lr-report-card" data-action="open" data-id="${Number(row.id)}"><div><strong>${esc(row.patient_name)}</strong><span>${esc(row.mr_id)} · ${esc(pretty(row.examined_at))}</span><small>${esc(row.lab_number || 'Nomor lab diberikan saat terbit')}</small></div><span class="lr-badge ${statusLabel(row) === 'Terbit' ? 'lr-published' : ''}">${statusLabel(row)}</span></button>`).join('')
        : '<div class="lr-empty"><i class="fas fa-flask"></i><h2>Belum ada hasil lab</h2><p>Pilih pasien dan DRD Klinik Privat untuk membuat hasil pertama.</p></div>';
}
async function newReport() {
    generation++; dirty = false; report = null; selectedVisit = null; pendingFiles = []; candidate = null; clearPreviews(); data = defaults();
    renderEditor();
    await searchVisits(context.mrId || '');
    if (context.mrId) {
        const match = visits.find(v => v.mr_id === context.mrId && (!context.patientId || v.patient_id === context.patientId));
        if (match) chooseVisit(String(match.visit_id));
    }
}
async function openReport(id) {
    const mine = ++generation; const result = await request(`/${id}`); if (mine !== generation) return;
    report = result.report; data = structuredClone(report.data); selectedVisit = { visit_id: report.visit_id, patient_id: report.patient_id, mr_id: report.mr_id, patient_name: report.patient_name, birth_date: report.birth_date };
    pendingFiles = []; candidate = null; clearPreviews(); dirty = false; renderEditor();
}
function input(label, key, value, type = 'text', extra = '') {
    return `<label class="lr-field"><span>${label}</span><input type="${type}" data-field="${key}" value="${esc(value || '')}" ${extra}></label>`;
}
function renderEditor() {
    const editable = can(report ? 'lab_exam.edit' : 'lab_exam.create');
    const identity = selectedVisit ? `<strong>${esc(selectedVisit.patient_name)}</strong><span>${esc(selectedVisit.patient_id)} · ${esc(selectedVisit.mr_id)} · ${esc(selectedVisit.birth_date || 'Tanggal lahir belum tersedia')}</span>` : '<strong>Pilih pasien dan DRD</strong><span>Tujuan laporan harus ditentukan sebelum unggah atau simpan.</span>';
    frame(`<button type="button" class="lr-link" data-action="back">← Daftar hasil</button>
        <div class="lr-identity">${identity}${report ? `<span class="lr-badge">${statusLabel(report)} · v${Number(report.version)}</span>` : ''}</div>
        <form id="lr-form"><fieldset ${editable ? '' : 'disabled'}>
        ${!report ? `<section class="lr-section"><h2>1. Pasien & DRD</h2><div class="lr-search"><input id="lr-patient-search" type="search" placeholder="Cari nama pasien atau DRD" aria-label="Cari pasien dan DRD"><button type="button" class="lr-btn" data-action="search-visits">Cari</button></div><div id="lr-visits"></div></section>` : ''}
        <section class="lr-section"><h2>${report ? '' : '2. '}Pemeriksaan</h2><div class="lr-grid">${input('Tanggal & waktu pemeriksaan', 'examined_at', data.examined_at, 'datetime-local', 'required')}${input('Waktu permintaan (opsional)', 'request_time', data.request_time)}</div></section>
        <section class="lr-section"><h2>${report ? '' : '3. '}Foto atau isi manual</h2><p class="lr-muted">Foto yang terang membantu pembacaan. JPG, PNG, WebP, PDF; 10 MB/file, total 30 MB.</p>
        <div class="lr-buttons"><label class="lr-btn lr-upload">📷 Ambil Foto<input type="file" id="lr-camera" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label><label class="lr-btn lr-upload">Unggah Foto / PDF<input type="file" id="lr-files" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden></label><button type="button" class="lr-btn lr-primary" data-action="ocr" ${(pendingFiles.length || (report && data.sources.length)) && selectedVisit && can(pendingFiles.length ? 'lab_exam.create' : 'lab_exam.edit') ? '' : 'disabled'}>Baca dengan OCR</button></div>
        <div class="lr-sources">${renderSources()}</div><div id="lr-candidate">${renderCandidate()}</div></section>
        <section class="lr-section"><h2>${report ? '' : '4. '}Periksa hasil</h2><div class="lr-buttons"><select id="lr-panel" aria-label="Panel pemeriksaan">${Object.keys(PANELS).map(p => `<option>${esc(p)}</option>`).join('')}</select><button type="button" class="lr-btn" data-action="add-panel">Tambah Panel</button><button type="button" class="lr-btn" data-action="add-row">+ Parameter</button><button type="button" class="lr-link" data-action="remove-empty">Hapus baris kosong</button></div>
        <div class="lr-parameters">${renderParameters()}</div>
        ${data.source_warnings?.length ? `<div class="lr-warning"><strong>Periksa sumber</strong><ul>${data.source_warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul><label><input type="checkbox" data-field="identity_resolved" ${data.identity_resolved ? 'checked' : ''}> Saya telah mencocokkan identitas, tanggal, dan sumber.</label></div>` : ''}
        <label class="lr-check"><input type="checkbox" data-field="review_confirmed" ${data.review_confirmed ? 'checked' : ''}> Saya telah memeriksa hasil, satuan, dan rujukan untuk pasien/DRD ini.</label></section>
        <section class="lr-section"><h2>Petugas & catatan</h2><div class="lr-grid">${input('Petugas laboratorium', 'technician', data.technician)}${input('Nomor SIP / izin', 'license', data.license)}</div>${input('Dokter pengirim', 'doctor', data.doctor)}<label class="lr-field"><span>Catatan (opsional)</span><textarea data-field="notes" rows="3">${esc(data.notes || '')}</textarea></label></section>
        </fieldset></form>
        <div class="lr-footer">${editable ? '<button type="button" class="lr-btn lr-primary" data-action="save">Simpan Draf</button>' : ''}${can('patient_documents.create') && report ? '<button type="button" class="lr-btn lr-publish" data-action="publish">Terbitkan ke Pasien</button>' : ''}${report && can('medical_records.export') ? '<button type="button" class="lr-btn" data-action="pdf">PDF Hasil</button>' : ''}${report ? '<button type="button" class="lr-btn" data-action="compare">Komparasi</button>' : ''}${report && can('medical_records.delete') ? '<button type="button" class="lr-btn lr-danger" data-action="delete">Hapus</button>' : ''}</div>`);
    if (!report) renderVisits();
}
function renderSources() {
    const stored = (data.sources || []).map((source, i) => `<div class="lr-source"><a href="${esc(source.url)}" target="_blank" rel="noopener">${source.type.startsWith('image/') ? `<img src="${esc(source.url)}" alt="Sumber hasil lab">` : '<span>PDF</span>'}${esc(source.name)}</a><button type="button" class="lr-link" data-action="remove-source" data-index="${i}">Lepas</button></div>`).join('');
    return stored + pendingFiles.map((file, i) => `<div class="lr-source"><a href="${esc(previews[i])}" target="_blank" rel="noopener">${file.type.startsWith('image/') ? `<img src="${esc(previews[i])}" alt="Pratinjau sumber hasil lab">` : '<span>PDF</span>'}${esc(file.name)}</a><button type="button" class="lr-link" data-action="remove-file" data-index="${i}">Lepas</button></div>`).join('');
}
function renderCandidate() {
    if (!candidate) return '';
    return `<div class="lr-candidate"><strong>Pratinjau OCR · ${candidate.parameters.length} parameter</strong><p class="lr-muted">Cocokkan dengan sumber sebelum diterapkan.</p><div class="lr-candidate-rows">${candidate.parameters.map(p => `<div><span>${esc(p.name)}</span><strong>${esc(p.raw_value || 'Belum terbaca')} ${esc(p.unit)}</strong></div>`).join('')}</div>${candidate.source_warnings.map(w => `<p class="lr-warning">${esc(w)}</p>`).join('')}<div class="lr-buttons"><button type="button" class="lr-btn lr-primary" data-action="apply-ocr">Isi Baris Kosong & Tambahkan</button><button type="button" class="lr-btn" data-action="replace-ocr">Gunakan sebagai Daftar Hasil</button></div></div>`;
}
function renderParameters() {
    if (!data.parameters.length) return '<p class="lr-empty-small">Tambahkan panel, parameter manual, atau terapkan hasil OCR.</p>';
    let panel = '';
    return data.parameters.map((p, i) => {
        const heading = panel !== p.panel ? `<h3>${esc(p.panel || 'Lainnya')}</h3>` : ''; panel = p.panel;
        const ambiguous = /^-?\d{1,3}[.,]\d{3}$/.test(p.raw_value || '');
        return `${heading}<article class="lr-param" data-row="${i}"><div class="lr-param-top"><label class="lr-field"><span>Pemeriksaan</span><input data-param="name" value="${esc(p.name || '')}" aria-label="Nama pemeriksaan"></label><button type="button" class="lr-link lr-danger" data-action="remove-row" data-index="${i}" aria-label="Hapus parameter ${esc(p.name || '')}">Hapus</button></div><div class="lr-param-grid"><label class="lr-field"><span>Hasil</span><input data-param="raw_value" value="${esc(p.raw_value || '')}" inputmode="text" placeholder="Nilai / kualitatif"></label><label class="lr-field"><span>Satuan</span><input data-param="unit" value="${esc(p.unit || '')}" placeholder="Sesuai sumber"></label><label class="lr-field lr-reference"><span>Nilai rujukan</span><input data-param="reference" value="${esc(p.reference || '')}" placeholder="Sesuai sumber"></label></div>
        ${p.code === 'hb' ? `<label class="lr-field"><span>Rujukan Hb dari format lama (pilihan)</span><select data-hb-reference><option value="">Pilih konteks bila digunakan</option><option value="12.0-15.5|Wanita dewasa">Wanita dewasa</option><option value="11.0-13.9|Wanita hamil trimester 1">Hamil trimester 1</option><option value="10.5-14.8|Wanita hamil trimester 2">Hamil trimester 2</option><option value="11.0-15.0|Wanita hamil trimester 3">Hamil trimester 3</option></select></label>` : ''}
        ${ambiguous ? `<label class="lr-field lr-warning"><span>Pemisah angka ambigu. Konfirmasikan nilai numerik tanpa pemisah ribuan.</span><input type="number" step="any" data-param="numeric_value" value="${p.numeric_value === null || p.numeric_value === undefined ? '' : esc(String(p.numeric_value))}" placeholder="Contoh: 9370 atau 9.37"></label>` : ''}
        <label class="lr-field"><span>Keterangan (opsional)${p.reference_context ? ` · ${esc(p.reference_context)}` : ''}</span><input data-param="note" value="${esc(p.note || '')}"></label><div class="lr-row-review"><span>${p.origin === 'ocr' ? 'OCR · Periksa dengan sumber' : 'Isian manual'}</span><label><input type="checkbox" data-param="reviewed" ${p.reviewed ? 'checked' : ''}> Sudah diperiksa</label></div></article>`;
    }).join('');
}
function readEditor() {
    if (!data || !host.querySelector('#lr-form')) return;
    host.querySelectorAll('[data-field]').forEach(input => { data[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
    host.querySelectorAll('[data-row]').forEach(row => {
        const parameter = data.parameters[Number(row.dataset.row)];
        row.querySelectorAll('[data-param]').forEach(input => {
            parameter[input.dataset.param] = input.type === 'checkbox' ? input.checked : input.dataset.param === 'numeric_value' ? (input.value === '' ? null : Number(input.value)) : input.value;
        });
        const confirmed = row.querySelector('[data-param="numeric_value"]');
        if (confirmed) parameter.numeric_confirmed_for = confirmed.value === '' ? '' : parameter.raw_value;
    });
}
async function searchVisits(search) {
    const mine = generation;
    const result = await request(`/visits?${new URLSearchParams({ search: search ?? host.querySelector('#lr-patient-search')?.value ?? '' })}`);
    if (mine !== generation) return; visits = result.visits; renderVisits();
}
function renderVisits() {
    const list = host.querySelector('#lr-visits'); if (!list) return;
    list.innerHTML = visits.length ? `<select id="lr-visit-select" aria-label="Pilih pasien dan DRD"><option value="">Pilih kunjungan...</option>${visits.map(v => `<option value="${Number(v.visit_id)}" ${Number(v.visit_id) === Number(selectedVisit?.visit_id) ? 'selected' : ''}>${esc(v.patient_name)} · ${esc(v.patient_id)} · ${esc(v.mr_id)} · ${esc(pretty(v.visit_date))}</option>`).join('')}</select>` : '<p class="lr-muted">DRD Klinik Privat belum ditemukan. Cari nama atau nomor DRD lain.</p>';
}
async function chooseVisit(id) {
    readEditor(); const visit = visits.find(v => Number(v.visit_id) === Number(id));
    if (selectedVisit && selectedVisit.visit_id !== visit?.visit_id && (data.parameters.some(p => p.raw_value) || pendingFiles.length)) {
        if (!await confirmAction('Ganti pasien/DRD? Isian dan sumber saat ini akan dikosongkan.')) { renderVisits(); return; }
        data = defaults(); pendingFiles = []; clearPreviews(); candidate = null;
    }
    selectedVisit = visit || null;
    if (selectedVisit && !data.parameters.length && !pendingFiles.length) data.examined_at = selectedVisit.visit_date || currentWib();
    dirty = true; renderEditor();
}
async function saveReport() {
    readEditor();
    if (!selectedVisit) throw new Error('Pilih pasien dan DRD Klinik Privat terlebih dahulu.');
    const form = new FormData();
    form.append('payload', JSON.stringify({ patient_id: selectedVisit.patient_id, mr_id: selectedVisit.mr_id, data, version: report?.version, upload_ids: pendingFiles.map(file => file._labSourceId), client_request_id: creationToken }));
    pendingFiles.forEach(file => form.append('files', file));
    const result = await request(report ? `/${report.id}` : '', { method: report ? 'PATCH' : 'POST', body: form });
    report = result.report; data = structuredClone(report.data); dirty = false; pendingFiles = []; candidate = null; clearPreviews(); renderEditor();
    return report;
}
async function runOcr() {
    readEditor(); if (!selectedVisit || (!pendingFiles.length && !data.sources.length)) throw new Error('Pilih pasien/DRD dan berkas sumber terlebih dahulu.');
    const mine = generation; const files = pendingFiles.slice(); const form = new FormData();
    form.append('patient_id', selectedVisit.patient_id); form.append('mr_id', selectedVisit.mr_id); form.append('examined_at', data.examined_at);
    form.append('upload_ids', JSON.stringify(files.map(file => file._labSourceId)));
    files.forEach(file => form.append('files', file));
    controller?.abort(); controller = new AbortController(); message('OCR sedang membaca sumber. Isian manual tetap tersimpan di form.');
    const result = files.length ? await request('/ocr', { method: 'POST', body: form, signal: controller.signal })
        : await request(`/${report.id}/ocr`, { method: 'POST', body: { source_ids: data.sources.map(source => source.id), examined_at: data.examined_at }, signal: controller.signal });
    if (mine !== generation || files.some((file, i) => pendingFiles[i] !== file) || files.length !== pendingFiles.length) return;
    candidate = result.candidate; host.querySelector('#lr-candidate').innerHTML = renderCandidate(); message('OCR selesai. Periksa pratinjau lalu pilih cara menerapkan.');
}
async function openPdf(comparison = false, previousId = '') {
    if (dirty) throw new Error('Simpan perubahan sebelum mencetak PDF.');
    if (!report) throw new Error('Simpan laporan terlebih dahulu.');
    const preview = window.open('', '_blank');
    try {
        const token = await getIdToken();
        const mine = generation; await verifyOwner(token);
        const response = await fetch(`/api/lab-reports/${report.id}/pdf?${new URLSearchParams({ comparison: comparison ? '1' : '0', previous_id: previousId })}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) { const error = await response.json(); throw new Error(error.message || 'PDF belum tersedia.'); }
        const blob = await response.blob(); await verifyOwner();
        if (mine !== generation) throw new Error('Sesi berubah. Buka kembali laporan.');
        const url = URL.createObjectURL(blob);
        if (preview) { preview.opener = null; preview.location.href = url; } else { const a = document.createElement('a'); a.href = url; a.download = 'hasil-laboratorium.pdf'; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) { preview?.close(); throw error; }
}
async function showComparison(previousId = '') {
    if (dirty) throw new Error('Simpan perubahan sebelum membuka komparasi.');
    const result = await request(`/${report.id}/comparison?${new URLSearchParams({ previous_id: previousId })}`);
    host.querySelector('dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.className = 'lr-dialog';
    dialog.innerHTML = `<div class="lr-dialog-top"><h2>Komparasi hasil</h2><button type="button" class="lr-btn" data-action="close-dialog">Tutup</button></div><p>${esc(selectedVisit.patient_name)} · ${esc(pretty(data.examined_at))}</p>${result.previous ? `<label class="lr-field"><span>Hasil pembanding</span><select id="lr-previous">${result.candidates.map(c => `<option value="${Number(c.id)}" ${Number(c.id) === Number(result.previous.id) ? 'selected' : ''}>${esc(pretty(c.examined_at))} · ${esc(c.lab_number)}</option>`).join('')}</select></label><div class="lr-comparison-scroll"><table><thead><tr><th>Pemeriksaan</th><th>Terdahulu</th><th>Sekarang</th><th>Selisih</th></tr></thead><tbody>${result.rows.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.previous?.raw_value || '-')} ${esc(p.previous?.unit || '')}</td><td>${esc(p.raw_value)} ${esc(p.unit)}</td><td>${p.delta === null ? '—' : esc(String(p.delta))}</td></tr>`).join('')}</tbody></table></div><p class="lr-muted">Selisih dihitung untuk parameter dan satuan yang sama.</p>${can('medical_records.export') ? '<button type="button" class="lr-btn lr-primary" data-action="comparison-pdf">Cetak Komparasi</button>' : ''}` : '<p class="lr-empty-small">Belum ada hasil terstruktur sebelumnya untuk pasien ini. Lampiran lama tetap tersedia pada Penunjang.</p>'}`;
    host.appendChild(dialog); dialog.showModal();
}
async function handleAction(action, button) {
    if (action === 'back') return showList();
    if (action === 'new') return newReport();
    if (action === 'search-list') return loadList();
    if (action === 'open') return openReport(button.dataset.id);
    if (action === 'search-visits') return searchVisits();
    if (action === 'ocr') return runOcr();
    if (action === 'save') { await saveReport(); return message('Draf tersimpan. Hasil terbit sebelumnya tetap tersedia bagi pasien.'); }
    if (action === 'publish') {
        if (dirty) await saveReport();
        readEditor();
        if (!await confirmAction(`Terbitkan hasil untuk ${selectedVisit.patient_name} (${selectedVisit.mr_id})?`)) return;
        const result = await request(`/${report.id}/publish`, { method: 'POST', body: { version: report.version } });
        report = result.report; data = structuredClone(report.data); dirty = false; renderEditor();
        return message(report.notification_warning ? 'Hasil sudah terbit. Notifikasi portal belum terkirim; pasien dapat membuka Hasil Lab.' : 'Hasil terbit dan tersedia pada portal pasien.');
    }
    if (action === 'delete') {
        if (!await confirmAction(`Hapus hasil ${report.lab_number || 'draf'} untuk ${selectedVisit.patient_name}? Hasil akan disembunyikan dari portal pasien.`)) return;
        await request(`/${report.id}`, { method: 'DELETE', body: { version: report.version } }); dirty = false; await showList(); return message('Hasil dihapus dari daftar aktif dan portal.');
    }
    if (action === 'pdf') return openPdf();
    if (action === 'compare') return showComparison();
    if (action === 'comparison-pdf') return openPdf(true, host.querySelector('#lr-previous').value);
    if (action === 'close-dialog') { host.querySelector('dialog')?.close(); return; }
    readEditor();
    if (action === 'add-panel') {
        const panel = host.querySelector('#lr-panel').value;
        PANELS[panel].forEach(([code, name, unit]) => { if (!data.parameters.some(p => p.code === code)) data.parameters.push({ code, name, unit, panel, raw_value: '', reference: '', note: '', origin: 'manual', reviewed: false }); });
    } else if (action === 'add-row') data.parameters.push({ code: `custom_${Date.now()}`, name: '', panel: 'Lainnya', raw_value: '', unit: '', reference: '', origin: 'manual', reviewed: false });
    else if (action === 'remove-row') data.parameters.splice(Number(button.dataset.index), 1);
    else if (action === 'remove-empty') data.parameters = data.parameters.filter(p => p.raw_value.trim());
    else if (action === 'remove-source' || action === 'remove-file') {
        const index = Number(button.dataset.index);
        const sourceId = action === 'remove-source' ? data.sources[index].id : pendingFiles[index]._labSourceId;
        if (data.parameters.some(p => p.source_id === sourceId)) {
            data.parameters = removeLabSource(data.parameters, sourceId);
            data.source_warnings = [...new Set([...(data.source_warnings || []), 'Berkas sumber hasil dilepas. Periksa kembali parameter terkait.'])]; data.identity_resolved = false;
        }
        if (action === 'remove-source') data.sources.splice(index, 1);
        else { pendingFiles.splice(index, 1); clearPreviews(); previews = pendingFiles.map(file => URL.createObjectURL(file)); }
        candidate = null;
    }
    else if (action === 'apply-ocr' || action === 'replace-ocr') {
        if (action === 'replace-ocr' && data.parameters.some(p => p.raw_value) && !await confirmAction('Ganti daftar hasil dengan OCR? Koreksi pada daftar saat ini akan diganti.')) return;
        data.parameters = action === 'replace-ocr' ? candidate.parameters.map(p => ({ ...p })) : mergeOcrCandidates(data.parameters, candidate.parameters);
        data.source_warnings = mergeSourceWarnings(data.source_warnings, candidate.source_warnings); data.identity_resolved = false; data.review_confirmed = false; candidate = null;
    } else return;
    dirty = true; renderEditor();
}
export async function mountLaboratorium(container, options = {}) {
    try { await verifyOwner(undefined, true); } catch (_) { host = container; clearAccountState(); return; }
    let keepDraft = false;
    if (host && data && dirty) {
        readEditor(); keepDraft = sameLabContext(report, selectedVisit, options);
        if (!keepDraft && !await confirmAction('Ada isian belum disimpan. Buka pasien/hasil lain dan tinggalkan isian ini?')) return;
    }
    host = container; context = options;
    if (!document.getElementById('laboratorium-style')) { const link = document.createElement('link'); link.id = 'laboratorium-style'; link.rel = 'stylesheet'; link.href = asset('styles/laboratorium.css'); document.head.appendChild(link); }
    if (!host.dataset.labBound) {
        host.dataset.labBound = '1';
        host.addEventListener('submit', event => event.preventDefault());
        host.addEventListener('input', event => {
            if (!event.target.closest('#lr-form')) return; dirty = true;
            const row = event.target.closest('[data-row]');
            if (row && event.target.dataset.param !== 'reviewed') row.querySelector('[data-param="reviewed"]').checked = false;
            if (event.target.dataset.param === 'raw_value') {
                const numeric = row.querySelector('[data-param="numeric_value"]'); if (numeric) numeric.value = '';
                data.parameters[Number(row.dataset.row)].numeric_value = null;
            }
            readEditor();
        });
        host.addEventListener('change', async event => {
            try {
                if (event.target.id === 'lr-visit-select') return chooseVisit(event.target.value);
                if (event.target.id === 'lr-previous') return await showComparison(event.target.value);
                if (event.target.hasAttribute('data-hb-reference') && event.target.value) {
                    readEditor(); const row = Number(event.target.closest('[data-row]').dataset.row); const [reference, reference_context] = event.target.value.split('|');
                    Object.assign(data.parameters[row], { reference, reference_context, reviewed: false }); dirty = true; renderEditor();
                }
                if (event.target.type === 'file') {
                    if (!selectedVisit) throw new Error('Pilih pasien dan DRD sebelum menambahkan sumber.');
                    readEditor(); const incoming = Array.from(event.target.files || []);
                    if (incoming.some(f => !['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type) || f.size > 10 * 1024 * 1024)) throw new Error('Gunakan JPG, PNG, WebP, atau PDF maksimal 10 MB/file.');
                    if (pendingFiles.length + incoming.length + data.sources.length > 10 || labSourceBytes(data.sources, pendingFiles, incoming) > 30 * 1024 * 1024) throw new Error('Maksimal 10 berkas dan total 30 MB.');
                    incoming.forEach(file => { file._labSourceId = crypto.randomUUID(); });
                    pendingFiles.push(...incoming); previews.push(...incoming.map(file => URL.createObjectURL(file))); candidate = null; dirty = true; renderEditor();
                }
            } catch (error) { message(error.message, true); }
        });
        host.addEventListener('click', async event => {
            const button = event.target.closest('[data-action]'); if (!button || busy) return;
            event.preventDefault(); busy = true; button.disabled = true;
            try { await verifyOwner(); await handleAction(button.dataset.action, button); }
            catch (error) { if (error.name !== 'AbortError') message(error.message, true); }
            finally { busy = false; if (button.isConnected) button.disabled = false; }
        });
    }
    if (!can('lab_exam.view')) { frame('<p class="lr-empty-small">Akun ini belum memiliki akses laboratorium.</p>'); return; }
    try {
        if (keepDraft) renderEditor();
        else if (options.reportId) await openReport(options.reportId);
        else { dirty = false; await showList(); }
    } catch (error) { message(error.message, true); }
}
