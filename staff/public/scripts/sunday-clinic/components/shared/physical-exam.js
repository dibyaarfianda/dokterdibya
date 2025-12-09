/**
 * Physical Examination Component (Shared)
 * Vital signs and physical examination findings
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Vital Signs
 * 2. Anthropometry (Height, Weight, BMI)
 * 3. General Appearance
 * 4. Physical Examination by System
 */

export default {
    /**
     * Render the Physical Examination form
     */
    async render(state) {
        const exam = state.recordData?.physical_exam || {};
        const intake = state.intakeData?.payload || {};
        const record = state.recordData || {};
        const category = record?.mrCategory || record?.mr_category || 'obstetri';

        // Use obstetri format for all categories (as per user request)
        // Pemeriksaan Fisik is the same across obstetri, gyn_repro, gyn_special
        return await this.renderObstetriFormat(state, exam);

        /* Disabled: Use new detailed format for other categories
        return `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-stethoscope"></i> Pemeriksaan Fisik
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Vital Signs Section -->
                    ${this.renderVitalSigns(exam, intake)}

                    <hr>

                    <!-- Anthropometry Section -->
                    ${this.renderAnthropometry(exam, intake)}

                    <hr>

                    <!-- General Appearance -->
                    ${this.renderGeneralAppearance(exam)}

                    <hr>

                    <!-- Physical Examination by System -->
                    ${this.renderSystemicExamination(exam)}
                </div>
            </div>

            <script>
                // Auto-calculate BMI
                window.calculateBMI = function() {
                    const height = parseFloat(document.querySelector('[name="height"]')?.value);
                    const weight = parseFloat(document.querySelector('[name="weight"]')?.value);

                    if (height && weight && height > 0) {
                        const heightInMeters = height / 100;
                        const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
                        document.querySelector('[name="bmi"]').value = bmi;

                        // Update BMI category
                        let category = '';
                        let categoryClass = '';
                        if (bmi < 18.5) {
                            category = 'Underweight';
                            categoryClass = 'text-warning';
                        } else if (bmi < 25) {
                            category = 'Normal';
                            categoryClass = 'text-success';
                        } else if (bmi < 30) {
                            category = 'Overweight';
                            categoryClass = 'text-warning';
                        } else {
                            category = 'Obese';
                            categoryClass = 'text-danger';
                        }

                        const categoryElement = document.getElementById('bmi-category');
                        if (categoryElement) {
                            categoryElement.textContent = category;
                            categoryElement.className = 'small ' + categoryClass;
                        }
                    }
                };

                // Attach listeners
                document.querySelector('[name="height"]')?.addEventListener('input', window.calculateBMI);
                document.querySelector('[name="weight"]')?.addEventListener('input', window.calculateBMI);

                // Calculate on load
                window.calculateBMI();
            </script>
        `;
    */
    },

    /**
     * Render old Obstetri format (simple) - EXACT copy from backup
     */
    async renderObstetriFormat(state, exam) {
        // Load saved physical exam data and metadata using getMedicalRecordContext
        const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'physical_exam');

        // Use saved data if available, otherwise use passed exam data
        const savedData = context?.data || exam || {};
        exam = savedData;

        // Get metadata for display
        const metaHtml = context ? renderRecordMeta(context, 'physical_exam') : '';
        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Pemeriksaan Fisik</h3>
                </div>
                ${metaHtml}
                <div class="sc-card">
                    <!-- Vital Signs in one row -->
                    <div class="row mb-3">
                        <div class="col-md-3">
                            <label class="font-weight-bold">Tekanan Darah</label>
                            <input type="text" class="form-control" id="pe-tekanan-darah"
                                   value="${escapeHtml(exam.tekanan_darah || '120/80')}"
                                   placeholder="120/80">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">Nadi</label>
                            <input type="text" class="form-control" id="pe-nadi"
                                   value="${escapeHtml(exam.nadi || '88')}"
                                   placeholder="88">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">Suhu</label>
                            <input type="text" class="form-control" id="pe-suhu"
                                   value="${escapeHtml(exam.suhu || '36.8')}"
                                   placeholder="36.8">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">Respirasi</label>
                            <input type="text" class="form-control" id="pe-respirasi"
                                   value="${escapeHtml(exam.respirasi || '18')}"
                                   placeholder="18">
                        </div>
                    </div>

                    <!-- Anthropometry (Height, Weight, BMI) -->
                    <div class="row mb-3">
                        <div class="col-md-3">
                            <label class="font-weight-bold">Tinggi Badan (cm)</label>
                            <input type="number" step="0.1" class="form-control" id="pe-tinggi-badan"
                                   value="${escapeHtml(exam.tinggi_badan || '')}"
                                   placeholder="160">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">Berat Badan (kg)</label>
                            <input type="number" step="0.1" class="form-control" id="pe-berat-badan"
                                   value="${escapeHtml(exam.berat_badan || '')}"
                                   placeholder="55">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">IMT (kg/m²)</label>
                            <input type="text" class="form-control" id="pe-imt" readonly
                                   value="${escapeHtml(exam.imt || '')}"
                                   placeholder="Auto">
                        </div>
                        <div class="col-md-3">
                            <label class="font-weight-bold">Kategori IMT</label>
                            <input type="text" class="form-control" id="pe-kategori-imt" readonly
                                   value="${escapeHtml(exam.kategori_imt || '')}"
                                   placeholder="Auto">
                        </div>
                    </div>

                    <!-- Examination Findings -->
                    <div class="mb-3">
                        <label class="font-weight-bold">Pemeriksaan Kepala & Leher</label>
                        <textarea class="form-control" id="pe-kepala-leher" rows="2">${escapeHtml(exam.kepala_leher || 'Anemia/Icterus/Cyanosis/Dyspneu (-)')}</textarea>
                    </div>
                    <div class="mb-3">
                        <label class="font-weight-bold">Pemeriksaan Thorax</label>
                        <textarea class="form-control" id="pe-thorax" rows="3">${escapeHtml(exam.thorax || 'Simetris. Vesiculer/vesicular. Rhonki/Wheezing (-)\nS1 S2 tunggal, murmur (-), gallop (-)')}</textarea>
                    </div>
                    <div class="mb-3">
                        <label class="font-weight-bold">Pemeriksaan Abdomen</label>
                        <textarea class="form-control" id="pe-abdomen" rows="3">${escapeHtml(exam.abdomen || 'BU (+) normal')}</textarea>
                    </div>
                    <div class="mb-3">
                        <label class="font-weight-bold">Pemeriksaan Ekstremitas</label>
                        <textarea class="form-control" id="pe-ekstremitas" rows="2">${escapeHtml(exam.ekstremitas || 'Akral hangat, kering. CRT < 2 detik')}</textarea>
                    </div>

                    <div class="text-right mt-3">
                        <button type="button" class="btn btn-primary" id="save-physical-exam" onclick="window.savePhysicalExam()">
                            <i class="fas fa-save mr-2"></i>Simpan Pemeriksaan Fisik
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Vital Signs section
     */
    renderVitalSigns(exam, intake) {
        const vitals = exam.vital_signs || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-heartbeat"></i> Tanda-Tanda Vital
                </h6>

                <div class="row">
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Tekanan Darah:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="systolic_bp"
                                       value="${vitals.systolic_bp || ''}"
                                       placeholder="Sistolik" min="0" max="300">
                                <div class="input-group-append input-group-prepend">
                                    <span class="input-group-text">/</span>
                                </div>
                                <input type="number" class="form-control" name="diastolic_bp"
                                       value="${vitals.diastolic_bp || ''}"
                                       placeholder="Diastolik" min="0" max="200">
                                <div class="input-group-append">
                                    <span class="input-group-text">mmHg</span>
                                </div>
                            </div>
                            <small class="text-muted">Normal: 120/80 mmHg</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Nadi:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="pulse_rate"
                                       value="${vitals.pulse_rate || ''}"
                                       placeholder="Denyut nadi" min="0" max="250">
                                <div class="input-group-append">
                                    <span class="input-group-text">bpm</span>
                                </div>
                            </div>
                            <small class="text-muted">Normal: 60-100 bpm</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Suhu Tubuh:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="temperature"
                                       value="${vitals.temperature || ''}"
                                       placeholder="Suhu" step="0.1" min="30" max="45">
                                <div class="input-group-append">
                                    <span class="input-group-text">°C</span>
                                </div>
                            </div>
                            <small class="text-muted">Normal: 36.5-37.5 °C</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Respirasi:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="respiratory_rate"
                                       value="${vitals.respiratory_rate || ''}"
                                       placeholder="Pernapasan" min="0" max="100">
                                <div class="input-group-append">
                                    <span class="input-group-text">x/min</span>
                                </div>
                            </div>
                            <small class="text-muted">Normal: 12-20 x/min</small>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Saturasi Oksigen (SpO2):</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="oxygen_saturation"
                                       value="${vitals.oxygen_saturation || ''}"
                                       placeholder="SpO2" min="0" max="100">
                                <div class="input-group-append">
                                    <span class="input-group-text">%</span>
                                </div>
                            </div>
                            <small class="text-muted">Normal: ≥ 95%</small>
                        </div>
                    </div>

                    <div class="col-md-9">
                        <div class="form-group">
                            <label>Catatan Tanda Vital:</label>
                            <textarea class="form-control" name="vital_signs_notes" rows="2"
                                      placeholder="Catatan tambahan tentang tanda vital...">${vitals.notes || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Anthropometry section
     */
    renderAnthropometry(exam, intake) {
        const anthro = exam.anthropometry || {};
        const height = anthro.height || intake.height || '';
        const weight = anthro.weight || intake.weight || '';
        const bmi = anthro.bmi || intake.metadata?.bmiValue || '';

        // Calculate BMI category
        let bmiCategory = '';
        let bmiCategoryClass = '';
        if (bmi) {
            const bmiNum = parseFloat(bmi);
            if (bmiNum < 18.5) {
                bmiCategory = 'Underweight';
                bmiCategoryClass = 'text-warning';
            } else if (bmiNum < 25) {
                bmiCategory = 'Normal';
                bmiCategoryClass = 'text-success';
            } else if (bmiNum < 30) {
                bmiCategory = 'Overweight';
                bmiCategoryClass = 'text-warning';
            } else {
                bmiCategory = 'Obese';
                bmiCategoryClass = 'text-danger';
            }
        }

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-ruler-combined"></i> Antropometri
                </h6>

                <div class="row">
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Tinggi Badan:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="height"
                                       value="${height}"
                                       placeholder="Tinggi" step="0.1" min="0" max="250">
                                <div class="input-group-append">
                                    <span class="input-group-text">cm</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Berat Badan:</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="weight"
                                       value="${weight}"
                                       placeholder="Berat" step="0.1" min="0" max="300">
                                <div class="input-group-append">
                                    <span class="input-group-text">kg</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>BMI (Body Mass Index):</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="bmi"
                                       value="${bmi}"
                                       placeholder="Auto" step="0.1" readonly>
                                <div class="input-group-append">
                                    <span class="input-group-text">kg/m²</span>
                                </div>
                            </div>
                            <small id="bmi-category" class="${bmiCategoryClass}">${bmiCategory}</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Lingkar Perut (jika relevan):</label>
                            <div class="input-group">
                                <input type="number" class="form-control" name="waist_circumference"
                                       value="${anthro.waist_circumference || ''}"
                                       placeholder="LP" step="0.1">
                                <div class="input-group-append">
                                    <span class="input-group-text">cm</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <small class="text-muted">
                            <strong>Klasifikasi BMI:</strong>
                            &lt; 18.5 (Underweight),
                            18.5-24.9 (Normal),
                            25-29.9 (Overweight),
                            ≥ 30 (Obese)
                        </small>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render General Appearance section
     */
    renderGeneralAppearance(exam) {
        const general = exam.general_appearance || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-eye"></i> Keadaan Umum
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Kesadaran:</label>
                            <select class="form-control" name="consciousness">
                                <option value="">-- Pilih --</option>
                                <option value="compos_mentis" ${general.consciousness === 'compos_mentis' ? 'selected' : ''}>
                                    Compos Mentis (Sadar penuh)
                                </option>
                                <option value="apatis" ${general.consciousness === 'apatis' ? 'selected' : ''}>
                                    Apatis
                                </option>
                                <option value="somnolen" ${general.consciousness === 'somnolen' ? 'selected' : ''}>
                                    Somnolen (Mengantuk)
                                </option>
                                <option value="sopor" ${general.consciousness === 'sopor' ? 'selected' : ''}>
                                    Sopor
                                </option>
                                <option value="coma" ${general.consciousness === 'coma' ? 'selected' : ''}>
                                    Coma
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Keadaan Umum:</label>
                            <select class="form-control" name="general_condition">
                                <option value="">-- Pilih --</option>
                                <option value="baik" ${general.general_condition === 'baik' ? 'selected' : ''}>
                                    Baik
                                </option>
                                <option value="sedang" ${general.general_condition === 'sedang' ? 'selected' : ''}>
                                    Sedang
                                </option>
                                <option value="lemah" ${general.general_condition === 'lemah' ? 'selected' : ''}>
                                    Lemah
                                </option>
                                <option value="buruk" ${general.general_condition === 'buruk' ? 'selected' : ''}>
                                    Buruk
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Gizi:</label>
                            <select class="form-control" name="nutrition_status">
                                <option value="">-- Pilih --</option>
                                <option value="baik" ${general.nutrition_status === 'baik' ? 'selected' : ''}>
                                    Baik
                                </option>
                                <option value="kurang" ${general.nutrition_status === 'kurang' ? 'selected' : ''}>
                                    Kurang
                                </option>
                                <option value="buruk" ${general.nutrition_status === 'buruk' ? 'selected' : ''}>
                                    Buruk
                                </option>
                                <option value="lebih" ${general.nutrition_status === 'lebih' ? 'selected' : ''}>
                                    Lebih
                                </option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="form-group">
                            <label>Catatan Keadaan Umum:</label>
                            <textarea class="form-control" name="general_appearance_notes" rows="2"
                                      placeholder="Penampilan umum, warna kulit, kelainan yang terlihat...">${general.notes || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Systemic Examination section
     */
    renderSystemicExamination(exam) {
        const systems = exam.systemic || {};

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-user-md"></i> Pemeriksaan Sistemik
                </h6>

                <!-- Head and Neck -->
                <div class="subsection mb-3">
                    <label class="font-weight-bold">Kepala & Leher:</label>
                    <div class="form-group">
                        <textarea class="form-control" name="head_neck" rows="2"
                                  placeholder="Konjungtiva anemis/tidak, sklera ikterik/tidak, pembesaran kelenjar getah bening, pembesaran tiroid...">${systems.head_neck || ''}</textarea>
                    </div>
                </div>

                <!-- Thorax (Cardiovascular & Respiratory) -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="subsection mb-3">
                            <label class="font-weight-bold">Thorax - Jantung (Cor):</label>
                            <div class="form-group">
                                <textarea class="form-control" name="cardiovascular" rows="2"
                                          placeholder="Bunyi jantung I/II regular, murmur (-), gallop (-)">${systems.cardiovascular || ''}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="subsection mb-3">
                            <label class="font-weight-bold">Thorax - Paru (Pulmo):</label>
                            <div class="form-group">
                                <textarea class="form-control" name="respiratory" rows="2"
                                          placeholder="Suara napas vesikuler, ronkhi (-), wheezing (-)">${systems.respiratory || ''}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Abdomen -->
                <div class="subsection mb-3">
                    <label class="font-weight-bold">Abdomen:</label>
                    <div class="form-group">
                        <textarea class="form-control" name="abdomen" rows="2"
                                  placeholder="Supel, nyeri tekan (-), bising usus (+) normal, hepar/lien tidak teraba membesar, massa (-)">${systems.abdomen || ''}</textarea>
                    </div>
                </div>

                <!-- Gynecological Examination -->
                <div class="subsection mb-3">
                    <label class="font-weight-bold">Pemeriksaan Ginekologi:</label>
                    <div class="form-group">
                        <textarea class="form-control" name="gynecological" rows="3"
                                  placeholder="Inspekulo: Portio licin/erosi, flour (-), fluksus (-), polip (-)&#10;VT (Vaginal Toucher): Portio teraba lunak/kenyal, Cavum Douglas tidak menonjol, Adneksa kanan/kiri tidak teraba massa, nyeri goyang portio (-)">${systems.gynecological || ''}</textarea>
                    </div>
                </div>

                <!-- Extremities -->
                <div class="subsection mb-3">
                    <label class="font-weight-bold">Ekstremitas:</label>
                    <div class="form-group">
                        <textarea class="form-control" name="extremities" rows="2"
                                  placeholder="Edema (-), sianosis (-), akral hangat, CRT < 2 detik">${systems.extremities || ''}</textarea>
                    </div>
                </div>

                <!-- Additional Findings -->
                <div class="subsection mb-3">
                    <label class="font-weight-bold">Temuan Tambahan / Catatan:</label>
                    <div class="form-group">
                        <textarea class="form-control" name="additional_findings" rows="3"
                                  placeholder="Temuan pemeriksaan fisik lainnya yang relevan...">${systems.additional_findings || ''}</textarea>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Save physical examination data
     */
    async save(state) {
        try {
            const data = {
                vital_signs: this.collectVitalSignsData(),
                anthropometry: this.collectAnthropometryData(),
                general_appearance: this.collectGeneralAppearanceData(),
                systemic: this.collectSystemicExaminationData()
            };

            console.log('[PhysicalExam] Saving data:', data);

            // In production, this would call the API
            // const response = await apiClient.savePhysicalExam(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[PhysicalExam] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Vital Signs data
     */
    collectVitalSignsData() {
        return {
            systolic_bp: document.querySelector('[name="systolic_bp"]')?.value || '',
            diastolic_bp: document.querySelector('[name="diastolic_bp"]')?.value || '',
            pulse_rate: document.querySelector('[name="pulse_rate"]')?.value || '',
            temperature: document.querySelector('[name="temperature"]')?.value || '',
            respiratory_rate: document.querySelector('[name="respiratory_rate"]')?.value || '',
            oxygen_saturation: document.querySelector('[name="oxygen_saturation"]')?.value || '',
            notes: document.querySelector('[name="vital_signs_notes"]')?.value || ''
        };
    },

    /**
     * Collect Anthropometry data
     */
    collectAnthropometryData() {
        return {
            height: document.querySelector('[name="height"]')?.value || '',
            weight: document.querySelector('[name="weight"]')?.value || '',
            bmi: document.querySelector('[name="bmi"]')?.value || '',
            waist_circumference: document.querySelector('[name="waist_circumference"]')?.value || ''
        };
    },

    /**
     * Collect General Appearance data
     */
    collectGeneralAppearanceData() {
        return {
            consciousness: document.querySelector('[name="consciousness"]')?.value || '',
            general_condition: document.querySelector('[name="general_condition"]')?.value || '',
            nutrition_status: document.querySelector('[name="nutrition_status"]')?.value || '',
            notes: document.querySelector('[name="general_appearance_notes"]')?.value || ''
        };
    },

    /**
     * Collect Systemic Examination data
     */
    collectSystemicExaminationData() {
        return {
            head_neck: document.querySelector('[name="head_neck"]')?.value || '',
            cardiovascular: document.querySelector('[name="cardiovascular"]')?.value || '',
            respiratory: document.querySelector('[name="respiratory"]')?.value || '',
            abdomen: document.querySelector('[name="abdomen"]')?.value || '',
            gynecological: document.querySelector('[name="gynecological"]')?.value || '',
            extremities: document.querySelector('[name="extremities"]')?.value || '',
            additional_findings: document.querySelector('[name="additional_findings"]')?.value || ''
        };
    },

    /**
     * After render hook - called after HTML is injected into DOM
     */
    afterRender() {
        // Setup BMI calculator for Obstetri format
        this.setupBMICalculator();
    },

    /**
     * Setup BMI auto-calculator
     */
    setupBMICalculator() {
        const tinggiEl = document.getElementById('pe-tinggi-badan');
        const beratEl = document.getElementById('pe-berat-badan');
        
        if (!tinggiEl || !beratEl) {
            return; // Not in Obstetri format
        }

        // Define calculator function
        const calculateBMI = () => {
            const imtEl = document.getElementById('pe-imt');
            const kategoriEl = document.getElementById('pe-kategori-imt');
            
            if (!imtEl || !kategoriEl) return;

            const tinggi = parseFloat(tinggiEl.value);
            const berat = parseFloat(beratEl.value);

            if (tinggi && berat && tinggi > 0) {
                const tinggiMeter = tinggi / 100;
                const imt = (berat / (tinggiMeter * tinggiMeter)).toFixed(1);
                
                imtEl.value = imt;

                // Kategorikan IMT
                let kategori = '';
                const imtNum = parseFloat(imt);
                
                if (imtNum < 17.0) {
                    kategori = 'Kurang Energi Kronis';
                } else if (imtNum >= 17.0 && imtNum < 18.5) {
                    kategori = 'Kurang Energi Kronis';
                } else if (imtNum >= 18.5 && imtNum < 25.0) {
                    kategori = 'Normal';
                } else if (imtNum >= 25.0 && imtNum < 30.0) {
                    kategori = 'Kelebihan Berat Badan';
                } else if (imtNum >= 30.0 && imtNum < 35.0) {
                    kategori = 'Obesitas Grade 1';
                } else if (imtNum >= 35.0 && imtNum < 40.0) {
                    kategori = 'Obesitas Grade 2';
                } else {
                    kategori = 'Obesitas Grade 3';
                }

                kategoriEl.value = kategori;
            } else {
                imtEl.value = '';
                kategoriEl.value = '';
            }
        };

        // Attach event listeners
        tinggiEl.addEventListener('input', calculateBMI);
        tinggiEl.addEventListener('change', calculateBMI);
        beratEl.addEventListener('input', calculateBMI);
        beratEl.addEventListener('change', calculateBMI);
        
        // Calculate immediately if values exist
        calculateBMI();
    }
};
