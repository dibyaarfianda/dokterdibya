/** Patient-linked schedules and explicit cancellation; preserve the doctor's Planning draft. */
import apiClient from './api-client.js';
import stateManager from './state-manager.js';
import { escapeHtml } from './helpers.js';
import { hasPermission } from '../../vps-auth-v2.js';

const loads = new WeakMap();
const cancellations = new Set();
const locations = { klinik_private: 'Klinik Privat', rsia_melinda: 'RSIA Melinda', rsud_gambiran: 'RSUD Gambiran', rs_bhayangkara: 'RS Bhayangkara' };

function isCurrentPlanning(root, mrId) {
    const state = stateManager.getState();
    return root?.isConnected && root.dataset.planningMrId === mrId
        && state.currentMrId === mrId && state.activeSection === 'plan';
}

export function plannedScMarkup(schedules, canCancel = false) {
    return `<div class="alert alert-info mb-0" role="status">
        <strong><i class="fas fa-calendar-check mr-1" aria-hidden="true"></i>Jadwal Rencana SC</strong>
        ${schedules.map(schedule => {
            const date = DibyaDateTime.date(schedule.surgery_date);
            const time = schedule.surgery_time ? `${schedule.surgery_time} WIB` : 'Jam belum ditentukan';
            const status = schedule.status === 'confirmed' ? 'Terkonfirmasi' : 'Direncanakan';
            return `<div class="mt-1"><strong>${escapeHtml(schedule.operation)}</strong>
                <div>${escapeHtml(date)} · ${escapeHtml(time)} · ${escapeHtml(locations[schedule.location] || schedule.location)}</div>
                <small>${status}</small>
                ${canCancel ? `<div class="mt-2"><button type="button" class="btn btn-sm btn-outline-danger" data-cancel-planned-sc="${escapeHtml(schedule.id)}">Batalkan rencana SC</button></div>` : ''}</div>`;
        }).join('')}
    </div>`;
}

export async function loadPlannedSc(state, root) {
    const mrId = state.currentMrId;
    const panel = root?.querySelector('[data-planned-sc]');
    if (!panel || !mrId) return;
    const load = {};
    loads.set(root, load);
    const isCurrent = () => loads.get(root) === load && isCurrentPlanning(root, mrId);
    try {
        const [response, canCancel] = await Promise.all([
            apiClient.request(`/api/sunday-clinic/records/${encodeURIComponent(mrId)}/planned-sc?_t=${Date.now()}`, {
                method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }
            }),
            hasPermission('docboard.write').catch(() => false)
        ]);
        if (!response?.success || !Array.isArray(response.data)) throw new Error('Jadwal belum termuat');
        if (!isCurrent()) return;
        panel.hidden = response.data.length === 0;
        panel.innerHTML = response.data.length ? plannedScMarkup(response.data, canCancel) : '';
        if (canCancel) {
            panel.querySelectorAll('[data-cancel-planned-sc]').forEach(button => {
                const schedule = response.data.find(item => String(item.id) === button.dataset.cancelPlannedSc);
                if (schedule) button.addEventListener('click', () => cancelPlannedSc(state, root, schedule, button));
            });
        }
        return true;
    } catch {
        if (!isCurrent()) return;
        panel.hidden = false;
        panel.innerHTML = '<div class="text-warning small" role="status">Jadwal rencana SC belum termuat. Buka kembali Planning untuk mencoba lagi.</div>';
        return false;
    }
}

export async function cancelPlannedSc(state, root, schedule, button) {
    const mrId = state.currentMrId;
    const id = String(schedule.id);
    const key = `${mrId}:${id}`;
    if (!isCurrentPlanning(root, mrId) || cancellations.has(key)) return;
    cancellations.add(key);
    button.disabled = true;
    const notice = (type, text) => {
        if (isCurrentPlanning(root, mrId)) window.showSundayClinicNotice?.(type, text);
    };
    let submitted = false;
    try {
        if (!await hasPermission('docboard.write')) {
            notice('error', 'Akses ditolak untuk membatalkan jadwal DocBoard.');
            return;
        }
        const promptText = `${schedule.operation} · ${DibyaDateTime.date(schedule.surgery_date)} ${schedule.surgery_time || ''}. Jadwal akan dikeluarkan dari jadwal aktif DocBoard. Riwayat pembatalan tetap tersimpan.`;
        let reason;
        if (window.Swal?.fire) {
            const result = await window.Swal.fire({
                title: 'Batalkan rencana SC?', text: promptText, icon: 'warning',
                input: 'textarea', inputLabel: 'Alasan pembatalan', inputAttributes: { maxlength: '1000' },
                showCancelButton: true, confirmButtonText: 'Batalkan rencana SC', cancelButtonText: 'Kembali',
                inputValidator: value => !String(value || '').trim() ? 'Alasan pembatalan wajib diisi.' : undefined
            });
            if (!result.isConfirmed) return;
            reason = String(result.value || '').trim();
        } else {
            reason = window.prompt(`Batalkan rencana SC?\n${promptText}\n\nAlasan pembatalan:`)?.trim();
        }
        if (!reason || reason.length > 1000 || !isCurrentPlanning(root, mrId)) return;
        loads.set(root, {}); // An older read must not restore the pre-cancellation card.
        submitted = true;
        const response = await apiClient.request(`/api/sunday-clinic/records/${encodeURIComponent(mrId)}/planned-sc/${encodeURIComponent(id)}/cancel`, {
            method: 'POST', body: JSON.stringify({ reason }), cache: 'no-store'
        });
        if (!response?.success || response.data?.status !== 'cancelled' || String(response.data.id) !== id) {
            throw new Error('Hasil pembatalan belum terverifikasi.');
        }
        let docBoardNotified = true;
        try {
            window.localStorage.setItem('docboard_schedule_revision_v1', JSON.stringify({
                revision: `${Date.now()}-${Math.random().toString(36).slice(2)}`, surgery_id: id
            }));
        } catch { docBoardNotified = false; }
        if (!isCurrentPlanning(root, mrId)) return;
        const refreshed = await loadPlannedSc(state, root);
        if (refreshed && docBoardNotified) {
            notice('success', 'Rencana SC dibatalkan dan dikeluarkan dari jadwal aktif DocBoard.');
        } else {
            notice('warning', 'Pembatalan tersimpan. Muat ulang Planning dan DocBoard untuk memperbarui tampilan jadwal.');
        }
    } catch (error) {
        if (submitted && (!error.status || error.status >= 500)) {
            notice('warning', 'Status pembatalan belum dapat dipastikan. Muat ulang jadwal sebelum mencoba kembali.');
        } else {
            notice('error', error.message || 'Gagal membatalkan rencana SC.');
        }
    } finally {
        cancellations.delete(key);
        button.disabled = false;
    }
}
