/** Previous private-clinic references, reused only through an explicit user action. */
import apiClient from './api-client.js';
import stateManager from './state-manager.js';
import { escapeHtml } from './helpers.js';

const pendingTherapy = new Set();
const historyLoads = new WeakMap();

export function visitTimestamp(value) {
    if (typeof value !== 'string' || !value.trim()) return NaN;
    // Unzoned database dates represent WIB, regardless of the device timezone.
    const text = value.trim().replace(' ', 'T');
    const zoned = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00+07:00` :
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text) ? `${text}+07:00` : text;
    return Date.parse(zoned);
}

function sequence(mrId) {
    const match = /^DRD(\d+)$/i.exec(String(mrId || ''));
    return match ? BigInt(match[1]) : null;
}

export function selectPreviousPrivateVisit(visits, currentRecord, currentMrId) {
    const currentVisit = visits.find(visit => visit.mr_id === currentMrId);
    const currentTime = visitTimestamp(currentVisit?.visit_date || currentRecord.createdAt);
    if (!Number.isFinite(currentTime)) throw new Error('Current visit date is unavailable');
    const currentSequence = sequence(currentMrId);
    return visits.filter(visit => {
        if (visit.visit_location !== 'klinik_private' || visit.mr_id === currentMrId) return false;
        const time = visitTimestamp(visit.visit_date);
        const visitSequence = sequence(visit.mr_id);
        return Number.isFinite(time) && (time < currentTime ||
            (time === currentTime && currentSequence !== null && visitSequence !== null && visitSequence < currentSequence));
    }).sort((a, b) => {
        const difference = visitTimestamp(b.visit_date) - visitTimestamp(a.visit_date);
        if (difference) return difference;
        const aSequence = sequence(a.mr_id);
        const bSequence = sequence(b.mr_id);
        return aSequence !== null && bSequence !== null ? (aSequence < bSequence ? 1 : aSequence > bSequence ? -1 : 0) : 0;
    })[0] || null;
}

function textValue(value) {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join('\n').trim();
    return '';
}

export function previousPlanningText(bundle) {
    // An explicitly empty section takes precedence over a legacy complete record.
    const data = bundle?.byType?.planning?.data ?? bundle?.latestComplete?.data?.planning ?? {};
    return {
        terapi: textValue(Object.hasOwn(data, 'terapi') ? data.terapi : data.obat),
        rencana: textValue(Object.hasOwn(data, 'rencana') ? data.rencana : data.instruksi)
    };
}

export function renderPreviousPlanningPanel(kind) {
    const title = kind === 'terapi' ? 'Terapi kontrol sebelumnya' : 'Rencana kontrol sebelumnya';
    return `<aside class="sc-planning-history" data-planning-history="${kind}" aria-labelledby="previous-${kind}-title">
        <h6 id="previous-${kind}-title" class="sc-planning-history-title">${title}</h6>
        <div class="sc-planning-history-meta" data-planning-history-meta></div>
        <div data-planning-history-content aria-live="polite">Memuat kontrol sebelumnya...</div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-use-previous-planning="${kind}" disabled>
            Pakai ${kind === 'terapi' ? 'terapi' : 'rencana'} sebelumnya
        </button>
        <div class="small mt-1" data-planning-history-feedback role="status"></div>
    </aside>`;
}

function medicationData(item) {
    if (typeof item.item_data !== 'string') return item.item_data || {};
    try { return JSON.parse(item.item_data) || {}; } catch { return {}; }
}

function medicationHtml(billing) {
    return (Array.isArray(billing?.items) ? billing.items : []).filter(item => item.item_type === 'obat').map(item => {
        const data = medicationData(item);
        const quantity = item.quantity == null ? '' : `Jumlah: ${item.quantity}`;
        const usage = textValue(data.caraPakai || data.latinSig);
        return `<div class="sc-planning-history-medication"><strong>${escapeHtml(item.item_name || '')}</strong>
            <div>${escapeHtml([quantity, usage].filter(Boolean).join(' • '))}</div></div>`;
    }).join('');
}

function prescriptionsFromBilling(billing) {
    return (Array.isArray(billing?.items) ? billing.items : []).filter(item => item.item_type === 'obat').map(item => {
        const data = medicationData(item);
        const quantity = Number(item.quantity);
        const name = textValue(item.item_name);
        const unit = textValue(data.unit);
        if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('Data obat sebelumnya tidak lengkap. Periksa melalui Input Terapi.');
        }
        return { obatId: data.obatId || null, name, quantity, unit,
            caraPakai: textValue(data.caraPakai), latinSig: textValue(data.latinSig) };
    });
}

function medicationKeys(item) {
    return [item.obatId ? `id:${item.obatId}` : '', `name:${item.name.trim().toLocaleLowerCase('id-ID')}`].filter(Boolean);
}

function missingPrescriptions(items, billing) {
    const existing = new Set((Array.isArray(billing?.items) ? billing.items : [])
        .filter(item => item.item_type === 'obat')
        .flatMap(item => medicationKeys({obatId: medicationData(item).obatId, name: String(item.item_name || '')})));
    return items.filter(item => {
        const keys = medicationKeys(item);
        if (keys.some(key => existing.has(key))) return false;
        keys.forEach(key => existing.add(key));
        return true;
    });
}

function appendPreviousText(root, kind, text) {
    if (!text) return;
    const field = root.querySelector(`#planning-${kind}`);
    if (!field || (`\n${field.value.trim()}\n`).includes(`\n${text}\n`)) return;
    field.value += `${field.value && !field.value.endsWith('\n') ? '\n' : ''}${text}`;
    field.dispatchEvent(new Event('input', {bubbles:true}));
    field.dispatchEvent(new Event('change', {bubbles:true}));
}

function enablePreviousPlanningActions(root, mrId, planning, billing, completeTherapy, isCurrent) {
    const therapyButton = root.querySelector('[data-use-previous-planning="terapi"]');
    const planButton = root.querySelector('[data-use-previous-planning="rencana"]');
    const feedback = (kind, message) => {
        if (isCurrent()) root.querySelector(`[data-planning-history="${kind}"] [data-planning-history-feedback]`).textContent = message;
    };
    therapyButton.disabled = !completeTherapy || !(planning?.terapi || billing?.items?.some(item => item.item_type === 'obat'));
    planButton.disabled = !planning?.rencana;
    planButton.onclick = () => {
        if (!isCurrent() || planButton.disabled) return;
        appendPreviousText(root, 'rencana', planning.rencana);
        planButton.disabled = true;
        feedback('rencana', 'Rencana dipakai. Simpan Planning untuk menyimpan perubahan.');
    };
    therapyButton.onclick = async () => {
        if (!isCurrent() || therapyButton.disabled || pendingTherapy.has(mrId)) return;
        pendingTherapy.add(mrId);
        therapyButton.disabled = true;
        let applied = false;
        feedback('terapi', 'Memakai terapi sebelumnya...');
        try {
            const items = prescriptionsFromBilling(billing);
            let added = 0;
            if (items.length) {
                // Read fresh billing on every action, including after reopening the form.
                const activeBilling = await readFresh(`/api/sunday-clinic/billing/${encodeURIComponent(mrId)}`);
                if (!isCurrent()) return;
                const missing = missingPrescriptions(items, activeBilling);
                if (missing.length) {
                    const response = await apiClient.updateBillingObat(mrId, missing);
                    if (!response?.success) throw new Error(response?.message || 'Gagal memakai terapi sebelumnya.');
                    added = missing.length;
                }
            }
            if (!isCurrent()) return;
            appendPreviousText(root, 'terapi', planning.terapi);
            applied = true;
            if (items.length && window.renderTerapiItemsList) {
                const refreshed = await window.renderTerapiItemsList({preserveEdits:true,isCurrent});
                if (!refreshed) throw new Error('Daftar obat belum termuat.');
            }
            feedback('terapi', `Terapi dipakai. ${added} obat ditambahkan; obat yang sudah ada tetap dipertahankan.${planning.terapi ? ' Simpan Planning untuk menyimpan teks manual.' : ''}`);
        } catch (error) {
            feedback('terapi', applied ? 'Terapi dipakai, tetapi daftar obat belum termuat. Buka kembali Planning.' :
                error.message || 'Gagal memakai terapi sebelumnya. Silakan coba lagi.');
        } finally {
            pendingTherapy.delete(mrId);
            if (isCurrent()) therapyButton.disabled = applied;
        }
    };
}

async function readFresh(endpoint) {
    const response = await apiClient.request(`${endpoint}?_t=${Date.now()}`, {
        method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response?.success) throw new Error('Previous control is unavailable');
    return response.data;
}

export async function loadPreviousPlanning(state, root) {
    const record = state.recordData?.record || state.recordData || {};
    const mrId = state.currentMrId || record.mrId || record.mr_id;
    const patientId = state.patientData?.id || record.patientId || record.patient_id;
    const panels = root?.querySelectorAll('[data-planning-history]');
    if (!panels?.length) return;
    const loadId = {};
    historyLoads.set(root, loadId);
    root.querySelectorAll('[data-use-previous-planning]').forEach(button => { button.disabled = true; });
    const isCurrent = () => {
        const live = stateManager.getState();
        const liveRecord = live.recordData?.record || live.recordData || {};
        return root.isConnected && historyLoads.get(root) === loadId && live.currentMrId === mrId && live.activeSection === 'plan' &&
            (live.patientData?.id || liveRecord.patientId || liveRecord.patient_id) === patientId;
    };
    const update = (kind, html) => {
        if (isCurrent()) root.querySelector(`[data-planning-history="${kind}"] [data-planning-history-content]`).innerHTML = html;
    };
    try {
        if (!isCurrent()) return;
        if (!patientId || !mrId) throw new Error('Visit identity is unavailable');
        const visits = await readFresh(`/api/sunday-clinic/patient-visits/${encodeURIComponent(patientId)}`);
        if (!isCurrent()) return;
        if (!Array.isArray(visits)) throw new Error('Visit history is unavailable');
        const previous = selectPreviousPrivateVisit(visits, record, mrId);
        if (!previous) {
            update('terapi', 'Belum ada kontrol sebelumnya di klinik private.');
            update('rencana', 'Belum ada kontrol sebelumnya di klinik private.');
            return;
        }
        const date = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric',
            timeZone: 'Asia/Jakarta' }).format(new Date(visitTimestamp(previous.visit_date)));
        panels.forEach(panel => {
            panel.querySelector('[data-planning-history-meta]').textContent = `${date} • ${previous.mr_id}`;
        });
        const sourceId = encodeURIComponent(previous.mr_id);
        const [planningResult, billingResult] = await Promise.allSettled([
            readFresh(`/api/sunday-clinic/records/${sourceId}`).then(source => {
                if (source?.record?.mrId !== previous.mr_id || source.record.patientId !== patientId ||
                    source.record.visit_location !== 'klinik_private') throw new Error('Source visit does not match');
                return previousPlanningText(source.medicalRecords);
            }),
            readFresh(`/api/sunday-clinic/billing/${sourceId}`)
        ]);
        if (!isCurrent()) return;
        const planning = planningResult.status === 'fulfilled' ? planningResult.value : null;
        const medications = billingResult.status === 'fulfilled' ? medicationHtml(billingResult.value) : '';
        const manual = planning?.terapi ? `<div class="sc-planning-history-text">${escapeHtml(planning.terapi)}</div>` : '';
        const failures = [
            billingResult.status === 'rejected' ? '<div class="sc-planning-history-error">Gagal memuat daftar obat sebelumnya.</div>' : '',
            planningResult.status === 'rejected' ? '<div class="sc-planning-history-error">Gagal memuat terapi manual sebelumnya.</div>' : ''
        ].join('');
        update('terapi', medications + manual + failures || 'Tidak ada terapi tercatat pada kontrol sebelumnya.');
        update('rencana', planning ? (planning.rencana ?
            `<div class="sc-planning-history-text">${escapeHtml(planning.rencana)}</div>` :
            'Tidak ada rencana tercatat pada kontrol sebelumnya.') :
            '<div class="sc-planning-history-error">Gagal memuat rencana kontrol sebelumnya.</div>');
        enablePreviousPlanningActions(root, mrId, planning, billingResult.status === 'fulfilled' ? billingResult.value : null,
            planningResult.status === 'fulfilled' && billingResult.status === 'fulfilled', isCurrent);
    } catch {
        update('terapi', '<div class="sc-planning-history-error">Gagal memuat kontrol sebelumnya. Buka kembali Planning untuk mencoba lagi.</div>');
        update('rencana', '<div class="sc-planning-history-error">Gagal memuat kontrol sebelumnya. Buka kembali Planning untuk mencoba lagi.</div>');
    }
}
