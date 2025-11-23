/**
 * Anamnesa Component for Gyn Repro Patients
 * Focus: Reproductive goals, fertility assessment, menstrual history
 */

export default {
    /**
     * Render Anamnesa form for Gyn Repro
     */
    async render(state) {
        const intake = state.intakeData?.payload || {};
        const summary = state.intakeData?.summary || {};
        const metadata = intake.metadata || {};

        return `
            <div class="card">
                <div class="card-header bg-success text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-notes-medical"></i> Anamnesa (Ginekologi Reproduksi)
                    </h5>
                </div>
                <div class="card-body">
                    ${this.renderReproductiveGoals(intake)}
                    ${this.renderMenstrualHistory(intake)}
                    ${this.renderContraceptionHistory(intake)}
                    ${this.renderFertilityAssessment(intake)}
                    ${this.renderGeneralMedicalHistory(intake)}
                    ${this.renderCurrentMedications(intake)}
                </div>
                <div class="card-footer">
                    <button type="button" class="btn btn-success" onclick="saveAnamnesaData()">
                        <i class="fas fa-save"></i> Simpan Anamnesa
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Reproductive Goals & Chief Complaints
     */
    renderReproductiveGoals(intake) {
        const reproGoals = intake.repro_goals || [];

        return `
            <h6 class="font-weight-bold text-success mt-3">TUJUAN KONSULTASI</h6>
            <div class="form-group">
                <label>Kebutuhan Reproduksi:</label>
                <div class="ml-3">
                    ${this.renderCheckboxGroup('repro_goals', [
                        { value: 'promil', label: 'Program hamil / promil' },
                        { value: 'kb_setup', label: 'Pasang/lepas alat kontrasepsi' },
                        { value: 'fertility_check', label: 'Pemeriksaan kesuburan' },
                        { value: 'pre_marital', label: 'Konsultasi pra-nikah' },
                        { value: 'cycle_planning', label: 'Mengatur siklus/menunda haid' },
                        { value: 'other', label: 'Lainnya' }
                    ], reproGoals)}
                </div>
            </div>

            <div class="form-group">
                <label>Detail Kebutuhan:</label>
                <textarea class="form-control" name="repro_goal_detail" rows="3"
                          placeholder="Jelaskan lebih detail tentang kebutuhan konsultasi...">${intake.repro_goal_detail || intake.goalDetail || ''}</textarea>
            </div>

            <div id="promil-section" style="display: ${reproGoals.includes('promil') ? 'block' : 'none'}">
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Berapa lama sudah mencoba hamil?</label>
                            <input type="text" class="form-control" name="repro_trying_duration"
                                   value="${intake.repro_trying_duration || intake.tryingDuration || ''}"
                                   placeholder="Contoh: 1 tahun, 6 bulan, dll">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Sedang mengikuti program hamil?</label>
                            <div class="ml-2">
                                ${this.renderRadioGroup('fertility_program_interest', [
                                    { value: 'yes', label: 'Ya' },
                                    { value: 'no', label: 'Tidak' },
                                    { value: 'considering', label: 'Sedang pertimbangkan' }
                                ], intake.fertility_program_interest || intake.programInterest)}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>Pemeriksaan yang pernah dilakukan:</label>
                    <textarea class="form-control" name="repro_previous_evaluations" rows="2"
                              placeholder="Contoh: USG transvaginal, HSG, analisa sperma, dll...">${intake.repro_previous_evaluations || intake.previousEvaluations || ''}</textarea>
                </div>
            </div>

            <div class="form-group">
                <label>Harapan dari konsultasi ini:</label>
                <textarea class="form-control" name="repro_expectation" rows="2"
                          placeholder="Apa yang diharapkan dari kunjungan ini...">${intake.repro_expectation || intake.expectation || ''}</textarea>
            </div>
            <hr>
        `;
    },

    /**
     * Menstrual History
     */
    renderMenstrualHistory(intake) {
        return `
            <h6 class="font-weight-bold text-success mt-3">RIWAYAT MENSTRUASI</h6>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Usia pertama kali menstruasi (menarche):</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="menarche_age"
                                   value="${intake.menarche_age || intake.menarcheAge || ''}"
                                   placeholder="12" min="8" max="18">
                            <div class="input-group-append">
                                <span class="input-group-text">tahun</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Panjang siklus menstruasi:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="cycle_length"
                                   value="${intake.cycle_length || intake.cycleLength || ''}"
                                   placeholder="28" min="21" max="35">
                            <div class="input-group-append">
                                <span class="input-group-text">hari</span>
                            </div>
                        </div>
                        <small class="text-muted">Normal: 21-35 hari</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Lama menstruasi:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="menstruation_duration"
                                   value="${intake.menstruation_duration || intake.menstruationDuration || ''}"
                                   placeholder="5" min="2" max="10">
                            <div class="input-group-append">
                                <span class="input-group-text">hari</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Siklus menstruasi teratur?</label>
                        <div class="ml-2">
                            ${this.renderRadioGroup('cycle_regular', [
                                { value: 'yes', label: 'Ya, teratur' },
                                { value: 'no', label: 'Tidak, tidak teratur' },
                                { value: 'sometimes', label: 'Kadang-kadang' }
                            ], intake.cycle_regular || intake.cycleRegular)}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Hari pertama haid terakhir (HPHT):</label>
                        <input type="date" class="form-control" name="lmp"
                               value="${intake.lmp || intake.lmp_date || ''}">
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Jumlah perdarahan:</label>
                        <div class="ml-2">
                            ${this.renderRadioGroup('menstruation_flow', [
                                { value: 'light', label: 'Ringan/sedikit' },
                                { value: 'moderate', label: 'Sedang/normal' },
                                { value: 'heavy', label: 'Banyak' },
                                { value: 'very_heavy', label: 'Sangat banyak (ganti pembalut tiap jam)' }
                            ], intake.menstruation_flow || intake.menstruationFlow)}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Nyeri menstruasi (dismenore):</label>
                        <div class="ml-2">
                            ${this.renderRadioGroup('dysmenorrhea_level', [
                                { value: 'none', label: 'Tidak ada' },
                                { value: 'mild', label: 'Ringan (masih bisa aktivitas)' },
                                { value: 'moderate', label: 'Sedang (perlu obat)' },
                                { value: 'severe', label: 'Berat (mengganggu aktivitas)' }
                            ], intake.dysmenorrhea_level || intake.dysmenorrheaLevel)}
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="spotting_outside_cycle"
                           ${intake.spotting_outside_cycle || intake.spottingOutsideCycle ? 'checked' : ''}>
                    <label class="form-check-label">Ada perdarahan/bercak di luar siklus menstruasi (spotting)</label>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Contraception History
     */
    renderContraceptionHistory(intake) {
        return `
            <h6 class="font-weight-bold text-success mt-3">RIWAYAT KONTRASEPSI</h6>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Sedang/pernah menggunakan KB?</label>
                        <div class="ml-2">
                            ${this.renderRadioGroup('using_contraception', [
                                { value: 'currently', label: 'Sedang menggunakan' },
                                { value: 'past', label: 'Pernah, tapi sudah berhenti' },
                                { value: 'never', label: 'Tidak pernah' }
                            ], intake.using_contraception)}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Metode kontrasepsi terakhir:</label>
                        <input type="text" class="form-control" name="repro_last_contraception"
                               value="${intake.repro_last_contraception || intake.lastContraception || ''}"
                               placeholder="Contoh: Pil KB, Suntik, IUD, Implant, dll">
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label>Catatan KB:</label>
                <textarea class="form-control" name="contraception_notes" rows="2"
                          placeholder="Efek samping, alasan berhenti, dll...">${intake.contraception_notes || ''}</textarea>
            </div>
            <hr>
        `;
    },

    /**
     * Fertility Assessment (for promil patients)
     */
    renderFertilityAssessment(intake) {
        return `
            <h6 class="font-weight-bold text-success mt-3">PENILAIAN KESUBURAN</h6>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="diagnosed_pcos"
                               ${intake.diagnosed_pcos === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Diagnosis PCOS sebelumnya</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="diagnosed_gyne_conditions"
                               ${intake.diagnosed_gyne_conditions === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Riwayat miom/kista/endometriosis</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="transvaginal_usg"
                               ${intake.transvaginal_usg === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Pernah USG transvaginal kesuburan</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="hsg_history"
                               ${intake.hsg_history === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Pernah pemeriksaan HSG</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="previous_programs"
                               ${intake.previous_programs === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Program hamil sebelumnya</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="partner_smoking"
                               ${intake.partner_smoking === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Pasangan merokok</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="partner_alcohol"
                               ${intake.partner_alcohol === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Pasangan mengonsumsi alkohol</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="sperm_analysis"
                               ${intake.sperm_analysis === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Pasangan pernah analisa sperma</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="prefer_natural_program"
                               ${intake.prefer_natural_program === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Lebih suka program alami</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="willing_hormonal_therapy"
                               ${intake.willing_hormonal_therapy === 'yes' ? 'checked' : ''}>
                        <label class="form-check-label">Bersedia terapi hormonal jika perlu</label>
                    </div>
                </div>
            </div>

            <div class="form-group mt-3">
                <label>Riwayat Kehamilan Sebelumnya (jika ada):</label>
                <div class="row">
                    <div class="col-md-3">
                        <label>Gravida:</label>
                        <input type="number" class="form-control" name="gravida"
                               value="${intake.gravida || ''}" min="0">
                    </div>
                    <div class="col-md-3">
                        <label>Para:</label>
                        <input type="number" class="form-control" name="para"
                               value="${intake.para || ''}" min="0">
                    </div>
                    <div class="col-md-3">
                        <label>Abortus:</label>
                        <input type="number" class="form-control" name="abortus"
                               value="${intake.abortus || ''}" min="0">
                    </div>
                    <div class="col-md-3">
                        <label>Anak Hidup:</label>
                        <input type="number" class="form-control" name="living"
                               value="${intake.living || intake.living_children || ''}" min="0">
                    </div>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * General Medical History (simplified for gyn repro)
     */
    renderGeneralMedicalHistory(intake) {
        const pastConditions = intake.past_conditions || [];

        return `
            <h6 class="font-weight-bold text-success mt-3">RIWAYAT MEDIS UMUM</h6>

            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Golongan Darah:</label>
                        <select class="form-control" name="blood_type">
                            <option value="">Pilih...</option>
                            <option value="A" ${intake.blood_type === 'A' ? 'selected' : ''}>A</option>
                            <option value="B" ${intake.blood_type === 'B' ? 'selected' : ''}>B</option>
                            <option value="AB" ${intake.blood_type === 'AB' ? 'selected' : ''}>AB</option>
                            <option value="O" ${intake.blood_type === 'O' ? 'selected' : ''}>O</option>
                        </select>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Rhesus:</label>
                        <select class="form-control" name="rhesus">
                            <option value="">Pilih...</option>
                            <option value="positive" ${intake.rhesus === 'positive' ? 'selected' : ''}>Positif (+)</option>
                            <option value="negative" ${intake.rhesus === 'negative' ? 'selected' : ''}>Negatif (-)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label>Alergi:</label>
                <div class="row">
                    <div class="col-md-4">
                        <input type="text" class="form-control" name="allergy_drugs"
                               value="${intake.allergy_drugs || ''}" placeholder="Obat-obatan">
                    </div>
                    <div class="col-md-4">
                        <input type="text" class="form-control" name="allergy_food"
                               value="${intake.allergy_food || ''}" placeholder="Makanan">
                    </div>
                    <div class="col-md-4">
                        <input type="text" class="form-control" name="allergy_env"
                               value="${intake.allergy_env || ''}" placeholder="Lingkungan">
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label>Riwayat Penyakit:</label>
                <div class="ml-3">
                    ${this.renderCheckboxGroup('past_conditions', [
                        { value: 'hipertensi', label: 'Hipertensi' },
                        { value: 'diabetes', label: 'Diabetes' },
                        { value: 'thyroid', label: 'Gangguan tiroid' },
                        { value: 'cyst_myoma', label: 'Kista/Myoma' },
                        { value: 'surgery', label: 'Riwayat operasi' }
                    ], pastConditions)}
                </div>
            </div>

            <div class="form-group">
                <label>Detail Riwayat Penyakit:</label>
                <textarea class="form-control" name="past_conditions_detail" rows="2"
                          placeholder="Jelaskan riwayat penyakit yang dipilih di atas...">${intake.past_conditions_detail || ''}</textarea>
            </div>
            <hr>
        `;
    },

    /**
     * Current Medications
     */
    renderCurrentMedications(intake) {
        const medications = intake.medications || [];

        return `
            <h6 class="font-weight-bold text-success mt-3">OBAT YANG SEDANG DIKONSUMSI</h6>
            <div id="medications-list">
                ${this.renderMedicationsList(medications)}
            </div>
            <button type="button" class="btn btn-sm btn-outline-success mt-2" onclick="addMedication()">
                <i class="fas fa-plus"></i> Tambah Obat
            </button>
        `;
    },

    /**
     * Render medications list
     */
    renderMedicationsList(medications) {
        if (!medications || medications.length === 0) {
            return '<p class="text-muted">Tidak ada obat yang sedang dikonsumsi</p>';
        }

        return medications.map((med, index) => `
            <div class="card mb-2">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <input type="text" class="form-control form-control-sm"
                                   name="med_name_${index}" value="${med.name || ''}"
                                   placeholder="Nama obat">
                        </div>
                        <div class="col-md-3">
                            <input type="text" class="form-control form-control-sm"
                                   name="med_dose_${index}" value="${med.dose || ''}"
                                   placeholder="Dosis">
                        </div>
                        <div class="col-md-4">
                            <input type="text" class="form-control form-control-sm"
                                   name="med_freq_${index}" value="${med.freq || med.frequency || ''}"
                                   placeholder="Frekuensi">
                        </div>
                        <div class="col-md-1">
                            <button type="button" class="btn btn-sm btn-danger" onclick="removeMedication(${index})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
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
     * Save Anamnesa data
     */
    async save(state) {
        try {
            const formData = {
                reproductiveGoals: this.collectReproductiveGoals(),
                menstrualHistory: this.collectMenstrualHistory(),
                contraceptionHistory: this.collectContraceptionHistory(),
                fertilityAssessment: this.collectFertilityAssessment(),
                generalMedical: this.collectGeneralMedicalData(),
                medications: this.collectMedications()
            };

            console.log('[Anamnesa Gyn Repro] Saving data:', formData);

            return { success: true, data: formData };
        } catch (error) {
            console.error('[Anamnesa Gyn Repro] Save failed:', error);
            return { success: false, error: error.message };
        }
    },

    collectReproductiveGoals() {
        return {
            reproGoals: Array.from(document.querySelectorAll('[name="repro_goals[]"]:checked')).map(el => el.value),
            reproGoalDetail: document.querySelector('[name="repro_goal_detail"]')?.value,
            tryingDuration: document.querySelector('[name="repro_trying_duration"]')?.value,
            fertilityProgramInterest: document.querySelector('input[name="fertility_program_interest"]:checked')?.value,
            previousEvaluations: document.querySelector('[name="repro_previous_evaluations"]')?.value,
            expectation: document.querySelector('[name="repro_expectation"]')?.value
        };
    },

    collectMenstrualHistory() {
        return {
            menarcheAge: document.querySelector('[name="menarche_age"]')?.value,
            cycleLength: document.querySelector('[name="cycle_length"]')?.value,
            menstruationDuration: document.querySelector('[name="menstruation_duration"]')?.value,
            cycleRegular: document.querySelector('input[name="cycle_regular"]:checked')?.value,
            lmp: document.querySelector('[name="lmp"]')?.value,
            menstruationFlow: document.querySelector('input[name="menstruation_flow"]:checked')?.value,
            dysmenorrheaLevel: document.querySelector('input[name="dysmenorrhea_level"]:checked')?.value,
            spottingOutsideCycle: document.querySelector('[name="spotting_outside_cycle"]')?.checked
        };
    },

    collectContraceptionHistory() {
        return {
            usingContraception: document.querySelector('input[name="using_contraception"]:checked')?.value,
            lastContraception: document.querySelector('[name="repro_last_contraception"]')?.value,
            contraceptionNotes: document.querySelector('[name="contraception_notes"]')?.value
        };
    },

    collectFertilityAssessment() {
        return {
            diagnosedPcos: document.querySelector('[name="diagnosed_pcos"]')?.checked,
            diagnosedGyneConditions: document.querySelector('[name="diagnosed_gyne_conditions"]')?.checked,
            transvaginalUsg: document.querySelector('[name="transvaginal_usg"]')?.checked,
            hsgHistory: document.querySelector('[name="hsg_history"]')?.checked,
            previousPrograms: document.querySelector('[name="previous_programs"]')?.checked,
            partnerSmoking: document.querySelector('[name="partner_smoking"]')?.checked,
            partnerAlcohol: document.querySelector('[name="partner_alcohol"]')?.checked,
            spermAnalysis: document.querySelector('[name="sperm_analysis"]')?.checked,
            preferNaturalProgram: document.querySelector('[name="prefer_natural_program"]')?.checked,
            willingHormonalTherapy: document.querySelector('[name="willing_hormonal_therapy"]')?.checked,
            gravida: document.querySelector('[name="gravida"]')?.value,
            para: document.querySelector('[name="para"]')?.value,
            abortus: document.querySelector('[name="abortus"]')?.value,
            living: document.querySelector('[name="living"]')?.value
        };
    },

    collectGeneralMedicalData() {
        return {
            bloodType: document.querySelector('[name="blood_type"]')?.value,
            rhesus: document.querySelector('[name="rhesus"]')?.value,
            allergyDrugs: document.querySelector('[name="allergy_drugs"]')?.value,
            allergyFood: document.querySelector('[name="allergy_food"]')?.value,
            allergyEnv: document.querySelector('[name="allergy_env"]')?.value,
            pastConditions: Array.from(document.querySelectorAll('[name="past_conditions[]"]:checked')).map(el => el.value),
            pastConditionsDetail: document.querySelector('[name="past_conditions_detail"]')?.value
        };
    },

    collectMedications() {
        return []; // TODO: Collect from dynamic list
    }
};

// Attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Show/hide promil section based on repro_goals
    document.querySelectorAll('[name="repro_goals[]"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const promilChecked = document.querySelector('[name="repro_goals[]"][value="promil"]')?.checked;
            document.getElementById('promil-section').style.display = promilChecked ? 'block' : 'none';
        });
    });

    // Dynamic list handlers
    window.addMedication = function() {
        alert('Add medication functionality to be implemented');
    };

    window.removeMedication = function(index) {
        alert('Remove medication functionality to be implemented');
    };
});
