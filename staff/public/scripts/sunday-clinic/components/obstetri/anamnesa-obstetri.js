/**
 * Anamnesa Component for Obstetri Patients
 * Focus: Pregnancy history, obstetric totals, risk factors
 */

export default {
    /**
     * Render Anamnesa form for Obstetri
     */
    async render(state) {
        const intake = state.intakeData?.payload || {};
        const summary = state.intakeData?.summary || {};
        const metadata = intake.metadata || {};

        return `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-notes-medical"></i> Anamnesa (Obstetri)
                    </h5>
                </div>
                <div class="card-body">
                    ${this.renderChiefComplaint(intake)}
                    ${this.renderPregnancyInfo(intake, metadata)}
                    ${this.renderObstetricHistory(intake, metadata)}
                    ${this.renderRiskFactors(intake, metadata)}
                    ${this.renderGeneralMedicalHistory(intake)}
                    ${this.renderCurrentMedications(intake)}
                </div>
                <div class="card-footer">
                    <button type="button" class="btn btn-primary" onclick="saveAnamnesaData()">
                        <i class="fas fa-save"></i> Simpan Anamnesa
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Chief Complaint
     */
    renderChiefComplaint(intake) {
        return `
            <h6 class="font-weight-bold text-primary mt-3">KELUHAN UTAMA</h6>
            <div class="form-group">
                <label>Keluhan saat ini:</label>
                <textarea class="form-control" name="chief_complaint" rows="3"
                          placeholder="Keluhan yang dirasakan pasien...">${intake.chief_complaint || intake.keluhan_utama || ''}</textarea>
            </div>
            <hr>
        `;
    },

    /**
     * Current Pregnancy Information
     */
    renderPregnancyInfo(intake, metadata) {
        const edd = metadata.edd || intake.edd || {};
        const eddValue = edd.value || edd;
        const lmp = intake.lmp_date || intake.lmp || (edd.lmpReference);
        const ga = metadata.gestationalAge || this.calculateGA(lmp);

        return `
            <h6 class="font-weight-bold text-primary mt-3">KEHAMILAN SAAT INI</h6>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label>HPHT (Hari Pertama Haid Terakhir):</label>
                        <input type="date" class="form-control" name="lmp_date" value="${lmp || ''}">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>HPL (Hari Perkiraan Lahir):</label>
                        <input type="date" class="form-control" name="edd_date" value="${eddValue || ''}" readonly>
                        <small class="text-muted">Dihitung otomatis dari HPHT</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Usia Kehamilan:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="ga_weeks"
                                   value="${ga?.weeks || ''}" placeholder="Minggu" readonly>
                            <div class="input-group-append input-group-prepend">
                                <span class="input-group-text">minggu</span>
                            </div>
                            <input type="number" class="form-control" name="ga_days"
                                   value="${ga?.days || ''}" placeholder="Hari" readonly>
                            <div class="input-group-append">
                                <span class="input-group-text">hari</span>
                            </div>
                        </div>
                        <small class="text-muted">Dihitung dari HPHT</small>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-3">
                    <div class="form-group">
                        <label>Tinggi Badan:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="height"
                                   value="${intake.height || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">cm</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label>Berat Badan Sekarang:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="current_weight"
                                   value="${intake.current_weight || intake.weight || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">kg</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label>BB Sebelum Hamil:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="pre_pregnancy_weight"
                                   value="${intake.pre_pregnancy_weight || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">kg</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label>BMI:</label>
                        <div class="input-group">
                            <input type="number" class="form-control" name="bmi"
                                   value="${metadata.bmiValue || intake.bmi || ''}" step="0.1" readonly>
                            <div class="input-group-append">
                                <button class="btn btn-outline-secondary" type="button" onclick="calculateBMI()">
                                    <i class="fas fa-calculator"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Jumlah Kunjungan ANC:</label>
                        <input type="number" class="form-control" name="anc_visits"
                               value="${intake.anc_visits || intake.anc_visit_count || ''}"
                               placeholder="Berapa kali kontrol">
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Kunjungan ANC terakhir:</label>
                        <input type="date" class="form-control" name="last_anc_date"
                               value="${intake.last_anc_date || ''}">
                    </div>
                </div>
            </div>

            <div class="form-group">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="prenatal_vitamins"
                           ${intake.prenatal_vitamins || intake.taking_vitamins ? 'checked' : ''}>
                    <label class="form-check-label">Mengonsumsi vitamin prenatal</label>
                </div>
            </div>
            <hr>
        `;
    },

    /**
     * Obstetric History (G P A L)
     */
    renderObstetricHistory(intake, metadata) {
        const obstetric = metadata.obstetricTotals || {};
        const gravida = obstetric.gravida ?? intake.gravida_count ?? intake.gravida ?? '';
        const para = obstetric.para ?? intake.para_count ?? intake.para ?? '';
        const abortus = obstetric.abortus ?? intake.abortus_count ?? intake.abortus ?? '';
        const living = obstetric.living ?? intake.living_children_count ?? intake.living ?? '';

        const previousPregnancies = intake.previousPregnancies || intake.previous_pregnancies || intake.pregnancy_history || [];

        return `
            <h6 class="font-weight-bold text-primary mt-3">RIWAYAT OBSTETRI</h6>
            <div class="row">
                <div class="col-md-3">
                    <div class="form-group">
                        <label><strong>G</strong> - Gravida (Hamil):</label>
                        <input type="number" class="form-control" name="gravida" value="${gravida}"
                               placeholder="Total kehamilan" min="0">
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label><strong>P</strong> - Para (Melahirkan):</label>
                        <input type="number" class="form-control" name="para" value="${para}"
                               placeholder="Total persalinan" min="0">
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label><strong>A</strong> - Abortus (Keguguran):</label>
                        <input type="number" class="form-control" name="abortus" value="${abortus}"
                               placeholder="Total keguguran" min="0">
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label><strong>L</strong> - Living (Anak Hidup):</label>
                        <input type="number" class="form-control" name="living" value="${living}"
                               placeholder="Anak hidup" min="0">
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label><strong>Riwayat Kehamilan Sebelumnya:</strong></label>
                <div id="previous-pregnancies-list">
                    ${this.renderPreviousPregnancies(previousPregnancies)}
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="addPreviousPregnancy()">
                    <i class="fas fa-plus"></i> Tambah Riwayat Kehamilan
                </button>
            </div>
            <hr>
        `;
    },

    /**
     * Render previous pregnancies list
     */
    renderPreviousPregnancies(pregnancies) {
        if (!pregnancies || pregnancies.length === 0) {
            return '<p class="text-muted">Belum ada riwayat kehamilan sebelumnya</p>';
        }

        return pregnancies.map((preg, index) => `
            <div class="card mb-2">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-2">
                            <label>Kehamilan #${index + 1}</label>
                        </div>
                        <div class="col-md-2">
                            <input type="text" class="form-control form-control-sm"
                                   name="prev_preg_year_${index}" value="${preg.year || ''}"
                                   placeholder="Tahun">
                        </div>
                        <div class="col-md-3">
                            <select class="form-control form-control-sm" name="prev_preg_mode_${index}">
                                <option value="">Cara persalinan...</option>
                                <option value="Normal" ${preg.mode === 'Normal' ? 'selected' : ''}>Normal</option>
                                <option value="SC" ${preg.mode === 'SC' ? 'selected' : ''}>SC</option>
                                <option value="Vacuum" ${preg.mode === 'Vacuum' ? 'selected' : ''}>Vacuum</option>
                                <option value="Forceps" ${preg.mode === 'Forceps' ? 'selected' : ''}>Forceps</option>
                                <option value="Keguguran" ${preg.mode === 'Keguguran' ? 'selected' : ''}>Keguguran</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <input type="number" class="form-control form-control-sm"
                                   name="prev_preg_weight_${index}" value="${preg.weight || ''}"
                                   placeholder="BB (gram)">
                        </div>
                        <div class="col-md-2">
                            <select class="form-control form-control-sm" name="prev_preg_alive_${index}">
                                <option value="">Status...</option>
                                <option value="yes" ${preg.alive === 'yes' ? 'selected' : ''}>Hidup</option>
                                <option value="no" ${preg.alive === 'no' ? 'selected' : ''}>Meninggal</option>
                            </select>
                        </div>
                        <div class="col-md-1">
                            <button type="button" class="btn btn-sm btn-danger" onclick="removePreviousPregnancy(${index})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="row mt-2">
                        <div class="col-md-12">
                            <input type="text" class="form-control form-control-sm"
                                   name="prev_preg_complication_${index}" value="${preg.complication || ''}"
                                   placeholder="Komplikasi (jika ada)">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Risk Factors
     */
    renderRiskFactors(intake, metadata) {
        const riskFlags = metadata.riskFlags || [];
        const riskFactors = intake.risk_factors || [];
        const isHighRisk = metadata.highRisk || false;

        return `
            <h6 class="font-weight-bold text-primary mt-3">FAKTOR RISIKO</h6>

            ${isHighRisk ? `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>KEHAMILAN RISIKO TINGGI</strong>
                </div>
            ` : ''}

            ${riskFlags.length > 0 ? `
                <div class="alert alert-warning">
                    <strong>Faktor Risiko Terdeteksi:</strong>
                    <ul class="mb-0">
                        ${riskFlags.map(flag => `<li>${flag}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            <div class="form-group">
                <label>Faktor Risiko Medis:</label>
                <div class="ml-3">
                    ${this.renderCheckboxGroup('risk_factors', [
                        { value: 'age_under_20', label: 'Usia < 20 tahun' },
                        { value: 'age_over_35', label: 'Usia > 35 tahun' },
                        { value: 'height_under_145', label: 'Tinggi badan < 145 cm' },
                        { value: 'multiple_pregnancy', label: 'Kehamilan ganda' },
                        { value: 'previous_sc', label: 'Riwayat SC sebelumnya' },
                        { value: 'previous_complications', label: 'Komplikasi kehamilan sebelumnya' },
                        { value: 'preeclampsia_history', label: 'Riwayat preeklampsia' },
                        { value: 'gestational_diabetes', label: 'Diabetes gestasional' },
                        { value: 'hypertension', label: 'Hipertensi' },
                        { value: 'anemia', label: 'Anemia' },
                        { value: 'bleeding', label: 'Perdarahan' },
                        { value: 'premature_rupture', label: 'Ketuban pecah dini' }
                    ], riskFactors)}
                </div>
            </div>

            <div class="form-group">
                <label>Catatan Risiko Tambahan:</label>
                <textarea class="form-control" name="risk_notes" rows="2"
                          placeholder="Faktor risiko lain yang perlu diperhatikan...">${intake.risk_notes || ''}</textarea>
            </div>
            <hr>
        `;
    },

    /**
     * General Medical History
     */
    renderGeneralMedicalHistory(intake) {
        const pastConditions = intake.past_conditions || [];
        const familyHistory = intake.family_history || [];

        return `
            <h6 class="font-weight-bold text-primary mt-3">RIWAYAT MEDIS UMUM</h6>

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
                        { value: 'heart', label: 'Penyakit jantung' },
                        { value: 'kidney', label: 'Gangguan ginjal' },
                        { value: 'thyroid', label: 'Gangguan tiroid' },
                        { value: 'asthma', label: 'Asma' },
                        { value: 'surgery', label: 'Riwayat operasi' }
                    ], pastConditions)}
                </div>
            </div>

            <div class="form-group">
                <label>Detail Riwayat Penyakit:</label>
                <textarea class="form-control" name="past_conditions_detail" rows="2"
                          placeholder="Jelaskan riwayat penyakit yang dipilih di atas...">${intake.past_conditions_detail || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Riwayat Penyakit Keluarga:</label>
                <div class="ml-3">
                    ${this.renderCheckboxGroup('family_history', [
                        { value: 'hipertensi', label: 'Hipertensi' },
                        { value: 'diabetes', label: 'Diabetes' },
                        { value: 'heart', label: 'Penyakit jantung' },
                        { value: 'stroke', label: 'Stroke' },
                        { value: 'cancer', label: 'Kanker' },
                        { value: 'genetic', label: 'Kelainan genetik' }
                    ], familyHistory)}
                </div>
            </div>

            <div class="form-group">
                <label>Detail Riwayat Keluarga:</label>
                <textarea class="form-control" name="family_history_detail" rows="2"
                          placeholder="Jelaskan riwayat penyakit keluarga...">${intake.family_history_detail || ''}</textarea>
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
            <h6 class="font-weight-bold text-primary mt-3">OBAT YANG SEDANG DIKONSUMSI</h6>
            <div id="medications-list">
                ${this.renderMedicationsList(medications)}
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="addMedication()">
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
     * Calculate gestational age from LMP
     */
    calculateGA(lmp) {
        if (!lmp) return null;
        const lmpDate = new Date(lmp);
        const today = new Date();
        const diffMs = today - lmpDate;
        if (diffMs < 0) return null;

        const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const weeks = Math.floor(totalDays / 7);
        const days = totalDays % 7;

        return { weeks, days };
    },

    /**
     * Save Anamnesa data
     */
    async save(state) {
        try {
            const formData = {
                chiefComplaint: document.querySelector('[name="chief_complaint"]')?.value,
                pregnancy: this.collectPregnancyData(),
                obstetricHistory: this.collectObstetricHistory(),
                riskFactors: this.collectRiskFactors(),
                generalMedical: this.collectGeneralMedicalData(),
                medications: this.collectMedications()
            };

            console.log('[Anamnesa Obstetri] Saving data:', formData);

            return { success: true, data: formData };
        } catch (error) {
            console.error('[Anamnesa Obstetri] Save failed:', error);
            return { success: false, error: error.message };
        }
    },

    collectPregnancyData() {
        return {
            lmp: document.querySelector('[name="lmp_date"]')?.value,
            edd: document.querySelector('[name="edd_date"]')?.value,
            gaWeeks: document.querySelector('[name="ga_weeks"]')?.value,
            gaDays: document.querySelector('[name="ga_days"]')?.value,
            height: document.querySelector('[name="height"]')?.value,
            currentWeight: document.querySelector('[name="current_weight"]')?.value,
            prePregnancyWeight: document.querySelector('[name="pre_pregnancy_weight"]')?.value,
            bmi: document.querySelector('[name="bmi"]')?.value,
            ancVisits: document.querySelector('[name="anc_visits"]')?.value,
            lastAncDate: document.querySelector('[name="last_anc_date"]')?.value,
            prenatalVitamins: document.querySelector('[name="prenatal_vitamins"]')?.checked
        };
    },

    collectObstetricHistory() {
        return {
            gravida: document.querySelector('[name="gravida"]')?.value,
            para: document.querySelector('[name="para"]')?.value,
            abortus: document.querySelector('[name="abortus"]')?.value,
            living: document.querySelector('[name="living"]')?.value,
            previousPregnancies: [] // TODO: Collect from dynamic list
        };
    },

    collectRiskFactors() {
        return {
            riskFactors: Array.from(document.querySelectorAll('[name="risk_factors[]"]:checked')).map(el => el.value),
            riskNotes: document.querySelector('[name="risk_notes"]')?.value
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
            pastConditionsDetail: document.querySelector('[name="past_conditions_detail"]')?.value,
            familyHistory: Array.from(document.querySelectorAll('[name="family_history[]"]:checked')).map(el => el.value),
            familyHistoryDetail: document.querySelector('[name="family_history_detail"]')?.value
        };
    },

    collectMedications() {
        return []; // TODO: Collect from dynamic list
    }
};

// Attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Calculate BMI
    window.calculateBMI = function() {
        const height = parseFloat(document.querySelector('[name="height"]')?.value) || 0;
        const weight = parseFloat(document.querySelector('[name="current_weight"]')?.value) || 0;

        if (height && weight) {
            const heightM = height / 100;
            const bmi = (weight / (heightM * heightM)).toFixed(1);
            document.querySelector('[name="bmi"]').value = bmi;
        } else {
            alert('Masukkan tinggi dan berat badan untuk menghitung BMI');
        }
    };

    // Calculate EDD from LMP
    document.querySelector('[name="lmp_date"]')?.addEventListener('change', (e) => {
        const lmp = new Date(e.target.value);
        if (!isNaN(lmp)) {
            const edd = new Date(lmp);
            edd.setDate(edd.getDate() + 280); // 40 weeks
            document.querySelector('[name="edd_date"]').value = edd.toISOString().split('T')[0];

            // Calculate GA
            const today = new Date();
            const diffMs = today - lmp;
            const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            const weeks = Math.floor(totalDays / 7);
            const days = totalDays % 7;

            document.querySelector('[name="ga_weeks"]').value = weeks;
            document.querySelector('[name="ga_days"]').value = days;
        }
    });

    // Dynamic list handlers
    window.addPreviousPregnancy = function() {
        // TODO: Add new pregnancy entry
        alert('Add pregnancy functionality to be implemented');
    };

    window.removePreviousPregnancy = function(index) {
        // TODO: Remove pregnancy entry
        alert('Remove pregnancy functionality to be implemented');
    };

    window.addMedication = function() {
        // TODO: Add new medication entry
        alert('Add medication functionality to be implemented');
    };

    window.removeMedication = function(index) {
        // TODO: Remove medication entry
        alert('Remove medication functionality to be implemented');
    };
});
