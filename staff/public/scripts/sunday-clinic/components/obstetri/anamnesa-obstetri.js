/**
 * Anamnesa Component for Obstetri Patients
 * Focus: Pregnancy history, obstetric totals, risk factors
 */

export default {
    /**
     * Render Anamnesa form for Obstetri
     */
    async render(state) {
        const record = state.recordData?.record || {};
        const category = record.mr_category || 'obstetri';

        // Use old simple format for obstetri category
        if (category === 'obstetri') {
            return this.renderObstetriFormat(state);
        }

        // Use new detailed format for other categories (if ever used)
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
     * Render old Obstetri format (simple)
     */
    async renderObstetriFormat(state) {
        const anamnesa = state.recordData?.anamnesa || {};
        const intake = state.intakeData?.payload || {};
        const derived = state.derived || {};

        // Get metadata context for display
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'anamnesa');
            if (context) {
                metaHtml = renderRecordMeta(context, 'anamnesa');
            }
        } catch (error) {
            console.error('[Anamnesa] Failed to load metadata:', error);
        }

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // Get saved datetime
        const recordDatetime = anamnesa.record_datetime || '';

        // Get saved data or defaults from derived state
        const keluhanUtama = anamnesa.keluhan_utama ?? intake.chief_complaint ?? intake.keluhan_utama ?? '';
        const riwayatKehamilan = anamnesa.riwayat_kehamilan_saat_ini ?? '';
        const hpht = anamnesa.hpht ?? derived.pregnancyDetails?.lmp ?? '';
        const hpl = anamnesa.hpl ?? derived.pregnancyDetails?.edd ?? '';
        const usiaKehamilan = anamnesa.usia_kehamilan ?? '';
        const detailRiwayat = anamnesa.detail_riwayat_penyakit ?? '';
        const riwayatKeluarga = anamnesa.riwayat_keluarga ?? '';
        const alergiObat = anamnesa.alergi_obat ?? derived.allergies?.medications ?? '';
        const alergiMakanan = anamnesa.alergi_makanan ?? derived.allergies?.food ?? '';
        const alergiLingkungan = anamnesa.alergi_lingkungan ?? derived.allergies?.environmental ?? '';
        const gravida = anamnesa.gravida ?? derived.obstetricHistory?.gravida ?? '';
        const para = anamnesa.para ?? derived.obstetricHistory?.para ?? '';
        const abortus = anamnesa.abortus ?? derived.obstetricHistory?.abortus ?? '';
        const anakHidup = anamnesa.anak_hidup ?? derived.obstetricHistory?.living ?? '';
        const usiaMenarche = anamnesa.usia_menarche ?? '';
        const lamaSiklus = anamnesa.lama_siklus ?? '';
        const siklusTeratur = anamnesa.siklus_teratur ?? '';
        const metodeKbTerakhir = anamnesa.metode_kb_terakhir ?? '';
        const kegagalanKb = anamnesa.kegagalan_kb ?? '';
        const jenisKbGagal = anamnesa.jenis_kb_gagal ?? '';

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Anamnesa & Riwayat</h3>
                    <button class="btn btn-primary btn-sm" id="btn-update-anamnesa" onclick="window.saveAnamnesa()">
                        <i class="fas fa-save"></i> Simpan
                    </button>
                </div>
                ${metaHtml}
                <div class="form-group mb-3" style="max-width: 300px;">
                    <label class="font-weight-bold text-primary">
                        <i class="fas fa-clock mr-1"></i>Tanggal & Jam Pemeriksaan <span class="text-danger">*</span>
                    </label>
                    <input type="datetime-local"
                           class="form-control"
                           id="anamnesa-datetime"
                           value="${escapeHtml(recordDatetime)}"
                           required>
                </div>
                <div class="sc-grid two">
                    <div class="sc-card">
                        <h4>Keluhan & Kehamilan Saat Ini</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Keluhan Utama</label>
                            <textarea class="form-control anamnesa-field" id="anamnesa-keluhan-utama" rows="2">${escapeHtml(keluhanUtama)}</textarea>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Riwayat Kehamilan Saat Ini</label>
                            <textarea class="form-control anamnesa-field" id="anamnesa-riwayat-kehamilan" rows="3">${escapeHtml(riwayatKehamilan)}</textarea>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">HPHT (Hari Pertama Haid Terakhir)</label>
                                    <input type="date" class="form-control anamnesa-field" id="anamnesa-hpht" value="${escapeHtml(hpht)}">
                                    <small class="text-muted">Isi salah satu, yang lain auto-calculate</small>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">HPL (Hari Perkiraan Lahir)</label>
                                    <input type="date" class="form-control anamnesa-field" id="anamnesa-hpl" value="${escapeHtml(hpl)}">
                                    <small class="text-muted">Isi salah satu, yang lain auto-calculate</small>
                                </div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Perkiraan Usia Kehamilan Saat Ini</label>
                            <input type="text" class="form-control" id="anamnesa-usia-kehamilan-display" value="${escapeHtml(usiaKehamilan)}" readonly style="background-color: #f8f9fa; cursor: not-allowed;" placeholder="Otomatis dari HPHT">
                        </div>

                        <h4>Riwayat Penyakit</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Detail Riwayat Penyakit</label>
                            <textarea class="form-control anamnesa-field" id="anamnesa-detail-riwayat" rows="3">${escapeHtml(detailRiwayat)}</textarea>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Riwayat Keluarga</label>
                            <textarea class="form-control anamnesa-field" id="anamnesa-riwayat-keluarga" rows="2">${escapeHtml(riwayatKeluarga)}</textarea>
                        </div>
                    </div>

                    <div class="sc-card">
                        <h4>Alergi</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Alergi Obat</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-alergi-obat" value="${escapeHtml(alergiObat)}">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Alergi Makanan</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-alergi-makanan" value="${escapeHtml(alergiMakanan)}">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Alergi Lingkungan</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-alergi-lingkungan" value="${escapeHtml(alergiLingkungan)}">
                        </div>

                        <h4>Riwayat Obstetri</h4>
                        <div class="row">
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Gravida</label>
                                    <input type="number" class="form-control anamnesa-field" id="anamnesa-gravida" value="${escapeHtml(gravida)}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Para</label>
                                    <input type="number" class="form-control anamnesa-field" id="anamnesa-para" value="${escapeHtml(para)}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Abortus</label>
                                    <input type="number" class="form-control anamnesa-field" id="anamnesa-abortus" value="${escapeHtml(abortus)}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Anak Hidup</label>
                                    <input type="number" class="form-control anamnesa-field" id="anamnesa-anak-hidup" value="${escapeHtml(anakHidup)}">
                                </div>
                            </div>
                        </div>

                        <h4>Riwayat Menstruasi</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Usia Menarche</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-usia-menarche" value="${escapeHtml(usiaMenarche)}" placeholder="Contoh: 12 tahun">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Lama Siklus Haid</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-lama-siklus" value="${escapeHtml(lamaSiklus)}" placeholder="Contoh: 28 hari">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Siklus Teratur?</label>
                            <select class="form-control anamnesa-field" id="anamnesa-siklus-teratur">
                                <option value="">-- Pilih --</option>
                                <option value="Ya" ${siklusTeratur === 'Ya' ? 'selected' : ''}>Ya</option>
                                <option value="Tidak" ${siklusTeratur === 'Tidak' ? 'selected' : ''}>Tidak</option>
                            </select>
                        </div>

                        <h4>Riwayat KB</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Metode KB Terakhir</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-metode-kb" value="${escapeHtml(metodeKbTerakhir)}">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Pernah gagal KB?</label>
                            <select class="form-control anamnesa-field" id="anamnesa-kegagalan-kb">
                                <option value="">-- Pilih --</option>
                                <option value="Ya" ${kegagalanKb === 'Ya' ? 'selected' : ''}>Ya</option>
                                <option value="Tidak" ${kegagalanKb === 'Tidak' ? 'selected' : ''}>Tidak</option>
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Jenis KB saat gagal</label>
                            <input type="text" class="form-control anamnesa-field" id="anamnesa-jenis-kb-gagal" value="${escapeHtml(jenisKbGagal)}">
                        </div>
                </div>
            </div>


        `;
    },

    /**
     * Called after component is rendered
     */
    async afterRender(state) {
        // Cleanup old listeners first
        this.cleanup();
        
        // Setup HPHT calculator
        setTimeout(() => {
            this.setupHPHTCalculator();
            this.setupSaveHandler();
        }, 100);
    },

    /**
     * Cleanup event listeners
     */
    cleanup() {
        // Remove old listeners by replacing elements or using AbortController
        // Store references for cleanup
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();
    },

    /**
     * Setup bi-directional HPHT <-> HPL calculator
     */
    setupHPHTCalculator() {
        const hphtInput = document.getElementById('anamnesa-hpht');
        const hplInput = document.getElementById('anamnesa-hpl');
        const usiaKehamilanDisplay = document.getElementById('anamnesa-usia-kehamilan-display');

        if (!hphtInput || !hplInput) return;

        // Flag to prevent infinite loop
        let isCalculating = false;

        const signal = this._abortController.signal;

        // HPHT → HPL calculation
        const updateFromHPHT = () => {
            if (isCalculating) return;
            isCalculating = true;

            const edd = this.calculateEDD(hphtInput.value);
            const ga = this.calculateGestationalAge(hphtInput.value);

            if (edd) {
                hplInput.value = this.formatDate(edd);
            }

            if (ga && usiaKehamilanDisplay) {
                usiaKehamilanDisplay.value = `${ga.weeks} minggu ${ga.days} hari`;
            } else if (usiaKehamilanDisplay) {
                usiaKehamilanDisplay.value = '';
            }

            isCalculating = false;
        };

        // HPL → HPHT calculation (reverse)
        const updateFromHPL = () => {
            if (isCalculating) return;
            isCalculating = true;

            const lmp = this.calculateLMP(hplInput.value);
            const ga = lmp ? this.calculateGestationalAge(this.formatDate(lmp)) : null;

            if (lmp) {
                hphtInput.value = this.formatDate(lmp);
            }

            if (ga && usiaKehamilanDisplay) {
                usiaKehamilanDisplay.value = `${ga.weeks} minggu ${ga.days} hari`;
            } else if (usiaKehamilanDisplay) {
                usiaKehamilanDisplay.value = '';
            }

            isCalculating = false;
        };

        // Calculate on load if HPHT has value
        if (hphtInput.value && !hplInput.value) {
            updateFromHPHT();
        } else if (hplInput.value && !hphtInput.value) {
            updateFromHPL();
        }

        // HPHT change listeners
        hphtInput.addEventListener('change', () => {
            updateFromHPHT();
            const updateBtn = document.getElementById('btn-update-anamnesa');
            if (updateBtn) updateBtn.style.display = 'inline-block';
        }, { signal });

        hphtInput.addEventListener('input', () => {
            if (hphtInput.value && hphtInput.value.length === 10) {
                updateFromHPHT();
            }
        }, { signal });

        // HPL change listeners
        hplInput.addEventListener('change', () => {
            updateFromHPL();
            const updateBtn = document.getElementById('btn-update-anamnesa');
            if (updateBtn) updateBtn.style.display = 'inline-block';
        }, { signal });

        hplInput.addEventListener('input', () => {
            if (hplInput.value && hplInput.value.length === 10) {
                updateFromHPL();
            }
        }, { signal });
    },

    /**
     * Calculate LMP (HPHT) from EDD (HPL) - reverse of Naegele's Rule
     */
    calculateLMP(eddDate) {
        if (!eddDate) return null;
        const edd = new Date(eddDate);
        if (isNaN(edd.getTime())) return null;

        // Reverse Naegele's Rule: EDD - 280 days
        const lmp = new Date(edd);
        lmp.setDate(lmp.getDate() - 280);

        return lmp;
    },

    /**
     * Calculate EDD (HPL) from LMP (HPHT) using Naegele's Rule
     */
    calculateEDD(lmpDate) {
        if (!lmpDate) return null;
        const lmp = new Date(lmpDate);
        if (isNaN(lmp.getTime())) return null;

        // Naegele's Rule: LMP + 280 days (40 weeks)
        const edd = new Date(lmp);
        edd.setDate(edd.getDate() + 280);

        return edd;
    },

    /**
     * Calculate gestational age from LMP
     */
    calculateGestationalAge(lmpDate) {
        if (!lmpDate) return null;

        // Parse as local date to avoid timezone issues (GMT+7)
        let lmp;
        if (typeof lmpDate === 'string' && lmpDate.includes('-')) {
            const [year, month, day] = lmpDate.split('-').map(Number);
            lmp = new Date(year, month - 1, day);  // Local midnight
        } else {
            lmp = new Date(lmpDate);
        }
        if (isNaN(lmp.getTime())) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);  // Set to local midnight for accurate day count
        lmp.setHours(0, 0, 0, 0);

        const diffTime = today - lmp;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return null;

        const weeks = Math.floor(diffDays / 7);
        const days = diffDays % 7;

        return { weeks, days, totalDays: diffDays };
    },

    /**
     * Format date to YYYY-MM-DD
     */
    formatDate(date) {
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Format date to European format (DD/MM/YYYY)
     */
    formatDateIndo(date) {
        if (!date) return '';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    },

    /**
     * Setup save button handler
     */
    setupSaveHandler() {
        const fields = document.querySelectorAll('.anamnesa-field');
        const updateBtn = document.getElementById('btn-update-anamnesa');
        const signal = this._abortController.signal;

        if (fields && updateBtn) {
            fields.forEach(field => {
                field.addEventListener('input', () => {
                    updateBtn.style.display = 'inline-block';
                }, { signal });
            });

            // NOTE: Button already has onclick="window.saveAnamnesa()" in HTML
            // No need to add addEventListener here to prevent double save
        }
    },

    /**
     * Chief Complaint
     */
    renderChiefComplaint(intake) {
        return `
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-stethoscope"></i> KELUHAN UTAMA
            </h6>
            <div class="form-group">
                <label class="font-weight-semibold">Keluhan saat ini</label>
                <textarea class="form-control" name="chief_complaint" rows="3"
                          placeholder="Keluhan yang dirasakan pasien...">${intake.chief_complaint || intake.keluhan_utama || ''}</textarea>
            </div>
            <hr class="my-4">
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
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-baby"></i> KEHAMILAN SAAT INI
            </h6>

            <!-- LMP, EDD, and GA in one clean row -->
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="font-weight-bold">
                            <i class="fas fa-calendar-alt text-danger"></i> HPHT (Tanggal Haid Terakhir)
                        </label>
                        <input type="date" class="form-control form-control-lg"
                               id="lmp_date" name="lmp_date" value="${lmp || ''}"
                               style="border: 2px solid #007bff;">
                        <small class="form-text text-muted">Pilih tanggal untuk menghitung HPL dan usia kehamilan</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="font-weight-bold">
                            <i class="fas fa-calendar-check text-success"></i> HPL (Hari Perkiraan Lahir)
                        </label>
                        <input type="text" class="form-control form-control-lg bg-light"
                               id="edd_date" name="edd_date" value="${eddValue || ''}" readonly
                               placeholder="Otomatis dari HPHT"
                               style="border: 2px solid #28a745; font-weight: bold;">
                        <small class="form-text text-success">
                            <i class="fas fa-info-circle"></i> Dihitung otomatis: HPHT + 280 hari
                        </small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="font-weight-bold">
                            <i class="fas fa-hourglass-half text-info"></i> Usia Kehamilan (GA)
                        </label>
                        <div class="input-group input-group-lg">
                            <input type="text" class="form-control bg-light text-center"
                                   id="ga_weeks" name="ga_weeks"
                                   value="${ga?.weeks || ''}" placeholder="--" readonly
                                   style="border: 2px solid #17a2b8; font-weight: bold; font-size: 1.5rem;">
                            <div class="input-group-append input-group-prepend">
                                <span class="input-group-text bg-info text-white">minggu</span>
                            </div>
                            <input type="text" class="form-control bg-light text-center"
                                   id="ga_days" name="ga_days"
                                   value="${ga?.days || ''}" placeholder="--" readonly
                                   style="border: 2px solid #17a2b8; font-weight: bold; font-size: 1.5rem;">
                            <div class="input-group-append">
                                <span class="input-group-text bg-info text-white">hari</span>
                            </div>
                        </div>
                        <small class="form-text text-info">
                            <i class="fas fa-info-circle"></i> Dihitung otomatis dari HPHT
                        </small>
                    </div>
                </div>
            </div>

            <!-- Physical measurements -->
            <div class="row mt-3">
                <div class="col-md-3">
                    <div class="form-group">
                        <label>Tinggi Badan</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="height" name="height"
                                   value="${intake.height || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">cm</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label>Berat Badan Sekarang</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="current_weight" name="current_weight"
                                   value="${intake.current_weight || intake.weight || ''}" step="0.1" placeholder="0.0">
                            <div class="input-group-append">
                                <span class="input-group-text">kg</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="form-group">
                        <label>BB Sebelum Hamil</label>
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
                        <label>BMI</label>
                        <div class="input-group">
                            <input type="number" class="form-control bg-light" name="bmi"
                                   value="${metadata.bmiValue || intake.bmi || ''}" step="0.1" readonly>
                            <div class="input-group-append">
                                <button class="btn btn-outline-primary" type="button" onclick="calculateBMI()">
                                    <i class="fas fa-calculator"></i> Hitung
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ANC visits -->
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Jumlah Kunjungan ANC</label>
                        <input type="number" class="form-control" name="anc_visits"
                               value="${intake.anc_visits || intake.anc_visit_count || ''}"
                               placeholder="Berapa kali kontrol">
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Kunjungan ANC Terakhir</label>
                        <input type="date" class="form-control" name="last_anc_date"
                               value="${intake.last_anc_date || ''}">
                    </div>
                </div>
            </div>

            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input class="custom-control-input" type="checkbox" id="prenatal_vitamins" name="prenatal_vitamins"
                           ${intake.prenatal_vitamins || intake.taking_vitamins ? 'checked' : ''}>
                    <label class="custom-control-label" for="prenatal_vitamins">
                        <i class="fas fa-pills text-success"></i> Mengonsumsi vitamin prenatal
                    </label>
                </div>
            </div>
            <hr class="my-4">
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
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-history"></i> RIWAYAT OBSTETRI
            </h6>
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
            <hr class="my-4">
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
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-exclamation-triangle"></i> FAKTOR RISIKO
            </h6>

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
            <hr class="my-4">
        `;
    },

    /**
     * General Medical History
     */
    renderGeneralMedicalHistory(intake) {
        const pastConditions = intake.past_conditions || [];
        const familyHistory = intake.family_history || [];

        return `
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-notes-medical"></i> RIWAYAT MEDIS UMUM
            </h6>

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
            <hr class="my-4">
        `;
    },

    /**
     * Current Medications
     */
    renderCurrentMedications(intake) {
        const medications = intake.medications || [];

        return `
            <h6 class="font-weight-bold text-primary mt-4 mb-3">
                <i class="fas fa-pills"></i> OBAT YANG SEDANG DIKONSUMSI
            </h6>
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
     * Collect data - handles both old and new formats
     */
    async collectData() {
        // Check if we're using old format (simple textareas)
        const keluhanUtama = document.querySelector('[name="keluhan_utama"]');

        if (keluhanUtama) {
            // Old format
            return {
                keluhan_utama: keluhanUtama.value || '',
                riwayat_penyakit_sekarang: document.querySelector('[name="riwayat_penyakit_sekarang"]')?.value || '',
                riwayat_penyakit_dahulu: document.querySelector('[name="riwayat_penyakit_dahulu"]')?.value || '',
                riwayat_obstetri: document.querySelector('[name="riwayat_obstetri"]')?.value || '',
                riwayat_kehamilan: document.querySelector('[name="riwayat_kehamilan"]')?.value || '',
                riwayat_alergi: document.querySelector('[name="riwayat_alergi"]')?.value || ''
            };
        } else {
            // New format
            const formData = {
                chiefComplaint: document.querySelector('[name="chief_complaint"]')?.value,
                pregnancy: this.collectPregnancyData(),
                obstetricHistory: this.collectObstetricHistory(),
                riskFactors: this.collectRiskFactors(),
                generalMedical: this.collectGeneralMedicalData(),
                medications: this.collectMedications()
            };
            return formData;
        }
    },

    /**
     * Validate form data
     */
    async validate() {
        // Anamnesa is optional, no strict validation needed for old format
        return { valid: true, errors: [] };
    },

    /**
     * Save Anamnesa data
     */
    async save(state) {
        try {
            const formData = await this.collectData();
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
            window.showToast('warning', 'Masukkan tinggi dan berat badan untuk menghitung BMI');
        }
    };

    // Calculate EDD and GA from LMP - with Indonesian date formatting
    const lmpInput = document.querySelector('#lmp_date');
    const eddInput = document.querySelector('#edd_date');
    const gaWeeksInput = document.querySelector('#ga_weeks');
    const gaDaysInput = document.querySelector('#ga_days');

    if (lmpInput) {
        // Function to format date in Indonesian style
        function formatIndonesianDate(date) {
            const months = [
                'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
            ];
            const day = date.getDate();
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            return `${day} ${month} ${year}`;
        }

        // Calculate EDD and GA when LMP changes
        lmpInput.addEventListener('change', function(e) {
            const lmpValue = e.target.value;
            if (!lmpValue) {
                // Clear fields if LMP is cleared
                eddInput.value = '';
                gaWeeksInput.value = '';
                gaDaysInput.value = '';
                return;
            }

            const lmpDate = new Date(lmpValue);
            if (isNaN(lmpDate.getTime())) {
                window.showToast('error', 'Tanggal HPHT tidak valid');
                return;
            }

            // Calculate EDD using Naegele's Rule: LMP + 280 days (40 weeks)
            const eddDate = new Date(lmpDate);
            eddDate.setDate(eddDate.getDate() + 280);

            // Format EDD in Indonesian style
            eddInput.value = formatIndonesianDate(eddDate);

            // Calculate current GA (Gestational Age)
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time for accurate day calculation

            const diffMs = today - lmpDate;
            if (diffMs < 0) {
                // LMP is in the future
                gaWeeksInput.value = '0';
                gaDaysInput.value = '0';
                window.showToast('warning', 'Perhatian: HPHT yang dipilih adalah tanggal yang akan datang.');
            } else {
                const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                const weeks = Math.floor(totalDays / 7);
                const days = totalDays % 7;

                gaWeeksInput.value = weeks;
                gaDaysInput.value = days;

                // Visual feedback for different trimesters
                if (weeks < 13) {
                    gaWeeksInput.style.color = '#17a2b8'; // Info blue for 1st trimester
                } else if (weeks < 27) {
                    gaWeeksInput.style.color = '#28a745'; // Green for 2nd trimester
                } else if (weeks < 42) {
                    gaWeeksInput.style.color = '#ffc107'; // Yellow for 3rd trimester
                } else {
                    gaWeeksInput.style.color = '#dc3545'; // Red for post-term
                }
            }
        });

        // Trigger calculation on page load if LMP already has a value
        if (lmpInput.value) {
            lmpInput.dispatchEvent(new Event('change'));
        }
    }

    // Dynamic list handlers
    window.addPreviousPregnancy = function() {
        // TODO: Add new pregnancy entry
        window.showToast('info', 'Fitur akan segera tersedia');
    };

    window.removePreviousPregnancy = function(index) {
        // TODO: Remove pregnancy entry
        window.showToast('info', 'Fitur akan segera tersedia');
    };

    window.addMedication = function() {
        // TODO: Add new medication entry
        window.showToast('info', 'Fitur akan segera tersedia');
    };

    window.removeMedication = function(index) {
        // TODO: Remove medication entry
        window.showToast('info', 'Fitur akan segera tersedia');
    };
});
