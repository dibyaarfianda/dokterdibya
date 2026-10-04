/** Read-only references from the immediately preceding private-clinic visit. */
import apiClient from './api-client.js';
import stateManager from './state-manager.js';
import { escapeHtml } from './helpers.js';

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
    </aside>`;
}

function medicationHtml(billing) {
    return (Array.isArray(billing?.items) ? billing.items : []).filter(item => item.item_type === 'obat').map(item => {
        let data = item.item_data || {};
        if (typeof data === 'string') {
            try { data = JSON.parse(data) || {}; } catch { data = {}; }
        }
        const quantity = item.quantity == null ? '' : `Jumlah: ${item.quantity}`;
        const usage = textValue(data.caraPakai || data.latinSig);
        return `<div class="sc-planning-history-medication"><strong>${escapeHtml(item.item_name || '')}</strong>
            <div>${escapeHtml([quantity, usage].filter(Boolean).join(' • '))}</div></div>`;
    }).join('');
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
    const isCurrent = () => {
        const live = stateManager.getState();
        const liveRecord = live.recordData?.record || live.recordData || {};
        return root.isConnected && live.currentMrId === mrId && live.activeSection === 'plan' &&
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
    } catch {
        update('terapi', '<div class="sc-planning-history-error">Gagal memuat kontrol sebelumnya. Buka kembali Planning untuk mencoba lagi.</div>');
        update('rencana', '<div class="sc-planning-history-error">Gagal memuat kontrol sebelumnya. Buka kembali Planning untuk mencoba lagi.</div>');
    }
}
