import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';
import { ROLE_IDS } from '../role-constants.js';
import '../prescription-sig.js';

const API = '/api/sunday-clinic/prescription-templates';
const el = id => document.getElementById(id);
const esc = value => escapeHtml(String(value ?? ''));
let templates = [], medications = [], editor = null, dirty = false, busy = false, ready = false, loadScope;
const isDoctor = () => Number((window.currentStaffUser || window.auth?.currentUser)?.role_id) === ROLE_IDS.DOKTER;
function status(message, tone = 'muted') { el('rx-status').textContent = message; el('rx-status').className = 'small mb-3 text-' + tone; }
function setBusy(value) {
    busy = value;
    el('rx-fields').disabled = value;
    document.querySelectorAll('#template-resep-page button').forEach(button => { button.disabled = value || !ready; });
    el('rx-search').disabled = value;
}
function discard() { return !dirty || window.confirm('Buang perubahan template yang belum disimpan?'); }
function list() {
    const query = el('rx-search').value.trim().toLocaleLowerCase();
    const filtered = templates.filter(t => [t.name, ...t.items.map(i => i.name)].join(' ').toLocaleLowerCase().includes(query));
    el('rx-list').innerHTML = filtered.map(t => '<article class="border rounded p-3 mb-2"><div class="font-weight-bold">' + esc(t.name) + '</div><div class="small text-muted mb-2">' + t.items.length + ' obat · ' + (t.updated_at ? esc(new Date(t.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })) + ' WIB' : 'Baru disimpan') + '</div><div class="d-flex flex-wrap" style="gap:8px">' + ['edit', 'duplicate', 'deactivate'].map((action, i) => '<button type="button" class="btn btn-sm btn-outline-' + (i === 2 ? 'danger' : 'primary') + '" data-rx-action="' + action + '" data-id="' + Number(t.id) + '">' + ['Edit','Duplikasi','Nonaktifkan'][i] + '</button>').join('') + '</div></article>').join('') || '<p class="text-muted">Tidak ada template yang sesuai.</p>';
}
function masterOptions() {
    const query = el('rx-master-search').value.trim().toLocaleLowerCase();
    el('rx-master').innerHTML = '<option value="">Pilih obat aktif</option>' + medications.filter(m => Number(m.is_active) === 1 && m.name.toLocaleLowerCase().includes(query)).map(m => '<option value="' + Number(m.id) + '">' + esc(m.name) + ' — ' + esc(m.unit) + '</option>').join('');
}
function warning(row) {
    const master = medications.find(m => String(m.id) === String(row.obatId ?? row.id));
    if (!master) return 'Obat tidak ditemukan di master. Periksa atau ganti obat secara manual.';
    const messages = [];
    if (!Number(master.is_active)) messages.push('Obat nonaktif. Periksa sebelum menggunakan template.');
    if (String(master.unit || '').trim().toLowerCase() !== String(row.unit || '').trim().toLowerCase()) messages.push('Satuan berbeda dengan master (' + (master.unit || 'kosong') + '). Tidak ada konversi otomatis.');
    return messages.join(' ');
}
function rows() {
    el('rx-items').innerHTML = editor.items.map((row, i) => '<div class="border rounded p-3 mb-3" data-rx-row="' + i + '"><div class="d-flex justify-content-between align-items-start mb-2"><strong style="overflow-wrap:anywhere">' + esc(row.name || 'Obat belum dipilih') + '</strong><button type="button" class="btn btn-sm btn-outline-danger ml-2" data-rx-action="remove" data-index="' + i + '">Hapus</button></div><div class="row">' +
        '<label class="col-sm-3">Jumlah<input class="form-control" type="number" step="any" min="0.000001" data-rx-field="quantity" value="' + esc(row.quantity) + '"></label>' +
        '<label class="col-sm-3">Satuan<input class="form-control" list="rx-units" data-rx-field="unit" value="' + esc(row.unit) + '"></label>' +
        '<label class="col-sm-6">Aturan pakai<input class="form-control" data-rx-field="caraPakai" value="' + esc(row.caraPakai) + '" placeholder="Boleh dikosongkan"></label></div>' +
        '<div class="small text-warning" data-rx-warning>' + esc(warning(row)) + '</div></div>').join('') || '<p class="text-muted">Belum ada obat. Tambahkan dari master obat.</p>';
}
function openEditor(template = null, duplicate = false) {
    if (busy || !discard()) return;
    editor = template ? JSON.parse(JSON.stringify(template)) : { name: '', items: [] };
    if (duplicate) { delete editor.id; editor.name = (editor.name + ' (salinan)').slice(0,150); }
    dirty = duplicate;
    el('rx-editor').hidden = false; el('rx-name').value = editor.name;
    el('rx-editor-title').textContent = editor.id ? 'Edit Template' : 'Template Baru';
    el('rx-master-search').value = ''; masterOptions(); rows();
    el('rx-name').focus(); status(duplicate ? 'Salinan belum disimpan sebagai template baru.' : 'Isi template dimuat tanpa perubahan.');
}
async function load() {
    if (busy || !discard()) return;
    loadScope?.abort(); const scope = createPageRequestScope(); loadScope = scope;
    setBusy(true); status('Memuat template dan master obat...');
    try {
        const [rx, meds] = await Promise.all([scope.request(API), scope.request('/api/obat?active=all')]);
        if (scope.signal.aborted) return;
        if (!rx?.success || !meds?.success) throw new Error();
        templates = rx.data.map(t => ({ ...t, items: Array.isArray(t.items) ? t.items : [] })); medications = meds.data;
        ready = true; dirty = false; editor = null; el('rx-editor').hidden = true; list(); masterOptions(); status('Template dan master obat dimuat.');
    } catch (error) { if (!scope.signal.aborted) status('Data gagal dimuat. Coba Muat Ulang.', 'danger'); }
    finally { if (loadScope === scope) { setBusy(false); el('template-resep-page').querySelector('[data-rx-action="reload"]').disabled = false; } }
}
async function save() {
    if (!editor || busy || !isDoctor()) return;
    const name = editor.name.trim();
    if (!name || name.length > 150 || !editor.items.length || editor.items.some(i => !i.name || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 || !String(i.unit || '').trim())) {
        status('Isi nama template dan minimal satu obat dengan jumlah positif serta satuan lengkap.', 'danger'); return;
    }
    setBusy(true); status('Menyimpan template...');
    const scope = createPageRequestScope();
    try {
        const result = await scope.request(API + (editor.id ? '/' + editor.id : ''), { method: editor.id ? 'PUT' : 'POST', body: JSON.stringify({ name, items: editor.items.map(item => ({ ...item, quantity: Number(item.quantity) })) }) });
        if (!result?.success) throw new Error();
        const saved = { ...result.data, updated_at: new Date().toISOString() };
        templates = templates.filter(t => Number(t.id) !== Number(saved.id)); templates.unshift(saved);
        editor = JSON.parse(JSON.stringify(saved)); dirty = false; el('rx-name').value = saved.name;
        el('rx-editor-title').textContent = 'Edit Template'; list(); status('Template tersimpan.', 'success');
    } catch (error) { status('Template gagal disimpan. Isian tetap ada; coba Simpan Template lagi.', 'danger'); }
    finally { setBusy(false); }
}
async function deactivate(id) {
    if (busy || !discard()) return;
    const template = templates.find(t => Number(t.id) === id);
    if (!template || !window.confirm('Nonaktifkan template "' + template.name + '"? Template tidak dihapus permanen.')) return;
    setBusy(true);
    try {
        const result = await createPageRequestScope().request(API + '/' + id, { method: 'DELETE' });
        if (!result?.success) throw new Error();
        templates = templates.filter(t => Number(t.id) !== id); editor = null; dirty = false; el('rx-editor').hidden = true; list(); status('Template dinonaktifkan.', 'success');
    } catch (error) { status('Template gagal dinonaktifkan. Coba lagi.', 'danger'); }
    finally { setBusy(false); }
}
export async function showTemplateResepPage() {
    if (!isDoctor()) { window.showError?.('Menu Template Resep hanya tersedia untuk dokter.'); return; }
    await window.activateRegisteredStaffPage('template-resep');
    if (!ready) await load();
}
document.addEventListener('click', event => {
    const button = event.target.closest?.('#template-resep-page [data-rx-action]');
    if (!button || busy || !isDoctor()) return;
    const action = button.dataset.rxAction;
    if (action === 'reload') { load(); return; }
    if (!ready) return;
    if (action === 'new') openEditor();
    if (action === 'edit' || action === 'duplicate') openEditor(templates.find(t => Number(t.id) === Number(button.dataset.id)), action === 'duplicate');
    if (action === 'cancel' && discard()) { editor = null; dirty = false; el('rx-editor').hidden = true; }
    if (action === 'save') save();
    if (action === 'deactivate') deactivate(Number(button.dataset.id));
    if (action === 'remove') { editor.items.splice(Number(button.dataset.index),1); dirty = true; rows(); }
    if (action === 'add') {
        const master = medications.find(m => Number(m.id) === Number(el('rx-master').value) && Number(m.is_active) === 1);
        if (!master) { status('Pilih obat aktif terlebih dahulu.', 'warning'); return; }
        editor.items.push({ obatId: master.id, name: master.name, quantity: 1, unit: master.unit || '', caraPakai: '', latinSig: '' }); dirty = true; rows();
    }
});
document.addEventListener('input', event => {
    const target = event.target;
    if (!target.closest?.('#template-resep-page') || busy) return;
    if (target.id === 'rx-search') { list(); return; }
    if (target.id === 'rx-master-search') { masterOptions(); return; }
    if (!editor) return;
    if (target.id === 'rx-name') editor.name = target.value;
    else if (target.dataset.rxField) {
        const row = editor.items[Number(target.closest('[data-rx-row]').dataset.rxRow)];
        row[target.dataset.rxField] = target.value;
        if (target.dataset.rxField === 'caraPakai') row.latinSig = window.PrescriptionSig.convertToLatinSig(target.value);
        target.closest('[data-rx-row]').querySelector('[data-rx-warning]').textContent = warning(row);
    } else return;
    dirty = true; status('Perubahan template belum disimpan.', 'warning');
});
// Guard ordinary sidebar links and global navigation before delegated handlers run.
document.addEventListener('click', event => {
    if (el('template-resep-page')?.classList.contains('d-none') || (!dirty && !busy)) return;
    if (event.target.closest?.('#template-resep-page')) return;
    const navigation = event.target.closest?.('a[href], [data-staff-call], [data-shell-action]');
    if (!navigation || navigation.matches('[data-widget], [data-toggle], [data-bs-toggle], [data-shell-action="open-mobile-menu"], [data-shell-action="close-mobile-menu"], [data-mobile-nav="more"]')) return;
    if (busy || !discard()) { event.preventDefault(); event.stopImmediatePropagation(); if (busy) status('Tunggu penyimpanan selesai sebelum meninggalkan editor.', 'warning'); }
    else { dirty = false; editor = null; el('rx-editor').hidden = true; }
}, true);
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
window.showTemplateResepPage = showTemplateResepPage;
