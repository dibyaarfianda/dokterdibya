import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';

const TRIMESTERS = ['t1', 't2', 't3'];
const ALLOWED_SERVICE_CATEGORIES = new Set(['LAYANAN', 'TINDAKAN MEDIS']);

let medicationCatalog = [];
let medicationMap = new Map();
let serviceCatalog = [];
let serviceMap = new Map();
let config = createDefaultEstimasiBiayaConfig();
let loaded = false;
let loadingPromise = null;
let loadScope = null;
let saveScope = null;

function createDefaultEstimasiBiayaConfig() {
    return {
        version: 1,
        updated_at: null,
        trimester_configs: { t1: [], t2: [], t3: [] },
        trimester_tindakan_configs: { t1: [], t2: [], t3: [] }
    };
}

function normalizeItems(items, idKeys, idName, fallbackQuantity) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.map(item => {
        const rawId = idKeys.map(key => key.split('.').reduce((value, part) => value?.[part], item))
            .find(value => value != null);
        const id = Number(rawId);
        const quantity = Number(item?.quantity ?? item?.qty ?? fallbackQuantity);
        return {
            [idName]: Number.isInteger(id) && id > 0 ? id : null,
            quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : fallbackQuantity
        };
    }).filter(item => item[idName]).filter(item => {
        const key = String(item[idName]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeEstimasiBiayaConfig(rawConfig) {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const medications = source.trimester_configs && typeof source.trimester_configs === 'object'
        ? source.trimester_configs
        : {};
    const services = source.trimester_tindakan_configs && typeof source.trimester_tindakan_configs === 'object'
        ? source.trimester_tindakan_configs
        : {};
    return {
        version: 1,
        updated_at: source.updated_at || null,
        trimester_configs: Object.fromEntries(TRIMESTERS.map(trimester => [
            trimester,
            normalizeItems(medications[trimester], ['obat_id', 'obatId', 'medication.id'], 'obat_id', 3)
        ])),
        trimester_tindakan_configs: Object.fromEntries(TRIMESTERS.map(trimester => [
            trimester,
            normalizeItems(services[trimester], ['tindakan_id', 'tindakanId', 'tindakan.id'], 'tindakan_id', 1)
        ]))
    };
}

function formatRupiah(amount) {
    return 'Rp ' + (Number(amount) || 0).toLocaleString('id-ID');
}

function formatUpdatedAt(value) {
    if (!value) return 'Belum pernah disimpan';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Belum pernah disimpan';
    return date.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta'
    }) + ' WIB';
}

function setStatus(message, tone = 'muted') {
    const element = document.getElementById('estimasi-config-status');
    if (!element) return;
    element.textContent = message;
    element.className = `small text-${tone}`;
}

function selectedMap(type, trimester) {
    const source = type === 'medication'
        ? config.trimester_configs?.[trimester]
        : config.trimester_tindakan_configs?.[trimester];
    const idName = type === 'medication' ? 'obat_id' : 'tindakan_id';
    return new Map((source || []).map(item => [String(item[idName]), item]));
}

function renderMedicationSelectors() {
    TRIMESTERS.forEach(trimester => {
        const container = document.getElementById(`estimasi-obat-selector-${trimester}`);
        if (!container) return;
        if (!medicationCatalog.length) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-pills fa-lg mb-2"></i><p class="small mb-0">Belum ada obat aktif di master obat.</p></div>';
            return;
        }
        const selected = selectedMap('medication', trimester);
        container.innerHTML = medicationCatalog.map(medication => {
            const item = selected.get(String(medication.id));
            const quantity = item?.quantity || 3;
            const id = Number(medication.id);
            return `
                <div class="border rounded p-2 mb-2 bg-white estimasi-obat-row" data-trimester="${trimester}" data-obat-id="${id}">
                    <div class="d-flex align-items-start justify-content-between">
                        <div class="custom-control custom-checkbox pr-2 flex-grow-1">
                            <input type="checkbox" class="custom-control-input estimasi-obat-toggle" id="estimasi-${trimester}-${id}" data-trimester="${trimester}" data-obat-id="${id}" ${item ? 'checked' : ''}>
                            <label class="custom-control-label small font-weight-bold" for="estimasi-${trimester}-${id}">${escapeHtml(medication.name)}</label>
                            <div class="small text-muted mt-1">${formatRupiah(medication.price)}${medication.unit ? ` / ${escapeHtml(medication.unit)}` : ''}</div>
                        </div>
                        <div class="ml-2 text-right" style="width:74px"><label class="small text-muted d-block mb-1">Qty</label><input type="number" min="1" max="12" class="form-control form-control-sm estimasi-obat-qty" data-trimester="${trimester}" data-obat-id="${id}" value="${quantity}" ${item ? '' : 'disabled'}></div>
                    </div>
                </div>`;
        }).join('');
    });
}

function renderServiceSelectors() {
    TRIMESTERS.forEach(trimester => {
        const container = document.getElementById(`estimasi-tindakan-selector-${trimester}`);
        if (!container) return;
        if (!serviceCatalog.length) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-stethoscope fa-lg mb-2"></i><p class="small mb-0">Belum ada layanan/tindakan aktif di master tindakan.</p></div>';
            return;
        }
        const selected = selectedMap('service', trimester);
        container.innerHTML = serviceCatalog.map(service => {
            const item = selected.get(String(service.id));
            const quantity = item?.quantity || 1;
            const id = Number(service.id);
            return `
                <div class="border rounded p-2 mb-2 bg-white estimasi-tindakan-row" data-trimester="${trimester}" data-tindakan-id="${id}">
                    <div class="d-flex align-items-start justify-content-between">
                        <div class="custom-control custom-checkbox pr-2 flex-grow-1">
                            <input type="checkbox" class="custom-control-input estimasi-tindakan-toggle" id="estimasi-tindakan-${trimester}-${id}" data-trimester="${trimester}" data-tindakan-id="${id}" ${item ? 'checked' : ''}>
                            <label class="custom-control-label small font-weight-bold" for="estimasi-tindakan-${trimester}-${id}">${escapeHtml(service.name)}</label>
                            <div class="small text-muted mt-1">${formatRupiah(service.price)}${service.category ? ` &bull; ${escapeHtml(service.category)}` : ''}</div>
                        </div>
                        <div class="ml-2 text-right" style="width:74px"><label class="small text-muted d-block mb-1">Qty</label><input type="number" min="1" max="12" class="form-control form-control-sm estimasi-tindakan-qty" data-trimester="${trimester}" data-tindakan-id="${id}" value="${quantity}" ${item ? '' : 'disabled'}></div>
                    </div>
                </div>`;
        }).join('');
    });
}

function syncMedication(trimester) {
    const container = document.getElementById(`estimasi-obat-selector-${trimester}`);
    if (!container) return;
    config.trimester_configs[trimester] = Array.from(container.querySelectorAll('.estimasi-obat-toggle:checked'))
        .map(checkbox => {
            const id = Number(checkbox.dataset.obatId);
            const quantityInput = container.querySelector(`.estimasi-obat-qty[data-obat-id="${checkbox.dataset.obatId}"]`);
            return { obat_id: id, quantity: Math.max(1, Math.min(12, Number(quantityInput?.value) || 3)) };
        }).filter(item => Number.isInteger(item.obat_id) && item.obat_id > 0);
}

function syncService(trimester) {
    const container = document.getElementById(`estimasi-tindakan-selector-${trimester}`);
    if (!container) return;
    config.trimester_tindakan_configs[trimester] = Array.from(container.querySelectorAll('.estimasi-tindakan-toggle:checked'))
        .map(checkbox => {
            const id = Number(checkbox.dataset.tindakanId);
            const quantityInput = container.querySelector(`.estimasi-tindakan-qty[data-tindakan-id="${checkbox.dataset.tindakanId}"]`);
            return { tindakan_id: id, quantity: Math.max(1, Math.min(12, Number(quantityInput?.value) || 1)) };
        }).filter(item => Number.isInteger(item.tindakan_id) && item.tindakan_id > 0);
}

function syncAll() {
    TRIMESTERS.forEach(trimester => {
        syncMedication(trimester);
        syncService(trimester);
    });
}

function markDirty() {
    setStatus('Perubahan obat dan layanan portal pasien belum disimpan.', 'warning');
}

function replaceScope(current, reason) {
    current?.abort(reason);
    return createPageRequestScope();
}

async function ensureData(forceReload = false) {
    if (loadingPromise && !forceReload) return loadingPromise;
    if (loaded && !forceReload) {
        renderMedicationSelectors();
        renderServiceSelectors();
        setStatus(`Tersimpan terakhir: ${formatUpdatedAt(config.updated_at)}`);
        return;
    }

    const scope = replaceScope(loadScope, 'Estimator data request replaced');
    loadScope = scope;
    setStatus('Memuat daftar obat, layanan, dan konfigurasi estimasi...', 'muted');
    const requestPromise = Promise.all([
        scope.request(`/api/obat?active=true&category=${encodeURIComponent('Obat-obatan')}&_t=${Date.now()}`),
        scope.request(`/api/tindakan?active=true&_t=${Date.now()}`),
        scope.request(`/api/estimasi-biaya?_t=${Date.now()}`)
    ]).then(([medications, services, savedConfig]) => {
        if (scope.signal.aborted || scope !== loadScope) return;
        if (!medications?.success) throw new Error(medications?.message || 'Gagal memuat master obat');
        if (!services?.success) throw new Error(services?.message || 'Gagal memuat master layanan/tindakan');
        if (!savedConfig?.success) throw new Error(savedConfig?.message || 'Gagal memuat konfigurasi estimasi biaya');

        medicationCatalog = Array.isArray(medications.data) ? medications.data : [];
        medicationMap = new Map(medicationCatalog.map(item => [Number(item.id), item]));
        serviceCatalog = Array.isArray(services.data)
            ? services.data.filter(item => ALLOWED_SERVICE_CATEGORIES.has(String(item.category || '').toUpperCase()))
            : [];
        serviceMap = new Map(serviceCatalog.map(item => [Number(item.id), item]));
        config = normalizeEstimasiBiayaConfig(savedConfig.config);
        loaded = true;
        renderMedicationSelectors();
        renderServiceSelectors();
        setStatus(`Tersimpan terakhir: ${formatUpdatedAt(config.updated_at)}`);
    }).catch(error => {
        if (error?.name === 'AbortError') return;
        loaded = false;
        setStatus(error?.message || 'Gagal memuat estimasi biaya.', 'danger');
        throw error;
    }).finally(() => {
        if (loadScope === scope) loadScope = null;
        if (loadingPromise === requestPromise) loadingPromise = null;
    });
    loadingPromise = requestPromise;
    return requestPromise;
}

function buildEstimatorItems(trimester) {
    const services = (config.trimester_tindakan_configs?.[trimester] || []).map(selection => {
        const service = serviceMap.get(Number(selection.tindakan_id));
        return service ? { name: `${service.name} (Layanan)`, price: Number(service.price) || 0, quantity: Number(selection.quantity) || 1 } : null;
    }).filter(Boolean);
    const medications = (config.trimester_configs?.[trimester] || []).map(selection => {
        const medication = medicationMap.get(Number(selection.obat_id));
        return medication ? { name: medication.name, price: Number(medication.price) || 0, quantity: Number(selection.quantity) || 3 } : null;
    }).filter(Boolean);
    return [...services, ...medications];
}

function renderEstimateTable(items, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return 0;
    if (!items.length) {
        table.innerHTML = '<tr><td colspan="2" class="text-muted" style="font-size:11px">Belum ada item dipilih.</td></tr>';
        return 0;
    }
    let subtotal = 0;
    table.innerHTML = items.map(item => {
        const total = item.price * item.quantity;
        subtotal += total;
        return `<tr><td style="font-size:11px">${escapeHtml(item.name)}</td><td class="text-right text-nowrap" style="font-size:10px">${formatRupiah(item.price)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</td></tr>`;
    }).join('');
    return subtotal;
}

export function updateEstimasiBiaya() {
    const selectedTrimester = document.getElementById('estimasi-fase')?.value || 'semua';
    let total = 0;
    TRIMESTERS.forEach(trimester => {
        const card = document.getElementById(`estimasi-card-${trimester}`);
        const visible = selectedTrimester === trimester || selectedTrimester === 'semua';
        card?.classList.toggle('d-none', !visible);
        if (!visible) return;
        const subtotal = renderEstimateTable(buildEstimatorItems(trimester), `tabel-estimasi-${trimester}`);
        const subtotalElement = document.getElementById(`subtotal-${trimester}`);
        if (subtotalElement) subtotalElement.textContent = formatRupiah(subtotal);
        total += subtotal;
    });
    const totalElement = document.getElementById('total-estimasi');
    if (totalElement) totalElement.textContent = formatRupiah(total);
}

export async function showEstimasiBiayaPage() {
    await window.activateRegisteredStaffPage?.('estimasi-biaya');
    try {
        await ensureData();
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Error loading estimasi biaya page:', error);
            window.showError?.(error?.message || 'Gagal memuat data estimasi biaya');
        }
    }
    updateEstimasiBiaya();
}

export async function saveEstimasiBiayaPortalConfig() {
    syncAll();
    const scope = replaceScope(saveScope, 'Estimator save request replaced');
    saveScope = scope;
    try {
        const result = await scope.request('/api/estimasi-biaya', {
            method: 'PUT',
            body: JSON.stringify({
                version: 1,
                trimester_configs: config.trimester_configs,
                trimester_tindakan_configs: config.trimester_tindakan_configs
            })
        });
        if (!result?.success) throw new Error(result?.message || 'Gagal menyimpan konfigurasi estimasi biaya');
        config = normalizeEstimasiBiayaConfig(result.config);
        renderMedicationSelectors();
        renderServiceSelectors();
        updateEstimasiBiaya();
        setStatus(`Tersimpan terakhir: ${formatUpdatedAt(config.updated_at)}`, 'success');
        window.showSuccess?.(result.message || 'Konfigurasi estimasi biaya berhasil disimpan');
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Save estimasi biaya config error:', error);
        setStatus(error?.message || 'Gagal menyimpan konfigurasi estimasi biaya.', 'danger');
        window.showError?.(error?.message || 'Gagal menyimpan konfigurasi estimasi biaya');
    } finally {
        if (saveScope === scope) saveScope = null;
    }
}

export async function reloadEstimasiBiayaConfig() {
    try {
        await ensureData(true);
        updateEstimasiBiaya();
        window.showSuccess?.('Konfigurasi estimasi biaya dimuat ulang dari server');
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('Reload estimasi biaya config error:', error);
            window.showError?.(error?.message || 'Gagal memuat ulang konfigurasi estimasi biaya');
        }
    }
}

document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-action]');
    if (!action || !action.closest('#estimasi-biaya-page')) return;
    if (action.dataset.action === 'reload-estimasi-biaya') {
        event.preventDefault();
        void reloadEstimasiBiayaConfig();
    }
    if (action.dataset.action === 'save-estimasi-biaya') {
        event.preventDefault();
        void saveEstimasiBiayaPortalConfig();
    }
});

document.addEventListener('change', event => {
    const target = event.target;
    if (!target?.closest?.('#estimasi-biaya-page')) return;
    if (target.id === 'estimasi-fase') {
        updateEstimasiBiaya();
        return;
    }
    if (target.matches('.estimasi-obat-toggle')) {
        const quantity = document.querySelector(`.estimasi-obat-qty[data-trimester="${target.dataset.trimester}"][data-obat-id="${target.dataset.obatId}"]`);
        if (quantity) {
            quantity.disabled = !target.checked;
            if (target.checked && Number(quantity.value) < 1) quantity.value = '3';
        }
        syncMedication(target.dataset.trimester);
    } else if (target.matches('.estimasi-tindakan-toggle')) {
        const quantity = document.querySelector(`.estimasi-tindakan-qty[data-trimester="${target.dataset.trimester}"][data-tindakan-id="${target.dataset.tindakanId}"]`);
        if (quantity) {
            quantity.disabled = !target.checked;
            if (target.checked && Number(quantity.value) < 1) quantity.value = '1';
        }
        syncService(target.dataset.trimester);
    } else {
        return;
    }
    markDirty();
    updateEstimasiBiaya();
});

document.addEventListener('input', event => {
    const target = event.target;
    if (!target?.closest?.('#estimasi-biaya-page')) return;
    if (!target.matches('.estimasi-obat-qty, .estimasi-tindakan-qty')) return;
    target.value = String(Math.max(1, Math.min(12, Number(target.value) || 1)));
    if (target.matches('.estimasi-obat-qty')) syncMedication(target.dataset.trimester);
    else syncService(target.dataset.trimester);
    markDirty();
    updateEstimasiBiaya();
});

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'estimasi-biaya') {
        loadScope?.abort('Page deactivated');
        saveScope?.abort('Page deactivated');
        loadScope = null;
        saveScope = null;
    }
});

Object.assign(window, {
    showEstimasiBiayaPage,
    updateEstimasiBiaya,
    saveEstimasiBiayaPortalConfig,
    reloadEstimasiBiayaConfig
});
