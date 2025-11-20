/**
 * Anamnesa Gyn Special Component
 * Focus: Gynecological symptoms, pathology, complaints
 *
 * Sections:
 * 1. Chief Complaints (discharge, bleeding, pain)
 * 2. Gynecological Symptoms
 * 3. Menstrual History (basic)
 * 4. Gynecological History (PAP smear, surgeries, dyspareunia)
 * 5. General Medical History
 * 6. Current Medications
 */

export default {
    /**
     * Render the Anamnesa form
     */
    async render(state) {
        const intake = state.intakeData?.payload || {};
        const summary = state.intakeData?.summary || {};
        const metadata = intake.metadata || {};

        return `
            <div class="card mb-3">
                <div class="card-header bg-info text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-notes-medical"></i> Anamnesa Ginekologi Khusus
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Chief Complaints Section -->
                    ${this.renderChiefComplaints(intake)}

                    <hr>

                    <!-- Gynecological Symptoms Section -->
                    ${this.renderGynecologicalSymptoms(intake)}

                    <hr>

                    <!-- Menstrual History Section -->
                    ${this.renderMenstrualHistory(intake)}

                    <hr>

                    <!-- Gynecological History Section -->
                    ${this.renderGynecologicalHistory(intake)}

                    <hr>

                    <!-- General Medical History Section -->
                    ${this.renderGeneralMedicalHistory(intake)}

                    <hr>

                    <!-- Current Medications Section -->
                    ${this.renderCurrentMedications(intake)}
                </div>
            </div>
        `;
    },

    /**
     * Render Chief Complaints section
     */
    renderChiefComplaints(intake) {
        const chiefComplaints = intake.chiefComplaints || [];
        const complaintDetails = intake.chiefComplaintDetails || '';

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-clipboard-list"></i> Keluhan Utama
                </h6>

                <label>Keluhan utama yang dialami:</label>
                ${this.renderCheckboxGroup('chief_complaints', [
                    { value: 'discharge', label: 'Keputihan / vaginal discharge' },
                    { value: 'abnormal_bleeding', label: 'Perdarahan abnormal' },
                    { value: 'pelvic_pain', label: 'Nyeri panggul / perut bawah' },
                    { value: 'mass', label: 'Benjolan / pembesaran perut bawah' },
                    { value: 'dyspareunia', label: 'Nyeri saat berhubungan (dyspareunia)' },
                    { value: 'urinary', label: 'Keluhan berkemih' },
                    { value: 'bowel', label: 'Keluhan buang air besar' },
                    { value: 'other', label: 'Lainnya' }
                ], chiefComplaints)}

                <div class="form-group mt-3">
                    <label>Penjelasan keluhan:</label>
                    <textarea class="form-control" name="chief_complaint_details"
                              rows="3" placeholder="Jelaskan keluhan lebih detail...">${complaintDetails}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render Gynecological Symptoms section
     */
    renderGynecologicalSymptoms(intake) {
        const symptoms = intake.gynSymptoms || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-stethoscope"></i> Gejala Ginekologi
                </h6>

                <!-- Vaginal Discharge Assessment -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Keputihan / Vaginal Discharge:</label>

                    <div class="form-group">
                        <label>Frekuensi keputihan:</label>
                        ${this.renderRadioGroup('discharge_frequency', [
                            { value: 'none', label: 'Tidak ada' },
                            { value: 'occasional', label: 'Kadang-kadang' },
                            { value: 'frequent', label: 'Sering' },
                            { value: 'constant', label: 'Terus-menerus' }
                        ], symptoms.dischargeFrequency)}
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <label>Warna keputihan:</label>
                            ${this.renderCheckboxGroup('discharge_color', [
                                { value: 'clear', label: 'Jernih / putih bening' },
                                { value: 'white', label: 'Putih susu' },
                                { value: 'yellow', label: 'Kuning' },
                                { value: 'green', label: 'Hijau' },
                                { value: 'brown', label: 'Kecoklatan' },
                                { value: 'bloody', label: 'Berdarah / kemerahan' }
                            ], symptoms.dischargeColor || [])}
                        </div>

                        <div class="col-md-6">
                            <label>Karakteristik keputihan:</label>
                            ${this.renderCheckboxGroup('discharge_characteristics', [
                                { value: 'watery', label: 'Encer / cair' },
                                { value: 'thick', label: 'Kental' },
                                { value: 'clumpy', label: 'Bergumpal (seperti keju)' },
                                { value: 'frothy', label: 'Berbusa' },
                                { value: 'odor', label: 'Berbau tidak sedap' },
                                { value: 'itchy', label: 'Gatal' },
                                { value: 'irritation', label: 'Iritasi / perih' }
                            ], symptoms.dischargeCharacteristics || [])}
                        </div>
                    </div>

                    <div class="form-group mt-2">
                        <label>Catatan keputihan:</label>
                        <textarea class="form-control" name="discharge_notes" rows="2"
                                  placeholder="Informasi tambahan tentang keputihan...">${symptoms.dischargeNotes || ''}</textarea>
                    </div>
                </div>

                <!-- Abnormal Bleeding Assessment -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Perdarahan Abnormal:</label>

                    <div class="form-group">
                        <label>Pola perdarahan:</label>
                        ${this.renderCheckboxGroup('bleeding_pattern', [
                            { value: 'menorrhagia', label: 'Menstruasi berlebihan (>7 hari / sangat banyak)' },
                            { value: 'metrorrhagia', label: 'Perdarahan di luar siklus menstruasi' },
                            { value: 'postcoital', label: 'Perdarahan setelah berhubungan (postcoital bleeding)' },
                            { value: 'postmenopausal', label: 'Perdarahan setelah menopause' },
                            { value: 'spotting', label: 'Bercak darah (spotting)' },
                            { value: 'irregular', label: 'Siklus tidak teratur' }
                        ], symptoms.bleedingPattern || [])}
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <label>Berapa lama sudah mengalami perdarahan abnormal?</label>
                            <input type="text" class="form-control" name="bleeding_duration"
                                   value="${symptoms.bleedingDuration || ''}"
                                   placeholder="Contoh: 3 bulan">
                        </div>
                        <div class="col-md-6">
                            <label>Jumlah perdarahan:</label>
                            ${this.renderRadioGroup('bleeding_amount', [
                                { value: 'spotting', label: 'Bercak' },
                                { value: 'light', label: 'Sedikit' },
                                { value: 'moderate', label: 'Sedang' },
                                { value: 'heavy', label: 'Banyak' },
                                { value: 'very_heavy', label: 'Sangat banyak (ganti pembalut tiap jam)' }
                            ], symptoms.bleedingAmount)}
                        </div>
                    </div>

                    <div class="form-group mt-2">
                        <label>Catatan perdarahan:</label>
                        <textarea class="form-control" name="bleeding_notes" rows="2"
                                  placeholder="Informasi tambahan tentang perdarahan...">${symptoms.bleedingNotes || ''}</textarea>
                    </div>
                </div>

                <!-- Pelvic Pain Assessment -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Nyeri Panggul / Perut Bawah:</label>

                    <div class="row">
                        <div class="col-md-6">
                            <label>Lokasi nyeri:</label>
                            ${this.renderCheckboxGroup('pain_location', [
                                { value: 'lower_abdomen', label: 'Perut bawah tengah' },
                                { value: 'right_side', label: 'Sisi kanan' },
                                { value: 'left_side', label: 'Sisi kiri' },
                                { value: 'pelvic', label: 'Panggul' },
                                { value: 'back', label: 'Pinggang / punggung bawah' }
                            ], symptoms.painLocation || [])}
                        </div>

                        <div class="col-md-6">
                            <label>Karakteristik nyeri:</label>
                            ${this.renderCheckboxGroup('pain_characteristics', [
                                { value: 'sharp', label: 'Tajam / menusuk' },
                                { value: 'dull', label: 'Tumpul / pegal' },
                                { value: 'cramping', label: 'Kram' },
                                { value: 'constant', label: 'Terus-menerus' },
                                { value: 'intermittent', label: 'Hilang timbul' },
                                { value: 'radiating', label: 'Menjalar' }
                            ], symptoms.painCharacteristics || [])}
                        </div>
                    </div>

                    <div class="row mt-2">
                        <div class="col-md-6">
                            <label>Skala nyeri (0-10):</label>
                            <input type="number" class="form-control" name="pain_scale"
                                   value="${symptoms.painScale || ''}" min="0" max="10"
                                   placeholder="0 = tidak nyeri, 10 = sangat nyeri">
                        </div>
                        <div class="col-md-6">
                            <label>Kapan nyeri muncul?</label>
                            ${this.renderCheckboxGroup('pain_timing', [
                                { value: 'during_period', label: 'Saat menstruasi' },
                                { value: 'during_intercourse', label: 'Saat berhubungan' },
                                { value: 'during_urination', label: 'Saat berkemih' },
                                { value: 'during_bowel', label: 'Saat BAB' },
                                { value: 'constant', label: 'Sepanjang waktu' }
                            ], symptoms.painTiming || [])}
                        </div>
                    </div>

                    <div class="form-group mt-2">
                        <label>Catatan nyeri:</label>
                        <textarea class="form-control" name="pain_notes" rows="2"
                                  placeholder="Informasi tambahan tentang nyeri...">${symptoms.painNotes || ''}</textarea>
                    </div>
                </div>

                <!-- Lower Abdomen Enlargement -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Pembesaran Perut Bawah / Benjolan:</label>

                    <div class="form-check mb-2">
                        <input type="checkbox" class="form-check-input" name="has_mass"
                               id="has_mass" ${symptoms.hasMass ? 'checked' : ''}>
                        <label class="form-check-label" for="has_mass">
                            Ada benjolan atau pembesaran perut bawah
                        </label>
                    </div>

                    <div id="mass-details" style="display: ${symptoms.hasMass ? 'block' : 'none'};">
                        <div class="row">
                            <div class="col-md-6">
                                <label>Lokasi benjolan:</label>
                                <input type="text" class="form-control" name="mass_location"
                                       value="${symptoms.massLocation || ''}"
                                       placeholder="Contoh: perut bawah kanan">
                            </div>
                            <div class="col-md-6">
                                <label>Sejak kapan dirasakan?</label>
                                <input type="text" class="form-control" name="mass_duration"
                                       value="${symptoms.massDuration || ''}"
                                       placeholder="Contoh: 2 bulan yang lalu">
                            </div>
                        </div>

                        <div class="form-group mt-2">
                            <label>Apakah benjolan membesar?</label>
                            ${this.renderRadioGroup('mass_growth', [
                                { value: 'no', label: 'Tidak, ukuran tetap' },
                                { value: 'slowly', label: 'Ya, membesar perlahan' },
                                { value: 'rapidly', label: 'Ya, membesar cepat' }
                            ], symptoms.massGrowth)}
                        </div>

                        <div class="form-group">
                            <label>Gejala terkait benjolan:</label>
                            ${this.renderCheckboxGroup('mass_symptoms', [
                                { value: 'painful', label: 'Nyeri' },
                                { value: 'pressure', label: 'Rasa penuh / tertekan' },
                                { value: 'urinary_frequency', label: 'Sering berkemih' },
                                { value: 'constipation', label: 'Sulit BAB / sembelit' },
                                { value: 'bloating', label: 'Kembung' }
                            ], symptoms.massSymptoms || [])}
                        </div>
                    </div>
                </div>

                <script>
                    // Toggle mass details
                    document.getElementById('has_mass')?.addEventListener('change', function() {
                        document.getElementById('mass-details').style.display =
                            this.checked ? 'block' : 'none';
                    });
                </script>
            </div>
        `;
    },

    /**
     * Render Menstrual History section (basic)
     */
    renderMenstrualHistory(intake) {
        const menstrual = intake.menstrualHistory || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-calendar-alt"></i> Riwayat Menstruasi
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <label>Usia menarche (haid pertama):</label>
                        <input type="number" class="form-control" name="menarche_age"
                               value="${menstrual.menarcheAge || intake.menarcheAge || ''}"
                               min="8" max="20" placeholder="Tahun">
                    </div>

                    <div class="col-md-4">
                        <label>Panjang siklus menstruasi:</label>
                        <input type="number" class="form-control" name="cycle_length"
                               value="${menstrual.cycleLength || intake.cycleLength || ''}"
                               min="21" max="45" placeholder="Hari">
                        <small class="text-muted">Normal: 21-35 hari</small>
                    </div>

                    <div class="col-md-4">
                        <label>Lama menstruasi:</label>
                        <input type="number" class="form-control" name="period_duration"
                               value="${menstrual.periodDuration || intake.periodDuration || ''}"
                               min="1" max="14" placeholder="Hari">
                        <small class="text-muted">Normal: 3-7 hari</small>
                    </div>
                </div>

                <div class="row mt-3">
                    <div class="col-md-6">
                        <label>Keteraturan siklus:</label>
                        ${this.renderRadioGroup('cycle_regularity', [
                            { value: 'regular', label: 'Teratur' },
                            { value: 'irregular', label: 'Tidak teratur' },
                            { value: 'sometimes', label: 'Kadang-kadang teratur' }
                        ], menstrual.cycleRegularity || intake.cycleRegularity)}
                    </div>

                    <div class="col-md-6">
                        <label>Hari pertama haid terakhir (HPHT):</label>
                        <input type="date" class="form-control" name="lmp_date"
                               value="${menstrual.lmpDate || intake.lmp || ''}">
                    </div>
                </div>

                <div class="form-group mt-3">
                    <label>Status menopause:</label>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" name="is_menopausal"
                               id="is_menopausal" ${menstrual.isMenopausal ? 'checked' : ''}>
                        <label class="form-check-label" for="is_menopausal">
                            Sudah menopause (tidak haid >12 bulan)
                        </label>
                    </div>
                    <input type="text" class="form-control mt-2" name="menopause_age"
                           value="${menstrual.menopauseAge || ''}"
                           placeholder="Usia menopause (jika sudah menopause)">
                </div>
            </div>
        `;
    },

    /**
     * Render Gynecological History section
     */
    renderGynecologicalHistory(intake) {
        const gynHistory = intake.gynecologicalHistory || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-history"></i> Riwayat Ginekologi
                </h6>

                <!-- PAP Smear History -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Riwayat PAP Smear / IVA Test:</label>

                    <div class="form-group">
                        <label>Sudah pernah PAP smear / IVA test?</label>
                        ${this.renderRadioGroup('pap_smear_done', [
                            { value: 'never', label: 'Belum pernah' },
                            { value: 'yes', label: 'Sudah pernah' }
                        ], gynHistory.papSmearDone)}
                    </div>

                    <div id="pap-smear-details" style="display: ${gynHistory.papSmearDone === 'yes' ? 'block' : 'none'};">
                        <div class="row">
                            <div class="col-md-6">
                                <label>Kapan terakhir kali?</label>
                                <input type="date" class="form-control" name="pap_smear_last_date"
                                       value="${gynHistory.papSmearLastDate || ''}">
                            </div>
                            <div class="col-md-6">
                                <label>Hasil terakhir:</label>
                                ${this.renderRadioGroup('pap_smear_result', [
                                    { value: 'normal', label: 'Normal' },
                                    { value: 'abnormal', label: 'Abnormal' },
                                    { value: 'unknown', label: 'Tidak tahu / lupa' }
                                ], gynHistory.papSmearResult)}
                            </div>
                        </div>

                        <div class="form-group mt-2">
                            <label>Detail hasil PAP smear (jika ada):</label>
                            <textarea class="form-control" name="pap_smear_details" rows="2"
                                      placeholder="Contoh: ASCUS, LSIL, HSIL, atau detail lainnya...">${gynHistory.papSmearDetails || ''}</textarea>
                        </div>
                    </div>

                    <script>
                        document.querySelectorAll('[name="pap_smear_done"]').forEach(radio => {
                            radio.addEventListener('change', function() {
                                document.getElementById('pap-smear-details').style.display =
                                    this.value === 'yes' ? 'block' : 'none';
                            });
                        });
                    </script>
                </div>

                <!-- Previous Gynecological Surgeries -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Riwayat Operasi Ginekologi:</label>

                    <div class="form-check mb-2">
                        <input type="checkbox" class="form-check-input" name="has_gyn_surgery"
                               id="has_gyn_surgery" ${gynHistory.hasGynSurgery ? 'checked' : ''}>
                        <label class="form-check-label" for="has_gyn_surgery">
                            Pernah menjalani operasi ginekologi
                        </label>
                    </div>

                    <div id="gyn-surgery-details" style="display: ${gynHistory.hasGynSurgery ? 'block' : 'none'};">
                        <label>Jenis operasi yang pernah dilakukan:</label>
                        ${this.renderCheckboxGroup('previous_surgeries', [
                            { value: 'myomectomy', label: 'Pengangkatan mioma (myomectomy)' },
                            { value: 'cystectomy', label: 'Pengangkatan kista ovarium (cystectomy)' },
                            { value: 'hysterectomy', label: 'Pengangkatan rahim (hysterectomy)' },
                            { value: 'oophorectomy', label: 'Pengangkatan ovarium (oophorectomy)' },
                            { value: 'laparoscopy', label: 'Laparoskopi diagnostik' },
                            { value: 'endometriosis_surgery', label: 'Operasi endometriosis' },
                            { value: 'cone_biopsy', label: 'Cone biopsy / LEEP' },
                            { value: 'other', label: 'Operasi lainnya' }
                        ], gynHistory.previousSurgeries || [])}

                        <div class="form-group mt-2">
                            <label>Detail operasi (tahun, rumah sakit, dll):</label>
                            <textarea class="form-control" name="surgery_details" rows="3"
                                      placeholder="Contoh: Myomectomy 2020 di RS X, Laparoskopi 2021...">${gynHistory.surgeryDetails || ''}</textarea>
                        </div>
                    </div>

                    <script>
                        document.getElementById('has_gyn_surgery')?.addEventListener('change', function() {
                            document.getElementById('gyn-surgery-details').style.display =
                                this.checked ? 'block' : 'none';
                        });
                    </script>
                </div>

                <!-- Sexual Health History -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Riwayat Kesehatan Seksual:</label>

                    <div class="form-group">
                        <label>Status pernikahan:</label>
                        ${this.renderRadioGroup('marital_status', [
                            { value: 'single', label: 'Belum menikah' },
                            { value: 'married', label: 'Menikah' },
                            { value: 'divorced', label: 'Bercerai' },
                            { value: 'widowed', label: 'Janda' }
                        ], gynHistory.maritalStatus)}
                    </div>

                    <div class="form-group">
                        <label>Sudah pernah berhubungan seksual?</label>
                        ${this.renderRadioGroup('sexually_active_history', [
                            { value: 'never', label: 'Belum pernah' },
                            { value: 'yes', label: 'Sudah pernah' }
                        ], gynHistory.sexuallyActiveHistory)}
                    </div>

                    <div id="sexual-history-details" style="display: ${gynHistory.sexuallyActiveHistory === 'yes' ? 'block' : 'none'};">
                        <div class="form-group">
                            <label>Dyspareunia (nyeri saat berhubungan):</label>
                            ${this.renderRadioGroup('dyspareunia', [
                                { value: 'none', label: 'Tidak ada nyeri' },
                                { value: 'superficial', label: 'Nyeri di bagian luar / awal penetrasi' },
                                { value: 'deep', label: 'Nyeri dalam' },
                                { value: 'always', label: 'Selalu nyeri' }
                            ], gynHistory.dyspareunia)}
                        </div>

                        <div class="form-check mb-2">
                            <input type="checkbox" class="form-check-input" name="postcoital_bleeding"
                                   ${gynHistory.postcoitalBleeding ? 'checked' : ''}>
                            <label class="form-check-label">
                                Perdarahan setelah berhubungan (postcoital bleeding)
                            </label>
                        </div>

                        <div class="form-group">
                            <label>Catatan kesehatan seksual:</label>
                            <textarea class="form-control" name="sexual_health_notes" rows="2"
                                      placeholder="Informasi tambahan...">${gynHistory.sexualHealthNotes || ''}</textarea>
                        </div>
                    </div>

                    <script>
                        document.querySelectorAll('[name="sexually_active_history"]').forEach(radio => {
                            radio.addEventListener('change', function() {
                                document.getElementById('sexual-history-details').style.display =
                                    this.value === 'yes' ? 'block' : 'none';
                            });
                        });
                    </script>
                </div>

                <!-- Contraception History -->
                <div class="subsection mb-4">
                    <label class="font-weight-bold">Riwayat Kontrasepsi:</label>

                    <div class="form-group">
                        <label>Penggunaan kontrasepsi:</label>
                        ${this.renderRadioGroup('contraception_use', [
                            { value: 'never', label: 'Tidak pernah menggunakan' },
                            { value: 'currently', label: 'Sedang menggunakan' },
                            { value: 'past', label: 'Pernah menggunakan (tidak lagi)' }
                        ], gynHistory.contraceptionUse)}
                    </div>

                    <div id="contraception-details" style="display: ${(gynHistory.contraceptionUse === 'currently' || gynHistory.contraceptionUse === 'past') ? 'block' : 'none'};">
                        <div class="form-group">
                            <label>Metode kontrasepsi (terakhir/saat ini):</label>
                            ${this.renderRadioGroup('contraception_method', [
                                { value: 'pill', label: 'Pil KB' },
                                { value: 'injection', label: 'Suntik KB' },
                                { value: 'iud', label: 'IUD / spiral' },
                                { value: 'implant', label: 'Implan / susuk' },
                                { value: 'condom', label: 'Kondom' },
                                { value: 'natural', label: 'Metode alami (kalender, dll)' },
                                { value: 'other', label: 'Lainnya' }
                            ], gynHistory.contraceptionMethod)}
                        </div>

                        <div class="form-group">
                            <label>Catatan kontrasepsi (efek samping, alasan berhenti, dll):</label>
                            <textarea class="form-control" name="contraception_notes" rows="2"
                                      placeholder="Contoh: Berhenti karena spotting, atau sedang pakai IUD sejak 2020...">${gynHistory.contraceptionNotes || ''}</textarea>
                        </div>
                    </div>

                    <script>
                        document.querySelectorAll('[name="contraception_use"]').forEach(radio => {
                            radio.addEventListener('change', function() {
                                document.getElementById('contraception-details').style.display =
                                    (this.value === 'currently' || this.value === 'past') ? 'block' : 'none';
                            });
                        });
                    </script>
                </div>
            </div>
        `;
    },

    /**
     * Render General Medical History section
     */
    renderGeneralMedicalHistory(intake) {
        const medical = intake.medicalHistory || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-heartbeat"></i> Riwayat Kesehatan Umum
                </h6>

                <div class="row mb-3">
                    <div class="col-md-6">
                        <label>Golongan darah:</label>
                        ${this.renderRadioGroup('blood_type', [
                            { value: 'A', label: 'A' },
                            { value: 'B', label: 'B' },
                            { value: 'AB', label: 'AB' },
                            { value: 'O', label: 'O' },
                            { value: 'unknown', label: 'Tidak tahu' }
                        ], medical.bloodType || intake.bloodType)}
                    </div>

                    <div class="col-md-6">
                        <label>Rhesus:</label>
                        ${this.renderRadioGroup('rhesus', [
                            { value: '+', label: 'Positif (+)' },
                            { value: '-', label: 'Negatif (-)' },
                            { value: 'unknown', label: 'Tidak tahu' }
                        ], medical.rhesus || intake.rhesus)}
                    </div>
                </div>

                <div class="form-group mb-3">
                    <label>Alergi:</label>
                    <input type="text" class="form-control" name="allergies"
                           value="${medical.allergies || intake.allergies || ''}"
                           placeholder="Obat, makanan, atau alergen lainnya (kosongkan jika tidak ada)">
                </div>

                <div class="form-group mb-3">
                    <label>Riwayat penyakit terdahulu:</label>
                    ${this.renderCheckboxGroup('past_conditions', [
                        { value: 'hypertension', label: 'Hipertensi / tekanan darah tinggi' },
                        { value: 'diabetes', label: 'Diabetes / kencing manis' },
                        { value: 'heart_disease', label: 'Penyakit jantung' },
                        { value: 'kidney_disease', label: 'Penyakit ginjal' },
                        { value: 'thyroid', label: 'Gangguan tiroid' },
                        { value: 'asthma', label: 'Asma' },
                        { value: 'cancer', label: 'Kanker' },
                        { value: 'autoimmune', label: 'Penyakit autoimun (lupus, dll)' },
                        { value: 'bleeding_disorder', label: 'Gangguan pembekuan darah' },
                        { value: 'liver_disease', label: 'Penyakit hati' }
                    ], medical.pastConditions || [])}
                </div>

                <div class="form-group mb-3">
                    <label>Detail riwayat penyakit:</label>
                    <textarea class="form-control" name="past_conditions_detail" rows="2"
                              placeholder="Jelaskan penyakit yang pernah/sedang diderita...">${medical.pastConditionsDetail || ''}</textarea>
                </div>

                <div class="form-group mb-3">
                    <label>Riwayat penyakit keluarga:</label>
                    ${this.renderCheckboxGroup('family_history', [
                        { value: 'breast_cancer', label: 'Kanker payudara' },
                        { value: 'ovarian_cancer', label: 'Kanker ovarium' },
                        { value: 'cervical_cancer', label: 'Kanker serviks' },
                        { value: 'uterine_cancer', label: 'Kanker rahim' },
                        { value: 'diabetes', label: 'Diabetes' },
                        { value: 'hypertension', label: 'Hipertensi' },
                        { value: 'heart_disease', label: 'Penyakit jantung' },
                        { value: 'endometriosis', label: 'Endometriosis' }
                    ], medical.familyHistory || [])}
                </div>

                <div class="form-group">
                    <label>Detail riwayat keluarga:</label>
                    <textarea class="form-control" name="family_history_detail" rows="2"
                              placeholder="Jelaskan riwayat penyakit keluarga...">${medical.familyHistoryDetail || ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render Current Medications section
     */
    renderCurrentMedications(intake) {
        const medications = intake.currentMedications || [];

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-pills"></i> Obat yang Sedang Dikonsumsi
                </h6>

                <div id="medications-list">
                    ${this.renderMedicationsList(medications)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addMedication()">
                    <i class="fas fa-plus"></i> Tambah Obat
                </button>

                <script>
                    window.medicationCounter = ${medications.length};

                    window.addMedication = function() {
                        const index = window.medicationCounter++;
                        const html = \`
                            <div class="medication-item border rounded p-2 mb-2" data-index="\${index}">
                                <div class="row">
                                    <div class="col-md-5">
                                        <input type="text" class="form-control form-control-sm"
                                               name="medications[\${index}][name]"
                                               placeholder="Nama obat" required>
                                    </div>
                                    <div class="col-md-3">
                                        <input type="text" class="form-control form-control-sm"
                                               name="medications[\${index}][dose]"
                                               placeholder="Dosis">
                                    </div>
                                    <div class="col-md-3">
                                        <input type="text" class="form-control form-control-sm"
                                               name="medications[\${index}][frequency]"
                                               placeholder="Frekuensi">
                                    </div>
                                    <div class="col-md-1">
                                        <button type="button" class="btn btn-sm btn-danger"
                                                onclick="window.removeMedication(\${index})">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        \`;
                        document.getElementById('medications-list').insertAdjacentHTML('beforeend', html);
                    };

                    window.removeMedication = function(index) {
                        const item = document.querySelector(\`.medication-item[data-index="\${index}"]\`);
                        if (item) item.remove();
                    };
                </script>
            </div>
        `;
    },

    /**
     * Render medications list helper
     */
    renderMedicationsList(medications) {
        if (!medications || medications.length === 0) {
            return '<p class="text-muted">Belum ada obat yang ditambahkan.</p>';
        }

        return medications.map((med, index) => `
            <div class="medication-item border rounded p-2 mb-2" data-index="${index}">
                <div class="row">
                    <div class="col-md-5">
                        <input type="text" class="form-control form-control-sm"
                               name="medications[${index}][name]"
                               value="${med.name || ''}"
                               placeholder="Nama obat" required>
                    </div>
                    <div class="col-md-3">
                        <input type="text" class="form-control form-control-sm"
                               name="medications[${index}][dose]"
                               value="${med.dose || ''}"
                               placeholder="Dosis">
                    </div>
                    <div class="col-md-3">
                        <input type="text" class="form-control form-control-sm"
                               name="medications[${index}][frequency]"
                               value="${med.frequency || ''}"
                               placeholder="Frekuensi">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-sm btn-danger"
                                onclick="window.removeMedication(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render checkbox group helper
     */
    renderCheckboxGroup(name, options, selectedValues = []) {
        return options.map(option => {
            const isChecked = selectedValues.includes(option.value);
            return `
                <div class="form-check">
                    <input type="checkbox" class="form-check-input"
                           name="${name}[]" value="${option.value}"
                           id="${name}_${option.value}"
                           ${isChecked ? 'checked' : ''}>
                    <label class="form-check-label" for="${name}_${option.value}">
                        ${option.label}
                    </label>
                </div>
            `;
        }).join('');
    },

    /**
     * Render radio group helper
     */
    renderRadioGroup(name, options, selectedValue = '') {
        return options.map(option => {
            const isChecked = selectedValue === option.value;
            return `
                <div class="form-check form-check-inline">
                    <input type="radio" class="form-check-input"
                           name="${name}" value="${option.value}"
                           id="${name}_${option.value}"
                           ${isChecked ? 'checked' : ''}>
                    <label class="form-check-label" for="${name}_${option.value}">
                        ${option.label}
                    </label>
                </div>
            `;
        }).join('');
    },

    /**
     * Save anamnesa data
     */
    async save(state) {
        try {
            const data = {
                chiefComplaints: this.collectChiefComplaintsData(),
                gynSymptoms: this.collectGynecologicalSymptomsData(),
                menstrualHistory: this.collectMenstrualHistoryData(),
                gynecologicalHistory: this.collectGynecologicalHistoryData(),
                medicalHistory: this.collectGeneralMedicalHistoryData(),
                currentMedications: this.collectMedicationsData()
            };

            console.log('[AnamnesaGynSpecial] Saving data:', data);

            // In production, this would call the API
            // const response = await apiClient.saveAnamnesa(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[AnamnesaGynSpecial] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Chief Complaints data
     */
    collectChiefComplaintsData() {
        const complaints = [];
        document.querySelectorAll('[name="chief_complaints[]"]:checked').forEach(cb => {
            complaints.push(cb.value);
        });

        return {
            complaints: complaints,
            details: document.querySelector('[name="chief_complaint_details"]')?.value || ''
        };
    },

    /**
     * Collect Gynecological Symptoms data
     */
    collectGynecologicalSymptomsData() {
        const dischargeColor = [];
        document.querySelectorAll('[name="discharge_color[]"]:checked').forEach(cb => {
            dischargeColor.push(cb.value);
        });

        const dischargeCharacteristics = [];
        document.querySelectorAll('[name="discharge_characteristics[]"]:checked').forEach(cb => {
            dischargeCharacteristics.push(cb.value);
        });

        const bleedingPattern = [];
        document.querySelectorAll('[name="bleeding_pattern[]"]:checked').forEach(cb => {
            bleedingPattern.push(cb.value);
        });

        const painLocation = [];
        document.querySelectorAll('[name="pain_location[]"]:checked').forEach(cb => {
            painLocation.push(cb.value);
        });

        const painCharacteristics = [];
        document.querySelectorAll('[name="pain_characteristics[]"]:checked').forEach(cb => {
            painCharacteristics.push(cb.value);
        });

        const painTiming = [];
        document.querySelectorAll('[name="pain_timing[]"]:checked').forEach(cb => {
            painTiming.push(cb.value);
        });

        const massSymptoms = [];
        document.querySelectorAll('[name="mass_symptoms[]"]:checked').forEach(cb => {
            massSymptoms.push(cb.value);
        });

        return {
            dischargeFrequency: document.querySelector('[name="discharge_frequency"]:checked')?.value || '',
            dischargeColor: dischargeColor,
            dischargeCharacteristics: dischargeCharacteristics,
            dischargeNotes: document.querySelector('[name="discharge_notes"]')?.value || '',
            bleedingPattern: bleedingPattern,
            bleedingDuration: document.querySelector('[name="bleeding_duration"]')?.value || '',
            bleedingAmount: document.querySelector('[name="bleeding_amount"]:checked')?.value || '',
            bleedingNotes: document.querySelector('[name="bleeding_notes"]')?.value || '',
            painLocation: painLocation,
            painCharacteristics: painCharacteristics,
            painScale: document.querySelector('[name="pain_scale"]')?.value || '',
            painTiming: painTiming,
            painNotes: document.querySelector('[name="pain_notes"]')?.value || '',
            hasMass: document.querySelector('[name="has_mass"]')?.checked || false,
            massLocation: document.querySelector('[name="mass_location"]')?.value || '',
            massDuration: document.querySelector('[name="mass_duration"]')?.value || '',
            massGrowth: document.querySelector('[name="mass_growth"]:checked')?.value || '',
            massSymptoms: massSymptoms
        };
    },

    /**
     * Collect Menstrual History data
     */
    collectMenstrualHistoryData() {
        return {
            menarcheAge: document.querySelector('[name="menarche_age"]')?.value || '',
            cycleLength: document.querySelector('[name="cycle_length"]')?.value || '',
            periodDuration: document.querySelector('[name="period_duration"]')?.value || '',
            cycleRegularity: document.querySelector('[name="cycle_regularity"]:checked')?.value || '',
            lmpDate: document.querySelector('[name="lmp_date"]')?.value || '',
            isMenopausal: document.querySelector('[name="is_menopausal"]')?.checked || false,
            menopauseAge: document.querySelector('[name="menopause_age"]')?.value || ''
        };
    },

    /**
     * Collect Gynecological History data
     */
    collectGynecologicalHistoryData() {
        const previousSurgeries = [];
        document.querySelectorAll('[name="previous_surgeries[]"]:checked').forEach(cb => {
            previousSurgeries.push(cb.value);
        });

        return {
            papSmearDone: document.querySelector('[name="pap_smear_done"]:checked')?.value || '',
            papSmearLastDate: document.querySelector('[name="pap_smear_last_date"]')?.value || '',
            papSmearResult: document.querySelector('[name="pap_smear_result"]:checked')?.value || '',
            papSmearDetails: document.querySelector('[name="pap_smear_details"]')?.value || '',
            hasGynSurgery: document.querySelector('[name="has_gyn_surgery"]')?.checked || false,
            previousSurgeries: previousSurgeries,
            surgeryDetails: document.querySelector('[name="surgery_details"]')?.value || '',
            maritalStatus: document.querySelector('[name="marital_status"]:checked')?.value || '',
            sexuallyActiveHistory: document.querySelector('[name="sexually_active_history"]:checked')?.value || '',
            dyspareunia: document.querySelector('[name="dyspareunia"]:checked')?.value || '',
            postcoitalBleeding: document.querySelector('[name="postcoital_bleeding"]')?.checked || false,
            sexualHealthNotes: document.querySelector('[name="sexual_health_notes"]')?.value || '',
            contraceptionUse: document.querySelector('[name="contraception_use"]:checked')?.value || '',
            contraceptionMethod: document.querySelector('[name="contraception_method"]:checked')?.value || '',
            contraceptionNotes: document.querySelector('[name="contraception_notes"]')?.value || ''
        };
    },

    /**
     * Collect General Medical History data
     */
    collectGeneralMedicalHistoryData() {
        const pastConditions = [];
        document.querySelectorAll('[name="past_conditions[]"]:checked').forEach(cb => {
            pastConditions.push(cb.value);
        });

        const familyHistory = [];
        document.querySelectorAll('[name="family_history[]"]:checked').forEach(cb => {
            familyHistory.push(cb.value);
        });

        return {
            bloodType: document.querySelector('[name="blood_type"]:checked')?.value || '',
            rhesus: document.querySelector('[name="rhesus"]:checked')?.value || '',
            allergies: document.querySelector('[name="allergies"]')?.value || '',
            pastConditions: pastConditions,
            pastConditionsDetail: document.querySelector('[name="past_conditions_detail"]')?.value || '',
            familyHistory: familyHistory,
            familyHistoryDetail: document.querySelector('[name="family_history_detail"]')?.value || ''
        };
    },

    /**
     * Collect Medications data
     */
    collectMedicationsData() {
        const medications = [];
        document.querySelectorAll('.medication-item').forEach(item => {
            const index = item.dataset.index;
            const name = document.querySelector(`[name="medications[${index}][name]"]`)?.value;
            const dose = document.querySelector(`[name="medications[${index}][dose]"]`)?.value;
            const frequency = document.querySelector(`[name="medications[${index}][frequency]"]`)?.value;

            if (name) {
                medications.push({ name, dose, frequency });
            }
        });

        return medications;
    }
};
