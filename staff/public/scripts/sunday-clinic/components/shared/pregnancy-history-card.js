/**
 * Pregnancy history card (Private Clinic anamnesa).
 * Data comes from /api/pregnancies; the visit page keeps explicit-save semantics.
 */

const COMPLICATIONS = [
    { code: 'preeklamsia', label: 'Preeklamsia/PEB' },
    { code: 'eklamsia', label: 'Eklamsia' },
    { code: 'hipertensi_gestasional', label: 'Hipertensi gestasional' },
    { code: 'dm_gestasional', label: 'DM gestasional' },
    { code: 'hpp', label: 'HPP (perdarahan postpartum)' },
    { code: 'plasenta_previa', label: 'Plasenta previa' },
    { code: 'solusio_plasenta', label: 'Solusio plasenta' },
    { code: 'kpd', label: 'KPD' },
    { code: 'preterm', label: 'Persalinan preterm' },
    { code: 'iugr', label: 'IUGR/PJT' },
    { code: 'kelainan_letak', label: 'Kelainan letak' },
    { code: 'infeksi', label: 'Infeksi' },
    { code: 'lainnya', label: 'Lainnya' }
];
const COMPLICATION_LABELS = Object.fromEntries(COMPLICATIONS.map(c => [c.code, c.label]));
const OUTCOME_LABELS = {
    lahir_hidup: 'Lahir hidup',
    lahir_mati: 'Lahir mati',
    abortus: 'Abortus',
    ektopik: 'Ektopik',
    unknown: 'Tidak diketahui'
};
const DELIVERY_METHODS = ['Spt B (Spontan)', 'SC (Caesar)', 'Vakum', 'Forceps'];
const TERMS = [
    { code: 'aterm', label: 'Aterm' },
    { code: 'preterm', label: 'Preterm' },
    { code: 'postterm', label: 'Postterm' }
];
const SPONTANEOUS = 'Spt B (Spontan)';
const LOAD_ERROR = 'Riwayat kehamilan belum dapat dimuat';
const SAVE_HINT = 'Riwayat diperbarui — tekan Simpan Anamnesa untuk menyimpan ke kunjungan ini';
const CARD_ID = 'pregnancy-history-card';

function esc(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad(n) { return String(n).padStart(2, '0'); }

function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
}

function gaWeeks(hpht, endedOn) {
    const a = parseDay(hpht);
    const b = parseDay(endedOn);
    if (!a || !b || b < a) return null;
    return Math.floor(Math.round((b - a) / 86400000) / 7);
}

function lossSuggestion(hpht, endedOn) {
    const ga = gaWeeks(hpht, endedOn);
    if (ga === null) return null;
    return ga < 20 ? 'abortus' : 'lahir_mati';
}

function suggestText(suggested) {
    if (suggested === 'abortus') return `Saran dari usia kehamilan: ${OUTCOME_LABELS.abortus}`;
    if (suggested === 'lahir_mati') return '≥20 minggu: bila bayi meninggal, catat sebagai Lahir mati';
    return '';
}

function toast(type, message) {
    if (typeof window.showToast === 'function') window.showToast(type, message);
}

function authHeaders() {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : (typeof window.getToken === 'function' ? window.getToken() : null);
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function api(method, url, body) {
    const sep = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${sep}_t=${Date.now()}`, {
        method,
        headers: authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    try { json = await response.json(); } catch (e) { json = null; }
    if (!response.ok || !json || json.success === false) {
        const error = new Error((json && json.message) || 'Permintaan gagal');
        error.status = response.status;
        throw error;
    }
    return json;
}

function canEdit() {
    return !(typeof window.hasAccountPermission === 'function' && window.hasAccountPermission('anamnesa.edit') === false);
}

function describe(p) {
    const parts = [];
    if (p.delivery_method) {
        parts.push(p.delivery_indication ? `${p.delivery_method} (${p.delivery_indication})` : p.delivery_method);
    }
    return parts.join(' ');
}

function renderRow(p, editable) {
    const outcome = p.status === 'ongoing' ? 'Sedang hamil' : (OUTCOME_LABELS[p.outcome] || 'Tidak diketahui');
    const year = p.year || (p.ended_on ? String(p.ended_on).slice(0, 4) : (p.hpht ? String(p.hpht).slice(0, 4) : '-'));
    const ga = p.ga_weeks_at_end !== null && p.ga_weeks_at_end !== undefined ? `${p.ga_weeks_at_end} mgg` : '';
    const comps = (Array.isArray(p.complications) ? p.complications : [])
        .map(code => COMPLICATION_LABELS[code] || code).join(', ');
    const babies = (Array.isArray(p.babies) ? p.babies : [])
        .map(b => `${b.weight_g ? `${b.weight_g} g` : '-'}${b.sex ? ` ${b.sex}` : ''}`).join(', ');
    const source = p.source === 'external'
        ? '<span class="badge badge-secondary">Luar</span>'
        : '<span class="badge badge-info">Klinik</span>';
    const review = p.needs_review ? ' <span class="badge badge-warning">Perlu dicek</span>' : '';
    const actions = editable && p.status !== 'ongoing'
        ? `<button type="button" class="btn btn-xs btn-outline-primary mr-1" data-preg-action="edit" data-preg-id="${esc(p.id)}">Ubah</button>` +
          (p.source === 'external'
              ? `<button type="button" class="btn btn-xs btn-outline-danger" data-preg-action="delete" data-preg-id="${esc(p.id)}">Hapus</button>`
              : '')
        : '';
    return `<tr>
        <td>${esc(year)}</td>
        <td><strong>${esc(outcome)}</strong>${review}<br>${source}</td>
        <td>${esc(ga)}</td>
        <td>${esc(describe(p))}</td>
        <td>${esc(comps)}${p.complication_notes ? `<br><small>${esc(p.complication_notes)}</small>` : ''}</td>
        <td>${esc(babies)}</td>
        <td class="text-nowrap">${actions}</td>
    </tr>`;
}

function sortNewestFirst(list) {
    return list.slice().sort((a, b) => (b.sequence || 0) - (a.sequence || 0));
}

// ── End form (shared by "Lengkapi kehamilan sebelumnya" and history add/edit) ──

function endFormHtml(opts) {
    const o = opts || {};
    const v = o.values || {};
    const outcomes = o.external
        ? ['lahir_hidup', 'lahir_mati', 'abortus', 'ektopik', 'unknown']
        : ['lahir_hidup', 'lahir_mati', 'abortus', 'ektopik'];
    const suggested = lossSuggestion(o.hpht, v.ended_on);
    const checked = v.outcome || '';
    const radios = outcomes.map(code => `
        <label class="mr-3 mb-1"><input type="radio" name="peg-outcome" value="${esc(code)}" ${checked === code ? 'checked' : ''}> ${esc(OUTCOME_LABELS[code])}</label>`).join('');
    const methods = ['<option value="">Pilih cara lahir</option>'].concat(DELIVERY_METHODS.map(m =>
        `<option value="${esc(m)}" ${v.delivery_method === m ? 'selected' : ''}>${esc(m)}</option>`)).join('');
    const terms = ['<option value="">–</option>'].concat(TERMS.map(t =>
        `<option value="${esc(t.code)}" ${v.term === t.code ? 'selected' : ''}>${esc(t.label)}</option>`)).join('');
    const comps = COMPLICATIONS.map(c => `
        <label class="mr-3 mb-1"><input type="checkbox" name="peg-comp" value="${esc(c.code)}" ${(v.complications || []).includes(c.code) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('');
    const babies = (Array.isArray(v.babies) ? v.babies : []).map(b => babyRowHtml(b)).join('');
    return `<div class="text-left" id="peg-form" data-hpht="${esc(o.hpht || '')}" data-suggested="${esc(suggested || '')}">
        ${o.external ? `<div class="form-group"><label>Tahun</label><input type="number" id="peg-year" class="form-control" min="1950" max="${new Date().getFullYear()}" value="${esc(v.year || '')}"></div>` : ''}
        <div class="form-group"><label>Hasil kehamilan</label><div>${radios}</div>
            <small class="text-muted" id="peg-suggest">${esc(suggestText(suggested))}</small></div>
        <div class="form-group"><label>Tanggal selesai</label><input type="date" id="peg-date" class="form-control" max="${todayLocal()}" value="${esc(v.ended_on || '')}"></div>
        <div class="form-group" id="peg-birth-block"><label>Cara lahir</label><select id="peg-method" class="form-control">${methods}</select>
            <input type="text" id="peg-indication" class="form-control mt-1" maxlength="255" placeholder="Indikasi (wajib untuk SC/Vakum/Forceps)" value="${esc(v.delivery_indication || '')}">
            <label class="mt-2 mb-0">Usia kehamilan saat lahir</label><select id="peg-term" class="form-control">${terms}</select>
            <small class="text-muted">Dihitung otomatis dari HPHT bila tanggal selesai diketahui.</small></div>
        <div class="form-group"><label>Komplikasi</label><div>${comps}</div>
            <textarea id="peg-comp-notes" class="form-control mt-1" maxlength="500" rows="2" placeholder="Catatan komplikasi">${esc(v.complication_notes || '')}</textarea></div>
        <div class="form-group" id="peg-babies-block"><label>Bayi (opsional)</label><div id="peg-babies">${babies}</div>
            <button type="button" class="btn btn-xs btn-outline-secondary" id="peg-add-baby">+ Bayi</button></div>
        <div class="form-group" id="peg-kuretase-block"><label>Kuretase</label>
            <select id="peg-kuretase" class="form-control"><option value="">-</option>
            <option value="Ya" ${v.kuretase === 'Ya' ? 'selected' : ''}>Ya</option><option value="Tidak" ${v.kuretase === 'Tidak' ? 'selected' : ''}>Tidak</option></select></div>
    </div>`;
}

function babyRowHtml(b) {
    const baby = b || {};
    return `<div class="form-inline mb-1 peg-baby">
        <input type="number" class="form-control form-control-sm mr-1 peg-baby-weight" min="0" max="9999" placeholder="Berat (g)" value="${esc(baby.weight_g || '')}">
        <select class="form-control form-control-sm peg-baby-sex"><option value="">JK</option>
        <option value="L" ${baby.sex === 'L' ? 'selected' : ''}>L</option><option value="P" ${baby.sex === 'P' ? 'selected' : ''}>P</option></select></div>`;
}

function readEndForm(root, opts) {
    const get = sel => root.querySelector(sel);
    const outcomeEl = root.querySelector('input[name="peg-outcome"]:checked');
    const payload = { outcome: outcomeEl ? outcomeEl.value : '' };
    const endedOn = (get('#peg-date') || {}).value || '';
    if (!payload.outcome) return { error: 'Pilih hasil kehamilan' };
    if (!endedOn && !(opts && opts.external)) return { error: 'Tanggal selesai wajib diisi' };
    if (endedOn) payload.ended_on = endedOn;
    const isBirth = payload.outcome === 'lahir_hidup' || payload.outcome === 'lahir_mati';
    if (isBirth) {
        const method = (get('#peg-method') || {}).value || '';
        const indication = ((get('#peg-indication') || {}).value || '').trim();
        if (!method && !(opts && opts.external)) return { error: 'Cara lahir wajib diisi' };
        if (method && method !== SPONTANEOUS && !indication) return { error: 'Indikasi wajib diisi untuk persalinan SC/Vakum/Forceps' };
        if (method) payload.delivery_method = method;
        if (indication) payload.delivery_indication = indication;
        const term = (get('#peg-term') || {}).value || '';
        if (term) payload.term = term;
        const alive = payload.outcome === 'lahir_hidup';
        const babies = Array.from(root.querySelectorAll('.peg-baby')).map(row => {
            const w = Number((row.querySelector('.peg-baby-weight') || {}).value);
            const sex = (row.querySelector('.peg-baby-sex') || {}).value || '';
            const baby = { alive };
            if (w > 0) baby.weight_g = w;
            if (sex) baby.sex = sex;
            return baby;
        }).filter(b => b.weight_g || b.sex);
        if (babies.length) payload.babies = babies;
    }
    if (payload.outcome === 'abortus') {
        const k = (get('#peg-kuretase') || {}).value || '';
        if (k) payload.kuretase = k;
    }
    payload.complications = Array.from(root.querySelectorAll('input[name="peg-comp"]:checked')).map(el => el.value);
    const notes = ((get('#peg-comp-notes') || {}).value || '').trim();
    if (notes) payload.complication_notes = notes;
    if (opts && opts.external) {
        const year = Number((get('#peg-year') || {}).value);
        if (year) payload.year = year;
    }
    if (opts && opts.edit) {
        // Edits must be able to clear fields: send every editable key.
        const keys = { ended_on: null, delivery_method: null, delivery_indication: null, complication_notes: null, kuretase: null, term: null };
        Object.keys(keys).forEach(k => { if (payload[k] === undefined) payload[k] = null; });
        if (!payload.babies) payload.babies = [];
        if (opts.external && payload.year === undefined) payload.year = null;
    }
    return { payload };
}

function wireEndForm(root, opts) {
    const sync = () => {
        const outcomeEl = root.querySelector('input[name="peg-outcome"]:checked');
        const outcome = outcomeEl ? outcomeEl.value : '';
        const isBirth = outcome === 'lahir_hidup' || outcome === 'lahir_mati';
        const show = (sel, on) => { const el = root.querySelector(sel); if (el) el.style.display = on ? '' : 'none'; };
        show('#peg-birth-block', isBirth);
        show('#peg-babies-block', isBirth);
        show('#peg-kuretase-block', outcome === 'abortus');
    };
    const suggestFromDate = () => {
        const date = (root.querySelector('#peg-date') || {}).value;
        const suggested = lossSuggestion(opts.hpht, date);
        const note = root.querySelector('#peg-suggest');
        if (note) note.textContent = suggestText(suggested);
        const picked = root.querySelector('input[name="peg-outcome"]:checked');
        if (picked && picked.dataset.auto === '1' && suggested !== 'abortus') {
            picked.checked = false;
            picked.dataset.auto = '';
        }
        if (suggested === 'abortus' && !root.querySelector('input[name="peg-outcome"]:checked')) {
            const radio = root.querySelector('input[name="peg-outcome"][value="abortus"]');
            if (radio) { radio.checked = true; radio.dataset.auto = '1'; }
        }
        sync();
    };
    root.querySelectorAll('input[name="peg-outcome"]').forEach(r => r.addEventListener('change', () => { r.dataset.auto = ''; sync(); }));
    const date = root.querySelector('#peg-date');
    if (date) date.addEventListener('change', suggestFromDate);
    const add = root.querySelector('#peg-add-baby');
    if (add) add.addEventListener('click', () => {
        const holder = root.querySelector('#peg-babies');
        if (holder) holder.insertAdjacentHTML('beforeend', babyRowHtml());
    });
    const initial = root.querySelector('input[name="peg-outcome"]:checked');
    if (!initial) suggestFromDate(); else sync();
}

async function openEndForm(opts) {
    const o = opts || {};
    const preselect = !(o.values && o.values.outcome) && lossSuggestion(o.hpht, (o.values || {}).ended_on) === 'abortus' ? 'abortus' : null;
    const values = Object.assign({}, o.values || {});
    if (preselect) values.outcome = preselect;
    const result = await Swal.fire({
        title: o.title || 'Lengkapi kehamilan sebelumnya',
        html: endFormHtml(Object.assign({}, o, { values })),
        width: 640,
        showCancelButton: true,
        confirmButtonText: o.confirmText || 'Simpan',
        cancelButtonText: 'Batal',
        didOpen: popup => wireEndForm(popup && popup.querySelector ? popup : document, o),
        preConfirm: () => {
            const popup = typeof Swal.getPopup === 'function' ? Swal.getPopup() : document;
            const read = readEndForm(popup, o);
            if (read.error) {
                if (typeof Swal.showValidationMessage === 'function') Swal.showValidationMessage(read.error);
                return false;
            }
            return read.payload;
        }
    });
    if (!result || !result.isConfirmed) return null;
    return result.value;
}

// ── Card ──

const PregnancyHistoryCard = {
    CARD_ID,
    LOAD_ERROR,
    COMPLICATIONS,
    esc,
    lossSuggestion,
    readEndForm,
    endFormHtml,
    openEndForm,

    /** Placeholder to put in a component's HTML. */
    placeholder() {
        return `<div id="${CARD_ID}"></div>`;
    },

    render(state, pregnancies) {
        const list = sortNewestFirst(Array.isArray(pregnancies) ? pregnancies : []);
        const editable = canEdit() && !(this._opts && this._opts.readOnly);
        const addBtn = editable
            ? '<button type="button" class="btn btn-xs btn-outline-primary" data-preg-action="add">+ Tambah riwayat luar</button>'
            : '';
        const body = list.length
            ? `<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr>
                <th>Tahun</th><th>Hasil</th><th>UK</th><th>Cara lahir</th><th>Komplikasi</th><th>Bayi</th><th></th>
                </tr></thead><tbody>${list.map(p => renderRow(p, editable)).join('')}</tbody></table></div>`
            : '<div class="text-muted small">Belum ada riwayat kehamilan tercatat.</div>';
        return `<div class="card mb-3 pregnancy-history-card"><div class="card-header py-2 d-flex justify-content-between align-items-center">
            <strong>Riwayat Kehamilan (Private Clinic)</strong>${addBtn}</div>
            <div class="card-body p-2">${body}</div></div>`;
    },

    renderError() {
        return `<div class="text-muted small mb-3">${esc(LOAD_ERROR)}</div>`;
    },

    patientIdOf(state) {
        const record = (state && state.recordData && state.recordData.record) || {};
        return record.patientId || record.patient_id || null;
    },

    mrIdOf(state) {
        return (state && (state.currentMrId || (state.recordData && (state.recordData.mrId || state.recordData.mr_id)))) || null;
    },

    async fetchData(patientId) {
        const json = await api('GET', `/api/pregnancies/patient/${encodeURIComponent(patientId)}`);
        return json.data || { pregnancies: [], totals: {}, riwayat_persalinan: [] };
    },

    /**
     * Fetch and render into the placeholder. opts: { category, onLoaded(data) }.
     * Never throws; failures show a neutral line.
     */
    async mount(state, opts) {
        const o = opts || {};
        const container = document.getElementById(CARD_ID);
        if (!container) return null;
        this._state = state;
        this._opts = o;
        const patientId = this.patientIdOf(state);
        // Never leave another patient's (or a stale) totals behind for the diagnosis generator.
        this.clearTotals();
        if (!patientId) { container.innerHTML = this.renderError(); return null; }
        let data;
        try {
            data = await this.fetchData(patientId);
        } catch (error) {
            container.innerHTML = this.renderError();
            return null;
        }
        this.publishTotals(patientId, data);
        const list = data.pregnancies || [];
        const hasClinic = list.some(p => p.source === 'clinic');
        if (o.category && o.category !== 'obstetri' && !hasClinic) {
            container.innerHTML = '';
            return data;
        }
        container.innerHTML = this.render(state, list);
        this._data = data;
        if (!container.dataset.bound) {
            container.dataset.bound = '1';
            container.addEventListener('click', event => this.onClick(event));
        }
        if (typeof o.onLoaded === 'function') {
            try { o.onLoaded(data); } catch (e) { console.error('[PregnancyHistoryCard] onLoaded failed:', e); }
        }
        return data;
    },

    /** Automatic obstetric diagnosis reads these (scoped by patient_id). */
    publishTotals(patientId, data) {
        const totals = data && data.totals;
        if (typeof window === 'undefined' || !totals) return;
        window.__pregnancyHistoryTotals = { patient_id: patientId, totals, sc_count: totals.sc_count || 0 };
    },

    clearTotals() {
        if (typeof window !== 'undefined') window.__pregnancyHistoryTotals = null;
    },

    /** Prefill G/P/A inputs only when empty. */
    prefillTotals(totals, force) {
        if (!totals) return;
        const map = {
            'anamnesa-gravida': totals.gravida,
            'anamnesa-para': totals.para,
            'anamnesa-abortus': totals.abortus,
            'anamnesa-anak-hidup': totals.anak_hidup
        };
        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (el && (force || String(el.value || '').trim() === '') && map[id] !== undefined && map[id] !== null) {
                el.value = String(map[id]);
            }
        });
    },

    async onClick(event) {
        const target = event.target && event.target.closest ? event.target.closest('[data-preg-action]') : null;
        if (!target) return;
        const action = target.dataset.pregAction;
        const id = Number(target.dataset.pregId);
        try {
            if (action === 'add') await this.addExternal();
            else if (action === 'edit') await this.editHistory(id);
            else if (action === 'delete') await this.deleteHistory(id);
        } catch (error) {
            toast('error', error.message || 'Gagal menyimpan riwayat');
        }
    },

    async addExternal() {
        const payload = await openEndForm({ title: 'Tambah riwayat kehamilan luar', external: true, confirmText: 'Tambah' });
        if (!payload) return;
        const patientId = this.patientIdOf(this._state);
        const json = await api('POST', `/api/pregnancies/patient/${encodeURIComponent(patientId)}/external`, payload);
        await this.afterHistoryChange(json);
    },

    async editHistory(id) {
        const row = ((this._data && this._data.pregnancies) || []).find(p => Number(p.id) === id);
        if (!row) return;
        const payload = await openEndForm({
            title: 'Ubah riwayat kehamilan',
            external: row.source === 'external',
            edit: true,
            hpht: row.hpht,
            values: Object.assign({}, row, { year: row.year }),
            confirmText: 'Simpan'
        });
        if (!payload) return;
        const patientId = this.patientIdOf(this._state);
        const json = await api('PUT', `/api/pregnancies/${id}`, Object.assign({ patient_id: patientId }, payload));
        await this.afterHistoryChange(json);
    },

    async deleteHistory(id) {
        const ask = await Swal.fire({ title: 'Hapus riwayat ini?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal' });
        if (!ask || !ask.isConfirmed) return;
        const patientId = this.patientIdOf(this._state);
        const json = await api('DELETE', `/api/pregnancies/${id}?patient_id=${encodeURIComponent(patientId)}`);
        await this.afterHistoryChange(json);
    },

    async afterHistoryChange(json) {
        if (json && json.warning) toast('info', json.warning);
        const data = await this.mount(this._state, this._opts);
        if (data && this._opts && typeof this._opts.onHistoryChanged === 'function') {
            await this._opts.onHistoryChanged(data);
        }
        toast('info', SAVE_HINT);
    },

    /**
     * After a successful anamnesa save (obstetri only). Errors never surface as save failures.
     * Returns a short status string for tests.
     */
    async runAfterSave(state) {
        // The diagnosis may only use totals republished after resolve (see mount).
        this.clearTotals();
        const patientId = this.patientIdOf(state);
        const mrId = this.mrIdOf(state);
        if (!patientId || !mrId) return 'skipped';
        let resolved;
        try {
            const json = await api('POST', `/api/pregnancies/patient/${encodeURIComponent(patientId)}/resolve`, { mr_id: mrId });
            resolved = json.data || {};
        } catch (error) {
            toast('info', error.message || 'Kehamilan belum dapat diperbarui');
            return 'resolve_failed';
        }
        if (resolved.action !== 'start_needs_previous_end') {
            await this.mount(state, this._opts || { category: 'obstetri' });
            return resolved.action || 'none';
        }
        const previous = resolved.previous || {};
        const payload = await openEndForm({
            title: 'Lengkapi kehamilan sebelumnya',
            hpht: previous.hpht,
            confirmText: 'Simpan & mulai kehamilan baru'
        });
        if (!payload) {
            toast('info', 'Kehamilan baru belum dibuat. Lengkapi kehamilan sebelumnya saat menyimpan berikutnya.');
            return 'cancelled';
        }
        try {
            const json = await api('POST', `/api/pregnancies/patient/${encodeURIComponent(patientId)}/start`, { mr_id: mrId, previous_end: payload });
            if (json.warning) toast('info', json.warning);
        } catch (error) {
            toast('error', error.message || 'Kehamilan baru belum dapat dibuat');
            return 'start_failed';
        }
        const data = await this.mount(state, this._opts || { category: 'obstetri' });
        if (data && this._opts && typeof this._opts.onHistoryChanged === 'function') await this._opts.onHistoryChanged(data);
        toast('info', SAVE_HINT);
        return 'started';
    }
};

window.PregnancyHistoryCard = PregnancyHistoryCard;
export default PregnancyHistoryCard;
