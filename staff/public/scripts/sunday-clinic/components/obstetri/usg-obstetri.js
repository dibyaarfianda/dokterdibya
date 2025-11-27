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
        const context = getMedicalRecordContext(state, 'usg');
        const savedData = context?.data || {};

        // Use saved data if available
        const data = savedData;

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

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>USG Obstetri</h3>
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

            <script>
            // Initialize USG save handler
            setTimeout(async () => {
                // Show save button on any field change
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

                // Photo upload handler
                const USGObstetri = (await import('./usg-obstetri.js')).default;
                const photoInput = document.getElementById('usg-photo-upload');
                if (photoInput) {
                    photoInput.addEventListener('change', (e) => USGObstetri.handlePhotoUpload(e));
                }
                USGObstetri.initPhotoRemoveHandlers();

                // NOTE: Button already has onclick="window.saveUSGExam()" in HTML
                // No need to add onclick handler here to prevent double save
            }, 100);
            </script>
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
                <div class="form-group col-md-4">
                    <label class="font-weight-bold">Jumlah Embrio</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="t1_embryo_count" id="t1-single" value="single" ${(t1.embryo_count || 'single') === 'single' ? 'checked' : ''}>
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
                    <input type="date" class="form-control usg-field" name="t1_edd" value="${escapeHtml(t1.edd || '')}">
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
                    <input type="date" class="form-control usg-field" name="t2_edd" value="${escapeHtml(t2.edd || '')}">
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
                    <input type="checkbox" class="custom-control-input usg-field" id="scr-4chamber" name="scr_4chamber" ${scr.four_chamber ? 'checked' : ''}>
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
                    <label>HPL</label>
                    <input type="date" class="form-control usg-field" name="t3_edd" value="${escapeHtml(t3.edd || '')}">
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
            crl: document.querySelector('[name="t1_crl"]')?.value,
            ga_weeks: document.querySelector('[name="t1_ga_weeks"]')?.value,
            heart_rate: document.querySelector('[name="t1_heart_rate"]')?.value,
            implantation: document.querySelector('input[name="t1_implantation"]:checked')?.value,
            edd: document.querySelector('[name="t1_edd"]')?.value,
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
            membrane_sweep: document.querySelector('input[name="t3_membrane_sweep"]:checked')?.value,
            contraception: contraception
        };
    },

    // Photo helper methods
    renderPhotosGrid(photos) {
        if (!photos || photos.length === 0) {
            return '<div class="col-12"><p class="text-muted">Belum ada foto USG</p></div>';
        }
        return photos.map((photo, index) => `
            <div class="col-md-3 col-sm-4 col-6 mb-3">
                <div class="card h-100">
                    <a href="${photo.url}" target="_blank">
                        <img src="${photo.url}" class="card-img-top" alt="${photo.name}" style="height: 120px; object-fit: cover;">
                    </a>
                    <div class="card-body p-2">
                        <small class="text-truncate d-block">${photo.name}</small>
                        <button type="button" class="btn btn-xs btn-danger mt-1 usg-remove-photo" data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    async handlePhotoUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const maxSize = 10 * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`File ${file.name} terlalu besar. Maksimal 10MB.`);
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
            alert(`${result.files.length} foto berhasil diupload!`);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Gagal upload foto.');
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
    }
};
