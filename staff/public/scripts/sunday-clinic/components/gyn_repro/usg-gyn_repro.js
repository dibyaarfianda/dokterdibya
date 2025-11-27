/**
 * USG Component for Gyn Repro Patients
 * Focus: Gynecological pathology, masses, abnormalities
 */

import stateManager from '../../utils/state-manager.js';
import apiClient from '../../utils/api-client.js';
import { getMedicalRecordContext, formatDateDMY, escapeHtml } from '../../utils/helpers.js';

// Helper function to get today's date in YYYY-MM-DD format for GMT+7
function getTodayDate() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));
    return gmt7Time.toISOString().split('T')[0];
}

export function render() {
    const state = stateManager.getState();
    const context = getMedicalRecordContext(state, 'usg');
    const savedData = context ? (context.data || {}) : {};
    const hasSavedRecord = context && context.record && context.record.id;

    const today = getTodayDate();
    const usgDate = savedData.date || today;

    // Build saved summary if data exists
    let savedSummaryHtml = '';
    if (hasSavedRecord && Object.keys(savedData).length > 1) {
        const summaryItems = [];

        if (savedData.date) summaryItems.push(`<strong>Tanggal:</strong> ${formatDateDMY(savedData.date)}`);
        if (savedData.type) summaryItems.push(`<strong>Jenis:</strong> ${savedData.type === 'transabdominal' ? 'Transabdominal' : savedData.type === 'transvaginal' ? 'Transvaginal' : 'Keduanya'}`);
        if (savedData.uterus?.position) summaryItems.push(`<strong>Posisi Rahim:</strong> ${savedData.uterus.position}`);
        if (savedData.uterus?.length && savedData.uterus?.width && savedData.uterus?.depth) {
            summaryItems.push(`<strong>Ukuran Rahim:</strong> ${savedData.uterus.length} × ${savedData.uterus.width} × ${savedData.uterus.depth} cm`);
        }
        if (savedData.uterus?.hasMyoma) summaryItems.push(`<strong>Mioma:</strong> Ya - ${savedData.uterus.myomaSize || ''}`);
        if (savedData.uterus?.hasAdenomyosis) summaryItems.push(`<strong>Adenomyosis:</strong> Ya`);
        if (savedData.endometrium?.thickness) summaryItems.push(`<strong>Endometrium:</strong> ${savedData.endometrium.thickness} mm`);
        if (savedData.ovaries?.right?.hasMass) summaryItems.push(`<strong>Massa Ovarium Kanan:</strong> ${savedData.ovaries.right.massSize || ''}`);
        if (savedData.ovaries?.left?.hasMass) summaryItems.push(`<strong>Massa Ovarium Kiri:</strong> ${savedData.ovaries.left.massSize || ''}`);
        if (savedData.notes) summaryItems.push(`<strong>Catatan:</strong> ${escapeHtml(savedData.notes)}`);

        if (summaryItems.length > 0) {
            savedSummaryHtml = `<div class="alert mb-3" style="background-color: #EDEDED; border-color: #DEDEDE;" id="usg-summary-container">
                <h5 style="cursor: pointer; margin-bottom: 0;" data-toggle="collapse" data-target="#usg-summary-collapse">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i> USG Ginekologi - <span style="color: #007bff;">Data Tersimpan</span>
                    <i class="fas fa-chevron-down float-right" style="transition: transform 0.3s; transform: rotate(-90deg);"></i>
                </h5>
                <div id="usg-summary-collapse" class="collapse">
                    <hr>
                    <div class="row" style="font-size: 0.875rem; font-weight: 300;">
                        ${summaryItems.map(item => `<div class="col-md-6 mb-2">${item}</div>`).join('')}
                    </div>
                </div>
                <hr>
                <button class="btn btn-warning btn-sm mr-2" id="btn-edit-usg">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-danger btn-sm" id="btn-reset-usg">
                    <i class="fas fa-trash"></i> Reset
                </button>
            </div>`;
        }
    }

    const showForm = !hasSavedRecord || !savedSummaryHtml;
    const metaHtml = context?.record ? `<div class="sc-note">Dicatat oleh ${escapeHtml(context.record.doctorName || 'N/A')} pada ${formatDateDMY(context.record.createdAt)}</div>` : '';

    const html = `
        <div class="sc-section-header d-flex justify-content-between">
            <h3>USG Ginekologi</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            ${savedSummaryHtml}

            <div id="usg-edit-form" style="display: ${showForm ? 'block' : 'none'};">
                <!-- Technical Info -->
                <div class="form-group">
                    <label class="font-weight-bold">Tanggal Pemeriksaan</label>
                    <input type="date" class="form-control" id="usg-date" style="width: 180px;" value="${escapeHtml(usgDate)}">
                </div>

                <div class="form-group">
                    <label class="font-weight-bold">Jenis Pemeriksaan</label>
                    <div class="ml-3">
                        <div class="custom-control custom-radio custom-control-inline">
                            <input type="radio" class="custom-control-input" name="usg_type" id="transabdominal" value="transabdominal" ${(savedData.type || 'transabdominal') === 'transabdominal' ? 'checked' : ''}>
                            <label class="custom-control-label" for="transabdominal">Transabdominal</label>
                        </div>
                        <div class="custom-control custom-radio custom-control-inline">
                            <input type="radio" class="custom-control-input" name="usg_type" id="transvaginal" value="transvaginal" ${savedData.type === 'transvaginal' ? 'checked' : ''}>
                            <label class="custom-control-label" for="transvaginal">Transvaginal</label>
                        </div>
                        <div class="custom-control custom-radio custom-control-inline">
                            <input type="radio" class="custom-control-input" name="usg_type" id="both_types" value="both" ${savedData.type === 'both' ? 'checked' : ''}>
                            <label class="custom-control-label" for="both_types">Keduanya</label>
                        </div>
                    </div>
                </div>
                <hr>

                <!-- Uterus Section -->
                <h5 class="text-info font-weight-bold"><i class="fas fa-female"></i> RAHIM (UTERUS)</h5>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Posisi</label>
                        <div>
                            ${['anteverted', 'retroverted', 'anteflexed', 'retroflexed'].map(pos => `
                                <div class="custom-control custom-radio">
                                    <input type="radio" class="custom-control-input" name="uterus_position" id="pos-${pos}" value="${pos}" ${(savedData.uterus?.position || 'anteverted') === pos ? 'checked' : ''}>
                                    <label class="custom-control-label" for="pos-${pos}">${pos.charAt(0).toUpperCase() + pos.slice(1)}</label>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Ukuran Uterus (L × W × D)</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="uterus-length" placeholder="L" value="${escapeHtml(savedData.uterus?.length || '')}" step="0.1">
                            <div class="input-group-append input-group-prepend"><span class="input-group-text">×</span></div>
                            <input type="number" class="form-control" id="uterus-width" placeholder="W" value="${escapeHtml(savedData.uterus?.width || '')}" step="0.1">
                            <div class="input-group-append input-group-prepend"><span class="input-group-text">×</span></div>
                            <input type="number" class="form-control" id="uterus-depth" placeholder="D" value="${escapeHtml(savedData.uterus?.depth || '')}" step="0.1">
                            <div class="input-group-append"><span class="input-group-text">cm</span></div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="has-myoma" ${savedData.uterus?.hasMyoma ? 'checked' : ''}>
                            <label class="custom-control-label" for="has-myoma">Mioma</label>
                        </div>
                        <div id="myoma-details" class="ml-4 mt-2" style="display: ${savedData.uterus?.hasMyoma ? 'block' : 'none'};">
                            <label>Lokasi:</label>
                            <div class="mb-2">
                                ${['submucosa', 'intramural', 'subserosa'].map(loc => `
                                    <div class="custom-control custom-checkbox custom-control-inline">
                                        <input type="checkbox" class="custom-control-input" name="myoma_location" id="myoma-${loc}" value="${loc}" ${(savedData.uterus?.myomaLocation || []).includes(loc) ? 'checked' : ''}>
                                        <label class="custom-control-label" for="myoma-${loc}">${loc.charAt(0).toUpperCase() + loc.slice(1)}</label>
                                    </div>
                                `).join('')}
                            </div>
                            <input type="text" class="form-control form-control-sm" id="myoma-size" placeholder="Ukuran mioma (L × W × D cm)" value="${escapeHtml(savedData.uterus?.myomaSize || '')}">
                            <div class="custom-control custom-checkbox mt-2">
                                <input type="checkbox" class="custom-control-input" id="multiple-myoma" ${savedData.uterus?.multipleMyoma ? 'checked' : ''}>
                                <label class="custom-control-label" for="multiple-myoma">Multiple Myoma</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="has-adenomyosis" ${savedData.uterus?.hasAdenomyosis ? 'checked' : ''}>
                            <label class="custom-control-label" for="has-adenomyosis">Adenomyosis</label>
                        </div>
                    </div>
                </div>
                <hr>

                <!-- Endometrium Section -->
                <h5 class="text-info font-weight-bold"><i class="fas fa-layer-group"></i> DINDING RAHIM (ENDOMETRIUM)</h5>
                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label>Ketebalan</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="endo-thickness" value="${escapeHtml(savedData.endometrium?.thickness || '')}" step="0.1" placeholder="0.0">
                            <div class="input-group-append"><span class="input-group-text">mm</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-8">
                        <label>Morfologi</label>
                        <select class="form-control" id="endo-morphology">
                            <option value="">-- Pilih --</option>
                            ${['trilaminar', 'echogenic', 'irregular', 'normal_phase', 'thick', 'polyp_suspected', 'fluid'].map(opt => {
                                const labels = {trilaminar:'Trilaminar', echogenic:'Echogenic', irregular:'Tidak teratur', normal_phase:'Normal untuk fase siklus', thick:'Tebal', polyp_suspected:'Curiga polip', fluid:'Tampak Cairan'};
                                return `<option value="${opt}" ${savedData.endometrium?.morphology === opt ? 'selected' : ''}>${labels[opt]}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <hr>

                <!-- Ovaries Section -->
                <h5 class="text-info font-weight-bold"><i class="fas fa-circle"></i> INDUNG TELUR (OVARIUM)</h5>
                <div class="row">
                    ${['right', 'left'].map(side => {
                        const sideData = savedData.ovaries?.[side] || {};
                        const sideLabel = side === 'right' ? 'Kanan' : 'Kiri';
                        return `
                        <div class="col-md-6 ${side === 'left' ? 'border-left' : ''}">
                            <h6 class="text-muted font-weight-bold">${sideLabel}</h6>
                            <div class="custom-control custom-checkbox mb-2">
                                <input type="checkbox" class="custom-control-input" id="ovary-${side}-identified" ${sideData.identified !== false ? 'checked' : ''}>
                                <label class="custom-control-label" for="ovary-${side}-identified">Teridentifikasi</label>
                            </div>
                            <label>Ukuran (L × W × D):</label>
                            <div class="input-group mb-2">
                                <input type="number" class="form-control form-control-sm" id="ovary-${side}-length" placeholder="L" value="${escapeHtml(sideData.length || '')}" step="0.1">
                                <span class="input-group-text">×</span>
                                <input type="number" class="form-control form-control-sm" id="ovary-${side}-width" placeholder="W" value="${escapeHtml(sideData.width || '')}" step="0.1">
                                <span class="input-group-text">×</span>
                                <input type="number" class="form-control form-control-sm" id="ovary-${side}-depth" placeholder="D" value="${escapeHtml(sideData.depth || '')}" step="0.1">
                                <div class="input-group-append"><span class="input-group-text">cm</span></div>
                            </div>

                            <div class="custom-control custom-checkbox mb-2">
                                <input type="checkbox" class="custom-control-input" id="ovary-${side}-pco" ${sideData.pco ? 'checked' : ''}>
                                <label class="custom-control-label" for="ovary-${side}-pco">Penampakan PCO</label>
                            </div>

                            <div class="custom-control custom-checkbox mb-2">
                                <input type="checkbox" class="custom-control-input" id="ovary-${side}-has-mass" ${sideData.hasMass ? 'checked' : ''}>
                                <label class="custom-control-label" for="ovary-${side}-has-mass">Ada Massa/Kista</label>
                            </div>
                            <div id="ovary-${side}-mass-details" class="ml-4" style="display: ${sideData.hasMass ? 'block' : 'none'};">
                                <div class="form-group mb-2">
                                    <input type="text" class="form-control form-control-sm" id="ovary-${side}-mass-size" placeholder="Ukuran massa (cm)" value="${escapeHtml(sideData.massSize || '')}">
                                </div>
                                <div class="form-group mb-2">
                                    <label class="small">Jenis:</label>
                                    <select class="form-control form-control-sm" id="ovary-${side}-mass-type">
                                        <option value="">-- Pilih --</option>
                                        <option value="simple_cyst" ${sideData.massType === 'simple_cyst' ? 'selected' : ''}>Kista sederhana</option>
                                        <option value="complex_cyst" ${sideData.massType === 'complex_cyst' ? 'selected' : ''}>Kista kompleks</option>
                                        <option value="solid" ${sideData.massType === 'solid' ? 'selected' : ''}>Padat</option>
                                        <option value="mixed" ${sideData.massType === 'mixed' ? 'selected' : ''}>Campuran</option>
                                    </select>
                                </div>
                                <div class="form-group mb-2">
                                    <label class="small">Internal echo:</label>
                                    <select class="form-control form-control-sm" id="ovary-${side}-internal-echo">
                                        <option value="">-- Pilih --</option>
                                        <option value="anechoic" ${sideData.internalEcho === 'anechoic' ? 'selected' : ''}>Anekoit</option>
                                        <option value="low_level" ${sideData.internalEcho === 'low_level' ? 'selected' : ''}>Tingkat rendah</option>
                                        <option value="echogenic" ${sideData.internalEcho === 'echogenic' ? 'selected' : ''}>Echogenik</option>
                                    </select>
                                </div>
                                <div class="form-group mb-2">
                                    <label class="small">Bersepta:</label>
                                    <select class="form-control form-control-sm" id="ovary-${side}-septated">
                                        <option value="none" ${(sideData.septated || 'none') === 'none' ? 'selected' : ''}>Tidak ada</option>
                                        <option value="thin" ${sideData.septated === 'thin' ? 'selected' : ''}>Tipis</option>
                                        <option value="thick" ${sideData.septated === 'thick' ? 'selected' : ''}>Tebal</option>
                                    </select>
                                </div>
                                <div class="form-group mb-2">
                                    <label class="small">Dinding:</label>
                                    <select class="form-control form-control-sm" id="ovary-${side}-wall">
                                        <option value="">-- Pilih --</option>
                                        <option value="smooth" ${sideData.wall === 'smooth' ? 'selected' : ''}>Halus</option>
                                        <option value="irregular" ${sideData.wall === 'irregular' ? 'selected' : ''}>Tidak teratur</option>
                                    </select>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <hr>

                <!-- Additional Findings -->
                <h5 class="text-info font-weight-bold"><i class="fas fa-plus-circle"></i> TEMUAN TAMBAHAN</h5>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="free-fluid" ${savedData.additional?.freeFluid ? 'checked' : ''}>
                            <label class="custom-control-label" for="free-fluid">Free fluid di cavum douglas</label>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="cervical-assessment" ${savedData.additional?.cervicalAssessment ? 'checked' : ''}>
                            <label class="custom-control-label" for="cervical-assessment">Pemeriksaan serviks dilakukan</label>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Catatan Tambahan:</label>
                    <textarea class="form-control" id="usg-notes" rows="3" placeholder="Temuan lain atau interpretasi...">${escapeHtml(savedData.notes || '')}</textarea>
                </div>

                <div class="mt-3 text-right">
                    <button class="btn btn-primary" id="btn-save-usg">
                        <i class="fas fa-save"></i> Simpan Data USG
                    </button>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners after DOM is ready
    setTimeout(() => {
        const container = document.querySelector('.section-container[data-section="usg"]');
        if (!container) return;

        const saveBtn = container.querySelector('#btn-save-usg');
        const editBtn = container.querySelector('#btn-edit-usg');
        const resetBtn = container.querySelector('#btn-reset-usg');
        const editForm = container.querySelector('#usg-edit-form');

        if (saveBtn) saveBtn.addEventListener('click', saveUSGGynRepro);
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                const summaryContainer = container.querySelector('#usg-summary-container');
                if (summaryContainer) summaryContainer.style.display = 'none';
                if (editForm) editForm.style.display = 'block';
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (confirm('Yakin ingin menghapus semua data USG?')) {
                    try {
                        const patientId = state.derived?.patientId;
                        const mrId = state.currentMrId;
                        if (!patientId) throw new Error('Patient ID not found');

                        await apiClient.delete(`/api/medical-records/by-type/usg?patientId=${patientId}&mrId=${mrId}`);
                        window.showSuccess('Data USG berhasil direset.');

                        const SundayClinicApp = (await import('../../main.js')).default;
                        await SundayClinicApp.fetchRecord(state.currentMrId);
                        SundayClinicApp.render(state.activeSection);
                    } catch (error) {
                        window.showError('Gagal menghapus data USG: ' + error.message);
                    }
                }
            });
        }

        // Dynamic show/hide for myoma details
        const hasMyoma = container.querySelector('#has-myoma');
        const myomaDetails = container.querySelector('#myoma-details');
        if (hasMyoma && myomaDetails) {
            hasMyoma.addEventListener('change', () => {
                myomaDetails.style.display = hasMyoma.checked ? 'block' : 'none';
            });
        }

        // Dynamic show/hide for ovary mass details
        ['right', 'left'].forEach(side => {
            const hasMass = container.querySelector(`#ovary-${side}-has-mass`);
            const massDetails = container.querySelector(`#ovary-${side}-mass-details`);
            if (hasMass && massDetails) {
                hasMass.addEventListener('change', () => {
                    massDetails.style.display = hasMass.checked ? 'block' : 'none';
                });
            }
        });

        // Collapse toggle
        const summaryCollapse = $(container).find('#usg-summary-collapse');
        if (summaryCollapse.length) {
            summaryCollapse.collapse('hide');
            summaryCollapse.on('show.bs.collapse', function() {
                $(this).closest('.alert').find('.fa-chevron-down').css('transform', 'rotate(0deg)');
            });
            summaryCollapse.on('hide.bs.collapse', function() {
                $(this).closest('.alert').find('.fa-chevron-down').css('transform', 'rotate(-90deg)');
            });
        }
    }, 100);

    return html;
}

let _savingUSG = false;

async function saveUSGGynRepro() {
    if (_savingUSG) return;
    _savingUSG = true;

    const btn = document.getElementById('btn-save-usg');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    }

    try {
        const state = stateManager.getState();
        const context = getMedicalRecordContext(state, 'usg');
        const existingRecordId = context?.record?.id;

        // Collect myoma locations
        const myomaLocations = Array.from(document.querySelectorAll('input[name="myoma_location"]:checked')).map(el => el.value);

        const usgData = {
            date: document.getElementById('usg-date')?.value || '',
            type: document.querySelector('input[name="usg_type"]:checked')?.value || 'transabdominal',
            uterus: {
                position: document.querySelector('input[name="uterus_position"]:checked')?.value || 'anteverted',
                length: document.getElementById('uterus-length')?.value || '',
                width: document.getElementById('uterus-width')?.value || '',
                depth: document.getElementById('uterus-depth')?.value || '',
                hasMyoma: document.getElementById('has-myoma')?.checked || false,
                myomaLocation: myomaLocations,
                myomaSize: document.getElementById('myoma-size')?.value || '',
                multipleMyoma: document.getElementById('multiple-myoma')?.checked || false,
                hasAdenomyosis: document.getElementById('has-adenomyosis')?.checked || false
            },
            endometrium: {
                thickness: document.getElementById('endo-thickness')?.value || '',
                morphology: document.getElementById('endo-morphology')?.value || ''
            },
            ovaries: {
                right: collectOvaryData('right'),
                left: collectOvaryData('left')
            },
            additional: {
                freeFluid: document.getElementById('free-fluid')?.checked || false,
                cervicalAssessment: document.getElementById('cervical-assessment')?.checked || false
            },
            notes: document.getElementById('usg-notes')?.value || ''
        };

        const patientId = state.derived?.patientId;
        if (!patientId) throw new Error('Patient ID not found');

        const payload = { patientId, type: 'usg', data: usgData };

        if (existingRecordId) {
            await apiClient.put(`/api/medical-records/${existingRecordId}`, { type: 'usg', data: usgData });
        } else {
            await apiClient.post('/api/medical-records', payload);
        }

        window.showSuccess('Data USG berhasil disimpan!');
        const SundayClinicApp = (await import('../../main.js')).default;
        await SundayClinicApp.fetchRecord(state.currentMrId);
        SundayClinicApp.render(state.activeSection);

    } catch (error) {
        console.error('Error saving USG:', error);
        window.showError('Gagal menyimpan data USG: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Data USG';
        }
        _savingUSG = false;
    }
}

function collectOvaryData(side) {
    return {
        identified: document.getElementById(`ovary-${side}-identified`)?.checked ?? true,
        length: document.getElementById(`ovary-${side}-length`)?.value || '',
        width: document.getElementById(`ovary-${side}-width`)?.value || '',
        depth: document.getElementById(`ovary-${side}-depth`)?.value || '',
        pco: document.getElementById(`ovary-${side}-pco`)?.checked || false,
        hasMass: document.getElementById(`ovary-${side}-has-mass`)?.checked || false,
        massSize: document.getElementById(`ovary-${side}-mass-size`)?.value || '',
        massType: document.getElementById(`ovary-${side}-mass-type`)?.value || '',
        internalEcho: document.getElementById(`ovary-${side}-internal-echo`)?.value || '',
        septated: document.getElementById(`ovary-${side}-septated`)?.value || 'none',
        wall: document.getElementById(`ovary-${side}-wall`)?.value || ''
    };
}

export default {
    render
};
