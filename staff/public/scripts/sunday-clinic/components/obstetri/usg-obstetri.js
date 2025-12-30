/**
 * USG Component for Obstetri Patients - 4 Trimester Format
 * Classic format with 4 tabs: Trimester 1, 2, Screening, and 3
 */

export default {
    /**
     * Render USG form for Obstetri with 4 trimester tabs
     */
    async render(state) {
        // Load saved USG data from medical records using getMedicalRecordContext
        const { getMedicalRecordContext } = await import('../../utils/helpers.js');

        // Debug: Check state structure
        console.log('[USG Obstetri] Render - state.medicalRecords:', state.medicalRecords);
        console.log('[USG Obstetri] Render - state.medicalRecords?.byType?.usg:', state.medicalRecords?.byType?.usg);

        const context = getMedicalRecordContext(state, 'usg');
        const savedData = context?.data || {};

        // Debug: Log what data is being loaded
        console.log('[USG Obstetri] Render - context:', context);
        console.log('[USG Obstetri] Render - savedData:', savedData);
        console.log('[USG Obstetri] Render - photos:', savedData.photos);
        console.log('[USG Obstetri] Render - photos count:', savedData.photos?.length || 0);

        // Use saved data if available
        const data = savedData;
        const recordDatetime = data.record_datetime || '';

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        // Determine current trimester from saved data (default to first)
        const currentTrimester = data.current_trimester || data.trimester || 'first';

        // Define switchTrimester function globally
        if (!window.switchTrimester) {
            window.switchTrimester = function(evt, trimester) {
                document.querySelectorAll('.trimester-content').forEach(el => el.style.display = 'none');
                document.getElementById('usg-trimester-' + trimester).style.display = 'block';
                document.querySelectorAll('.trimester-selector .btn').forEach(btn => btn.classList.remove('active'));
                evt.target.closest('.btn').classList.add('active');
            };
        }

        // Define calculateFromEDD function globally
        // Calculates LMP (HPHT) = HPL - 280 days and Gestational Age from LMP to today
        if (!window.calculateFromEDD) {
            window.calculateFromEDD = function(prefix) {
                const eddInput = document.getElementById(`${prefix}-edd-input`);
                const lmpInput = document.getElementById(`${prefix}-lmp-calculated`);
                const gaInput = document.getElementById(`${prefix}-ga-calculated`);

                if (!eddInput || !eddInput.value) {
                    if (lmpInput) lmpInput.value = '';
                    if (gaInput) gaInput.value = '';
                    return;
                }

                // Calculate LMP = EDD - 280 days
                // Parse as local date (not UTC) to avoid timezone issues
                const [year, month, day] = eddInput.value.split('-').map(Number);
                const edd = new Date(year, month - 1, day);  // Local midnight
                const lmp = new Date(edd);
                lmp.setDate(lmp.getDate() - 280);

                // Format LMP for date input (YYYY-MM-DD) using local date
                const lmpFormatted = `${lmp.getFullYear()}-${String(lmp.getMonth() + 1).padStart(2, '0')}-${String(lmp.getDate()).padStart(2, '0')}`;
                if (lmpInput) lmpInput.value = lmpFormatted;

                // Calculate gestational age from LMP to today
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffMs = today - lmp;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                if (diffDays >= 0) {
                    const weeks = Math.floor(diffDays / 7);
                    const days = diffDays % 7;
                    if (gaInput) gaInput.value = `${weeks} minggu ${days} hari`;
                } else {
                    if (gaInput) gaInput.value = 'Tanggal tidak valid';
                }
            };
        }

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>USG Obstetri</h3>
                    <button type="button" class="btn btn-outline-info btn-sm ml-auto" id="btn-read-usg-photo" onclick="window.showUSGReaderModal()">
                        <i class="fas fa-magic mr-1"></i>Baca dari Foto
                    </button>
                </div>
                <div class="form-group mb-3" style="max-width: 300px;">
                    <label class="font-weight-bold text-primary">
                        <i class="fas fa-clock mr-1"></i>Tanggal & Jam Pemeriksaan <span class="text-danger">*</span>
                    </label>
                    <input type="datetime-local"
                           class="form-control"
                           id="usg-datetime"
                           value="${escapeHtml(recordDatetime)}"
                           autocomplete="off"
                           required>
                </div>
                <div class="sc-card">
                    <!-- Trimester Selector -->
                    <div class="trimester-selector mb-4">
                        <div class="btn-group btn-group-toggle" data-toggle="buttons" role="group">
                            <label class="btn btn-outline-primary ${currentTrimester === 'first' ? 'active' : ''}" onclick="window.switchTrimester(event, 'first')">
                                <input type="radio" name="trimester" value="first" ${currentTrimester === 'first' ? 'checked' : ''}> Trimester 1 (1-13w)
                            </label>
                            <label class="btn btn-outline-primary ${currentTrimester === 'second' ? 'active' : ''}" onclick="window.switchTrimester(event, 'second')">
                                <input type="radio" name="trimester" value="second" ${currentTrimester === 'second' ? 'checked' : ''}> Trimester 2 (14-27w)
                            </label>
                            <label class="btn btn-outline-primary ${currentTrimester === 'screening' ? 'active' : ''}" onclick="window.switchTrimester(event, 'screening')">
                                <input type="radio" name="trimester" value="screening" ${currentTrimester === 'screening' ? 'checked' : ''}> Skrining Kongenital (18-23w)
                            </label>
                            <label class="btn btn-outline-primary ${currentTrimester === 'third' ? 'active' : ''}" onclick="window.switchTrimester(event, 'third')">
                                <input type="radio" name="trimester" value="third" ${currentTrimester === 'third' ? 'checked' : ''}> Trimester 3 (28+w)
                            </label>
                        </div>
                    </div>

                    <!-- Trimester 1 Content -->
                    <div id="usg-trimester-first" class="trimester-content" style="display: ${currentTrimester === 'first' ? 'block' : 'none'};">
                        ${this.renderTrimester1(data)}
                    </div>

                    <!-- Trimester 2 Content -->
                    <div id="usg-trimester-second" class="trimester-content" style="display: ${currentTrimester === 'second' ? 'block' : 'none'};">
                        ${this.renderTrimester2(data)}
                    </div>

                    <!-- Screening Content -->
                    <div id="usg-trimester-screening" class="trimester-content" style="display: ${currentTrimester === 'screening' ? 'block' : 'none'};">
                        ${this.renderScreening(data)}
                    </div>

                    <!-- Trimester 3 Content -->
                    <div id="usg-trimester-third" class="trimester-content" style="display: ${currentTrimester === 'third' ? 'block' : 'none'};">
                        ${this.renderTrimester3(data)}
                    </div>

                    <!-- USG Photos Section -->
                    <div class="border-top pt-4 mt-4">
                        <h5 class="text-info font-weight-bold"><i class="fas fa-camera"></i> FOTO USG</h5>
                        <div class="form-group">
                            <div class="custom-file mb-3">
                                <input type="file" class="custom-file-input" id="usg-photo-upload" accept="image/*" multiple>
                                <label class="custom-file-label" for="usg-photo-upload">Pilih foto USG...</label>
                            </div>
                            <small class="form-text text-muted">Format: JPG, PNG. Maksimal 10MB per file.</small>
                        </div>
                        <div id="usg-photos-grid" class="row mb-3">
                            ${this.renderPhotosGrid(data.photos || [])}
                        </div>
                        <input type="hidden" id="usg-photos-data" value="${JSON.stringify(data.photos || []).replace(/"/g, '&quot;')}">
                    </div>

                    <!-- Save Button -->
                    <div class="text-right mt-4">
                        <button type="button" class="btn btn-primary" id="btn-save-usg" onclick="window.saveUSGExam()">
                            <i class="fas fa-save mr-2"></i>Simpan USG
                        </button>
                    </div>
                </div>
            </div>

            <!-- Event handlers are set up in usg.js afterRender() -->
        `;
    },

    /**
     * Render Trimester 1 (1-13 weeks)
     */
    renderTrimester1(data) {
        const t1 = data.trimester_1 || {};
        const escapeHtml = (str) => str ? String(str).replace(/"/g, '&quot;') : '';

        return `
            <h4 class="mb-3">TRIMESTER PERTAMA (1-13 minggu)</h4>
            <div class="form-row">
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Tanggal</label>
                    <input type="date" class="form-control usg-field" name="t1_date" value="${escapeHtml(t1.date || '')}">
                </div>
                <div class="form-group col-md-8">
                    <label class="font-weight-bold">Jumlah Embrio</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_embryo_count" id="t1-not-visible" value="not_visible" ${t1.embryo_count === 'not_visible' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t1-not-visible">Belum Tampak</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_embryo_count" id="t1-single" value="single" ${(t1.embryo_count || 'single') === 'single' && t1.embryo_count !== 'not_visible' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t1-single">Tunggal</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_embryo_count" id="t1-multiple" value="multiple" ${t1.embryo_count === 'multiple' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t1-multiple">Multipel</label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-3">
                    <label>Kantung Kehamilan (GS)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t1_gs" value="${escapeHtml(t1.gs || '')}" placeholder="0.0">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>Crown Rump Length (CRL)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t1_crl" value="${escapeHtml(t1.crl || '')}" placeholder="0.0">
                        <div class="input-group-append"><span class="input-group-text">cm</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>Usia Kehamilan (by CRL)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t1_ga_weeks" value="${escapeHtml(t1.ga_weeks || '')}" placeholder="0">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>Detak Jantung</label>
                    <div class="input-group">
                        <input type="number" class="form-control usg-field" name="t1_heart_rate" value="${escapeHtml(t1.heart_rate || '')}" placeholder="0">
                        <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Implantasi</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_implantation" id="t1-intrauterine" value="intrauterine" ${(t1.implantation || 'intrauterine') === 'intrauterine' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t1-intrauterine">Intrauterine</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_implantation" id="t1-ectopic" value="ectopic" ${t1.implantation === 'ectopic' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t1-ectopic">Ectopic</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label>Hari Perkiraan Lahir (HPL/EDD)</label>
                    <input type="date" class="form-control usg-field" name="t1_edd" id="t1-edd-input" value="${escapeHtml(t1.edd || '')}" onchange="window.calculateFromEDD && window.calculateFromEDD('t1')">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label>HPHT/LMP <small class="text-muted">(dari HPL)</small></label>
                    <input type="date" class="form-control usg-field" name="t1_lmp" id="t1-lmp-calculated" value="${escapeHtml(t1.lmp || '')}" readonly style="background-color: #f8f9fa;">
                </div>
                <div class="form-group col-md-4">
                    <label>Usia Kehamilan <small class="text-muted">(dari HPL)</small></label>
                    <input type="text" class="form-control" id="t1-ga-calculated" value="${escapeHtml(t1.ga_from_edd || '')}" readonly style="background-color: #f8f9fa;" placeholder="Otomatis dari HPL">
                </div>
                <div class="form-group col-md-4">
                    <label>Nuchal Translucency (NT)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t1_nt" value="${escapeHtml(t1.nt || '')}" placeholder="0.0">
                        <div class="input-group-append"><span class="input-group-text">mm</span></div>
                    </div>
                    <small class="text-muted">Normal: < 3.0 mm</small>
                </div>
            </div>

            <div class="form-group">
                <label>Catatan</label>
                <textarea class="form-control usg-field" name="t1_notes" rows="2" placeholder="Catatan tambahan...">${escapeHtml(t1.notes || '')}</textarea>
            </div>
        `;
    },

    /**
     * Render Trimester 2 (14-27 weeks)
     */
    renderTrimester2(data) {
        const t2 = data.trimester_2 || {};
        const escapeHtml = (str) => str ? String(str).replace(/"/g, '&quot;') : '';

        return `
            <h4 class="mb-3">BIOMETRI JANIN - Trimester Kedua (14-27 minggu)</h4>
            <div class="form-row">
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Tanggal</label>
                    <input type="date" class="form-control usg-field" name="t2_date" value="${escapeHtml(t2.date || '')}">
                </div>
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jumlah Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_fetus_count" id="t2-single" value="single" ${(t2.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-single">Tunggal</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_fetus_count" id="t2-multiple" value="multiple" ${t2.fetus_count === 'multiple' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-multiple">Multipel</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jenis Kelamin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_gender" id="t2-male" value="male" ${t2.gender === 'male' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-male">Laki-laki</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_gender" id="t2-female" value="female" ${t2.gender === 'female' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-female">Perempuan</label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Letak Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_fetus_lie" id="t2-longitudinal" value="longitudinal" ${t2.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-longitudinal">Membujur</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_fetus_lie" id="t2-transverse" value="transverse" ${t2.fetus_lie === 'transverse' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-transverse">Melintang</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_fetus_lie" id="t2-oblique" value="oblique" ${t2.fetus_lie === 'oblique' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-oblique">Oblique</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Presentasi Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_presentation" id="t2-cephalic" value="cephalic" ${t2.presentation === 'cephalic' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-cephalic">Kepala</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_presentation" id="t2-breech" value="breech" ${t2.presentation === 'breech' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-breech">Bokong</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_presentation" id="t2-shoulder" value="shoulder" ${t2.presentation === 'shoulder' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-shoulder">Bahu/Punggung</label>
                        </div>
                    </div>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Biometri</h5>
            <div class="form-row">
                <div class="form-group col-md-3">
                    <label>BPD (Diameter Parietal)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t2_bpd" value="${escapeHtml(t2.bpd || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>AC (Lingkar Perut)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t2_ac" value="${escapeHtml(t2.ac || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>FL (Panjang Femur)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t2_fl" value="${escapeHtml(t2.fl || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>Detak Jantung</label>
                    <div class="input-group">
                        <input type="number" class="form-control usg-field" name="t2_heart_rate" value="${escapeHtml(t2.heart_rate || '')}">
                        <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                    </div>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
            <div class="form-row">
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Lokasi Plasenta</label>
                    <div class="d-flex gap-2 flex-wrap">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_placenta" id="t2-anterior" value="anterior" ${t2.placenta === 'anterior' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-anterior">Anterior</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_placenta" id="t2-posterior" value="posterior" ${t2.placenta === 'posterior' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-posterior">Posterior</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_placenta" id="t2-fundus" value="fundus" ${t2.placenta === 'fundus' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-fundus">Fundus</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t2_placenta" id="t2-lateral" value="lateral" ${t2.placenta === 'lateral' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t2-lateral">Lateral</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-6">
                    <label>Plasenta Previa</label>
                    <input type="text" class="form-control usg-field" name="t2_placenta_previa" placeholder="Jika ada, sebutkan..." value="${escapeHtml(t2.placenta_previa || '')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label>AFI (Amniotic Fluid Index)</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t2_afi" value="${escapeHtml(t2.afi || '')}">
                        <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label>Taksiran Berat Janin (EFW)</label>
                    <div class="input-group">
                        <input type="text" class="form-control usg-field" name="t2_efw" placeholder="gram" value="${escapeHtml(t2.efw || '')}">
                        <div class="input-group-append"><span class="input-group-text">gram</span></div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label>Hari Perkiraan Lahir (HPL)</label>
                    <input type="date" class="form-control usg-field" name="t2_edd" id="t2-edd-input" value="${escapeHtml(t2.edd || '')}" onchange="window.calculateFromEDD && window.calculateFromEDD('t2')">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label>HPHT/LMP <small class="text-muted">(dari HPL)</small></label>
                    <input type="date" class="form-control usg-field" name="t2_lmp" id="t2-lmp-calculated" value="${escapeHtml(t2.lmp || '')}" readonly style="background-color: #f8f9fa;">
                </div>
                <div class="form-group col-md-4">
                    <label>Usia Kehamilan <small class="text-muted">(dari HPL)</small></label>
                    <input type="text" class="form-control" id="t2-ga-calculated" value="${escapeHtml(t2.ga_from_edd || '')}" readonly style="background-color: #f8f9fa;" placeholder="Otomatis dari HPL">
                </div>
            </div>

            <div class="form-group">
                <label>Catatan</label>
                <textarea class="form-control usg-field" name="t2_notes" rows="2" placeholder="Catatan tambahan...">${escapeHtml(t2.notes || '')}</textarea>
            </div>
        `;
    },

    /**
     * Render Screening (18-23 weeks)
     */
    renderScreening(data) {
        const scr = data.screening || {};
        const escapeHtml = (str) => str ? String(str).replace(/"/g, '&quot;') : '';

        return `
            <h4 class="mb-3">SKRINING KELAINAN KONGENITAL (18-23 minggu)</h4>
            <div class="form-row">
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Tanggal</label>
                    <input type="date" class="form-control usg-field" name="scr_date" value="${escapeHtml(scr.date || '')}">
                </div>
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jenis Kelamin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="scr_gender" id="scr-male" value="male" ${scr.gender === 'male' ? 'checked' : ''}>
                            <label class="custom-control-label" for="scr-male">Laki-laki</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="scr_gender" id="scr-female" value="female" ${scr.gender === 'female' ? 'checked' : ''}>
                            <label class="custom-control-label" for="scr-female">Perempuan</label>
                        </div>
                    </div>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Kepala dan Otak:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-hemisphere" name="scr_hemisphere" ${scr.hemisphere ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-hemisphere">Simetris hemisfer, Falx cerebri jelas</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-lateral-vent" name="scr_lateral_vent" ${scr.lateral_vent ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-lateral-vent">Ventrikel lateral, Atrium < 10 mm</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-cavum" name="scr_cavum" ${scr.cavum ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-cavum">Cavum septum pellucidum</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Muka dan Leher:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-profile" name="scr_profile" ${scr.profile ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-profile">Profil muka normal</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-nasal-bone" name="scr_nasal_bone" ${scr.nasal_bone ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-nasal-bone">Tulang hidung tampak, ukuran normal</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-upper-lip" name="scr_upper_lip" ${scr.upper_lip ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-upper-lip">Garis bibir atas menyambung</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Jantung dan Rongga Dada:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-4chamber" name="scr_4chamber" ${scr['4chamber'] ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-4chamber">Gambaran jelas 4-chamber view</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-heart-left" name="scr_heart_left" ${scr.heart_left ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-heart-left">Jantung di sebelah kiri</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-apex" name="scr_apex" ${scr.apex ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-apex">Apex jantung kearah kiri (~45°)</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-heart-size" name="scr_heart_size" ${scr.heart_size ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-heart-size">Besar jantung <1/3 area dada</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Tulang Belakang:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-vertebra" name="scr_vertebra" ${scr.vertebra ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-vertebra">Tidak tampak kelainan vertebra</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-skin" name="scr_skin" ${scr.skin ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-skin">Garis kulit tampak baik</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Anggota Gerak:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-upper-limbs" name="scr_upper_limbs" ${scr.upper_limbs ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-upper-limbs">Alat gerak kiri kanan atas normal</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-lower-limbs" name="scr_lower_limbs" ${scr.lower_limbs ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-lower-limbs">Alat gerak kiri kanan bawah normal</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Rongga Perut:</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-stomach" name="scr_stomach" ${scr.stomach ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-stomach">Lambung di sebelah kiri</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-liver" name="scr_liver" ${scr.liver ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-liver">Posisi liver dan echogenocity normal</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-kidneys" name="scr_kidneys" ${scr.kidneys ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-kidneys">Terlihat ginjal kiri & kanan</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-bladder" name="scr_bladder" ${scr.bladder ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-bladder">Kandung kemih terisi</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-cord" name="scr_cord" ${scr.cord ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-cord">Insersi tali pusat baik</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-abdominal-wall" name="scr_abdominal_wall" ${scr.abdominal_wall ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-abdominal-wall">Dinding perut tidak tampak defek</label>
                </div>
            </div>

            <h5 class="mt-3 mb-2">KESIMPULAN</h5>
            <div class="form-group">
                <div class="custom-control custom-checkbox mb-3">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-no-anomaly" name="scr_no_anomaly" ${scr.no_anomaly ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-no-anomaly">Tidak ditemukan kelainan</label>
                </div>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-suspect" name="scr_suspect" ${scr.suspect ? 'checked' : ''}>
                    <label class="custom-control-label" for="scr-suspect">Kecurigaan</label>
                </div>
                <div class="mt-2">
                    <textarea class="form-control usg-field" name="scr_suspect_notes" rows="3" placeholder="Jelaskan kecurigaan jika ada...">${escapeHtml(scr.suspect_notes || '')}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render Trimester 3 (28+ weeks)
     */
    renderTrimester3(data) {
        const t3 = data.trimester_3 || {};
        const escapeHtml = (str) => str ? String(str).replace(/"/g, '&quot;') : '';

        return `
            <h4 class="mb-3">BIOMETRI JANIN - Trimester Ketiga (28+ minggu)</h4>
            <div class="form-row">
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Tanggal</label>
                    <input type="date" class="form-control usg-field" name="t3_date" value="${escapeHtml(t3.date || '')}">
                </div>
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jumlah Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_fetus_count" id="t3-single" value="single" ${(t3.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-single">Tunggal</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_fetus_count" id="t3-multiple" value="multiple" ${t3.fetus_count === 'multiple' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-multiple">Multipel</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jenis Kelamin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_gender" id="t3-male" value="male" ${t3.gender === 'male' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-male">Laki-laki</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_gender" id="t3-female" value="female" ${t3.gender === 'female' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-female">Perempuan</label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Letak Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_fetus_lie" id="t3-longitudinal" value="longitudinal" ${t3.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-longitudinal">Membujur</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_fetus_lie" id="t3-transverse" value="transverse" ${t3.fetus_lie === 'transverse' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-transverse">Melintang</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_fetus_lie" id="t3-oblique" value="oblique" ${t3.fetus_lie === 'oblique' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-oblique">Oblique</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Presentasi Janin</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_presentation" id="t3-cephalic" value="cephalic" ${t3.presentation === 'cephalic' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-cephalic">Kepala</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_presentation" id="t3-breech" value="breech" ${t3.presentation === 'breech' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-breech">Bokong</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_presentation" id="t3-shoulder" value="shoulder" ${t3.presentation === 'shoulder' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-shoulder">Bahu/Punggung</label>
                        </div>
                    </div>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Biometri</h5>
            <div class="form-row">
                <div class="form-group col-md-3">
                    <label>BPD</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t3_bpd" value="${escapeHtml(t3.bpd || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>AC</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t3_ac" value="${escapeHtml(t3.ac || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>FL</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t3_fl" value="${escapeHtml(t3.fl || '')}">
                        <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                    </div>
                </div>
                <div class="form-group col-md-3">
                    <label>Detak Jantung</label>
                    <div class="input-group">
                        <input type="number" class="form-control usg-field" name="t3_heart_rate" value="${escapeHtml(t3.heart_rate || '')}">
                        <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                    </div>
                </div>
            </div>

            <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
            <div class="form-row">
                <div class="form-group col-md-6">
                    <label class="font-weight-bold">Lokasi Plasenta</label>
                    <div class="d-flex gap-2 flex-wrap">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_placenta" id="t3-anterior" value="anterior" ${t3.placenta === 'anterior' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-anterior">Anterior</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_placenta" id="t3-posterior" value="posterior" ${t3.placenta === 'posterior' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-posterior">Posterior</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_placenta" id="t3-fundus" value="fundus" ${t3.placenta === 'fundus' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-fundus">Fundus</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t3_placenta" id="t3-lateral" value="lateral" ${t3.placenta === 'lateral' ? 'checked' : ''}>
                            <label class="custom-control-label" for="t3-lateral">Lateral</label>
                        </div>
                    </div>
                </div>
                <div class="form-group col-md-6">
                    <label>Plasenta Previa</label>
                    <input type="text" class="form-control usg-field" name="t3_placenta_previa" placeholder="Jika ada..." value="${escapeHtml(t3.placenta_previa || '')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label>AFI</label>
                    <div class="input-group">
                        <input type="number" step="0.1" class="form-control usg-field" name="t3_afi" value="${escapeHtml(t3.afi || '')}">
                        <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label>EFW</label>
                    <div class="input-group">
                        <input type="text" class="form-control usg-field" name="t3_efw" value="${escapeHtml(t3.efw || '')}">
                        <div class="input-group-append"><span class="input-group-text">gram</span></div>
                    </div>
                </div>
                <div class="form-group col-md-4">
                    <label>Hari Perkiraan Lahir (HPL)</label>
                    <input type="date" class="form-control usg-field" name="t3_edd" id="t3-edd-input" value="${escapeHtml(t3.edd || '')}" onchange="window.calculateFromEDD && window.calculateFromEDD('t3')">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group col-md-4">
                    <label>HPHT/LMP <small class="text-muted">(dari HPL)</small></label>
                    <input type="date" class="form-control usg-field" name="t3_lmp" id="t3-lmp-calculated" value="${escapeHtml(t3.lmp || '')}" readonly style="background-color: #f8f9fa;">
                </div>
                <div class="form-group col-md-4">
                    <label>Usia Kehamilan <small class="text-muted">(dari HPL)</small></label>
                    <input type="text" class="form-control" id="t3-ga-calculated" value="${escapeHtml(t3.ga_from_edd || '')}" readonly style="background-color: #f8f9fa;" placeholder="Otomatis dari HPL">
                </div>
            </div>

            <div class="form-group">
                <label class="font-weight-bold">Stripping of membrane</label>
                <div class="d-flex gap-3">
                    <div class="custom-control custom-radio mr-4">
                        <input type="radio" class="custom-control-input usg-field" name="t3_membrane_sweep" id="t3-sweep-no" value="no" ${(t3.membrane_sweep || 'no') === 'no' ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-sweep-no">Tidak</label>
                    </div>
                    <div class="custom-control custom-radio mr-4">
                        <input type="radio" class="custom-control-input usg-field" name="t3_membrane_sweep" id="t3-sweep-success" value="successful" ${t3.membrane_sweep === 'successful' ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-sweep-success">Berhasil</label>
                    </div>
                    <div class="custom-control custom-radio mr-4">
                        <input type="radio" class="custom-control-input usg-field" name="t3_membrane_sweep" id="t3-sweep-fail" value="failed" ${t3.membrane_sweep === 'failed' ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-sweep-fail">Gagal</label>
                    </div>
                </div>
            </div>

            <h5 class="mt-4 mb-2">Rencana Kontrasepsi</h5>
            <div class="row">
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_steril" id="t3-contra-steril" ${(t3.contraception || []).includes('steril') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-steril">Steril (Tubektomi Bilateral)</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_iud" id="t3-contra-iud" ${(t3.contraception || []).includes('iud') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-iud">Intra-Uterine Device (IUD)</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_iud_mirena" id="t3-contra-iud-mirena" ${(t3.contraception || []).includes('iud_mirena') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-iud-mirena">IUD Mirena (hormonal)</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_implant" id="t3-contra-implant" ${(t3.contraception || []).includes('implant') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-implant">Implant</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_injection" id="t3-contra-injection" ${(t3.contraception || []).includes('injection') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-injection">Suntik KB 3 bulan</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_pill" id="t3-contra-pill" ${(t3.contraception || []).includes('pill') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-pill">Pil KB</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_condom" id="t3-contra-condom" ${(t3.contraception || []).includes('condom') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-condom">Kondom</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_vasectomy" id="t3-contra-vasectomy" ${(t3.contraception || []).includes('vasectomy') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-vasectomy">Vasektomi</label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" name="t3_contra_none" id="t3-contra-none" ${(t3.contraception || []).includes('none') ? 'checked' : ''}>
                        <label class="custom-control-label" for="t3-contra-none">Tanpa kontrasepsi (riwayat infertil)</label>
                    </div>
                </div>
            </div>


        `;
    },

    /**
     * Save USG data
     */
    async save(state) {
        try {
            console.log('[USG Obstetri] Saving USG data...');

            // Collect data from all trimester forms
            const data = {
                trimester_1: this.collectTrimester1Data(),
                trimester_2: this.collectTrimester2Data(),
                screening: this.collectScreeningData(),
                trimester_3: this.collectTrimester3Data()
            };

            // TODO: Send to API
            console.log('[USG Obstetri] Data:', data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[USG Obstetri] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    collectTrimester1Data() {
        return {
            date: document.querySelector('[name="t1_date"]')?.value,
            embryo_count: document.querySelector('input[name="t1_embryo_count"]:checked')?.value,
            gs: document.querySelector('[name="t1_gs"]')?.value,
            crl: document.querySelector('[name="t1_crl"]')?.value,
            ga_weeks: document.querySelector('[name="t1_ga_weeks"]')?.value,
            heart_rate: document.querySelector('[name="t1_heart_rate"]')?.value,
            implantation: document.querySelector('input[name="t1_implantation"]:checked')?.value,
            edd: document.querySelector('[name="t1_edd"]')?.value,
            lmp: document.querySelector('[name="t1_lmp"]')?.value,
            ga_from_edd: document.getElementById('t1-ga-calculated')?.value,
            nt: document.querySelector('[name="t1_nt"]')?.value,
            notes: document.querySelector('[name="t1_notes"]')?.value
        };
    },

    collectTrimester2Data() {
        return {
            date: document.querySelector('[name="t2_date"]')?.value,
            fetus_count: document.querySelector('input[name="t2_fetus_count"]:checked')?.value,
            gender: document.querySelector('input[name="t2_gender"]:checked')?.value,
            fetus_lie: document.querySelector('input[name="t2_fetus_lie"]:checked')?.value,
            presentation: document.querySelector('input[name="t2_presentation"]:checked')?.value,
            bpd: document.querySelector('[name="t2_bpd"]')?.value,
            ac: document.querySelector('[name="t2_ac"]')?.value,
            fl: document.querySelector('[name="t2_fl"]')?.value,
            heart_rate: document.querySelector('[name="t2_heart_rate"]')?.value,
            placenta: document.querySelector('input[name="t2_placenta"]:checked')?.value,
            placenta_previa: document.querySelector('[name="t2_placenta_previa"]')?.value,
            afi: document.querySelector('[name="t2_afi"]')?.value,
            efw: document.querySelector('[name="t2_efw"]')?.value,
            edd: document.querySelector('[name="t2_edd"]')?.value,
            lmp: document.querySelector('[name="t2_lmp"]')?.value,
            ga_from_edd: document.getElementById('t2-ga-calculated')?.value,
            notes: document.querySelector('[name="t2_notes"]')?.value
        };
    },

    collectScreeningData() {
        const checkboxes = [
            'hemisphere', 'lateral_vent', 'cavum', 'profile', 'nasal_bone', 'upper_lip',
            '4chamber', 'heart_left', 'apex', 'heart_size', 'vertebra', 'skin',
            'upper_limbs', 'lower_limbs', 'stomach', 'liver', 'kidneys', 'bladder', 'cord', 'abdominal_wall',
            'no_anomaly', 'suspect'
        ];

        const data = {
            date: document.querySelector('[name="scr_date"]')?.value,
            gender: document.querySelector('input[name="scr_gender"]:checked')?.value,
            suspect_notes: document.querySelector('[name="scr_suspect_notes"]')?.value
        };

        checkboxes.forEach(name => {
            data[name] = document.querySelector(`[name="scr_${name}"]`)?.checked || false;
        });

        return data;
    },

    collectTrimester3Data() {
        const contraception = [];
        ['steril', 'iud', 'iud_mirena', 'implant', 'injection', 'pill', 'condom', 'vasectomy', 'none'].forEach(method => {
            if (document.querySelector(`[name="t3_contra_${method}"]`)?.checked) {
                contraception.push(method);
            }
        });

        return {
            date: document.querySelector('[name="t3_date"]')?.value,
            fetus_count: document.querySelector('input[name="t3_fetus_count"]:checked')?.value,
            gender: document.querySelector('input[name="t3_gender"]:checked')?.value,
            fetus_lie: document.querySelector('input[name="t3_fetus_lie"]:checked')?.value,
            presentation: document.querySelector('input[name="t3_presentation"]:checked')?.value,
            bpd: document.querySelector('[name="t3_bpd"]')?.value,
            ac: document.querySelector('[name="t3_ac"]')?.value,
            fl: document.querySelector('[name="t3_fl"]')?.value,
            heart_rate: document.querySelector('[name="t3_heart_rate"]')?.value,
            placenta: document.querySelector('input[name="t3_placenta"]:checked')?.value,
            placenta_previa: document.querySelector('[name="t3_placenta_previa"]')?.value,
            afi: document.querySelector('[name="t3_afi"]')?.value,
            efw: document.querySelector('[name="t3_efw"]')?.value,
            edd: document.querySelector('[name="t3_edd"]')?.value,
            lmp: document.querySelector('[name="t3_lmp"]')?.value,
            ga_from_edd: document.getElementById('t3-ga-calculated')?.value,
            membrane_sweep: document.querySelector('input[name="t3_membrane_sweep"]:checked')?.value,
            contraception: contraception
        };
    },

    // Photo helper methods
    renderPhotosGrid(photos) {
        console.log('[USG Obstetri] renderPhotosGrid called with:', photos);
        if (!photos || photos.length === 0) {
            console.log('[USG Obstetri] renderPhotosGrid - no photos, showing placeholder');
            return '<div class="col-12"><p class="text-muted">Belum ada foto USG</p></div>';
        }
        console.log('[USG Obstetri] renderPhotosGrid - rendering', photos.length, 'photos');
        return photos.map((photo, index) => `
            <div class="col-md-3 col-sm-4 col-6 mb-3">
                <div class="card h-100">
                    <a href="${photo.url}" target="_blank">
                        <img src="${photo.url}" class="card-img-top" alt="${photo.name}" style="height: 120px; object-fit: cover;">
                    </a>
                    <div class="card-body p-2">
                        <small class="text-truncate d-block">${photo.name}</small>
                        <div class="btn-group btn-group-sm mt-1">
                            <button type="button" class="btn btn-info btn-xs usg-read-photo" data-url="${photo.url}" title="Baca data dari foto ini">
                                <i class="fas fa-magic"></i>
                            </button>
                            <button type="button" class="btn btn-danger btn-xs usg-remove-photo" data-index="${index}" title="Hapus foto">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Show toast notification (non-blocking)
     */
    showToast(message, type = 'info') {
        // Create toast container if not exists
        let container = document.getElementById('usg-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'usg-toast-container';
            container.style.cssText = 'position: fixed; top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
            document.body.appendChild(container);
        }

        // Color mapping
        const colors = {
            success: { bg: '#28a745', icon: 'fa-check-circle' },
            error: { bg: '#dc3545', icon: 'fa-times-circle' },
            warning: { bg: '#ffc107', icon: 'fa-exclamation-triangle', text: '#000' },
            info: { bg: '#17a2b8', icon: 'fa-info-circle' }
        };
        const color = colors[type] || colors.info;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            background: ${color.bg}; color: ${color.text || '#fff'}; padding: 12px 16px;
            border-radius: 6px; margin-bottom: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex; align-items: center; gap: 10px; animation: slideIn 0.3s ease;
            font-size: 14px;
        `;
        toast.innerHTML = `<i class="fas ${color.icon}"></i><span>${message}</span>`;

        // Add animation style if not exists
        if (!document.getElementById('toast-animation-style')) {
            const style = document.createElement('style');
            style.id = 'toast-animation-style';
            style.textContent = `
                @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }
            `;
            document.head.appendChild(style);
        }

        container.appendChild(toast);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    async handlePhotoUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const maxSize = 10 * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxSize) {
                this.showToast(`File ${file.name} terlalu besar. Maksimal 10MB.`, 'error');
                return;
            }
        }

        const label = event.target.nextElementSibling;
        const originalLabel = label.textContent;
        label.textContent = 'Mengupload...';

        try {
            const formData = new FormData();
            files.forEach(file => formData.append('files', file));

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            const response = await fetch('/api/usg-photos/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();
            const photosData = document.getElementById('usg-photos-data');
            let currentPhotos = [];
            try {
                currentPhotos = JSON.parse(photosData.value.replace(/&quot;/g, '"') || '[]');
            } catch (e) { currentPhotos = []; }

            const updatedPhotos = [...currentPhotos, ...result.files];
            photosData.value = JSON.stringify(updatedPhotos).replace(/"/g, '&quot;');

            const grid = document.getElementById('usg-photos-grid');
            if (grid) {
                grid.innerHTML = this.renderPhotosGrid(updatedPhotos);
                this.initPhotoRemoveHandlers();
            }

            await this.savePhotosToDatabase(updatedPhotos);

            event.target.value = '';
            label.textContent = originalLabel;
            this.showToast(`${result.files.length} foto berhasil diupload!`, 'success');
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Gagal upload foto.', 'error');
            label.textContent = originalLabel;
        }
    },

    async removePhoto(index) {
        if (!confirm('Hapus foto ini?')) return;

        const photosData = document.getElementById('usg-photos-data');
        let photos = [];
        try {
            photos = JSON.parse(photosData.value.replace(/&quot;/g, '"') || '[]');
        } catch (e) { photos = []; }

        photos.splice(index, 1);
        photosData.value = JSON.stringify(photos).replace(/"/g, '&quot;');

        const grid = document.getElementById('usg-photos-grid');
        if (grid) {
            grid.innerHTML = this.renderPhotosGrid(photos);
            this.initPhotoRemoveHandlers();
        }

        await this.savePhotosToDatabase(photos);
    },

    initPhotoRemoveHandlers() {
        const self = this;
        document.querySelectorAll('.usg-remove-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                self.removePhoto(index);
            });
        });

        // Add handler for "Baca Data" buttons
        document.querySelectorAll('.usg-read-photo').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // Store button reference BEFORE async operations (e.currentTarget becomes null after await)
                const button = e.currentTarget;
                const url = button.dataset.url;
                if (!url) return;

                // Get current trimester
                const activeTab = document.querySelector('.trimester-selector .btn.active input');
                const trimester = activeTab?.value || 'second';

                // Show loading on button
                const originalHtml = button.innerHTML;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                button.disabled = true;

                try {
                    const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
                    const response = await fetch('/api/usg-reader/analyze-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            imageUrl: url,
                            trimester: trimester,
                            type: 'obstetri'
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Store and apply result
                        window._usgReaderResult = result.data;
                        window.applyUSGData();
                    } else {
                        self.showToast('Gagal membaca foto: ' + result.message, 'error');
                    }
                } catch (error) {
                    console.error('USG Reader error:', error);
                    self.showToast('Error: ' + error.message, 'error');
                } finally {
                    button.innerHTML = originalHtml;
                    button.disabled = false;
                }
            });
        });
    },

    async savePhotosToDatabase(photos) {
        try {
            const { default: stateManager } = await import('../../utils/state-manager.js');
            const state = stateManager.getState();
            const patientId = state.derived?.patientId || state.recordData?.patientId || state.patientData?.id;
            const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

            if (!patientId || !mrId) return;

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            if (!token) return;

            // Get existing USG data
            const { getMedicalRecordContext } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'usg');
            const existingData = context?.data || {};

            await fetch('/api/medical-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId,
                    visitId: mrId,
                    type: 'usg',
                    data: { ...existingData, photos },
                    timestamp: new Date().toISOString()
                })
            });
            console.log('[USG Obstetri] Photos saved to database');
        } catch (error) {
            console.error('[USG Obstetri] Error saving photos:', error);
        }
    },

    /**
     * After render hook - setup event handlers
     */
    afterRender() {
        console.log('[USG Obstetri] afterRender called');
        const self = this; // Preserve reference

        // Setup global toast function for window functions to use
        if (!window.showUSGToast) {
            window.showUSGToast = (message, type) => self.showToast(message, type);
        }

        // Setup USG Reader Modal function
        if (!window.showUSGReaderModal) {
            window.showUSGReaderModal = function() {
                // Get current trimester from active tab
                const activeTab = document.querySelector('.trimester-selector .btn.active input');
                const currentTrimester = activeTab?.value || 'second';

                // Create modal if not exists
                let modal = document.getElementById('usgReaderModal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.id = 'usgReaderModal';
                    modal.className = 'modal fade';
                    modal.innerHTML = `
                        <div class="modal-dialog modal-lg">
                            <div class="modal-content">
                                <div class="modal-header bg-info text-white">
                                    <h5 class="modal-title"><i class="fas fa-magic mr-2"></i>Baca Data dari Foto USG</h5>
                                    <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-info">
                                        <i class="fas fa-info-circle mr-2"></i>
                                        Upload foto USG dan AI akan membaca data pengukuran secara otomatis.
                                    </div>

                                    <div class="form-group">
                                        <label class="font-weight-bold">Trimester</label>
                                        <select class="form-control" id="usg-reader-trimester">
                                            <option value="first">Trimester 1 (1-13 minggu)</option>
                                            <option value="second">Trimester 2 (14-27 minggu)</option>
                                            <option value="screening">Skrining Kongenital (18-23 minggu)</option>
                                            <option value="third">Trimester 3 (28+ minggu)</option>
                                        </select>
                                    </div>

                                    <div class="form-group">
                                        <label class="font-weight-bold">Upload Foto USG</label>
                                        <div class="custom-file">
                                            <input type="file" class="custom-file-input" id="usg-reader-file" accept="image/*">
                                            <label class="custom-file-label" for="usg-reader-file">Pilih foto...</label>
                                        </div>
                                    </div>

                                    <div id="usg-reader-preview" class="text-center mb-3" style="display:none;">
                                        <img id="usg-reader-preview-img" src="" class="img-fluid rounded" style="max-height: 300px;">
                                    </div>

                                    <div id="usg-reader-result" style="display:none;">
                                        <hr>
                                        <h6 class="font-weight-bold text-success"><i class="fas fa-check-circle mr-2"></i>Data Ditemukan:</h6>
                                        <div id="usg-reader-data" class="bg-light p-3 rounded"></div>
                                    </div>

                                    <div id="usg-reader-loading" style="display:none;" class="text-center py-4">
                                        <div class="spinner-border text-info" role="status"></div>
                                        <p class="mt-2 text-muted">AI sedang membaca foto...</p>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                                    <button type="button" class="btn btn-info" id="btn-analyze-usg" onclick="window.analyzeUSGPhoto()" disabled>
                                        <i class="fas fa-search mr-1"></i>Analisis Foto
                                    </button>
                                    <button type="button" class="btn btn-success" id="btn-apply-usg" onclick="window.applyUSGData()" style="display:none;">
                                        <i class="fas fa-check mr-1"></i>Terapkan ke Form
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);

                    // Setup file input change handler
                    document.getElementById('usg-reader-file').addEventListener('change', function(e) {
                        const file = e.target.files[0];
                        if (file) {
                            e.target.nextElementSibling.textContent = file.name;
                            document.getElementById('btn-analyze-usg').disabled = false;

                            // Show preview
                            const reader = new FileReader();
                            reader.onload = function(ev) {
                                document.getElementById('usg-reader-preview-img').src = ev.target.result;
                                document.getElementById('usg-reader-preview').style.display = 'block';
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                }

                // Set current trimester in modal
                document.getElementById('usg-reader-trimester').value = currentTrimester;

                // Reset state
                document.getElementById('usg-reader-result').style.display = 'none';
                document.getElementById('usg-reader-loading').style.display = 'none';
                document.getElementById('btn-apply-usg').style.display = 'none';

                $(modal).modal('show');
            };
        }

        // Analyze USG photo function
        if (!window.analyzeUSGPhoto) {
            window.analyzeUSGPhoto = async function() {
                const fileInput = document.getElementById('usg-reader-file');
                const trimester = document.getElementById('usg-reader-trimester').value;

                if (!fileInput.files[0]) {
                    window.showUSGToast('Pilih foto terlebih dahulu', 'warning');
                    return;
                }

                // Show loading
                document.getElementById('usg-reader-loading').style.display = 'block';
                document.getElementById('usg-reader-result').style.display = 'none';
                document.getElementById('btn-analyze-usg').disabled = true;

                try {
                    const formData = new FormData();
                    formData.append('image', fileInput.files[0]);
                    formData.append('trimester', trimester);
                    formData.append('type', 'obstetri');

                    const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
                    const response = await fetch('/api/usg-reader/analyze', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Store result for apply
                        window._usgReaderResult = result.data;

                        // Display result
                        const dataDiv = document.getElementById('usg-reader-data');
                        dataDiv.innerHTML = formatUSGResult(result.data);

                        document.getElementById('usg-reader-result').style.display = 'block';
                        document.getElementById('btn-apply-usg').style.display = 'inline-block';
                    } else {
                        window.showUSGToast('Gagal menganalisis foto: ' + result.message, 'error');
                    }
                } catch (error) {
                    console.error('USG Reader error:', error);
                    window.showUSGToast('Error: ' + error.message, 'error');
                } finally {
                    document.getElementById('usg-reader-loading').style.display = 'none';
                    document.getElementById('btn-analyze-usg').disabled = false;
                }
            };
        }

        // Apply USG data to form
        if (!window.applyUSGData) {
            window.applyUSGData = function() {
                const data = window._usgReaderResult;
                if (!data || !data.formData) return;

                const formData = data.formData;
                const trimester = data.trimester;

                // Switch to correct trimester tab
                const trimesterBtn = document.querySelector(`.trimester-selector .btn input[value="${trimester}"]`);
                if (trimesterBtn) {
                    trimesterBtn.closest('.btn').click();
                }

                // Wait for tab switch, then fill form
                setTimeout(() => {
                    for (const [key, value] of Object.entries(formData)) {
                        if (!value || key === 'type' || key === 'trimester') continue;

                        // Find the input field
                        const input = document.querySelector(`[name="${key}"]`);
                        if (input) {
                            if (input.type === 'radio') {
                                const radio = document.querySelector(`[name="${key}"][value="${value}"]`);
                                if (radio) radio.checked = true;
                            } else if (input.type === 'checkbox') {
                                input.checked = !!value;
                            } else {
                                input.value = value;
                            }
                        }
                    }

                    // Close modal
                    $('#usgReaderModal').modal('hide');

                    // Show save button
                    const saveBtn = document.getElementById('btn-save-usg');
                    if (saveBtn) saveBtn.style.display = 'inline-block';

                    window.showUSGToast('Data USG berhasil diterapkan. Silakan review dan simpan.', 'success');
                }, 300);
            };
        }

        // Format USG result for display
        function formatUSGResult(data) {
            if (!data || !data.formData) return '<p class="text-muted">Tidak ada data</p>';

            const formData = data.formData;
            const labels = {
                t1_gs: 'Gestational Sac (GS)',
                t1_crl: 'Crown Rump Length (CRL)',
                t1_ga_weeks: 'Usia Kehamilan',
                t1_heart_rate: 'Detak Jantung',
                t1_edd: 'HPL/EDD',
                t1_nt: 'Nuchal Translucency (NT)',
                t2_bpd: 'BPD',
                t2_ac: 'AC',
                t2_fl: 'FL',
                t2_heart_rate: 'Detak Jantung',
                t2_efw: 'Taksiran Berat (EFW)',
                t2_afi: 'AFI',
                t2_edd: 'HPL/EDD',
                t2_presentation: 'Presentasi',
                t2_placenta: 'Plasenta',
                t2_gender: 'Jenis Kelamin',
                t3_bpd: 'BPD',
                t3_ac: 'AC',
                t3_fl: 'FL',
                t3_heart_rate: 'Detak Jantung',
                t3_efw: 'Taksiran Berat (EFW)',
                t3_afi: 'AFI',
                t3_edd: 'HPL/EDD',
                t3_presentation: 'Presentasi',
                t3_placenta: 'Plasenta',
                t3_gender: 'Jenis Kelamin'
            };

            let html = '<table class="table table-sm table-bordered mb-0">';
            for (const [key, value] of Object.entries(formData)) {
                if (!value || key === 'type' || key === 'trimester' || key.endsWith('_date')) continue;
                const label = labels[key] || key;
                html += `<tr><td class="font-weight-bold">${label}</td><td>${value}</td></tr>`;
            }
            html += '</table>';

            if (data.confidence) {
                html += `<p class="text-muted mt-2 mb-0"><small>Confidence: ${data.confidence.percentage}%</small></p>`;
            }

            return html;
        }

        const photoInput = document.getElementById('usg-photo-upload');
        if (photoInput) {
            console.log('[USG Obstetri] Photo input found, attaching handler');

            // Remove any existing handlers first
            const newInput = photoInput.cloneNode(true);
            photoInput.parentNode.replaceChild(newInput, photoInput);

            newInput.addEventListener('change', (e) => {
                console.log('[USG Obstetri] Photo selected, files:', e.target.files.length);
                self.handlePhotoUpload(e);
            });

            // Update label on file select
            newInput.addEventListener('change', function() {
                const label = this.nextElementSibling;
                if (label && this.files.length > 0) {
                    label.textContent = this.files.length > 1
                        ? `${this.files.length} file dipilih`
                        : this.files[0].name;
                }
            });
        } else {
            console.warn('[USG Obstetri] Photo input not found!');
        }

        // Initialize photo remove handlers
        this.initPhotoRemoveHandlers();

        // Setup field change handlers for save button visibility
        document.querySelectorAll('.usg-field').forEach(field => {
            field.addEventListener('input', () => {
                const btn = document.getElementById('btn-save-usg');
                if (btn) btn.style.display = 'inline-block';
            });
            field.addEventListener('change', () => {
                const btn = document.getElementById('btn-save-usg');
                if (btn) btn.style.display = 'inline-block';
            });
        });
    }
};
