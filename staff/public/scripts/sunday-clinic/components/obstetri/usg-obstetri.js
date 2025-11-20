/**
 * USG Component for Obstetri Patients
 * Focus: Fetal biometry, amniotic fluid, placenta, fetal wellbeing
 */

export default {
    /**
     * Render USG form for Obstetri
     */
    async render(state) {
        const data = state.medicalRecords?.usg || {};

        return `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-ultrasound"></i> Pemeriksaan Ultrasound (USG Obstetri)
                    </h5>
                </div>
                <div class="card-body">
                    ${this.renderFetalBiometry(data)}
                    ${this.renderFetalPresentation(data)}
                    ${this.renderAmnioticFluid(data)}
                    ${this.renderPlacenta(data)}
                    ${this.renderFetalActivity(data)}
                    ${this.renderDopplerStudies(data)}
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
     * Fetal Biometry Section
     */
    renderFetalBiometry(data) {
        const biometry = data.biometry || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">BIOMETRI JANIN</h6>
            <div class="row">
                <div class="col-md-3">
                    <label>BPD (Biparietal Diameter):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="bpd"
                               value="${biometry.bpd || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <label>HC (Head Circumference):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="hc"
                               value="${biometry.hc || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <label>AC (Abdominal Circumference):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="ac"
                               value="${biometry.ac || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <label>FL (Femur Length):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="fl"
                               value="${biometry.fl || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row mt-3">
                <div class="col-md-6">
                    <label>Estimated Fetal Weight (EFW):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="efw"
                               value="${biometry.efw || ''}" step="1" placeholder="0" readonly>
                        <div class="input-group-append">
                            <span class="input-group-text">gram</span>
                        </div>
                        <div class="input-group-append">
                            <button class="btn btn-outline-secondary" type="button" onclick="calculateEFW()">
                                <i class="fas fa-calculator"></i> Hitung
                            </button>
                        </div>
                    </div>
                    <small class="text-muted">Menggunakan formula Hadlock</small>
                </div>
                <div class="col-md-6">
                    <label>Gestational Age by USG:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="ga_weeks"
                               value="${biometry.gaWeeks || ''}" placeholder="Minggu">
                        <div class="input-group-append input-group-prepend">
                            <span class="input-group-text">minggu</span>
                        </div>
                        <input type="number" class="form-control" name="ga_days"
                               value="${biometry.gaDays || ''}" placeholder="Hari">
                        <div class="input-group-append">
                            <span class="input-group-text">hari</span>
                        </div>
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Fetal Presentation
     */
    renderFetalPresentation(data) {
        const presentation = data.presentation || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">PRESENTASI JANIN</h6>
            <div class="row">
                <div class="col-md-4">
                    <label>Presentasi:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fetal_presentation', [
                            { value: 'cephalic', label: 'Kepala' },
                            { value: 'breech', label: 'Sungsang' },
                            { value: 'transverse', label: 'Lintang' },
                            { value: 'oblique', label: 'Miring' }
                        ], presentation.position)}
                    </div>
                </div>
                <div class="col-md-4">
                    <label>Posisi Punggung:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fetal_back_position', [
                            { value: 'anterior', label: 'Anterior' },
                            { value: 'posterior', label: 'Posterior' },
                            { value: 'left', label: 'Kiri' },
                            { value: 'right', label: 'Kanan' }
                        ], presentation.backPosition)}
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-check mt-4">
                        <input class="form-check-input" type="checkbox" name="multiple_pregnancy"
                               ${presentation.multiplePregnancy ? 'checked' : ''}>
                        <label class="form-check-label">Kehamilan ganda</label>
                    </div>
                    <div id="multiple_pregnancy_details" style="display: ${presentation.multiplePregnancy ? 'block' : 'none'}">
                        <input type="number" class="form-control mt-2" name="number_of_fetuses"
                               value="${presentation.numberOfFetuses || 2}" min="2" placeholder="Jumlah janin">
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Amniotic Fluid
     */
    renderAmnioticFluid(data) {
        const fluid = data.amnioticFluid || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">AIR KETUBAN</h6>
            <div class="row">
                <div class="col-md-6">
                    <label>AFI (Amniotic Fluid Index):</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="afi"
                               value="${fluid.afi || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">cm</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <label>Interpretasi:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fluid_interpretation', [
                            { value: 'normal', label: 'Normal (8-24 cm)' },
                            { value: 'oligohydramnios', label: 'Oligohidramnion (<8 cm)' },
                            { value: 'polyhydramnios', label: 'Polihidramnion (>24 cm)' }
                        ], fluid.interpretation)}
                    </div>
                </div>
            </div>
            <div class="row mt-2">
                <div class="col-md-12">
                    <label>Kejernihan:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fluid_clarity', [
                            { value: 'clear', label: 'Jernih' },
                            { value: 'cloudy', label: 'Keruh' },
                            { value: 'meconium', label: 'Mekonium' }
                        ], fluid.clarity)}
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Placenta
     */
    renderPlacenta(data) {
        const placenta = data.placenta || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">PLASENTA</h6>
            <div class="row">
                <div class="col-md-4">
                    <label>Lokasi:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('placenta_location', [
                            { value: 'fundal', label: 'Fundal' },
                            { value: 'anterior', label: 'Anterior' },
                            { value: 'posterior', label: 'Posterior' },
                            { value: 'lateral', label: 'Lateral' },
                            { value: 'low_lying', label: 'Rendah' },
                            { value: 'previa', label: 'Previa' }
                        ], placenta.location)}
                    </div>
                </div>
                <div class="col-md-4">
                    <label>Grade (Grannum):</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('placenta_grade', [
                            { value: '0', label: 'Grade 0' },
                            { value: '1', label: 'Grade I' },
                            { value: '2', label: 'Grade II' },
                            { value: '3', label: 'Grade III' }
                        ], placenta.grade)}
                    </div>
                </div>
                <div class="col-md-4">
                    <label>Ketebalan:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="placenta_thickness"
                               value="${placenta.thickness || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">mm</span>
                        </div>
                    </div>
                    <small class="text-muted">Normal: 20-40 mm</small>
                </div>
            </div>
            <div class="row mt-2">
                <div class="col-md-6">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="placenta_calcification"
                               ${placenta.calcification ? 'checked' : ''}>
                        <label class="form-check-label">Kalsifikasi</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <label>Jarak dari os:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="placenta_distance_os"
                               value="${placenta.distanceFromOs || ''}" step="0.1" placeholder="0.0">
                        <div class="input-group-append">
                            <span class="input-group-text">cm</span>
                        </div>
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Fetal Activity
     */
    renderFetalActivity(data) {
        const activity = data.activity || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">AKTIVITAS JANIN</h6>
            <div class="row">
                <div class="col-md-4">
                    <label>Gerakan janin:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fetal_movement', [
                            { value: 'active', label: 'Aktif' },
                            { value: 'reduced', label: 'Berkurang' },
                            { value: 'absent', label: 'Tidak ada' }
                        ], activity.movement)}
                    </div>
                </div>
                <div class="col-md-4">
                    <label>Denyut jantung janin:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" name="fetal_heart_rate"
                               value="${activity.heartRate || ''}" placeholder="120-160">
                        <div class="input-group-append">
                            <span class="input-group-text">bpm</span>
                        </div>
                    </div>
                    <small class="text-muted">Normal: 120-160 bpm</small>
                </div>
                <div class="col-md-4">
                    <label>Tonus janin:</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fetal_tone', [
                            { value: 'normal', label: 'Normal' },
                            { value: 'reduced', label: 'Berkurang' }
                        ], activity.tone)}
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Doppler Studies
     */
    renderDopplerStudies(data) {
        const doppler = data.doppler || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">STUDI DOPPLER (Jika dilakukan)</h6>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="doppler_performed"
                               id="doppler_performed" ${doppler.performed ? 'checked' : ''}>
                        <label class="form-check-label" for="doppler_performed">
                            <strong>Pemeriksaan Doppler dilakukan</strong>
                        </label>
                    </div>
                </div>
            </div>
            <div id="doppler_details" style="display: ${doppler.performed ? 'block' : 'none'}">
                <div class="row mt-3">
                    <div class="col-md-4">
                        <label>Umbilical artery:</label>
                        <div class="input-group">
                            <div class="input-group-prepend">
                                <span class="input-group-text">PI:</span>
                            </div>
                            <input type="number" class="form-control" name="umbilical_pi"
                                   value="${doppler.umbilicalPI || ''}" step="0.01" placeholder="0.00">
                        </div>
                        <div class="input-group mt-1">
                            <div class="input-group-prepend">
                                <span class="input-group-text">RI:</span>
                            </div>
                            <input type="number" class="form-control" name="umbilical_ri"
                                   value="${doppler.umbilicalRI || ''}" step="0.01" placeholder="0.00">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <label>Middle cerebral artery:</label>
                        <div class="input-group">
                            <div class="input-group-prepend">
                                <span class="input-group-text">PI:</span>
                            </div>
                            <input type="number" class="form-control" name="mca_pi"
                                   value="${doppler.mcaPI || ''}" step="0.01" placeholder="0.00">
                        </div>
                        <div class="input-group mt-1">
                            <div class="input-group-prepend">
                                <span class="input-group-text">PSV:</span>
                            </div>
                            <input type="number" class="form-control" name="mca_psv"
                                   value="${doppler.mcaPSV || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">cm/s</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <label>CPR (Cerebro-Placental Ratio):</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="cpr"
                                   value="${doppler.cpr || ''}" step="0.01" placeholder="0.00" readonly>
                            <div class="input-group-append">
                                <button class="btn btn-outline-secondary" type="button" onclick="calculateCPR()">
                                    <i class="fas fa-calculator"></i> Hitung
                                </button>
                            </div>
                        </div>
                        <small class="text-muted">CPR = MCA PI / Umbilical PI</small>
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Additional Findings
     */
    renderAdditionalFindings(data) {
        const additional = data.additional || {};

        return `
            <h6 class="font-weight-bold text-primary mt-3">TEMUAN TAMBAHAN</h6>
            <div class="row">
                <div class="col-md-6">
                    <label>Jenis kelamin janin (jika terlihat):</label>
                    <div class="ml-2">
                        ${this.renderRadioGroup('fetal_gender', [
                            { value: 'male', label: 'Laki-laki' },
                            { value: 'female', label: 'Perempuan' },
                            { value: 'unclear', label: 'Tidak jelas' },
                            { value: 'not_assessed', label: 'Tidak dinilai' }
                        ], additional.gender)}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-check mt-4">
                        <input class="form-check-input" type="checkbox" name="cord_around_neck"
                               ${additional.cordAroundNeck ? 'checked' : ''}>
                        <label class="form-check-label">Lilitan tali pusat</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="anatomical_abnormalities"
                               ${additional.anatomicalAbnormalities ? 'checked' : ''}>
                        <label class="form-check-label">Kelainan anatomi</label>
                    </div>
                </div>
            </div>
            <div class="form-group mt-3">
                <label>Catatan Tambahan:</label>
                <textarea class="form-control" name="usg_notes" rows="4"
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
     * Save USG data
     */
    async save(state) {
        try {
            // Collect form data
            const formData = {
                biometry: this.collectBiometryData(),
                presentation: this.collectPresentationData(),
                amnioticFluid: this.collectAmnioticFluidData(),
                placenta: this.collectPlacentaData(),
                activity: this.collectActivityData(),
                doppler: this.collectDopplerData(),
                additional: this.collectAdditionalData(),
                notes: document.querySelector('[name="usg_notes"]')?.value
            };

            // TODO: Send to backend API
            console.log('[USG Obstetri] Saving data:', formData);

            return { success: true, data: formData };
        } catch (error) {
            console.error('[USG Obstetri] Save failed:', error);
            return { success: false, error: error.message };
        }
    },

    collectBiometryData() {
        return {
            bpd: document.querySelector('[name="bpd"]')?.value,
            hc: document.querySelector('[name="hc"]')?.value,
            ac: document.querySelector('[name="ac"]')?.value,
            fl: document.querySelector('[name="fl"]')?.value,
            efw: document.querySelector('[name="efw"]')?.value,
            gaWeeks: document.querySelector('[name="ga_weeks"]')?.value,
            gaDays: document.querySelector('[name="ga_days"]')?.value
        };
    },

    collectPresentationData() {
        return {
            position: document.querySelector('input[name="fetal_presentation"]:checked')?.value,
            backPosition: document.querySelector('input[name="fetal_back_position"]:checked')?.value,
            multiplePregnancy: document.querySelector('[name="multiple_pregnancy"]')?.checked,
            numberOfFetuses: document.querySelector('[name="number_of_fetuses"]')?.value
        };
    },

    collectAmnioticFluidData() {
        return {
            afi: document.querySelector('[name="afi"]')?.value,
            interpretation: document.querySelector('input[name="fluid_interpretation"]:checked')?.value,
            clarity: document.querySelector('input[name="fluid_clarity"]:checked')?.value
        };
    },

    collectPlacentaData() {
        return {
            location: document.querySelector('input[name="placenta_location"]:checked')?.value,
            grade: document.querySelector('input[name="placenta_grade"]:checked')?.value,
            thickness: document.querySelector('[name="placenta_thickness"]')?.value,
            calcification: document.querySelector('[name="placenta_calcification"]')?.checked,
            distanceFromOs: document.querySelector('[name="placenta_distance_os"]')?.value
        };
    },

    collectActivityData() {
        return {
            movement: document.querySelector('input[name="fetal_movement"]:checked')?.value,
            heartRate: document.querySelector('[name="fetal_heart_rate"]')?.value,
            tone: document.querySelector('input[name="fetal_tone"]:checked')?.value
        };
    },

    collectDopplerData() {
        return {
            performed: document.querySelector('[name="doppler_performed"]')?.checked,
            umbilicalPI: document.querySelector('[name="umbilical_pi"]')?.value,
            umbilicalRI: document.querySelector('[name="umbilical_ri"]')?.value,
            mcaPI: document.querySelector('[name="mca_pi"]')?.value,
            mcaPSV: document.querySelector('[name="mca_psv"]')?.value,
            cpr: document.querySelector('[name="cpr"]')?.value
        };
    },

    collectAdditionalData() {
        return {
            gender: document.querySelector('input[name="fetal_gender"]:checked')?.value,
            cordAroundNeck: document.querySelector('[name="cord_around_neck"]')?.checked,
            anatomicalAbnormalities: document.querySelector('[name="anatomical_abnormalities"]')?.checked
        };
    }
};

// Attach event listeners for dynamic behavior
document.addEventListener('DOMContentLoaded', () => {
    // Show/hide multiple pregnancy details
    document.getElementById('multiple_pregnancy')?.addEventListener('change', (e) => {
        document.getElementById('multiple_pregnancy_details').style.display = e.target.checked ? 'block' : 'none';
    });

    // Show/hide doppler details
    document.getElementById('doppler_performed')?.addEventListener('change', (e) => {
        document.getElementById('doppler_details').style.display = e.target.checked ? 'block' : 'none';
    });

    // Calculate EFW using Hadlock formula
    window.calculateEFW = function() {
        const bpd = parseFloat(document.querySelector('[name="bpd"]')?.value) || 0;
        const hc = parseFloat(document.querySelector('[name="hc"]')?.value) || 0;
        const ac = parseFloat(document.querySelector('[name="ac"]')?.value) || 0;
        const fl = parseFloat(document.querySelector('[name="fl"]')?.value) || 0;

        if (bpd && hc && ac && fl) {
            // Hadlock formula (simplified)
            const logEFW = 1.326 + 0.0107 * hc + 0.0438 * ac + 0.158 * fl - 0.00326 * ac * fl;
            const efw = Math.round(Math.exp(logEFW));
            document.querySelector('[name="efw"]').value = efw;
        } else {
            alert('Masukkan semua nilai biometri (BPD, HC, AC, FL) untuk menghitung EFW');
        }
    };

    // Calculate CPR (Cerebro-Placental Ratio)
    window.calculateCPR = function() {
        const mcaPI = parseFloat(document.querySelector('[name="mca_pi"]')?.value) || 0;
        const umbilicalPI = parseFloat(document.querySelector('[name="umbilical_pi"]')?.value) || 0;

        if (mcaPI && umbilicalPI) {
            const cpr = (mcaPI / umbilicalPI).toFixed(2);
            document.querySelector('[name="cpr"]').value = cpr;
        } else {
            alert('Masukkan MCA PI dan Umbilical PI untuk menghitung CPR');
        }
    };
});
