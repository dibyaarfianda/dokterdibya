/**
 * Plan Component (Shared)
 * Treatment plan, medications, follow-up, patient education
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Treatment Plan / Management
 * 2. Medications (Resep)
 * 3. Follow-up Schedule
 * 4. Patient Education & Advice
 */

export default {
    /**
     * Render the Plan form
     */
    async render(state) {
        const record = state.recordData?.record || {};
        const category = record?.mr_category || 'obstetri';

        // Use obstetri format for all categories (as per user request)
        // Planning is the same across obstetri, gyn_repro, gyn_special
        return this.renderObstetriFormat(state);

        /* Disabled: Use new detailed format for other categories
        const plan = state.recordData?.plan || {};
        const medications = plan.medications || [];

        return `
            <div class="card mb-3">
                <div class="card-header bg-info text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-clipboard-list"></i> Rencana Tatalaksana
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Treatment Plan Section -->
                    ${this.renderTreatmentPlan(plan)}

                    <hr>

                    <!-- Medications Section -->
                    ${this.renderMedications(medications)}

                    <hr>

                    <!-- Follow-up Section -->
                    ${this.renderFollowUp(plan)}

                    <hr>

                    <!-- Patient Education Section -->
                    ${this.renderPatientEducation(plan)}
                </div>
            </div>

            <script>
                window.medicationPlanCounter = ${medications.length};

                // Add Medication
                window.addMedicationPlan = function() {
                    const index = window.medicationPlanCounter++;
                    const html = \`
                        <div class="medication-plan-item border rounded p-3 mb-3" data-index="\${index}">
                            <div class="row">
                                <div class="col-md-11">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label>Nama Obat <span class="text-danger">*</span>:</label>
                                                <input type="text" class="form-control" name="medications[\${index}][name]"
                                                       placeholder="Nama obat" required>
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label>Dosis:</label>
                                                <input type="text" class="form-control" name="medications[\${index}][dosage]"
                                                       placeholder="Contoh: 500 mg">
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label>Bentuk:</label>
                                                <select class="form-control" name="medications[\${index}][form]">
                                                    <option value="">-- Pilih --</option>
                                                    <option value="tablet">Tablet</option>
                                                    <option value="kapsul">Kapsul</option>
                                                    <option value="sirup">Sirup</option>
                                                    <option value="injeksi">Injeksi</option>
                                                    <option value="salep">Salep</option>
                                                    <option value="krim">Krim</option>
                                                    <option value="supositoria">Supositoria</option>
                                                    <option value="lainnya">Lainnya</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Frekuensi:</label>
                                                <select class="form-control" name="medications[\${index}][frequency]">
                                                    <option value="">-- Pilih --</option>
                                                    <option value="1x1">1 x sehari</option>
                                                    <option value="2x1">2 x sehari</option>
                                                    <option value="3x1">3 x sehari</option>
                                                    <option value="4x1">4 x sehari</option>
                                                    <option value="prn">Bila perlu (PRN)</option>
                                                    <option value="custom">Kustom</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Waktu:</label>
                                                <select class="form-control" name="medications[\${index}][timing]">
                                                    <option value="">-- Pilih --</option>
                                                    <option value="sebelum_makan">Sebelum makan</option>
                                                    <option value="sesudah_makan">Sesudah makan</option>
                                                    <option value="bersama_makan">Bersama makan</option>
                                                    <option value="pagi">Pagi hari</option>
                                                    <option value="malam">Malam hari</option>
                                                    <option value="sebelum_tidur">Sebelum tidur</option>
                                                    <option value="any_time">Kapan saja</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="form-group">
                                                <label>Durasi:</label>
                                                <input type="text" class="form-control" name="medications[\${index}][duration]"
                                                       placeholder="Contoh: 7 hari, 2 minggu">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Instruksi Tambahan:</label>
                                        <input type="text" class="form-control" name="medications[\${index}][instructions]"
                                               placeholder="Instruksi khusus untuk pasien">
                                    </div>
                                </div>
                                <div class="col-md-1 text-right">
                                    <button type="button" class="btn btn-danger btn-sm mt-4"
                                            onclick="window.removeMedicationPlan(\${index})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`;
                    document.getElementById('medications-plan-list').insertAdjacentHTML('beforeend', html);
                };

                window.removeMedicationPlan = function(index) {
                    const item = document.querySelector(\`.medication-plan-item[data-index="\${index}"]\`);
                    if (item) item.remove();
                };
            </script>
        `;
    */
    },

    /**
     * Render old Obstetri format (simple)
     */
    async renderObstetriFormat(state) {
        // Get saved data from medicalRecords if available
        let savedData = {};
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'planning');
            if (context) {
                savedData = context.data || {};
                metaHtml = renderRecordMeta(context, 'planning');
            }
        } catch (error) {
            console.error('[Plan] Failed to load saved data:', error);
        }

        // Merge with state.recordData.planning (fallback to savedData from medicalRecords)
        // Note: stateManager stores planning data under 'planning' key, not 'plan'
        const statePlan = state.recordData?.planning || state.recordData?.plan || {};
        console.log('[Plan] statePlan from stateManager:', statePlan);
        console.log('[Plan] savedData from medicalRecords:', savedData);

        // Get default datetime (current time)
        const now = new Date();
        const defaultDatetime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Helper to convert MEDIFY array to string
        const convertArrayToString = (arr) => {
            if (!arr) return '';
            if (typeof arr === 'string') return arr;
            if (Array.isArray(arr)) {
                // MEDIFY saves as array like ["Item 1", "Item 2"]
                return arr.join('\n');
            }
            return '';
        };

        // Get terapi - support both form field name (terapi) and MEDIFY field name (obat)
        const terapiValue = savedData.terapi || convertArrayToString(savedData.obat) ||
                           statePlan.terapi || convertArrayToString(statePlan.obat) || '';

        // Get tindakan - MEDIFY saves as array, form expects string
        const tindakanValue = typeof savedData.tindakan === 'string' ? savedData.tindakan :
                             convertArrayToString(savedData.tindakan) ||
                             (typeof statePlan.tindakan === 'string' ? statePlan.tindakan : convertArrayToString(statePlan.tindakan)) || '';

        // Get rencana - MEDIFY might save as "instruksi" array
        const rencanaValue = savedData.rencana || convertArrayToString(savedData.instruksi) ||
                            statePlan.rencana || convertArrayToString(statePlan.instruksi) || '';

        const planData = {
            tindakan: tindakanValue,
            terapi: terapiValue,
            rencana: rencanaValue,
            record_datetime: savedData.record_datetime || statePlan.record_datetime || defaultDatetime
        };
        console.log('[Plan] Final planData:', planData);

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
                    <h3>Planning</h3>
                </div>
                ${metaHtml}
                <div class="form-group mb-3" style="max-width: 300px;">
                    <label class="font-weight-bold text-primary">
                        <i class="fas fa-clock mr-1"></i>Tanggal & Jam Pemeriksaan <span class="text-danger">*</span>
                    </label>
                    <input type="datetime-local"
                           class="form-control"
                           id="planning-datetime"
                           value="${escapeHtml(planData.record_datetime)}"
                           autocomplete="off"
                           required>
                </div>
                <div class="sc-card">
                    <div class="mb-3">
                        <label class="font-weight-bold">Tindakan</label>

                        <!-- Item list with individual delete buttons (synced with billing) -->
                        <div id="tindakan-items-container" class="mb-2">
                            <p class="text-muted small">Memuat daftar tindakan...</p>
                        </div>

                        <!-- Textarea for custom entries only -->
                        <textarea class="form-control" id="planning-tindakan" rows="2"
                                  placeholder="Tulis tindakan manual di sini (untuk tindakan yang tidak ada di daftar)...">${escapeHtml(planData.tindakan)}</textarea>
                        <div class="mt-2">
                            <button type="button" class="btn btn-sm btn-outline-primary mr-2" id="btn-input-tindakan">
                                <i class="fas fa-plus-circle mr-1"></i>Input Tindakan
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" id="btn-reset-tindakan">
                                <i class="fas fa-trash mr-1"></i>Hapus Semua
                            </button>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="font-weight-bold">Terapi</label>

                        <!-- Item list with individual delete buttons -->
                        <div id="terapi-items-container" class="mb-2">
                            <p class="text-muted small">Memuat daftar obat...</p>
                        </div>

                        <!-- Textarea for custom entries (vitamins not in list, etc.) -->
                        <textarea class="form-control" id="planning-terapi" rows="3"
                                  placeholder="Tulis resep manual di sini (untuk obat/vitamin yang tidak ada di daftar)...">${escapeHtml(planData.terapi)}</textarea>
                        <div class="mt-2">
                            <button type="button" class="btn btn-sm btn-outline-primary mr-2" id="btn-input-terapi">
                                <i class="fas fa-plus-circle mr-1"></i>Input Terapi
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" id="btn-reset-terapi">
                                <i class="fas fa-trash mr-1"></i>Hapus Semua
                            </button>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="font-weight-bold">Rencana</label>
                        <textarea class="form-control" id="planning-rencana" rows="4"
                                  placeholder="Masukkan rencana tindak lanjut...">${escapeHtml(planData.rencana)}</textarea>
                    </div>

                    <div class="text-right mt-3">
                        <button type="button" class="btn btn-primary" id="save-plan">
                            <i class="fas fa-save mr-2"></i>Simpan Planning
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Treatment Plan section
     */
    renderTreatmentPlan(plan) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-procedures"></i> Rencana Tatalaksana / Manajemen
                </h6>

                <div class="form-group">
                    <label>Tatalaksana Non-Farmakologis:</label>
                    <textarea class="form-control" name="non_pharmacological_treatment" rows="3"
                              placeholder="Contoh: Bed rest, diet tinggi protein, kompres hangat, pijat, latihan fisik, dll.">${plan.non_pharmacological_treatment || ''}</textarea>
                    <small class="text-muted">
                        Terapi yang tidak menggunakan obat: istirahat, perubahan gaya hidup, diet, olahraga, fisioterapi, dll.
                    </small>
                </div>

                <div class="form-group">
                    <label>Tindakan Medis yang Direncanakan:</label>
                    <textarea class="form-control" name="planned_procedures" rows="3"
                              placeholder="Contoh: USG follow-up, laparoskopi diagnostik, histerektomi, dll.">${plan.planned_procedures || ''}</textarea>
                    <small class="text-muted">
                        Prosedur atau tindakan medis yang akan dilakukan (jika ada).
                    </small>
                </div>

                <div class="form-group">
                    <label>Pemeriksaan Lanjutan yang Diperlukan:</label>
                    <textarea class="form-control" name="additional_tests" rows="2"
                              placeholder="Contoh: Lab darah lengkap ulang, HSG, MRI pelvis, dll.">${plan.additional_tests || ''}</textarea>
                    <small class="text-muted">
                        Pemeriksaan lab, imaging, atau penunjang lain yang diperlukan untuk monitoring atau diagnosis lanjutan.
                    </small>
                </div>

                <div class="form-group">
                    <label>Rujukan (jika diperlukan):</label>
                    <div class="row">
                        <div class="col-md-6">
                            <select class="form-control mb-2" name="referral_needed">
                                <option value="no" ${plan.referral_needed === 'no' || !plan.referral_needed ? 'selected' : ''}>
                                    Tidak perlu rujukan
                                </option>
                                <option value="yes" ${plan.referral_needed === 'yes' ? 'selected' : ''}>
                                    Perlu rujukan
                                </option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <input type="text" class="form-control" name="referral_to"
                                   value="${plan.referral_to || ''}"
                                   placeholder="Rujuk ke (rumah sakit / spesialis)">
                        </div>
                    </div>
                    <textarea class="form-control mt-2" name="referral_reason" rows="2"
                              placeholder="Alasan rujukan...">${plan.referral_reason || ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render Medications section
     */
    renderMedications(medications) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-pills"></i> Resep Obat / Medikasi
                </h6>

                <div id="medications-plan-list">
                    ${this.renderMedicationsList(medications)}
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addMedicationPlan()">
                    <i class="fas fa-plus"></i> Tambah Obat
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Note:</strong> Resep obat ini akan otomatis masuk ke bagian Tagihan/Billing.
                        Pastikan semua informasi dosis, frekuensi, dan durasi sudah benar.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Medications list
     */
    renderMedicationsList(medications) {
        if (!medications || medications.length === 0) {
            return '<p class="text-muted">Belum ada obat yang diresepkan. Klik "Tambah Obat" untuk menambahkan resep.</p>';
        }

        return medications.map((med, index) => `
            <div class="medication-plan-item border rounded p-3 mb-3" data-index="${index}">
                <div class="row">
                    <div class="col-md-11">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Nama Obat <span class="text-danger">*</span>:</label>
                                    <input type="text" class="form-control" name="medications[${index}][name]"
                                           value="${med.name || ''}"
                                           placeholder="Nama obat" required>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Dosis:</label>
                                    <input type="text" class="form-control" name="medications[${index}][dosage]"
                                           value="${med.dosage || ''}"
                                           placeholder="Contoh: 500 mg">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Bentuk:</label>
                                    <select class="form-control" name="medications[${index}][form]">
                                        <option value="">-- Pilih --</option>
                                        <option value="tablet" ${med.form === 'tablet' ? 'selected' : ''}>Tablet</option>
                                        <option value="kapsul" ${med.form === 'kapsul' ? 'selected' : ''}>Kapsul</option>
                                        <option value="sirup" ${med.form === 'sirup' ? 'selected' : ''}>Sirup</option>
                                        <option value="injeksi" ${med.form === 'injeksi' ? 'selected' : ''}>Injeksi</option>
                                        <option value="salep" ${med.form === 'salep' ? 'selected' : ''}>Salep</option>
                                        <option value="krim" ${med.form === 'krim' ? 'selected' : ''}>Krim</option>
                                        <option value="supositoria" ${med.form === 'supositoria' ? 'selected' : ''}>Supositoria</option>
                                        <option value="lainnya" ${med.form === 'lainnya' ? 'selected' : ''}>Lainnya</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Frekuensi:</label>
                                    <select class="form-control" name="medications[${index}][frequency]">
                                        <option value="">-- Pilih --</option>
                                        <option value="1x1" ${med.frequency === '1x1' ? 'selected' : ''}>1 x sehari</option>
                                        <option value="2x1" ${med.frequency === '2x1' ? 'selected' : ''}>2 x sehari</option>
                                        <option value="3x1" ${med.frequency === '3x1' ? 'selected' : ''}>3 x sehari</option>
                                        <option value="4x1" ${med.frequency === '4x1' ? 'selected' : ''}>4 x sehari</option>
                                        <option value="prn" ${med.frequency === 'prn' ? 'selected' : ''}>Bila perlu (PRN)</option>
                                        <option value="custom" ${med.frequency === 'custom' ? 'selected' : ''}>Kustom</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Waktu:</label>
                                    <select class="form-control" name="medications[${index}][timing]">
                                        <option value="">-- Pilih --</option>
                                        <option value="sebelum_makan" ${med.timing === 'sebelum_makan' ? 'selected' : ''}>Sebelum makan</option>
                                        <option value="sesudah_makan" ${med.timing === 'sesudah_makan' ? 'selected' : ''}>Sesudah makan</option>
                                        <option value="bersama_makan" ${med.timing === 'bersama_makan' ? 'selected' : ''}>Bersama makan</option>
                                        <option value="pagi" ${med.timing === 'pagi' ? 'selected' : ''}>Pagi hari</option>
                                        <option value="malam" ${med.timing === 'malam' ? 'selected' : ''}>Malam hari</option>
                                        <option value="sebelum_tidur" ${med.timing === 'sebelum_tidur' ? 'selected' : ''}>Sebelum tidur</option>
                                        <option value="any_time" ${med.timing === 'any_time' ? 'selected' : ''}>Kapan saja</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Durasi:</label>
                                    <input type="text" class="form-control" name="medications[${index}][duration]"
                                           value="${med.duration || ''}"
                                           placeholder="Contoh: 7 hari, 2 minggu">
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Instruksi Tambahan:</label>
                            <input type="text" class="form-control" name="medications[${index}][instructions]"
                                   value="${med.instructions || ''}"
                                   placeholder="Instruksi khusus untuk pasien">
                        </div>
                    </div>
                    <div class="col-md-1 text-right">
                        <button type="button" class="btn btn-danger btn-sm mt-4"
                                onclick="window.removeMedicationPlan(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render Follow-up section
     */
    renderFollowUp(plan) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-calendar-plus"></i> Jadwal Kontrol / Follow-up
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Jadwal Kontrol Berikutnya:</label>
                            <input type="date" class="form-control" name="next_visit_date"
                                   value="${plan.next_visit_date || ''}">
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Atau dalam berapa lama:</label>
                            <select class="form-control" name="next_visit_interval">
                                <option value="">-- Pilih --</option>
                                <option value="1_minggu" ${plan.next_visit_interval === '1_minggu' ? 'selected' : ''}>1 minggu</option>
                                <option value="2_minggu" ${plan.next_visit_interval === '2_minggu' ? 'selected' : ''}>2 minggu</option>
                                <option value="1_bulan" ${plan.next_visit_interval === '1_bulan' ? 'selected' : ''}>1 bulan</option>
                                <option value="2_bulan" ${plan.next_visit_interval === '2_bulan' ? 'selected' : ''}>2 bulan</option>
                                <option value="3_bulan" ${plan.next_visit_interval === '3_bulan' ? 'selected' : ''}>3 bulan</option>
                                <option value="6_bulan" ${plan.next_visit_interval === '6_bulan' ? 'selected' : ''}>6 bulan</option>
                                <option value="prn" ${plan.next_visit_interval === 'prn' ? 'selected' : ''}>Bila perlu (PRN)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>Tujuan Kontrol Berikutnya:</label>
                    <textarea class="form-control" name="next_visit_purpose" rows="2"
                              placeholder="Contoh: Evaluasi hasil lab, monitoring pertumbuhan janin, evaluasi respon terapi, dll.">${plan.next_visit_purpose || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Monitoring yang Diperlukan:</label>
                    <textarea class="form-control" name="monitoring_plan" rows="2"
                              placeholder="Apa yang perlu dimonitor oleh pasien di rumah? Contoh: tekanan darah, gula darah, pergerakan janin, dll.">${plan.monitoring_plan || ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render Patient Education section
     */
    renderPatientEducation(plan) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-book-medical"></i> Edukasi & Nasihat untuk Pasien
                </h6>

                <div class="form-group">
                    <label>Penjelasan tentang Kondisi:</label>
                    <textarea class="form-control" name="condition_explanation" rows="2"
                              placeholder="Penjelasan sederhana tentang kondisi/diagnosis kepada pasien...">${plan.condition_explanation || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Saran & Nasihat:</label>
                    <textarea class="form-control" name="patient_advice" rows="3"
                              placeholder="Contoh: Istirahat cukup, hindari aktivitas berat, konsumsi makanan bergizi, minum air putih yang cukup, dll.">${plan.patient_advice || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Tanda Bahaya / Warning Signs:</label>
                    <textarea class="form-control" name="warning_signs" rows="2"
                              placeholder="Tanda-tanda yang harus diwaspadai dan segera datang ke klinik/RS...">${plan.warning_signs || ''}</textarea>
                    <small class="text-muted">
                        Informasikan kepada pasien kapan harus segera kembali atau ke UGD (perdarahan banyak, nyeri hebat, demam tinggi, dll).
                    </small>
                </div>

                <div class="form-group">
                    <label>Catatan Tambahan:</label>
                    <textarea class="form-control" name="additional_notes" rows="2"
                              placeholder="Catatan atau instruksi tambahan lainnya...">${plan.additional_notes || ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Save plan data
     */
    async save(state) {
        try {
            const data = {
                non_pharmacological_treatment: document.querySelector('[name="non_pharmacological_treatment"]')?.value || '',
                planned_procedures: document.querySelector('[name="planned_procedures"]')?.value || '',
                additional_tests: document.querySelector('[name="additional_tests"]')?.value || '',
                referral_needed: document.querySelector('[name="referral_needed"]')?.value || 'no',
                referral_to: document.querySelector('[name="referral_to"]')?.value || '',
                referral_reason: document.querySelector('[name="referral_reason"]')?.value || '',
                medications: this.collectMedicationsData(),
                next_visit_date: document.querySelector('[name="next_visit_date"]')?.value || '',
                next_visit_interval: document.querySelector('[name="next_visit_interval"]')?.value || '',
                next_visit_purpose: document.querySelector('[name="next_visit_purpose"]')?.value || '',
                monitoring_plan: document.querySelector('[name="monitoring_plan"]')?.value || '',
                condition_explanation: document.querySelector('[name="condition_explanation"]')?.value || '',
                patient_advice: document.querySelector('[name="patient_advice"]')?.value || '',
                warning_signs: document.querySelector('[name="warning_signs"]')?.value || '',
                additional_notes: document.querySelector('[name="additional_notes"]')?.value || ''
            };

            console.log('[Plan] Saving data:', data);

            // In production, this would call the API
            // const response = await apiClient.savePlan(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[Plan] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Medications data
     */
    collectMedicationsData() {
        const medications = [];
        document.querySelectorAll('.medication-plan-item').forEach(item => {
            const index = item.dataset.index;
            const name = document.querySelector(`[name="medications[${index}][name]"]`)?.value;
            const dosage = document.querySelector(`[name="medications[${index}][dosage]"]`)?.value;
            const form = document.querySelector(`[name="medications[${index}][form]"]`)?.value;
            const frequency = document.querySelector(`[name="medications[${index}][frequency]"]`)?.value;
            const timing = document.querySelector(`[name="medications[${index}][timing]"]`)?.value;
            const duration = document.querySelector(`[name="medications[${index}][duration]"]`)?.value;
            const instructions = document.querySelector(`[name="medications[${index}][instructions]"]`)?.value;

            if (name) {
                medications.push({
                    name, dosage, form, frequency, timing, duration, instructions
                });
            }
        });

        return medications;
    }
};
