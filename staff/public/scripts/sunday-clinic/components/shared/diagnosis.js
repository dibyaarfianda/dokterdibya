/**
 * Diagnosis Component (Shared)
 * Primary and secondary diagnoses with ICD-10 support
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Primary Diagnosis
 * 2. Secondary/Differential Diagnoses
 * 3. Clinical Summary
 */

export default {
    /**
     * Render the Diagnosis form
     */
    async render(state) {
        const diagnosis = state.recordData?.diagnosis || {};
        const diagnoses = diagnosis.diagnoses || [];
        const record = state.recordData?.record || {};
        const category = record?.mr_category || 'obstetri';

        // Use old simple format for obstetri category
        if (category === 'obstetri') {
            return this.renderObstetriFormat(diagnosis, state);
        }

        // Use new detailed format for other categories
        return `
            <div class="card mb-3">
                <div class="card-header bg-warning text-dark">
                    <h5 class="mb-0">
                        <i class="fas fa-diagnoses"></i> Diagnosis
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Diagnoses List Section -->
                    ${this.renderDiagnosesList(diagnoses)}

                    <hr>

                    <!-- Clinical Summary -->
                    ${this.renderClinicalSummary(diagnosis)}
                </div>
            </div>

            <script>
                window.diagnosisCounter = ${diagnoses.length};

                // Add Diagnosis
                window.addDiagnosis = function() {
                    const index = window.diagnosisCounter++;
                    const isPrimary = index === 0; // First diagnosis is primary

                    const html = \`
                        <div class="diagnosis-item border rounded p-3 mb-3" data-index="\${index}">
                            <div class="row">
                                <div class="col-md-11">
                                    <div class="row">
                                        <div class="col-md-2">
                                            <div class="form-group">
                                                <label>Tipe:</label>
                                                <select class="form-control" name="diagnoses[\${index}][type]">
                                                    <option value="primary" \${isPrimary ? 'selected' : ''}>Primer</option>
                                                    <option value="secondary" \${!isPrimary ? 'selected' : ''}>Sekunder</option>
                                                    <option value="differential">Diferensial</option>
                                                    <option value="rule_out">Rule Out</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-10">
                                            <div class="form-group">
                                                <label>Diagnosis <span class="text-danger">*</span>:</label>
                                                <input type="text" class="form-control" name="diagnoses[\${index}][diagnosis]"
                                                       placeholder="Masukkan diagnosis (bahasa Indonesia atau Latin)"
                                                       required>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Kode ICD-10 (opsional):</label>
                                                <input type="text" class="form-control" name="diagnoses[\${index}][icd10_code]"
                                                       placeholder="Contoh: O26.8, N80.0">
                                                <small class="text-muted">
                                                    <a href="https://icd.who.int/browse10/2019/en" target="_blank">
                                                        <i class="fas fa-external-link-alt"></i> Cari ICD-10
                                                    </a>
                                                </small>
                                            </div>
                                        </div>
                                        <div class="col-md-8">
                                            <div class="form-group">
                                                <label>Catatan:</label>
                                                <input type="text" class="form-control" name="diagnoses[\${index}][notes]"
                                                       placeholder="Catatan tambahan tentang diagnosis ini">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-1 text-right">
                                    <button type="button" class="btn btn-danger btn-sm mt-4"
                                            onclick="window.removeDiagnosis(\${index})"
                                            \${isPrimary ? 'disabled title="Diagnosis primer tidak dapat dihapus"' : ''}>
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`;
                    document.getElementById('diagnoses-list').insertAdjacentHTML('beforeend', html);
                };

                window.removeDiagnosis = function(index) {
                    const item = document.querySelector(\`.diagnosis-item[data-index="\${index}"]\`);
                    if (item) item.remove();
                };
            </script>
        `;
    },

    /**
     * Render old Obstetri format (simple)
     */
    async renderObstetriFormat(diagnosis, state) {
        // Get metadata context for display AND saved data
        let metaHtml = '';
        let savedData = {};
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'diagnosis');
            if (context) {
                metaHtml = renderRecordMeta(context, 'diagnosis');
                // Use saved data from medicalRecords if available
                savedData = context.data || {};
            }
        } catch (error) {
            console.error('[Diagnosis] Failed to load metadata:', error);
        }

        // Merge with passed diagnosis parameter (fallback to savedData from medicalRecords)
        const diagnosisData = {
            diagnosis_utama: savedData.diagnosis_utama || diagnosis.diagnosis_utama || '',
            diagnosis_sekunder: savedData.diagnosis_sekunder || diagnosis.diagnosis_sekunder || ''
        };

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const signatureName = 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.';

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Diagnosis</h3>
                </div>
                ${metaHtml}
                <div class="sc-card">
                    <div class="mb-3">
                        <label class="font-weight-bold">Diagnosis Utama</label>
                        <textarea class="form-control" id="diagnosis-utama" name="diagnosis_utama" rows="1"
                                  placeholder="Masukkan diagnosis utama">${escapeHtml(diagnosisData.diagnosis_utama)}</textarea>
                    </div>
                    <div class="mb-3">
                        <label class="font-weight-bold">Diagnosis Sekunder (jika ada)</label>
                        <textarea class="form-control" id="diagnosis-sekunder" name="diagnosis_sekunder" rows="1"
                                  placeholder="Masukkan diagnosis sekunder jika ada">${escapeHtml(diagnosisData.diagnosis_sekunder)}</textarea>
                    </div>
                    <div class="mb-4 mt-4">
                        <p class="mb-0"><strong>${escapeHtml(signatureName)}</strong></p>
                        <p class="text-muted mb-0">Obstetrician Gynaecologist</p>
                    </div>
                    <div class="text-right mt-3">
                        <button type="button" class="btn btn-primary" id="save-diagnosis" onclick="window.saveDiagnosis()">
                            <i class="fas fa-save mr-2"></i>Simpan Diagnosis
                        </button>
                    </div>
                </div>
            </div>

            <script>
            // Initialize Diagnosis save handler
            setTimeout(() => {
                const saveBtn = document.getElementById('save-diagnosis');
                if (saveBtn) {
                    saveBtn.onclick = () => {
                        if (window.saveDiagnosis) {
                            window.saveDiagnosis();
                        }
                    };
                }
            }, 100);
            </script>
        `;
    },

    /**
     * Render Diagnoses List section
     */
    renderDiagnosesList(diagnoses) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-list-ul"></i> Daftar Diagnosis
                </h6>

                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>Panduan:</strong>
                    <ul class="mb-0 mt-2">
                        <li><strong>Primer:</strong> Diagnosis utama yang menjadi fokus perawatan</li>
                        <li><strong>Sekunder:</strong> Diagnosis tambahan yang menyertai kondisi utama</li>
                        <li><strong>Diferensial:</strong> Kemungkinan diagnosis lain yang sedang dipertimbangkan</li>
                        <li><strong>Rule Out:</strong> Diagnosis yang perlu disingkirkan melalui pemeriksaan lanjutan</li>
                    </ul>
                </div>

                <div id="diagnoses-list">
                    ${this.renderDiagnosesItems(diagnoses)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addDiagnosis()">
                    <i class="fas fa-plus"></i> Tambah Diagnosis
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Contoh diagnosis Obstetri:</strong>
                        Kehamilan normal (Z34.8), Preeklamsia ringan/berat (O14.0/O14.1),
                        Anemia dalam kehamilan (O99.0), Diabetes gestasional (O24.4), dll.
                        <br>
                        <strong>Contoh diagnosis Ginekologi:</strong>
                        Mioma uteri (D25.9), Kista ovarium (N83.2), Endometriosis (N80),
                        Infertilitas wanita (N97), Dismenore primer (N94.4), PCOS (E28.2), dll.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Diagnoses items
     */
    renderDiagnosesItems(diagnoses) {
        if (!diagnoses || diagnoses.length === 0) {
            return '<p class="text-muted">Belum ada diagnosis yang ditambahkan. Klik tombol "Tambah Diagnosis" untuk menambahkan.</p>';
        }

        return diagnoses.map((diag, index) => {
            const isPrimary = diag.type === 'primary' || index === 0;

            const typeLabels = {
                'primary': 'Primer',
                'secondary': 'Sekunder',
                'differential': 'Diferensial',
                'rule_out': 'Rule Out'
            };

            const typeColors = {
                'primary': 'badge-danger',
                'secondary': 'badge-warning',
                'differential': 'badge-info',
                'rule_out': 'badge-secondary'
            };

            const diagType = diag.type || (isPrimary ? 'primary' : 'secondary');

            return `
                <div class="diagnosis-item border rounded p-3 mb-3" data-index="${index}">
                    <div class="row">
                        <div class="col-md-11">
                            <div class="row">
                                <div class="col-md-2">
                                    <div class="form-group">
                                        <label>Tipe:</label>
                                        <select class="form-control" name="diagnoses[${index}][type]">
                                            <option value="primary" ${diagType === 'primary' ? 'selected' : ''}>Primer</option>
                                            <option value="secondary" ${diagType === 'secondary' ? 'selected' : ''}>Sekunder</option>
                                            <option value="differential" ${diagType === 'differential' ? 'selected' : ''}>Diferensial</option>
                                            <option value="rule_out" ${diagType === 'rule_out' ? 'selected' : ''}>Rule Out</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-10">
                                    <div class="form-group">
                                        <label>Diagnosis <span class="text-danger">*</span>:</label>
                                        <input type="text" class="form-control" name="diagnoses[${index}][diagnosis]"
                                               value="${diag.diagnosis || ''}"
                                               placeholder="Masukkan diagnosis (bahasa Indonesia atau Latin)"
                                               required>
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label>Kode ICD-10 (opsional):</label>
                                        <input type="text" class="form-control" name="diagnoses[${index}][icd10_code]"
                                               value="${diag.icd10_code || ''}"
                                               placeholder="Contoh: O26.8, N80.0">
                                        <small class="text-muted">
                                            <a href="https://icd.who.int/browse10/2019/en" target="_blank">
                                                <i class="fas fa-external-link-alt"></i> Cari ICD-10
                                            </a>
                                        </small>
                                    </div>
                                </div>
                                <div class="col-md-8">
                                    <div class="form-group">
                                        <label>Catatan:</label>
                                        <input type="text" class="form-control" name="diagnoses[${index}][notes]"
                                               value="${diag.notes || ''}"
                                               placeholder="Catatan tambahan tentang diagnosis ini">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-1 text-right">
                            <button type="button" class="btn btn-danger btn-sm mt-4"
                                    onclick="window.removeDiagnosis(${index})"
                                    ${isPrimary && diagnoses.length === 1 ? 'disabled title="Diagnosis primer tidak dapat dihapus jika hanya ada 1"' : ''}>
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render Clinical Summary section
     */
    renderClinicalSummary(diagnosis) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-file-medical-alt"></i> Kesimpulan Klinis
                </h6>

                <div class="form-group">
                    <label>Ringkasan Klinis:</label>
                    <textarea class="form-control" name="clinical_summary" rows="4"
                              placeholder="Ringkasan singkat dari hasil anamnesa, pemeriksaan fisik, dan penunjang yang mendukung diagnosis di atas...">${diagnosis.clinical_summary || ''}</textarea>
                    <small class="text-muted">
                        Jelaskan secara singkat temuan klinis yang mendukung diagnosis yang ditegakkan.
                    </small>
                </div>

                <div class="form-group">
                    <label>Prognosis:</label>
                    <select class="form-control" name="prognosis">
                        <option value="">-- Pilih --</option>
                        <option value="baik" ${diagnosis.prognosis === 'baik' ? 'selected' : ''}>
                            Baik (Ad bonam)
                        </option>
                        <option value="dubia_ad_bonam" ${diagnosis.prognosis === 'dubia_ad_bonam' ? 'selected' : ''}>
                            Dubia ad bonam (Meragukan cenderung baik)
                        </option>
                        <option value="dubia_ad_malam" ${diagnosis.prognosis === 'dubia_ad_malam' ? 'selected' : ''}>
                            Dubia ad malam (Meragukan cenderung buruk)
                        </option>
                        <option value="buruk" ${diagnosis.prognosis === 'buruk' ? 'selected' : ''}>
                            Buruk (Ad malam)
                        </option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Catatan Diagnosis:</label>
                    <textarea class="form-control" name="diagnosis_notes" rows="2"
                              placeholder="Catatan tambahan tentang diagnosis atau pertimbangan klinis lainnya...">${diagnosis.notes || ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Save diagnosis data
     */
    async save(state) {
        try {
            const data = {
                diagnoses: this.collectDiagnosesData(),
                clinical_summary: document.querySelector('[name="clinical_summary"]')?.value || '',
                prognosis: document.querySelector('[name="prognosis"]')?.value || '',
                notes: document.querySelector('[name="diagnosis_notes"]')?.value || ''
            };

            console.log('[Diagnosis] Saving data:', data);

            // Validation: At least one diagnosis required
            if (!data.diagnoses || data.diagnoses.length === 0) {
                throw new Error('Minimal satu diagnosis harus diisi');
            }

            // Validation: Ensure at least one primary diagnosis
            const hasPrimary = data.diagnoses.some(d => d.type === 'primary');
            if (!hasPrimary) {
                // Auto-set first diagnosis as primary if none specified
                data.diagnoses[0].type = 'primary';
            }

            // In production, this would call the API
            // const response = await apiClient.saveDiagnosis(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[Diagnosis] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Diagnoses data
     */
    collectDiagnosesData() {
        const diagnoses = [];
        document.querySelectorAll('.diagnosis-item').forEach(item => {
            const index = item.dataset.index;
            const type = document.querySelector(`[name="diagnoses[${index}][type]"]`)?.value;
            const diagnosis = document.querySelector(`[name="diagnoses[${index}][diagnosis]"]`)?.value;
            const icd10Code = document.querySelector(`[name="diagnoses[${index}][icd10_code]"]`)?.value;
            const notes = document.querySelector(`[name="diagnoses[${index}][notes]"]`)?.value;

            if (diagnosis) {
                diagnoses.push({
                    type: type || 'secondary',
                    diagnosis: diagnosis,
                    icd10_code: icd10Code,
                    notes: notes
                });
            }
        });

        return diagnoses;
    }
};
