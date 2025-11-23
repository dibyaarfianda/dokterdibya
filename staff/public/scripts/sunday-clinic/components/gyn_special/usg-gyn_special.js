/**
 * USG Component for Gyn Special Patients
 * Focus: Gynecological pathology, masses, abnormalities
 */

export default {
    /**
     * Render USG form for Gyn Special
     */
    async render(state) {
        const data = state.medicalRecords?.usg || {};

        return `
            <div class="card">
                <div class="card-header bg-info text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-ultrasound"></i> Pemeriksaan Ultrasound (USG Ginekologi)
                    </h5>
                </div>
                <div class="card-body">
                    ${this.renderTechnicalInfo(data)}
                    ${this.renderUterus(data)}
                    ${this.renderEndometrium(data)}
                    ${this.renderOvaries(data)}
                    ${this.renderAdditionalFindings(data)}
                </div>
                <div class="card-footer">
                    <button type="button" class="btn btn-primary" onclick="saveUSGData()">
                        <i class="fas fa-save"></i> Simpan USG
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Technical information section
     */
    renderTechnicalInfo(data) {
        return `
            <div class="form-group">
                <label class="font-weight-bold">Informasi Teknis</label>
                <div class="ml-3">
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="usg_type" id="transabdominal"
                               value="transabdominal" ${data.type === 'transabdominal' ? 'checked' : ''}>
                        <label class="form-check-label" for="transabdominal">Transabdominal</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="usg_type" id="transvaginal"
                               value="transvaginal" ${data.type === 'transvaginal' ? 'checked' : ''}>
                        <label class="form-check-label" for="transvaginal">Transvaginal</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="usg_type" id="both_types"
                               value="both" ${data.type === 'both' ? 'checked' : ''}>
                        <label class="form-check-label" for="both_types">Keduanya</label>
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Uterus section
     */
    renderUterus(data) {
        const uterus = data.uterus || {};

        return `
            <h6 class="font-weight-bold text-success mt-3">RAHIM (UTERUS)</h6>
            <div class="row">
                <div class="col-md-6">
                    <label>Posisi:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('uterus_position', [
                            { value: 'anteverted', label: 'Anteverted' },
                            { value: 'retroverted', label: 'Retroverted' },
                            { value: 'anteflexed', label: 'Anteflexed' },
                            { value: 'retroflexed', label: 'Retroflexed' }
                        ], uterus.position)}
                    </div>
                </div>
                <div class="col-md-6">
                    <label>Ukuran Uterus:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="uterus_length"
                               placeholder="L" value="${uterus.length || ''}" step="0.1">
                        <div class="input-group-append input-group-prepend">
                            <span class="input-group-text">×</span>
                        </div>
                        <input type="number" class="form-control" name="uterus_width"
                               placeholder="W" value="${uterus.width || ''}" step="0.1">
                        <div class="input-group-append input-group-prepend">
                            <span class="input-group-text">×</span>
                        </div>
                        <input type="number" class="form-control" name="uterus_depth"
                               placeholder="D" value="${uterus.depth || ''}" step="0.1">
                        <div class="input-group-append">
                            <span class="input-group-text">cm</span>
                        </div>
                    </div>
                    <small class="text-muted">Volume: <span id="uterus_volume">--</span> ml</small>
                </div>
            </div>

            <div class="row mt-2">
                <div class="col-md-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="has_myoma"
                               id="has_myoma" ${uterus.hasMyoma ? 'checked' : ''}>
                        <label class="form-check-label" for="has_myoma">Mioma</label>
                    </div>
                    <div id="myoma_details" class="ml-4 mt-2" style="display: ${uterus.hasMyoma ? 'block' : 'none'}">
                        <label>Lokasi:</label>
                        ${this.renderCheckboxGroup('myoma_location', [
                            { value: 'submucosa', label: 'Submukosa' },
                            { value: 'intramural', label: 'Intramural' },
                            { value: 'subserosa', label: 'Subserosa' }
                        ], uterus.myomaLocation || [])}
                        <div class="input-group mt-2">
                            <div class="input-group-prepend">
                                <span class="input-group-text">Ukuran:</span>
                            </div>
                            <input type="text" class="form-control" name="myoma_size"
                                   placeholder="__ × __ × __ cm" value="${uterus.myomaSize || ''}">
                        </div>
                        <div class="form-check mt-2">
                            <input class="form-check-input" type="checkbox" name="multiple_myoma"
                                   ${uterus.multipleMyoma ? 'checked' : ''}>
                            <label class="form-check-label">Multiple Myoma</label>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="has_adenomyosis"
                               ${uterus.hasAdenomyosis ? 'checked' : ''}>
                        <label class="form-check-label">Adenomyosis</label>
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Endometrium section (important for fertility)
     */
    renderEndometrium(data) {
        const endo = data.endometrium || {};

        return `
            <h6 class="font-weight-bold text-success mt-3">DINDING RAHIM (ENDOMETRIUM)</h6>
            <div class="row">
                <div class="col-md-4">
                    <label>Ketebalan:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="endometrium_thickness"
                               value="${endo.thickness || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <label>Morfologi:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('endometrium_morphology', [
                            { value: 'trilaminar', label: 'Trilaminar' },
                            { value: 'echogenic', label: 'Echogenic' },
                            { value: 'irregular', label: 'Tidak teratur' },
                            { value: 'normal_phase', label: 'Normal untuk fase siklus' },
                            { value: 'thick', label: 'Tebal' },
                            { value: 'polyp_suspected', label: 'Curiga polip' },
                            { value: 'fluid', label: 'Tampak Cairan' }
                        ], endo.morphology)}
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Ovaries section (critical for fertility assessment)
     */
    renderOvaries(data) {
        const ovaries = data.ovaries || {};

        return `
            <h6 class="font-weight-bold text-success mt-3">INDUNG TELUR (OVARIUM)</h6>

            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-muted">Kanan</h6>
                    ${this.renderOvarySide('right', ovaries.right || {})}
                </div>
                <div class="col-md-6 border-left">
                    <h6 class="text-muted">Kiri</h6>
                    ${this.renderOvarySide('left', ovaries.left || {})}
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Render one ovary side
     */
    renderOvarySide(side, data) {
        return `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" name="ovary_${side}_identified"
                       ${data.identified ? 'checked' : ''}>
                <label class="form-check-label font-weight-bold">Teridentifikasi</label>
            </div>

            <label>Ukuran:</label>
            <div class="input-group mb-2">
                <input type="number" class="form-control" name="ovary_${side}_length"
                       placeholder="L" value="${data.length || ''}" step="0.1">
                <div class="input-group-append input-group-prepend">
                    <span class="input-group-text">×</span>
                </div>
                <input type="number" class="form-control" name="ovary_${side}_width"
                       placeholder="W" value="${data.width || ''}" step="0.1">
                <div class="input-group-append input-group-prepend">
                    <span class="input-group-text">×</span>
                </div>
                <input type="number" class="form-control" name="ovary_${side}_depth"
                       placeholder="D" value="${data.depth || ''}" step="0.1">
                <div class="input-group-append">
                    <span class="input-group-text">cm</span>
                </div>
            </div>

            <label>Folikel (untuk monitoring kesuburan):</label>
            <div class="row mb-2">
                <div class="col-6">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <span class="input-group-text">Jumlah:</span>
                        </div>
                        <input type="number" class="form-control" name="ovary_${side}_follicle_count"
                               value="${data.follicleCount || ''}" placeholder="0">
                    </div>
                </div>
                <div class="col-6">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <span class="input-group-text">Ukuran:</span>
                        </div>
                        <input type="number" class="form-control" name="ovary_${side}_follicle_size_min"
                               placeholder="min" value="${data.follicleMinSize || ''}" step="0.1">
                        <div class="input-group-append input-group-prepend">
                            <span class="input-group-text">-</span>
                        </div>
                        <input type="number" class="form-control" name="ovary_${side}_follicle_size_max"
                               placeholder="max" value="${data.follicleMaxSize || ''}" step="0.1">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" name="ovary_${side}_pco"
                       id="ovary_${side}_pco" ${data.pco ? 'checked' : ''}>
                <label class="form-check-label" for="ovary_${side}_pco">Penampakan PCO</label>
            </div>

            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" name="ovary_${side}_has_mass"
                       id="ovary_${side}_has_mass" ${data.hasMass ? 'checked' : ''}>
                <label class="form-check-label" for="ovary_${side}_has_mass">Ada Massa/Kista</label>
            </div>

            <div id="ovary_${side}_mass_details" style="display: ${data.hasMass ? 'block' : 'none'}" class="ml-4">
                <div class="input-group mb-2">
                    <div class="input-group-prepend">
                        <span class="input-group-text">Ukuran:</span>
                    </div>
                    <input type="text" class="form-control" name="ovary_${side}_mass_size"
                           placeholder="__ × __ × __ cm" value="${data.massSize || ''}">
                </div>
                <label>Jenis:</label>
                ${this.renderRadioGroup(`ovary_${side}_mass_type`, [
                    { value: 'simple_cyst', label: 'Kista sederhana' },
                    { value: 'complex_cyst', label: 'Kista kompleks' },
                    { value: 'solid', label: 'Padat' },
                    { value: 'mixed', label: 'Campuran' }
                ], data.massType)}

                <label class="mt-2">Internal echo:</label>
                ${this.renderRadioGroup(`ovary_${side}_internal_echo`, [
                    { value: 'anechoic', label: 'Anekoit' },
                    { value: 'low_level', label: 'Tingkat rendah' },
                    { value: 'echogenic', label: 'Echogenik' }
                ], data.internalEcho)}

                <label class="mt-2">Bersepta:</label>
                ${this.renderRadioGroup(`ovary_${side}_septated`, [
                    { value: 'none', label: 'Tidak ada' },
                    { value: 'thin', label: 'Tipis' },
                    { value: 'thick', label: 'Tebal' }
                ], data.septated)}

                <label class="mt-2">Dinding:</label>
                ${this.renderRadioGroup(`ovary_${side}_wall`, [
                    { value: 'smooth', label: 'Halus' },
                    { value: 'irregular', label: 'Tidak teratur' }
                ], data.wall)}
            </div>
        `;
    },

    /**
     * Additional findings
     */
    renderAdditionalFindings(data) {
        const additional = data.additional || {};

        return `
            <h6 class="font-weight-bold text-success mt-3">TEMUAN TAMBAHAN</h6>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="free_fluid"
                               ${additional.freeFluid ? 'checked' : ''}>
                        <label class="form-check-label">Free fluid di cavum douglas</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="cervical_assessment"
                               ${additional.cervicalAssessment ? 'checked' : ''}>
                        <label class="form-check-label">Pemeriksaan serviks dilakukan</label>
                    </div>
                </div>
            </div>
            <div class="form-group mt-3">
                <label>Catatan Tambahan:</label>
                <textarea class="form-control" name="usg_notes" rows="3"
                          placeholder="Temuan lain atau interpretasi...">${data.notes || ''}</textarea>
            </div>
        `;
    },

    /**
     * Helper: Render radio group
     */
    renderRadioGroup(name, options, selectedValue) {
        return options.map(opt => `
            <div class="form-check">
                <input class="form-check-input" type="radio" name="${name}"
                       value="${opt.value}" ${selectedValue === opt.value ? 'checked' : ''}>
                <label class="form-check-label">${opt.label}</label>
            </div>
        `).join('');
    },

    /**
     * Helper: Render checkbox group
     */
    renderCheckboxGroup(name, options, selectedValues = []) {
        return options.map(opt => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="${name}[]"
                       value="${opt.value}" ${selectedValues.includes(opt.value) ? 'checked' : ''}>
                <label class="form-check-label">${opt.label}</label>
            </div>
        `).join('');
    },

    /**
     * Save USG data
     */
    async save(state) {
        try {
            // Collect form data
            const formData = {
                type: document.querySelector('input[name="usg_type"]:checked')?.value,
                uterus: this.collectUterusData(),
                endometrium: this.collectEndometriumData(),
                ovaries: {
                    right: this.collectOvaryData('right'),
                    left: this.collectOvaryData('left')
                },
                additional: this.collectAdditionalData(),
                notes: document.querySelector('[name="usg_notes"]')?.value
            };

            // TODO: Send to backend API
            console.log('[USG Gyn Special] Saving data:', formData);

            return { success: true, data: formData };
        } catch (error) {
            console.error('[USG Gyn Special] Save failed:', error);
            return { success: false, error: error.message };
        }
    },

    collectUterusData() {
        return {
            position: document.querySelector('input[name="uterus_position"]:checked')?.value,
            length: document.querySelector('[name="uterus_length"]')?.value,
            width: document.querySelector('[name="uterus_width"]')?.value,
            depth: document.querySelector('[name="uterus_depth"]')?.value,
            hasMyoma: document.querySelector('[name="has_myoma"]')?.checked,
            myomaLocation: Array.from(document.querySelectorAll('[name="myoma_location[]"]:checked')).map(el => el.value),
            myomaSize: document.querySelector('[name="myoma_size"]')?.value,
            multipleMyoma: document.querySelector('[name="multiple_myoma"]')?.checked,
            hasAdenomyosis: document.querySelector('[name="has_adenomyosis"]')?.checked
        };
    },

    collectEndometriumData() {
        return {
            thickness: document.querySelector('[name="endometrium_thickness"]')?.value,
            morphology: document.querySelector('input[name="endometrium_morphology"]:checked')?.value
        };
    },

    collectOvaryData(side) {
        return {
            identified: document.querySelector(`[name="ovary_${side}_identified"]`)?.checked,
            length: document.querySelector(`[name="ovary_${side}_length"]`)?.value,
            width: document.querySelector(`[name="ovary_${side}_width"]`)?.value,
            depth: document.querySelector(`[name="ovary_${side}_depth"]`)?.value,
            follicleCount: document.querySelector(`[name="ovary_${side}_follicle_count"]`)?.value,
            follicleMinSize: document.querySelector(`[name="ovary_${side}_follicle_size_min"]`)?.value,
            follicleMaxSize: document.querySelector(`[name="ovary_${side}_follicle_size_max"]`)?.value,
            pco: document.querySelector(`[name="ovary_${side}_pco"]`)?.checked,
            hasMass: document.querySelector(`[name="ovary_${side}_has_mass"]`)?.checked,
            massSize: document.querySelector(`[name="ovary_${side}_mass_size"]`)?.value,
            massType: document.querySelector(`input[name="ovary_${side}_mass_type"]:checked`)?.value,
            internalEcho: document.querySelector(`input[name="ovary_${side}_internal_echo"]:checked`)?.value,
            septated: document.querySelector(`input[name="ovary_${side}_septated"]:checked`)?.value,
            wall: document.querySelector(`input[name="ovary_${side}_wall"]:checked`)?.value
        };
    },

    collectAdditionalData() {
        return {
            freeFluid: document.querySelector('[name="free_fluid"]')?.checked,
            cervicalAssessment: document.querySelector('[name="cervical_assessment"]')?.checked
        };
    }
};

// Attach event listeners for dynamic behavior
document.addEventListener('DOMContentLoaded', () => {
    // Show/hide myoma details
    document.getElementById('has_myoma')?.addEventListener('change', (e) => {
        document.getElementById('myoma_details').style.display = e.target.checked ? 'block' : 'none';
    });

    // Show/hide mass details for both ovaries
    ['right', 'left'].forEach(side => {
        document.getElementById(`ovary_${side}_has_mass`)?.addEventListener('change', (e) => {
            document.getElementById(`ovary_${side}_mass_details`).style.display = e.target.checked ? 'block' : 'none';
        });
    });

    // Calculate uterus volume (L × W × D × 0.5236)
    ['uterus_length', 'uterus_width', 'uterus_depth'].forEach(field => {
        document.querySelector(`[name="${field}"]`)?.addEventListener('input', () => {
            const l = parseFloat(document.querySelector('[name="uterus_length"]')?.value) || 0;
            const w = parseFloat(document.querySelector('[name="uterus_width"]')?.value) || 0;
            const d = parseFloat(document.querySelector('[name="uterus_depth"]')?.value) || 0;
            const volume = (l * w * d * 0.5236).toFixed(1);
            document.getElementById('uterus_volume').textContent = volume > 0 ? volume : '--';
        });
    });
});
