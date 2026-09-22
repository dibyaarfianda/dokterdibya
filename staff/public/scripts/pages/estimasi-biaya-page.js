import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';
const KEYS = ['t1', 't2', 't3'];
let draft, templates = [], medications = [], services = [];
let loadScope, previewScope, saveScope;
let dirty = false, ready = false, previewData = null, revision = 0;
const el = id => document.getElementById(id);
const esc = value => escapeHtml(String(value ?? ''));
const money = value => value == null ? 'Harga belum tersedia' : 'Rp ' + Number(value).toLocaleString('id-ID');
const num = value => value === '' ? null : Number(value);
function status(message, tone = 'muted') {
    const node = el('estimasi-config-status');
    if (node) { node.textContent = message; node.className = 'small mb-3 text-' + tone; }
}
function send(data) { el('estimate-patient-frame')?.contentWindow?.postMessage(data, window.location.origin); }
function markDirty() {
    dirty = true; revision++; previewData = null;
    status('Perubahan draft belum disimpan.', 'warning');
    send({ type: 'estimate-unavailable', message: 'Pengaturan berubah. Perbarui pratinjau untuk melihat hasil terbaru.' });
}
function showTab(preview) {
    el('estimate-settings-panel').hidden = preview; el('estimate-preview-panel').hidden = !preview;
    document.querySelectorAll('#estimasi-biaya-page [role="tab"]').forEach(button => {
        const selected = (button.dataset.action === 'estimate-preview') === preview;
        button.className = 'btn ' + (selected ? 'btn-primary' : 'btn-outline-primary');
        button.setAttribute('aria-selected', String(selected));
    });
}
function options(list, selected, placeholder) {
    return '<option value="">' + placeholder + '</option>' +
        (selected && !list.some(t => Number(t.id) === selected) ? '<option selected value="' + selected + '">Item tidak tersedia — pilih ulang</option>' : '') +
        list.map(t => '<option value="' + Number(t.id) + '"' + (Number(t.id) === selected ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('');
}
function field(label, control, width = 4) { return '<label class="col-md-' + width + ' small">' + label + control + '</label>'; }
function attrs(type, key, index) { return ' class="form-control form-control-sm" data-field="' + type + '" data-key="' + key + '" data-index="' + index + '"'; }
function input(type, key, index, value, extra = '') { return '<input' + attrs(type, key, index) + ' value="' + esc(value) + '" ' + extra + '>'; }
function render() {
    el('estimate-draft-editor').innerHTML = KEYS.map((key, phaseIndex) => {
        const phase = draft.trimesters[key];
        const meds = phase.medications.map((row, i) => {
            const master = medications.find(m => Number(m.id) === row.obat_id);
            return '<div class="border rounded p-3 mb-2"><div class="font-weight-bold mb-2">' + esc(row.name || master?.name || 'Obat belum dipetakan') + '</div><div class="row">' +
                field('Pasangan master obat', '<select' + attrs('med-id', key, i) + '>' + options(medications, row.obat_id, 'Pilih master obat') + '</select>') +
                field('Nama tampilan pasien', input('alias', key, i, draft.aliases[String(row.obat_id)] || '', 'maxlength="160" data-alias-id="' + row.obat_id + '" placeholder="Isi nama khusus"')) +
                field('Jumlah / resep', input('med-qty', key, i, row.quantity, 'type="number" min="0.01" step="any"'), 2) +
                field('Satuan resep', input('med-unit', key, i, row.unit, 'maxlength="160"'), 2) + '</div>' +
                '<div class="small text-muted">Master: ' + (master ? money(master.price) + ' / ' + esc(master.unit || 'belum ada satuan') : 'Belum cocok — periksa pasangan master') +
                '. Jika berbeda satuan, periksa lalu sesuaikan jumlah dan satuan resep.</div></div>';
        }).join('');
        const acts = phase.services.map((row, i) => '<div class="row align-items-end mb-2">' +
            field('Layanan', '<select' + attrs('service-id', key, i) + '>' + options(services.map(s => ({ ...s, name: s.name + ' — ' + money(s.price) })), row.tindakan_id, 'Pilih layanan') + '</select>', 6) +
            field('Jumlah / pelaksanaan', input('service-qty', key, i, row.quantity, 'type="number" min="0.01" step="any"'), 2) +
            field('Pengulangan', input('service-repeat', key, i, row.repeats, 'type="number" min="0" step="1"'), 2) +
            '<div class="col-md-2 mb-2"><button type="button" class="btn btn-outline-danger btn-sm" data-action="estimate-remove-service" data-key="' + key + '" data-index="' + i + '">Hapus</button></div></div>').join('');
        return '<section class="card card-outline card-secondary"><div class="card-header"><h4 class="card-title">Trimester ' + (phaseIndex + 1) + '</h4></div><div class="card-body"><div class="row">' +
            field('Template peresepan', '<select' + attrs('template', key, 0) + '>' + options(templates, phase.template_id, 'Belum dipilih') + '</select>', 8) +
            field('Pengulangan resep', input('repeat', key, 0, phase.repeats, 'type="number" min="0" step="1"')) + '</div>' +
            '<p class="small text-muted">Isi template disalin saat dipilih. Perubahan di peresepan tidak otomatis mengubah draft ini.</p>' +
            (meds || '<p class="text-muted">Belum ada template obat dipilih.</p>') + '<hr><h5>Layanan &amp; pemeriksaan</h5>' + acts +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-action="estimate-add-service" data-key="' + key + '">Tambah Layanan</button></div></section>';
    }).join('');
}
async function load() {
    loadScope?.abort(); const scope = createPageRequestScope(); loadScope = scope;
    ready = false; el('estimasi-biaya-page')?.querySelector('[data-action="save-estimasi-biaya"]')?.setAttribute('disabled', '');
    status('Memuat draft, template, dan harga...');
    try {
        const [saved, meds, acts, rx] = await Promise.all([
            scope.request('/api/estimasi-biaya/draft?_t=' + Date.now()), scope.request('/api/obat?active=true'),
            scope.request('/api/tindakan?active=true'), scope.request('/api/sunday-clinic/prescription-templates')
        ]);
        if (scope.signal.aborted) return;
        if (![saved, meds, acts, rx].every(result => result?.success)) throw new Error('Data belum dimuat');
        draft = saved.draft; medications = meds.data; templates = rx.data;
        services = acts.data.filter(s => ['LAYANAN', 'TINDAKAN MEDIS'].includes(s.category));
        dirty = false; ready = true; revision++; previewData = null; render();
        el('estimasi-biaya-page').querySelector('[data-action="save-estimasi-biaya"]').disabled = false;
        status(draft.updated_at ? 'Draft tersimpan: ' + new Date(draft.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB.' : 'Belum ada draft tersimpan. Template belum dipilih.');
        send({ type: 'estimate-unavailable', message: 'Perbarui pratinjau untuk memuat draft ini.' });
    } catch (error) { if (error.name !== 'AbortError') status('Gagal memuat data. Klik Muat Ulang untuk mencoba lagi.', 'danger'); }
}
export async function showEstimasiBiayaPage() {
    await window.activateRegisteredStaffPage?.('estimasi-biaya');
    if (!ready) await load();
}
export async function saveEstimasiBiayaPortalConfig() {
    if (!ready || saveScope) return;
    const scope = createPageRequestScope(); saveScope = scope; const currentRevision = revision;
    status('Menyimpan draft...');
    try {
        const result = await scope.request('/api/estimasi-biaya/draft', { method: 'PUT', body: JSON.stringify(draft) });
        if (!result.success) throw new Error();
        if (currentRevision === revision) { draft = result.draft; dirty = false; }
        status(dirty ? 'Versi sebelumnya tersimpan; perubahan terbaru belum disimpan.' : result.message, dirty ? 'warning' : 'success');
    } catch (error) { if (error.name !== 'AbortError') status('Draft gagal disimpan. Perubahan tetap ada; coba Simpan Draft lagi.', 'danger'); }
    finally { if (saveScope === scope) saveScope = null; }
}
export async function reloadEstimasiBiayaConfig() {
    if (saveScope) { status('Penyimpanan sedang berlangsung. Tunggu hingga selesai sebelum memuat ulang.', 'warning'); return; }
    if (dirty && !window.confirm('Buang perubahan draft yang belum disimpan dan muat ulang?')) return;
    await load();
}
export async function updateEstimasiBiaya() {
    if (!ready) { status('Muat konfigurasi terlebih dahulu.', 'warning'); return; }
    showTab(true); previewScope?.abort(); const scope = createPageRequestScope(); previewScope = scope;
    const currentRevision = revision; previewData = null; send({ type: 'estimate-unavailable', message: 'Memuat harga terbaru...' });
    const configured = KEYS.some(key => draft.trimesters[key].template_id || draft.trimesters[key].services.length || draft.trimesters[key].medications.length);
    if (!configured) { send({ type: 'estimate-dummy' }); status('Data Dummy — bukan tarif klinik. Pilih template untuk memakai draft.'); return; }
    try {
        const result = await scope.request('/api/estimasi-biaya/preview', { method: 'POST', body: JSON.stringify(draft) });
        if (scope.signal.aborted || currentRevision !== revision) return;
        if (!result.success) throw new Error();
        previewData = result.preview; send({ type: 'estimate-data', preview: previewData });
        const configurationReady = previewData.configuration_ready ?? previewData.ready;
        status((dirty ? 'Pratinjau perubahan yang belum disimpan. ' : '') + (configurationReady ? 'Rincian siap disimulasikan.' : 'Ada trimester belum lengkap. Periksa peringatan di pratinjau.'), configurationReady ? 'success' : 'warning');
    } catch (error) {
        if (error.name !== 'AbortError') {
            send({ type: 'estimate-unavailable', message: 'Harga gagal dimuat. Klik Perbarui Harga & Pratinjau untuk mencoba lagi.' });
            status('Pratinjau gagal dimuat. Silakan coba lagi.', 'danger');
        }
    }
}
window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== el('estimate-patient-frame')?.contentWindow) return;
    if (event.data?.type === 'estimate-ready') {
        if (previewData) send({ type: 'estimate-data', preview: previewData });
        else if (ready && !el('estimate-preview-panel').hidden) void updateEstimasiBiaya();
    }
});
document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-action]');
    if (!button?.closest('#estimasi-biaya-page')) return;
    const action = button.dataset.action, key = button.dataset.key;
    if (action === 'estimate-settings') showTab(false);
    if (action === 'estimate-preview' || action === 'estimate-refresh') void updateEstimasiBiaya();
    if (action === 'reload-estimasi-biaya') void reloadEstimasiBiayaConfig();
    if (action === 'save-estimasi-biaya') void saveEstimasiBiayaPortalConfig();
    if (action === 'estimate-phone') el('estimate-patient-frame').style.width = '390px';
    if (action === 'estimate-desktop') el('estimate-patient-frame').style.width = '100%';
    if (action === 'estimate-dummy') { previewScope?.abort(); previewData = null; send({ type: 'estimate-dummy' }); status('Data Dummy — bukan tarif klinik. Draft tetap terpisah.'); }
    if (ready && action === 'estimate-add-service') { draft.trimesters[key].services.push({ tindakan_id: null, quantity: 1, repeats: 1 }); markDirty(); render(); }
    if (ready && action === 'estimate-remove-service') { draft.trimesters[key].services.splice(Number(button.dataset.index), 1); markDirty(); render(); }
});
function edit(target) {
    if (!ready || !target.closest?.('#estimasi-biaya-page') || !target.dataset.field) return;
    const { field: type, key, index } = target.dataset; const phase = draft.trimesters[key];
    const row = phase.medications[Number(index)], service = phase.services[Number(index)];
    if (type === 'template') {
        if (phase.medications.length && !window.confirm('Ganti isi obat trimester ini dengan template pilihan? Penyesuaian jumlah dan satuan akan diganti.')) { render(); return; }
        const template = templates.find(t => Number(t.id) === Number(target.value));
        phase.template_id = template ? Number(template.id) : null; phase.template_name = template?.name || '';
        phase.medications = (template?.items || []).map(item => ({ obat_id: Number(item.obatId || item.id) || null, name: item.name || '', quantity: Number(item.quantity), unit: item.unit || '' }));
        markDirty(); render(); return;
    }
    if (type === 'alias' && row.obat_id) {
        draft.aliases[String(row.obat_id)] = target.value;
        document.querySelectorAll('#estimasi-biaya-page [data-alias-id="' + row.obat_id + '"]').forEach(input => { if (input !== target) input.value = target.value; });
    }
    if (type === 'repeat') phase.repeats = num(target.value);
    if (type === 'med-qty') row.quantity = num(target.value);
    if (type === 'med-unit') row.unit = target.value;
    if (type === 'med-id') { row.obat_id = num(target.value); markDirty(); render(); return; }
    if (type === 'service-id') service.tindakan_id = num(target.value);
    if (type === 'service-qty') service.quantity = num(target.value);
    if (type === 'service-repeat') service.repeats = num(target.value);
    markDirty();
}
document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') edit(event.target); });
document.addEventListener('input', event => { if (event.target.tagName === 'INPUT') edit(event.target); });
document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'estimasi-biaya') { loadScope?.abort('Page deactivated'); previewScope?.abort('Page deactivated'); }
});
Object.assign(window, { showEstimasiBiayaPage, updateEstimasiBiaya, saveEstimasiBiayaPortalConfig, reloadEstimasiBiayaConfig });
