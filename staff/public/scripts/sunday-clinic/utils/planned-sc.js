/** Read-only patient schedules; never merge them into the doctor's Planning draft. */
import apiClient from './api-client.js';
import stateManager from './state-manager.js';
import { escapeHtml } from './helpers.js';

const loads = new WeakMap();
const locations = { klinik_private: 'Klinik Privat', rsia_melinda: 'RSIA Melinda', rsud_gambiran: 'RSUD Gambiran', rs_bhayangkara: 'RS Bhayangkara' };
const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function plannedScMarkup(schedules) {
    return `<div class="alert alert-info mb-0" role="status">
        <strong><i class="fas fa-calendar-check mr-1" aria-hidden="true"></i>Jadwal Rencana SC</strong>
        ${schedules.map(schedule => {
            const [year, month, day] = String(schedule.surgery_date).split('-');
            const date = `${Number(day)} ${months[Number(month) - 1]} ${year}`;
            const time = schedule.surgery_time ? `${schedule.surgery_time} WIB` : 'Jam belum ditentukan';
            const status = schedule.status === 'confirmed' ? 'Terkonfirmasi' : 'Direncanakan';
            return `<div class="mt-1"><strong>${escapeHtml(schedule.operation)}</strong>
                <div>${escapeHtml(date)} · ${escapeHtml(time)} · ${escapeHtml(locations[schedule.location] || schedule.location)}</div>
                <small>${status}</small></div>`;
        }).join('')}
    </div>`;
}

export async function loadPlannedSc(state, root) {
    const mrId = state.currentMrId;
    const panel = root?.querySelector('[data-planned-sc]');
    if (!panel || !mrId) return;
    const load = {};
    loads.set(root, load);
    const isCurrent = () => root.isConnected && loads.get(root) === load
        && root.dataset.planningMrId === mrId && stateManager.getState().currentMrId === mrId
        && stateManager.getState().activeSection === 'plan';
    try {
        const response = await apiClient.request(`/api/sunday-clinic/records/${encodeURIComponent(mrId)}/planned-sc?_t=${Date.now()}`, {
            method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response?.success || !Array.isArray(response.data)) throw new Error('Jadwal belum termuat');
        if (!isCurrent()) return;
        panel.hidden = response.data.length === 0;
        panel.innerHTML = response.data.length ? plannedScMarkup(response.data) : '';
    } catch {
        if (!isCurrent()) return;
        panel.hidden = false;
        panel.innerHTML = '<div class="text-warning small" role="status">Jadwal rencana SC belum termuat. Buka kembali Planning untuk mencoba lagi.</div>';
    }
}
