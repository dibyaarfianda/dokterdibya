import { getIdToken } from './vps-auth-v2.js';
import { escapeHtml } from './safe-render.js';

const e = escapeHtml;
const labels = { urgent: 'Segera', order: 'Perlu order', enough: 'Cukup', manual: 'Periksa manual' };
const number = value => value == null ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 });
const money = value => value == null ? 'Belum diketahui' : `Rp ${number(value)}`;
const th = label => `<th style="text-align: center !important; vertical-align: middle !important;">${label}</th>`;
const button = (action, label, id = '', extra = '') => `<button type="button" class="btn btn-sm btn-outline-primary mr-1" data-order-action="${action}" data-id="${e(id)}" ${extra}>${label}</button>`;

async function request(path, options = {}) {
    const token = await getIdToken();
    if (!token) throw new Error('Sesi berakhir. Silakan masuk kembali.');
    const origin = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:3001' : window.location.origin;
    const response = await fetch(`${origin}/api/inventory${path}`, {
        method: options.method || 'GET', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    if (options.blob && response.ok) return response.blob();
    const result = await response.json();
    if (!response.ok || !result.success) {
        const error = new Error(result.message || 'Permintaan gagal.');
        Object.assign(error, { code: result.code, data: result.data, status: response.status });
        throw error;
    }
    return result.data;
}

export class OrderController {
    constructor(api = request) {
        this.api = api; this.items = []; this.suppliers = []; this.selection = new Map();
        this.busy = false; this.requestKey = null; this.requestPayload = null; this.notes = ''; this.analysisChanged = false;
    }
    async refresh() {
        const result = await this.api('/order-recommendations');
        this.items = result.items; this.suppliers = result.suppliers; this.asOf = result.as_of;
        // Existing selections retain their exact evidence; save validates it against current stock.
        return result;
    }
    select(id, selected) {
        const key = String(id);
        if (!selected) { this.selection.delete(key); return; }
        if (this.selection.has(key)) return;
        const item = this.items.find(x => String(x.obat_id) === key);
        if (item) this.selection.set(key, { ...item, quantity: Math.max(1, item.recommended_quantity || 0), notes: '' });
    }
    selectUrgent() {
        this.items.filter(x => ['urgent', 'order'].includes(x.priority)).forEach(x => this.select(x.obat_id, true));
    }
    async setSupplier(id, supplierId) {
        if (!supplierId) throw new Error('Pilih supplier terlebih dahulu.');
        const result = await this.api(`/order-recommendations?supplier_id=${encodeURIComponent(supplierId)}`);
        const fresh = result.items.find(x => String(x.obat_id) === String(id));
        if (!fresh) throw new Error('Analisis obat tidak tersedia.');
        const previous = this.selection.get(String(id));
        if (previous) this.selection.set(String(id), { ...fresh, quantity: previous.quantity, notes: previous.notes });
        this.items = this.items.map(x => String(x.obat_id) === String(id) ? fresh : x);
    }
    applyAnalysis(items) {
        for (const fresh of items || []) {
            const previous = this.selection.get(String(fresh.obat_id));
            if (previous) this.selection.set(String(fresh.obat_id), { ...fresh, quantity: previous.quantity, notes: previous.notes });
            this.items = this.items.map(x => String(x.obat_id) === String(fresh.obat_id) ? fresh : x);
        }
        this.analysisChanged = true;
    }
    removeDraftReference(id) {
        const remove = x => ({ ...x, active_drafts: (x.active_drafts || []).filter(d => String(d.id) !== String(id)) });
        this.items = this.items.map(remove);
        this.selection.forEach((value, key) => this.selection.set(key, remove(value)));
    }
    async save() {
        if (this.busy) return null;
        const items = [...this.selection.values()].map(x => ({ obat_id: x.obat_id, supplier_id: x.supplier_id, quantity: x.quantity, notes: x.notes || '', analysis_fingerprint: x.analysis_fingerprint }));
        if (!items.length) throw new Error('Pilih sedikitnya satu obat.');
        if (items.some(x => !x.supplier_id || !Number.isInteger(x.quantity) || x.quantity < 1)) throw new Error('Isi supplier dan jumlah bulat positif untuk semua obat terpilih.');
        const payload = JSON.stringify({ notes: this.notes, items });
        if (payload !== this.requestPayload) { this.requestKey = crypto.randomUUID(); this.requestPayload = payload; }
        this.busy = true;
        try {
            const result = await this.api('/order-drafts', { method: 'POST', body: { request_key: this.requestKey, notes: this.notes, items } });
            this.items = this.items.map(item => {
                const selected = this.selection.get(String(item.obat_id));
                if (!selected) return item;
                const added = result.drafts.filter(d => String(d.supplier_id) === String(selected.supplier_id));
                const prior = item.active_drafts || [];
                return { ...item, active_drafts: [...prior, ...added.filter(d => !prior.some(p => p.id === d.id))] };
            });
            this.selection.clear(); this.requestKey = null; this.requestPayload = null; this.analysisChanged = false;
            return result;
        } catch (error) {
            if (error.code === 'ANALYSIS_CHANGED') this.applyAnalysis(error.data?.items);
            throw error;
        } finally { this.busy = false; }
    }
}

let controller;
let root;
let draft = null;
let draftDirty = false;
let working = false;
let search = '';
let priority = '';
let supplierFilter = '';
let fastOnly = false;
let statusFilter = 'draft';
const pane = id => root.querySelector(`[data-order-pane="${id}"]`);
function notify(message, danger = false) {
    const node = root.querySelector('#order-notice');
    node.className = `alert ${danger ? 'alert-warning' : 'alert-info'} py-2`;
    node.textContent = message;
}
function formatWib(value) {
    if (!value) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).split('-').reverse().join('/');
    // MySQL date-time strings without offsets are already WIB.
    const input = String(value).replace(' ', 'T');
    const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(input) ? input : `${input}+07:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
}
function removeDraftItem(value, id) {
    if (value.status !== 'draft') throw new Error('Draft arsip tidak dapat diubah.');
    if (value.items.length <= 1) throw new Error('Draft harus memiliki sedikitnya satu obat.');
    value.items = value.items.filter(x => String(x.obat_id) !== String(id));
}
function costSource(item) {
    return item.cost_source === 'supplier_purchase' ? 'Pembelian supplier' : item.cost_source === 'default_estimate' ? 'Estimasi harga bawaan' : 'Harga belum tersedia';
}
function supplierOptions(selected) {
    return '<option value="">Pilih supplier</option>' + controller.suppliers.map(s => `<option value="${e(s.id)}" ${String(s.id) === String(selected) ? 'selected' : ''}>${e(s.name)}</option>`).join('');
}
function evidence(item) {
    return `<div class="p-2 bg-light"><strong>${e(item.name)}</strong><p class="small mb-1">Tanggal analisis: ${e(formatWib(item.as_of))}</p><p class="mb-1">${e((item.reasons || []).join(' • '))}</p>
    <p class="text-warning mb-1">${e((item.warnings || []).join(' • '))}</p>
    <p class="mb-1">Riwayat sejak ${e(item.history_start || 'belum diketahui')} ${item.history_limited ? '(terbatas)' : ''}. Stok tercatat ${number(item.stock)}; batch ${number(item.batch_stock)}; kedaluwarsa ${number(item.expired_stock)}; layak ${number(item.usable_stock)}.</p>
    <p class="mb-1">Kebutuhan harian ${number(item.daily_demand)}; lead ${number(item.lead_days)} hari; safety ${number(item.safety_days)} hari; titik order ${number(item.reorder_point)}; target ${number(item.target_stock)}. ${e(costSource(item))}: ${money(item.estimated_unit_cost)}.</p>
    <details><summary>Batch (${(item.batches || []).length})</summary>${table(['Batch', 'Pembelian', 'Kedaluwarsa', 'Sisa'], (item.batches || []).map(b => `<tr><td>${e(b.batch_number)}</td><td>${e(b.purchase_date)}</td><td>${e(b.expiry_date || 'Tidak tercatat')}</td><td>${number(b.quantity_remaining)}</td></tr>`).join(''))}</details>
    <details><summary>Bukti transaksi (${(item.transactions || []).length})</summary>${table(['Sumber / referensi', 'Tanggal', 'Jumlah', 'Validasi'], (item.transactions || []).map(t => `<tr><td>${e(t.reference_type)} / ${e(t.reference_id)}</td><td>${e(t.date)}</td><td>${number(t.quantity)}</td><td>${t.valid ? 'Dihitung' : 'Dikecualikan'} · ${e(t.status)}</td></tr>`).join(''))}</details></div>`;
}
function table(headers, rows) {
    return `<div class="table-responsive"><table class="table table-sm table-bordered table-hover mb-2"><thead class="bg-light"><tr>${headers.map(th).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="text-center text-muted">Tidak ada data</td></tr>`}</tbody></table></div>`;
}
function renderRecommendations() {
    const visible = controller.items.filter(x => `${x.name} ${x.code}`.toLowerCase().includes(search.toLowerCase()) && (!priority || x.priority === priority) && (!supplierFilter || String(x.supplier_id) === supplierFilter) && (!fastOnly || x.fast_moving));
    pane('recommendations').innerHTML = `<div class="card"><div class="card-body p-3"><div class="d-flex flex-wrap align-items-center mb-2">
    ${button('refresh', 'Perbarui analisis')}${button('select-urgent', 'Pilih segera + perlu order')}${button('clear', 'Kosongkan pilihan')}
    <small class="text-muted ml-2">Analisis ${e(controller.asOf || '—')} · Target 30 hari · ${controller.selection.size} dipilih</small></div>
    <div class="row mb-2"><div class="col-md-4"><input class="form-control form-control-sm" id="order-search" aria-label="Cari obat" placeholder="Cari nama / kode obat" value="${e(search)}"></div>
    <div class="col-md-3"><select class="form-control form-control-sm" id="order-priority" aria-label="Prioritas"><option value="">Semua prioritas</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${priority===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="col-md-3"><select class="form-control form-control-sm" id="order-supplier-filter" aria-label="Filter supplier"><option value="">Semua supplier</option>${controller.suppliers.map(s=>`<option value="${e(s.id)}" ${supplierFilter===String(s.id)?'selected':''}>${e(s.name)}</option>`).join('')}</select></div>
    <div class="col-md-2"><label class="small"><input type="checkbox" id="order-fast" ${fastOnly?'checked':''}> Fast moving</label></div></div>
    <p class="small text-muted">Klinik / luar: unit (jumlah transaksi), masing-masing 30 / 90 hari. Periksa manual tidak dipilih otomatis. Draft tidak mengubah stok.</p>
    ${table(['Pilih / obat','Klinik 30 / 90 hari','Luar klinik 30 / 90 hari','Stok layak / cakupan','Tren / prioritas','Supplier / estimasi harga','Saran / jumlah order','Bukti'], visible.map(base => {
        const selected = controller.selection.get(String(base.obat_id)); const x = selected || base;
        return `<tr><td><label><input type="checkbox" data-select="${e(x.obat_id)}" ${selected?'checked':''}> ${e(x.name)}</label><small class="d-block">${e(x.code)} · ${e(x.unit)}</small>${(x.active_drafts||[]).map(d=>button('open-draft',`Draft #${e(d.id)}`,d.id)).join('')}</td>
        <td>${number(x.clinic?.units30)} (${number(x.clinic?.transactions30)}) / ${number(x.clinic?.units90)} (${number(x.clinic?.transactions90)})</td>
        <td>${number(x.external?.units30)} (${number(x.external?.transactions30)}) / ${number(x.external?.units90)} (${number(x.external?.transactions90)})</td>
        <td>${number(x.usable_stock)} / ${number(x.days_remaining)} hari</td><td>${number(x.trend_percent)}%<br><span class="badge badge-${x.priority==='urgent'?'danger':x.priority==='manual'?'warning':'info'}">${e(labels[x.priority] || x.priority)}</span>${x.fast_moving?'<br><small>Fast moving</small>':''}</td>
        <td><select class="form-control form-control-sm" aria-label="Supplier ${e(x.name)}" data-supplier="${e(x.obat_id)}">${supplierOptions(x.supplier_id)}</select><small>${money(x.estimated_unit_cost)}<br>${e(costSource(x))}</small></td>
        <td>${number(x.recommended_quantity)}<input type="number" min="1" step="1" class="form-control form-control-sm" style="min-width:80px" aria-label="Jumlah ${e(x.name)}" data-quantity="${e(x.obat_id)}" value="${selected?e(selected.quantity):Math.max(1,x.recommended_quantity||0)}"></td>
        <td><details><summary>Detail</summary>${evidence(x)}</details></td></tr>`;
    }).join(''))}
    <label for="order-notes">Catatan draft</label><textarea id="order-notes" class="form-control form-control-sm mb-2" rows="2">${e(controller.notes)}</textarea>
    ${button('create', controller.analysisChanged ? 'Saya sudah meninjau · coba simpan lagi' : 'Simpan draft per supplier')}
    <small class="text-muted">Pilihan tetap tersimpan saat mengganti filter. Jumlah dan supplier dapat diubah sebelum disimpan.</small>
    <details class="mt-3"><summary>Pengaturan lead time & safety stock per supplier</summary><div class="mt-2">${table(['Supplier','Lead (hari)','Safety (hari)','Simpan'],controller.suppliers.map(s=>`<tr><td>${e(s.name)}</td><td><input class="form-control form-control-sm" aria-label="Lead ${e(s.name)}" type="number" min="0" max="365" step="1" data-lead="${e(s.id)}" value="${e(s.lead_days)}"></td><td><input class="form-control form-control-sm" aria-label="Safety ${e(s.name)}" type="number" min="0" max="365" step="1" data-safety="${e(s.id)}" value="${e(s.safety_days)}"></td><td>${button('settings','Simpan',s.id)}</td></tr>`).join(''))}</div></details></div></div>`;
}
async function renderDrafts() {
    const drafts = await controller.api(`/order-drafts?status=${statusFilter}`);
    pane('drafts').innerHTML = `<div class="card"><div class="card-body p-3"><label>Status <select id="order-draft-status" class="form-control form-control-sm"><option value="draft" ${statusFilter==='draft'?'selected':''}>Aktif</option><option value="archived" ${statusFilter==='archived'?'selected':''}>Arsip</option></select></label> ${button('drafts','Perbarui')}${table(['Draft','Supplier','Item','Diperbarui','Aksi'],drafts.map(d=>`<tr><td>#${e(d.id)}</td><td>${e(d.supplier_name)}</td><td>${number(d.item_count)}</td><td>${e(formatWib(d.updated_at))}</td><td>${button('open-draft','Buka',d.id)}</td></tr>`).join(''))}<div id="order-draft-detail"></div></div></div>`;
    if (draft) renderDraftDetail();
}
function renderDraftDetail() {
    const editable = draft.status === 'draft';
    root.querySelector('#order-draft-detail').innerHTML = `<hr><h5>Draft #${e(draft.id)} · ${e(draft.supplier_name)}</h5><p class="small">${e(draft.status)} · versi ${e(draft.version)} · Harga merupakan estimasi; tidak mencatat pembelian.</p>
    ${table(['Obat','Jumlah','Harga estimasi','Subtotal estimasi','Bukti','Aksi'],draft.items.map(x=>`<tr><td>${e(x.name)}<small class="d-block">${e(x.code)} · ${e(x.unit)}</small></td><td><input type="number" min="1" step="1" aria-label="Jumlah draft ${e(x.name)}" class="form-control form-control-sm" data-draft-quantity="${e(x.obat_id)}" value="${e(x.quantity)}" ${editable?'':'disabled'}></td><td>${money(x.estimated_unit_cost)}</td><td>${money(x.estimated_unit_cost==null?null:x.quantity*x.estimated_unit_cost)}</td><td><details><summary>Detail</summary>${evidence(x.analysis||x)}</details></td><td>${editable?button('remove-draft-item','Hapus item',x.obat_id):'—'}</td></tr>`).join(''))}
    <label>Catatan<textarea id="order-draft-notes" class="form-control form-control-sm mb-2" ${editable?'':'disabled'}>${e(draft.notes)}</textarea></label><div>${editable?button('update-draft','Simpan perubahan')+button('archive','Arsipkan draft'):''}${button('print','Cetak data tersimpan')}${button('excel','Unduh Excel tersimpan')}${button('reload-draft','Muat ulang versi server')}</div>
    <details class="mt-2"><summary>Riwayat perubahan</summary>${(draft.audit||[]).map(a=>`<p class="small mb-1">${e(formatWib(a.created_at))} · ${e(a.action)} · ${e(a.actor)}</p>`).join('')}</details>`;
}
function activate(name) {
    root.querySelectorAll('[data-order-pane]').forEach(el=>el.classList.toggle('d-none',el.dataset.orderPane!==name));
    root.querySelectorAll('[data-order-tab]').forEach(el=>el.classList.toggle('active',el.dataset.orderTab===name));
}
async function openDraft(id, discardChanges = false) {
    if (draftDirty && !discardChanges) {
        activate('drafts'); renderDraftDetail();
        notify('Ada perubahan draft yang belum disimpan. Simpan perubahan atau gunakan Muat ulang versi server untuk membuang perubahan sebelum membuka draft.', true);
        return;
    }
    const fresh = await controller.api(`/order-drafts/${encodeURIComponent(id)}`);
    if (!root.querySelector('#order-draft-detail')) await renderDrafts();
    draft = fresh; draftDirty = false; activate('drafts'); renderDraftDetail();
}
function lockControls(host) {
    const controls = [...host.querySelectorAll('button, input, select, textarea')].map(element => ({ element, disabled: element.disabled }));
    controls.forEach(({ element }) => { element.disabled = true; });
    return () => controls.forEach(({ element, disabled }) => { element.disabled = disabled; });
}
async function perform(action, id) {
    if (working) return;
    working = true;
    root.setAttribute('aria-busy','true');
    const unlock = lockControls(root);
    try {
        if (action==='refresh') { await controller.refresh(); renderRecommendations(); notify('Analisis diperbarui. Pilihan dan jumlah yang sudah dipilih tetap dipertahankan.'); }
        if (action==='select-urgent') { controller.selectUrgent(); renderRecommendations(); }
        if (action==='clear') { controller.selection.clear(); renderRecommendations(); }
        if (action==='create') {
            const result = await controller.save(); renderRecommendations();
            if (result) {
                const message = `Draft tersimpan: ${result.drafts.map(d=>'#'+d.id).join(', ')}${result.replayed?' (permintaan sebelumnya)':''}.`;
                notify(message);
                try { await renderDrafts(); activate('drafts'); }
                catch (error) { notify(`${message} Daftar belum dapat dimuat: ${error.message}. Gunakan Perbarui pada tab Draft Order.`, true); }
            }
        }
        if (action==='drafts') await renderDrafts();
        if (action==='open-draft') await openDraft(id);
        if (action==='reload-draft' && draft) await openDraft(draft.id, true);
        if (action==='remove-draft-item' && draft) { removeDraftItem(draft, id); draftDirty = true; renderDraftDetail(); notify('Item dihapus dari pilihan. Simpan perubahan untuk memperbarui draft.'); }
        if (action==='settings') {
            const setting=controller.suppliers.find(s=>String(s.id)===String(id));
            const lead_days=Number(root.querySelector(`[data-lead="${id}"]`).value), safety_days=Number(root.querySelector(`[data-safety="${id}"]`).value);
            if (![lead_days,safety_days].every(x=>Number.isInteger(x)&&x>=0&&x<=365)) throw new Error('Lead dan safety harus bilangan bulat 0–365 hari.');
            await controller.api(`/order-settings/${encodeURIComponent(id)}`,{method:'PUT',body:{lead_days,safety_days,version:setting.version}});
            await controller.refresh(); renderRecommendations(); notify('Pengaturan disimpan; analisis diperbarui.');
        }
        if (action==='update-draft' && draft) {
            if (draft.items.some(x=>!Number.isInteger(x.quantity)||x.quantity<1)) throw new Error('Jumlah harus bilangan bulat positif.');
            try {
                draft=await controller.api(`/order-drafts/${encodeURIComponent(draft.id)}`,{method:'PUT',body:{version:draft.version,notes:draft.notes,items:draft.items.map(x=>({obat_id:x.obat_id,supplier_id:draft.supplier_id,quantity:x.quantity,notes:x.notes||'',analysis_fingerprint:x.analysis?.analysis_fingerprint}))}});
                draftDirty = false; renderDraftDetail(); notify('Perubahan draft disimpan.');
            } catch(error) {
                if(error.code==='ANALYSIS_CHANGED') {
                    for(const fresh of error.data?.items||[]) {const old=draft.items.find(x=>String(x.obat_id)===String(fresh.obat_id));if(old){old.analysis=fresh;old.estimated_unit_cost=fresh.estimated_unit_cost;old.cost_source=fresh.cost_source;}}
                    renderDraftDetail();
                }
                throw error;
            }
        }
        if (action==='archive' && draft) {
            if (draftDirty) throw new Error('Simpan perubahan draft atau muat ulang versi server sebelum mengarsipkan.');
            const archived = await controller.api(`/order-drafts/${encodeURIComponent(draft.id)}/archive`,{method:'POST',body:{version:draft.version}});
            controller.removeDraftReference(draft.id); renderRecommendations();
            draft.status = 'archived'; draft.version = archived.version; renderDraftDetail(); notify('Draft diarsipkan.');
            try { await openDraft(draft.id); }
            catch (error) { notify(`Draft sudah diarsipkan. Detail terbaru belum dapat dimuat: ${error.message}`, true); }
        }
        if (action==='excel' && draft) {
            const blob=await controller.api(`/order-drafts/${encodeURIComponent(draft.id)}/export`,{blob:true});
            const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`draft-order-${draft.id}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }
        if (action==='print' && draft) {
            const popup=window.open('','_blank');if(!popup) throw new Error('Izinkan jendela cetak di browser.');
            try {
                const saved=await controller.api(`/order-drafts/${encodeURIComponent(draft.id)}`);
                popup.document.open();popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Draft order #${e(saved.id)}</title><style>body{font:14px Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px}small{color:#555}</style></head><body><h2>Draft order #${e(saved.id)}</h2><p>Supplier: ${e(saved.supplier_name)} · ${e(saved.status)} · versi ${e(saved.version)}</p>${table(['Obat','Jumlah','Harga estimasi','Subtotal estimasi'],saved.items.map(x=>`<tr><td>${e(x.name)} (${e(x.unit)})</td><td>${number(x.quantity)}</td><td>${money(x.estimated_unit_cost)}</td><td>${money(x.estimated_unit_cost==null?null:x.quantity*x.estimated_unit_cost)}</td></tr>`).join(''))}<p>${e(saved.notes)}</p><small>Draft perencanaan; harga estimasi. Tidak mengubah stok.</small></body></html>`);popup.document.close();popup.focus();popup.print();
            } catch(error) {popup.close();throw error;}
        }
    } catch(error) {
        if(error.code==='ANALYSIS_CHANGED') {if(action==='create')renderRecommendations();notify('Analisis berubah. Bukti terbaru ditampilkan, jumlah pilihan tetap. Tinjau lalu tekan simpan kembali untuk menyetujui.',true);}
        else if(error.code==='VERSION_CONFLICT') notify('Versi telah berubah oleh pengguna lain. Perubahan Anda dipertahankan. Catat perubahan lalu muat ulang versi server sebelum mengedit kembali.',true);
        else notify(error.message,true);
    } finally {working=false;root.setAttribute('aria-busy','false');unlock();}
}
export function initOrderObat() {
    const host=document.getElementById('kelola-obat-page');
    if (!host || host.querySelector('#order-obat-tabs')) return;
    root=host;controller=new OrderController();
    const existing=document.createElement('div');existing.dataset.orderPane='inventory';
    while(host.firstChild) existing.appendChild(host.firstChild);
    host.appendChild(existing);
    host.insertAdjacentHTML('afterbegin',`<ul class="nav nav-tabs mb-3" id="order-obat-tabs"><li class="nav-item"><button class="nav-link active" data-order-tab="inventory" type="button">Data Obat</button></li><li class="nav-item"><button class="nav-link" data-order-tab="recommendations" type="button">Rekomendasi Order</button></li><li class="nav-item"><button class="nav-link" data-order-tab="drafts" type="button">Draft Order</button></li></ul><div id="order-notice" class="d-none" role="status"></div>`);
    host.insertAdjacentHTML('beforeend','<div data-order-pane="recommendations" class="d-none"></div><div data-order-pane="drafts" class="d-none"></div>');
    host.addEventListener('click',async event=>{
        const tab=event.target.closest('[data-order-tab]');
        if(tab){activate(tab.dataset.orderTab);if(tab.dataset.orderTab==='recommendations'&&!pane('recommendations').innerHTML)await perform('refresh');if(tab.dataset.orderTab==='drafts')await perform('drafts');return;}
        const target=event.target.closest('[data-order-action]');if(target) await perform(target.dataset.orderAction,target.dataset.id);
    });
    host.addEventListener('input',event=>{
        const t=event.target;
        if(t.id==='order-search'){search=t.value;const position=t.selectionStart;renderRecommendations();const next=root.querySelector('#order-search');next.focus();next.setSelectionRange(position,position);}
        if(t.id==='order-notes')controller.notes=t.value;
        if(t.id==='order-draft-notes'&&draft){draft.notes=t.value;draftDirty=true;}
        if(t.dataset.quantity){controller.select(t.dataset.quantity,true);controller.selection.get(t.dataset.quantity).quantity=Number(t.value);const checkbox=root.querySelector(`[data-select="${t.dataset.quantity}"]`);if(checkbox)checkbox.checked=true;}
        if(t.dataset.draftQuantity&&draft){const x=draft.items.find(x=>String(x.obat_id)===t.dataset.draftQuantity);if(x){x.quantity=Number(t.value);draftDirty=true;}}
    });
    host.addEventListener('change',async event=>{
        const t=event.target;
        if(t.dataset.select){controller.select(t.dataset.select,t.checked);renderRecommendations();}
        if(t.id==='order-priority'){priority=t.value;renderRecommendations();}
        if(t.id==='order-supplier-filter'){supplierFilter=t.value;renderRecommendations();}
        if(t.id==='order-fast'){fastOnly=t.checked;renderRecommendations();}
        if(t.id==='order-draft-status'){statusFilter=t.value;await perform('drafts');}
        if(t.dataset.supplier){
            if(working){renderRecommendations();return;}
            working=true;const unlock=lockControls(root);
            try{await controller.setSupplier(t.dataset.supplier,t.value);renderRecommendations();notify('Analisis supplier diperbarui; jumlah pilihan tetap.');}
            catch(error){renderRecommendations();notify(error.message,true);}
            finally{working=false;unlock();}
        }
    });
}
