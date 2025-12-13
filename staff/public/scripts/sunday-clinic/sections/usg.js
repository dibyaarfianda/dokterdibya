import stateManager from '../utils/state-manager.js';
import apiClient from '../utils/api-client.js';
import { getMedicalRecordContext, formatDateDMY, escapeHtml } from '../utils/helpers.js';

// Helper function to get today's date in YYYY-MM-DD format for GMT+7
function getTodayDate() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));
    return gmt7Time.toISOString().split('T')[0];
}

// Expose the function to the global window object for inline event handlers
window.switchTrimester = function(trimester) {
    // Hide all trimester contents
    document.querySelectorAll('.trimester-content').forEach(content => {
        content.style.display = 'none';
    });

    // Show selected trimester
    const targetContent = document.getElementById(`usg-${trimester}-trimester`);
    if (targetContent) {
        targetContent.style.display = 'block';
    }

    // Update button states
    document.querySelectorAll('.trimester-selector .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Use event.target if available, otherwise find the button by value
    if (event && event.target) {
         const btn = event.target.closest('.btn');
         if (btn) btn.classList.add('active');
    } else {
        const activeButton = document.querySelector(`.trimester-selector input[value="${trimester}"]`);
        if (activeButton) {
            activeButton.closest('.btn').classList.add('active');
        }
    }
}

export function renderUSG() {
    const state = stateManager.getState();
    const context = getMedicalRecordContext(state, 'usg');
    const savedData = context ? (context.data || {}) : {};
    const hasSavedRecord = context && context.record && context.record.id;

    const today = getTodayDate();
    const usgDate = savedData.date || today;
    const trimester = (savedData.trimester || 'first').toLowerCase();

    const trimesterLabels = {
        'first': 'Trimester 1 (1-13w)',
        'second': 'Trimester 2 (14-27w)',
        'screening': 'Skrining Kelainan Kongenital (18-23w)',
        'third': 'Trimester 3 (28+w)'
    };

    let savedSummaryHtml = '';
    if (hasSavedRecord) {
        const summaryItems = [];
        const trimesterLabel = trimesterLabels[trimester] || `Trimester (${trimester})`;

        if (trimester === 'first') {
            if (savedData.date) summaryItems.push(`<strong>Tanggal:</strong> ${formatDateDMY(savedData.date)}`);
            if (savedData.embryo_count) {
                const embryoLabel = savedData.embryo_count === 'not_visible' ? 'Belum Tampak' : (savedData.embryo_count === 'single' ? 'Tunggal' : 'Multipel');
                summaryItems.push(`<strong>Jumlah Embrio:</strong> ${embryoLabel}`);
            }
            if (savedData.implantation) summaryItems.push(`<strong>Lokasi Implantasi:</strong> ${savedData.implantation === 'intrauterine' ? 'Dalam rahim' : 'Luar rahim/Ektopik'}`);
            if (savedData.crl_cm || savedData.crl_weeks) {
                const crlParts = [];
                if (savedData.crl_cm) crlParts.push(`${savedData.crl_cm} cm`);
                if (savedData.crl_weeks) crlParts.push(`${savedData.crl_weeks} minggu`);
                summaryItems.push(`<strong>CRL:</strong> ${crlParts.join(' / ')}`);
            }
            if (savedData.heart_rate) summaryItems.push(`<strong>Denyut Jantung:</strong> ${savedData.heart_rate} x/menit`);
            if (savedData.edd) summaryItems.push(`<strong>HPL:</strong> ${formatDateDMY(savedData.edd)}`);
            if (savedData.nt) summaryItems.push(`<strong>NT:</strong> ${savedData.nt} mm`);
        } else if (trimester === 'second') {
            if (savedData.date) summaryItems.push(`<strong>Tanggal:</strong> ${formatDateDMY(savedData.date)}`);
            if (savedData.fetus_count) summaryItems.push(`<strong>Jumlah Janin:</strong> ${savedData.fetus_count === 'single' ? 'Tunggal' : 'Multipel'}`);
            if (savedData.gender) summaryItems.push(`<strong>Jenis Kelamin:</strong> ${savedData.gender === 'male' ? 'Laki-laki' : 'Perempuan'}`);
            if (savedData.fetus_lie) summaryItems.push(`<strong>Letak Janin:</strong> ${savedData.fetus_lie}`);
            if (savedData.presentation) summaryItems.push(`<strong>Presentasi:</strong> ${savedData.presentation}`);
            if (savedData.bpd) summaryItems.push(`<strong>BPD:</strong> ${savedData.bpd} cm`);
            if (savedData.ac) summaryItems.push(`<strong>AC:</strong> ${savedData.ac} cm`);
            if (savedData.fl) summaryItems.push(`<strong>FL:</strong> ${savedData.fl} cm`);
            if (savedData.heart_rate) summaryItems.push(`<strong>Denyut Jantung:</strong> ${savedData.heart_rate} x/menit`);
            if (savedData.placenta) summaryItems.push(`<strong>Plasenta:</strong> ${savedData.placenta}`);
            if (savedData.placenta_previa) summaryItems.push(`<strong>Plasenta Previa:</strong> ${savedData.placenta_previa}`);
            if (savedData.afi) summaryItems.push(`<strong>AFI:</strong> ${savedData.afi} cm`);
            if (savedData.efw) summaryItems.push(`<strong>EFW:</strong> ${savedData.efw} gram`);
            if (savedData.edd) summaryItems.push(`<strong>HPL:</strong> ${formatDateDMY(savedData.edd)}`);
            if (savedData.notes) summaryItems.push(`<strong>Catatan:</strong> ${savedData.notes}`);
        } else if (trimester === 'third') {
            if (savedData.date) summaryItems.push(`<strong>Tanggal:</strong> ${formatDateDMY(savedData.date)}`);
            if (savedData.fetus_count) summaryItems.push(`<strong>Jumlah Janin:</strong> ${savedData.fetus_count === 'single' ? 'Tunggal' : 'Multipel'}`);
            if (savedData.gender) summaryItems.push(`<strong>Jenis Kelamin:</strong> ${savedData.gender === 'male' ? 'Laki-laki' : 'Perempuan'}`);
            if (savedData.fetus_lie) summaryItems.push(`<strong>Letak Janin:</strong> ${savedData.fetus_lie}`);
            if (savedData.presentation) summaryItems.push(`<strong>Presentasi:</strong> ${savedData.presentation}`);
            if (savedData.bpd) summaryItems.push(`<strong>BPD:</strong> ${savedData.bpd} cm`);
            if (savedData.ac) summaryItems.push(`<strong>AC:</strong> ${savedData.ac} cm`);
            if (savedData.fl) summaryItems.push(`<strong>FL:</strong> ${savedData.fl} cm`);
            if (savedData.heart_rate) summaryItems.push(`<strong>Denyut Jantung:</strong> ${savedData.heart_rate} x/menit`);
            if (savedData.placenta) summaryItems.push(`<strong>Plasenta:</strong> ${savedData.placenta}`);
            if (savedData.placenta_previa) summaryItems.push(`<strong>Plasenta Previa:</strong> ${savedData.placenta_previa}`);
            if (savedData.afi) summaryItems.push(`<strong>AFI:</strong> ${savedData.afi} cm`);
            if (savedData.efw) summaryItems.push(`<strong>EFW:</strong> ${savedData.efw} gram`);
            if (savedData.edd) summaryItems.push(`<strong>HPL:</strong> ${formatDateDMY(savedData.edd)}`);
            if (savedData.membrane_sweep) summaryItems.push(`<strong>Pelepasan Selaput:</strong> ${savedData.membrane_sweep === 'yes' ? 'Ya' : 'Tidak'}`);
            if (savedData.contraception && savedData.contraception.length > 0) summaryItems.push(`<strong>KB:</strong> ${savedData.contraception.join(', ')}`);
        } else if (trimester === 'screening') {
            if (savedData.date) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Tanggal:</strong> ${formatDateDMY(savedData.date)}</div>`);
            
            // Biometrik data
            if (savedData.diameter_kepala) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Diameter Kepala:</strong> ${escapeHtml(savedData.diameter_kepala)} minggu</div>`);
            if (savedData.lingkar_kepala) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Lingkar Kepala:</strong> ${escapeHtml(savedData.lingkar_kepala)} minggu</div>`);
            if (savedData.lingkar_perut) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Lingkar Perut:</strong> ${escapeHtml(savedData.lingkar_perut)} minggu</div>`);
            if (savedData.panjang_tulang_paha) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Panjang Tulang Paha:</strong> ${escapeHtml(savedData.panjang_tulang_paha)} minggu</div>`);
            if (savedData.taksiran_berat_janin) summaryItems.push(`<div class="col-md-6 mb-2"><strong>Taksiran Berat Janin:</strong> ${escapeHtml(savedData.taksiran_berat_janin)} gram</div>`);
            
            // Collect all checked screening items
            const screeningFindings = [];
            
            // Kepala dan Otak
            if (savedData.simetris_hemisfer) screeningFindings.push('Simetris hemisfer serebral');
            if (savedData.falx_bpd) screeningFindings.push('Ventrikel lateral, Atrium < 10 mm');
            if (savedData.ventrikel) screeningFindings.push('Ventrikel sereberal, cisterna magna');
            if (savedData.cavum_septum) screeningFindings.push('Cavum septum pellucidum');
            
            // Muka dan Leher
            if (savedData.profil_muka) screeningFindings.push('Profil muka normal');
            if (savedData.tulang_hidung) screeningFindings.push('Tulang hidung tampak, ukuran normal');
            if (savedData.garis_bibir) screeningFindings.push('Garis bibir atas menyambung');
            
            // Jantung dan Rongga Dada
            if (savedData.four_chamber) screeningFindings.push('Gambaran jelas 4-chamber view');
            if (savedData.jantung_kiri) screeningFindings.push('Jantung di sebelah kiri');
            if (savedData.septum_interv) screeningFindings.push('Apex jantung kearah kiri (~45°)');
            if (savedData.besar_jantung) screeningFindings.push('Besar jantung <1/3 area dada');
            if (savedData.dua_atrium) screeningFindings.push('Dua atrium dan dua ventrikel');
            if (savedData.katup_atrioventricular) screeningFindings.push('Katup atrioventricular');
            if (savedData.ritme_jantung) screeningFindings.push('Ritme jantung reguler');
            if (savedData.echogenic_pads) screeningFindings.push('Echogenic pada lapang paru');
            
            // Tulang Belakang
            if (savedData.vertebra) screeningFindings.push('Tidak tampak kelainan vertebra');
            if (savedData.kulit_dorsal) screeningFindings.push('Garis kulit tampak baik');
            
            // Anggota Gerak
            if (savedData.alat_gerak_atas) screeningFindings.push('Alat gerak kiri kanan atas normal');
            if (savedData.alat_gerak_bawah) screeningFindings.push('Alat gerak kiri kanan bawah normal');
            if (savedData.visual_tangan) screeningFindings.push('Visualisasi tangan dan kaki baik');
            
            // Rongga Perut
            if (savedData.lambung_kiri) screeningFindings.push('Lambung di sebelah kiri');
            if (savedData.posisi_liver) screeningFindings.push('Posisi liver dan echogenocity normal');
            if (savedData.ginjal_kiri_kanan) screeningFindings.push('Terlihat ginjal kiri & kanan');
            if (savedData.ginjal_echohypoic) screeningFindings.push('Ginjal tampak hipoechoic dibanding usus');
            if (savedData.kandung_kemih) screeningFindings.push('Kandung kemih terisi');
            if (savedData.insersi_tali_pusat) screeningFindings.push('Insersi tali pusat baik');
            if (savedData.dinding_perut) screeningFindings.push('Dinding perut tidak tampak defek');
            
            // Plasenta dan Air Ketuban
            if (savedData.lokasi_plasenta && savedData.lokasi_plasenta_text) screeningFindings.push(`Lokasi plasenta: ${escapeHtml(savedData.lokasi_plasenta_text)}`);
            if (savedData.tekstur_plasenta) screeningFindings.push('Tekstur plasenta homogen');
            if (savedData.volume_ketuban) screeningFindings.push('Volume ketuban cukup');
            if (savedData.panjang_serviks && savedData.panjang_serviks_text) screeningFindings.push(`Panjang serviks: ${escapeHtml(savedData.panjang_serviks_text)} cm`);
            
            // Lainnya
            if (savedData.gerak_janin_baik) screeningFindings.push('Gerak janin baik');
            if (savedData.gender) screeningFindings.push(`Jenis kelamin: ${savedData.gender === 'male' ? 'Laki-laki' : 'Perempuan'}`);
            
            // Add screening findings summary
            if (screeningFindings.length > 0) {
                summaryItems.push(`<div class="col-md-12 mb-2"><strong>Pada skrining kelainan kongenital mayor, kami dapatkan:</strong></div>`);
                screeningFindings.forEach(finding => {
                    summaryItems.push(`<div class="col-md-6" style="padding-left: 20px;">• ${finding}</div>`);
                });
            }
            
            // Kesimpulan
            if (savedData.tidak_kelainan) summaryItems.push(`<div class="col-md-12 mt-2"><strong>Kesimpulan:</strong> Tidak ditemukan kelainan</div>`);
            if (savedData.kecurigaan && savedData.kecurigaan_text) summaryItems.push(`<div class="col-md-12 mt-2"><strong>Kecurigaan:</strong> ${escapeHtml(savedData.kecurigaan_text)}</div>`);
        }

        // If there are saved items, show summary; otherwise treat as no saved record
        if (summaryItems.length > 0) {
            // For screening: items already contain their div wrappers (col-md-6 or col-md-12)
            // For other trimesters: items are plain strings, need col-md-6 wrapping
            const summaryContent = (trimester === 'screening') 
                ? summaryItems.join('') 
                : summaryItems.map(item => `<div class="col-md-6 mb-2">${item}</div>`).join('');
            
            savedSummaryHtml = `<div class="alert mb-3" style="background-color: #EDEDED; border-color: #DEDEDE;" id="usg-summary-container">
                   <h5 style="cursor: pointer; margin-bottom: 0;" data-toggle="collapse" data-target="#usg-summary-collapse">
                       <i class="fas fa-check-circle" style="color: #28a745;"></i> ${trimesterLabel} - <span style="color: #007bff;">Data Tersimpan</span>
                       <i class="fas fa-chevron-down float-right" style="transition: transform 0.3s; transform: rotate(-90deg);"></i>
                   </h5>
                   <div id="usg-summary-collapse" class="collapse">
                       <hr>
                       <div class="row" style="font-size: 0.875rem; font-weight: 300;">
                           ${summaryContent}
                       </div>
                   </div>
                   <hr>
                   <button class="btn btn-warning btn-sm mr-2" id="btn-edit-usg">
                       <i class="fas fa-edit"></i> Edit
                   </button>
                   <button class="btn btn-danger btn-sm" id="btn-reset-usg">
                       <i class="fas fa-trash"></i> Reset
                   </button>
               </div>`;
        } else {
            // No actual data saved, treat as new record
            savedSummaryHtml = '';
        }
    }
    
    // Override hasSavedRecord if no summary data exists
    // If no record OR no saved summary, always show form
    const showForm = !hasSavedRecord || !savedSummaryHtml;

    const metaHtml = context ? `<div class="sc-note">Dicatat oleh ${escapeHtml(context.record.doctorName || 'N/A')} pada ${formatDateDMY(context.record.createdAt)}</div>` : '';

    // When editing existing data, show only the saved trimester (locked)
    // When creating new data, show all 4 trimester options
    const trimesterSelectorHtml = !showForm
        ? `<div class="alert alert-secondary mb-3"><strong><i class="fas fa-calendar-check"></i> ${trimesterLabels[trimester]}</strong></div>`
        : hasSavedRecord && savedSummaryHtml
        ? `<div class="alert alert-info mb-3">
               <strong><i class="fas fa-lock"></i> Mengedit: ${trimesterLabels[trimester]}</strong>
               <small class="d-block text-muted mt-1">Trimester terkunci untuk data yang sudah disimpan. Gunakan tombol Reset untuk memulai dari awal.</small>
           </div>`
        : `<div class="trimester-selector mb-4">
               <div class="btn-group btn-group-toggle" data-toggle="buttons">
                   <label class="btn btn-outline-primary ${trimester === 'first' ? 'active' : ''}" onclick="switchTrimester('first')">
                       <input type="radio" name="trimester" value="first" ${trimester === 'first' ? 'checked' : ''}> Trimester 1 (1-13w)
                   </label>
                   <label class="btn btn-outline-primary ${trimester === 'second' ? 'active' : ''}" onclick="switchTrimester('second')">
                       <input type="radio" name="trimester" value="second" ${trimester === 'second' ? 'checked' : ''}> Trimester 2 (14-27w)
                   </label>
                   <label class="btn btn-outline-primary ${trimester === 'screening' ? 'active' : ''}" onclick="switchTrimester('screening')">
                       <input type="radio" name="trimester" value="screening" ${trimester === 'screening' ? 'checked' : ''}> Skrining (18-23w)
                   </label>
                   <label class="btn btn-outline-primary ${trimester === 'third' ? 'active' : ''}" onclick="switchTrimester('third')">
                       <input type="radio" name="trimester" value="third" ${trimester === 'third' ? 'checked' : ''}> Trimester 3 (28+w)
                   </label>
               </div>
           </div>`;

    const html = `
        <div class="sc-section-header d-flex justify-content-between">
            <h3>USG Obstetri</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            ${savedSummaryHtml}

            <div id="usg-edit-form" style="display: ${showForm ? 'block' : 'none'};">
            ${trimesterSelectorHtml}

            <!-- First Trimester -->
            <div id="usg-first-trimester" class="trimester-content" style="display: ${trimester === 'first' ? 'block' : 'none'};">
                <h4 class="mb-3">JANIN (Fetus) - Trimester Pertama</h4>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-first-date" style="width: 150.923076px;" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Jumlah Embrio/Janin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_embryo_count" id="first-not-visible" value="not_visible" ${savedData.embryo_count === 'not_visible' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-not-visible">Belum Tampak</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_embryo_count" id="first-single" value="single" ${(savedData.embryo_count || 'single') === 'single' && savedData.embryo_count !== 'not_visible' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_embryo_count" id="first-multiple" value="multiple" ${savedData.embryo_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Panjang Kepala-Ekor (CRL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-first-crl-cm" placeholder="cm" value="${escapeHtml(savedData.crl_cm || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm ~</span></div>
                            <input type="number" step="1" class="form-control usg-field" id="usg-first-crl-weeks" placeholder="minggu" value="${escapeHtml(savedData.crl_weeks || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Lokasi Implantasi</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_implantation" id="first-intrauterine" value="intrauterine" ${(savedData.implantation || 'intrauterine') === 'intrauterine' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-intrauterine">Dalam rahim</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_implantation" id="first-ectopic" value="ectopic">
                                <label class="custom-control-label" for="first-ectopic">Luar rahim / Ektopik</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Detak Jantung</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-first-heart-rate" placeholder="x/menit" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-first-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Cairan Tengkuk Janin (NT)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-first-nt" placeholder="mm" value="${escapeHtml(savedData.nt || '')}">
                            <div class="input-group-append"><span class="input-group-text">mm (&lt;3.5)</span></div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="font-weight-bold">Notes</label>
                    <textarea class="form-control usg-field" id="usg-first-notes" rows="2" readonly>Posisi janin harus menghadap kedepan dengan kepala sedikit menunduk untuk mendapatkan gambaran nuchal translucency (NT)</textarea>
                </div>
                <div class="mt-3 text-right">
                    <button class="btn btn-primary" id="btn-save-usg">
                        <i class="fas fa-save"></i> Simpan Data USG
                    </button>
                </div>
            </div>

            <!-- Second Trimester -->
            <div id="usg-second-trimester" class="trimester-content" style="display: ${trimester === 'second' ? 'block' : 'none'};">
                <h4 class="mb-3">BIOMETRI JANIN (Fetal Biometry) - Trimester Kedua</h4>
                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-second-date" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Jumlah Janin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_count" id="second-single" value="single" ${(savedData.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_count" id="second-multiple" value="multiple" ${savedData.fetus_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Kelamin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_gender" id="second-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-male">Laki-laki</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_gender" id="second-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-female">Perempuan</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Letak Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-longitudinal" value="longitudinal" ${savedData.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-longitudinal">Membujur</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-transverse" value="transverse" ${savedData.fetus_lie === 'transverse' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-transverse">Melintang</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-oblique" value="oblique" ${savedData.fetus_lie === 'oblique' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-oblique">Oblique</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Presentasi Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-cephalic" value="cephalic" ${savedData.presentation === 'cephalic' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-cephalic">Kepala</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-breech" value="breech" ${savedData.presentation === 'breech' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-breech">Bokong</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-shoulder" value="shoulder" ${savedData.presentation === 'shoulder' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-shoulder">Bahu/Punggung</label>
                            </div>
                        </div>
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-3">
                        <label>Diameter Parietal Kepala (BPD)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-bpd" value="${escapeHtml(savedData.bpd || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Lingkar Perut Janin (AC)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-ac" value="${escapeHtml(savedData.ac || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Panjang Tulang Paha (FL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-fl" value="${escapeHtml(savedData.fl || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Detak Jantung (HR)</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-second-heart-rate" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
                <div class="form-row">
                    <div class="form-group col-md-12">
                        <label class="font-weight-bold">Lokasi Plasenta</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-anterior" value="anterior" ${savedData.placenta === 'anterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-anterior">Anterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-posterior" value="posterior" ${savedData.placenta === 'posterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-posterior">Posterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-fundus" value="fundus" ${savedData.placenta === 'fundus' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-fundus">Fundus</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-lateral" value="lateral" ${savedData.placenta === 'lateral' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-lateral">Lateral</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Plasenta Previa</label>
                        <input type="text" class="form-control usg-field" id="usg-second-placenta-previa" placeholder="Jika ada, sebutkan..." value="${escapeHtml(savedData.placenta_previa || '')}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label>AFI (Amniotic Fluid Index)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-afi" value="${escapeHtml(savedData.afi || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Taksiran Berat Janin (EFW)</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="usg-second-efw" placeholder="gram" value="${escapeHtml(savedData.efw || '')}">
                            <div class="input-group-append"><span class="input-group-text">gram</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-second-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="font-weight-bold">Notes</label>
                    <textarea class="form-control usg-field" id="usg-second-notes" rows="2" placeholder="Pemeriksaan skrining kelainan kongenital dilakukan di usia kehamilan 18-21 minggu. Bila ditemukan kelainan bawaan, dikonsulkan kepada Subspesialis Fetomaternal">${escapeHtml(savedData.notes || '')}</textarea>
                </div>
                <div class="mt-3 text-right">
                    <button class="btn btn-primary" id="btn-save-usg">
                        <i class="fas fa-save"></i> Simpan Data USG
                    </button>
                </div>
            </div>

            <!-- Screening -->
            <div id="usg-screening-trimester" class="trimester-content" style="display: ${trimester === 'screening' ? 'block' : 'none'};">
                <h4 class="mb-3">SCREENING ULTRASONOGRAFI ABDOMINAL (Trimester Kedua)</h4>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-screening-date" style="width: 150.923076px;" value="${escapeHtml(usgDate)}">
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-6"><label>Diameter Kepala</label><div class="input-group"><input type="text" class="form-control usg-field" id="scr-diameter-kepala-text" value="${escapeHtml(savedData.diameter_kepala || '')}"><div class="input-group-append"><span class="input-group-text">minggu</span></div></div></div>
                    <div class="form-group col-md-6"><label>Lingkar Kepala</label><div class="input-group"><input type="text" class="form-control usg-field" id="scr-lingkar-kepala-text" value="${escapeHtml(savedData.lingkar_kepala || '')}"><div class="input-group-append"><span class="input-group-text">minggu</span></div></div></div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6"><label>Lingkar Perut</label><div class="input-group"><input type="text" class="form-control usg-field" id="scr-lingkar-perut-text" value="${escapeHtml(savedData.lingkar_perut || '')}"><div class="input-group-append"><span class="input-group-text">minggu</span></div></div></div>
                    <div class="form-group col-md-6"><label>Panjang Tulang Paha</label><div class="input-group"><input type="text" class="form-control usg-field" id="scr-panjang-tulang-paha-text" value="${escapeHtml(savedData.panjang_tulang_paha || '')}"><div class="input-group-append"><span class="input-group-text">minggu</span></div></div></div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6"><label>Taksiran Berat Janin</label><div class="input-group"><input type="text" class="form-control usg-field" id="scr-taksiran-berat-janin-text" value="${escapeHtml(savedData.taksiran_berat_janin || '')}"><div class="input-group-append"><span class="input-group-text">gram</span></div></div></div>
                </div>
                <div class="card bg-light mb-3">
                    <div class="card-body py-2">
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input" id="scr-select-all">
                            <label class="custom-control-label font-weight-bold text-primary" for="scr-select-all">
                                <i class="fas fa-check-double"></i> Pilih Semua (Normal)
                            </label>
                        </div>
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Kepala dan Otak:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-simetris-hemisfer" ${savedData.simetris_hemisfer ? 'checked' : ''}><label class="custom-control-label" for="scr-simetris-hemisfer">Simetris hemisfer serebral</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-falx-bpd" ${savedData.falx_bpd ? 'checked' : ''}><label class="custom-control-label" for="scr-falx-bpd">Ventrikel lateral, Atrium < 10 mm</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-ventrikel" ${savedData.ventrikel ? 'checked' : ''}><label class="custom-control-label" for="scr-ventrikel">Ventrikel sereberal, cisterna magna</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-cavum-septum" ${savedData.cavum_septum ? 'checked' : ''}><label class="custom-control-label" for="scr-cavum-septum">Cavum septum pellucidum</label></div>
                </div>
                <h5 class="mt-3 mb-2">Muka dan Leher:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-profil-muka" ${savedData.profil_muka ? 'checked' : ''}><label class="custom-control-label" for="scr-profil-muka">Profil muka normal</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-bibir-langit" ${savedData.tulang_hidung ? 'checked' : ''}><label class="custom-control-label" for="scr-bibir-langit">Tulang hidung tampak, ukuran normal</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-lens-bibir" ${savedData.garis_bibir ? 'checked' : ''}><label class="custom-control-label" for="scr-lens-bibir">Garis bibir atas menyambung</label></div>
                </div>
                <h5 class="mt-3 mb-2">Jantung dan Rongga Dada:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-4chamber" ${savedData.four_chamber ? 'checked' : ''}><label class="custom-control-label" for="scr-4chamber">Gambaran jelas 4-chamber view</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-jantung-kiri" ${savedData.jantung_kiri ? 'checked' : ''}><label class="custom-control-label" for="scr-jantung-kiri">Jantung di sebelah kiri</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-septum-interv" ${savedData.septum_interv ? 'checked' : ''}><label class="custom-control-label" for="scr-septum-interv">Apex jantung kearah kiri (~45')</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-besar-jantung" ${savedData.besar_jantung ? 'checked' : ''}><label class="custom-control-label" for="scr-besar-jantung">Besar jantung <1/3 area dada</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-dua-atrium" ${savedData.dua_atrium ? 'checked' : ''}><label class="custom-control-label" for="scr-dua-atrium">Dua atrium dan dua ventrikel</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-irama-jantung" ${savedData.katup_atrioventricular ? 'checked' : ''}><label class="custom-control-label" for="scr-irama-jantung">Katup atrioventricular</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-ritme-jantung" ${savedData.ritme_jantung ? 'checked' : ''}><label class="custom-control-label" for="scr-ritme-jantung">Ritme jantung reguler</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-echogenic-pads" ${savedData.echogenic_pads ? 'checked' : ''}><label class="custom-control-label" for="scr-echogenic-pads">Echogenic pada lapang paru</label></div>
                </div>
                <h5 class="mt-3 mb-2">Tulang Belakang:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-vertebra" ${savedData.vertebra ? 'checked' : ''}><label class="custom-control-label" for="scr-vertebra">Tidak tampak kelainan vertebra</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-kulit-dorsal" ${savedData.kulit_dorsal ? 'checked' : ''}><label class="custom-control-label" for="scr-kulit-dorsal">Garis kulit tampak baik</label></div>
                </div>
                <h5 class="mt-3 mb-2">Anggota Gerak:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-gerakan-lengan" ${savedData.alat_gerak_atas ? 'checked' : ''}><label class="custom-control-label" for="scr-gerakan-lengan">Alat gerak kiri kanan atas normal</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-alat-gerak" ${savedData.alat_gerak_bawah ? 'checked' : ''}><label class="custom-control-label" for="scr-alat-gerak">Alat gerak kiri kanan bawah normal</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-visual-tangan" ${savedData.visual_tangan ? 'checked' : ''}><label class="custom-control-label" for="scr-visual-tangan">Visualisasi tangan dan kaki baik</label></div>
                </div>
                <h5 class="mt-3 mb-2">Rongga perut:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-lambung-kiri" ${savedData.lambung_kiri ? 'checked' : ''}><label class="custom-control-label" for="scr-lambung-kiri">Lambung di sebelah kiri</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-posisi-liver" ${savedData.posisi_liver ? 'checked' : ''}><label class="custom-control-label" for="scr-posisi-liver">Posisi liver dan echogenocity normal</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-ginjal-kiri-kanan" ${savedData.ginjal_kiri_kanan ? 'checked' : ''}><label class="custom-control-label" for="scr-ginjal-kiri-kanan">Terlihat ginjal kiri & kanan</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-ginjal-echohypoic" ${savedData.ginjal_echohypoic ? 'checked' : ''}><label class="custom-control-label" for="scr-ginjal-echohypoic">Ginjal tampak hipoechoic dibanding usus</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-kandung-kemih" ${savedData.kandung_kemih ? 'checked' : ''}><label class="custom-control-label" for="scr-kandung-kemih">Kandung kemih terisi</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-hawa-jantung" ${savedData.insersi_tali_pusat ? 'checked' : ''}><label class="custom-control-label" for="scr-hawa-jantung">Insersi tali pusat baik</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-masa-padat" ${savedData.dinding_perut ? 'checked' : ''}><label class="custom-control-label" for="scr-masa-padat">Dinding perut tidak tampak defek</label></div>
                </div>
                <h5 class="mt-3 mb-2">Plasenta dan Air Ketuban:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox mb-2"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-lokasi-plasenta" ${savedData.lokasi_plasenta ? 'checked' : ''}><label class="custom-control-label" for="scr-lokasi-plasenta">Lokasi plasenta</label></div>
                    <div class="form-row mb-2"><div class="form-group col-md-6 mb-0"><input type="text" class="form-control usg-field" id="scr-lokasi-plasenta-text" placeholder="Sebutkan lokasi plasenta..." value="${escapeHtml(savedData.lokasi_plasenta_text || '')}"></div></div>
                    <div class="custom-control custom-checkbox mb-2"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-tekstur-plasenta" ${savedData.tekstur_plasenta ? 'checked' : ''}><label class="custom-control-label" for="scr-tekstur-plasenta">Tekstur plasenta homogen</label></div>
                    <div class="custom-control custom-checkbox mb-2"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-volume-ketuban" ${savedData.volume_ketuban ? 'checked' : ''}><label class="custom-control-label" for="scr-volume-ketuban">Volume ketuban cukup</label></div>
                    <div class="custom-control custom-checkbox mb-2"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-warna-jernih" ${savedData.panjang_serviks ? 'checked' : ''}><label class="custom-control-label" for="scr-warna-jernih">Panjang serviks</label></div>
                    <div class="form-row"><div class="form-group col-md-4 mb-0"><div class="input-group"><input type="text" class="form-control usg-field" id="scr-panjang-serviks-text" placeholder="Panjang serviks" value="${escapeHtml(savedData.panjang_serviks_text || '')}"><div class="input-group-append"><span class="input-group-text">cm</span></div></div></div></div>
                </div>
                <h5 class="mt-3 mb-2">Lainnya:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field screening-checkbox" id="scr-gerak-janin-baik" ${savedData.gerak_janin_baik ? 'checked' : ''}><label class="custom-control-label" for="scr-gerak-janin-baik">Gerak janin baik</label></div>
                    <div class="form-group mt-2"><label class="font-weight-bold">Jenis kelamin</label><div><div class="custom-control custom-radio d-inline-block mr-3"><input type="radio" class="custom-control-input usg-field" name="screening_gender" id="scr-gender-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}><label class="custom-control-label" for="scr-gender-male">Laki-laki</label></div><div class="custom-control custom-radio d-inline-block"><input type="radio" class="custom-control-input usg-field" name="screening_gender" id="scr-gender-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}><label class="custom-control-label" for="scr-gender-female">Perempuan</label></div></div></div>
                </div>
                <h5 class="mt-3 mb-2">KESIMPULAN</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox mb-3"><input type="checkbox" class="custom-control-input usg-field" id="scr-tidak-kelainan" ${savedData.tidak_kelainan ? 'checked' : ''}><label class="custom-control-label" for="scr-tidak-kelainan">Tidak ditemukan kelainan</label></div>
                    <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field" id="scr-kecurigaan" ${savedData.kecurigaan ? 'checked' : ''}><label class="custom-control-label" for="scr-kecurigaan">Kecurigaan</label></div>
                    <div class="mt-2"><textarea class="form-control usg-field" id="usg-screening-kecurigaan-text" style="width: 100%; height: 71px;">${escapeHtml(savedData.kecurigaan_text || '')}</textarea></div>
                </div>
                <div class="mt-3 text-right">
                    <button class="btn btn-primary" id="btn-save-usg">
                        <i class="fas fa-save"></i> Simpan Data USG
                    </button>
                </div>
            </div>

            <!-- Third Trimester -->
            <div id="usg-third-trimester" class="trimester-content" style="display: ${trimester === 'third' ? 'block' : 'none'};">
                <h4 class="mb-3">BIOMETRI JANIN (Fetal Biometry) - Trimester Ketiga</h4>
                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-third-date" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Jumlah Janin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_count" id="third-single" value="single" ${(savedData.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_count" id="third-multiple" value="multiple" ${savedData.fetus_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Kelamin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_gender" id="third-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-male">Laki-laki</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="third_gender" id="third-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-female">Perempuan</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Letak Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-longitudinal" value="longitudinal" ${savedData.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-longitudinal">Membujur</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-transverse" value="transverse" ${savedData.fetus_lie === 'transverse' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-transverse">Melintang</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-oblique" value="oblique" ${savedData.fetus_lie === 'oblique' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-oblique">Oblique</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Presentasi Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-cephalic" value="cephalic" ${savedData.presentation === 'cephalic' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-cephalic">Kepala</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-breech" value="breech" ${savedData.presentation === 'breech' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-breech">Bokong</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-shoulder" value="shoulder" ${savedData.presentation === 'shoulder' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-shoulder">Bahu/Punggung</label>
                            </div>
                        </div>
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-3">
                        <label>Diameter Parietal Kepala (BPD)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-bpd" value="${escapeHtml(savedData.bpd || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Lingkar Perut Janin (AC)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-ac" value="${escapeHtml(savedData.ac || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Panjang Tulang Paha (FL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-fl" value="${escapeHtml(savedData.fl || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Detak Jantung (HR)</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-third-heart-rate" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
                <div class="form-row">
                    <div class="form-group col-md-12">
                        <label class="font-weight-bold">Lokasi Plasenta</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-anterior" value="anterior" ${savedData.placenta === 'anterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-anterior">Anterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-posterior" value="posterior" ${savedData.placenta === 'posterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-posterior">Posterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-fundus" value="fundus" ${savedData.placenta === 'fundus' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-fundus">Fundus</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-lateral" value="lateral" ${savedData.placenta === 'lateral' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-lateral">Lateral</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Plasenta Previa</label>
                        <input type="text" class="form-control usg-field" id="usg-third-placenta-previa" placeholder="Jika ada, sebutkan..." value="${escapeHtml(savedData.placenta_previa || '')}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label>AFI (Amniotic Fluid Index)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-afi" value="${escapeHtml(savedData.afi || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Taksiran Berat Janin (EFW)</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="usg-third-efw" placeholder="gram" value="${escapeHtml(savedData.efw || '')}">
                            <div class="input-group-append"><span class="input-group-text">gram</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-third-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                </div>
                <h5 class="mt-3 mb-2">Tindakan & Rencana</h5>
                <div class="form-group">
                    <label class="font-weight-bold">Pelepasan Selaput (Membrane Sweep)</label>
                    <div>
                        <div class="custom-control custom-radio d-inline-block mr-3"><input type="radio" class="custom-control-input usg-field" name="third_membrane_sweep" id="sweep-no" value="no" ${savedData.membrane_sweep !== 'yes' ? 'checked' : ''}><label class="custom-control-label" for="sweep-no">Tidak dilakukan</label></div>
                        <div class="custom-control custom-radio d-inline-block"><input type="radio" class="custom-control-input usg-field" name="third_membrane_sweep" id="sweep-yes" value="yes" ${savedData.membrane_sweep === 'yes' ? 'checked' : ''}><label class="custom-control-label" for="sweep-yes">Dilakukan</label></div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="font-weight-bold">Rencana KB Pasca Salin</label>
                    <div class="d-flex flex-wrap">
                        <div class="custom-control custom-checkbox mr-3"><input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="kb-iud" value="IUD" ${(savedData.contraception || []).includes('IUD') ? 'checked' : ''}><label class="custom-control-label" for="kb-iud">IUD</label></div>
                        <div class="custom-control custom-checkbox mr-3"><input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="kb-implant" value="Implant" ${(savedData.contraception || []).includes('Implant') ? 'checked' : ''}><label class="custom-control-label" for="kb-implant">Implant</label></div>
                        <div class="custom-control custom-checkbox mr-3"><input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="kb-suntik" value="Suntik" ${(savedData.contraception || []).includes('Suntik') ? 'checked' : ''}><label class="custom-control-label" for="kb-suntik">Suntik</label></div>
                        <div class="custom-control custom-checkbox mr-3"><input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="kb-pil" value="Pil" ${(savedData.contraception || []).includes('Pil') ? 'checked' : ''}><label class="custom-control-label" for="kb-pil">Pil</label></div>
                        <div class="custom-control custom-checkbox"><input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="kb-mow" value="MOW" ${(savedData.contraception || []).includes('MOW') ? 'checked' : ''}><label class="custom-control-label" for="kb-mow">MOW (Steril)</label></div>
                    </div>
                </div>
                <div class="mt-3 text-right">
                    <button class="btn btn-primary" id="btn-save-usg">
                        <i class="fas fa-save"></i> Simpan Data USG
                    </button>
                </div>
            </div>
            </div>
        </div>
    `;

    // Attach event listeners after DOM is ready
    setTimeout(() => {
        const container = document.querySelector('.section-container[data-section="usg"]');
        if (!container) {
            console.error('[USG] Container not found');
            return;
        }

        const saveBtns = container.querySelectorAll('#btn-save-usg');
        const editBtn = container.querySelector('#btn-edit-usg');
        const resetBtn = container.querySelector('#btn-reset-usg');
        const editForm = container.querySelector('#usg-edit-form');

        // Attach event listener to all Save buttons (one per trimester)
        saveBtns.forEach(btn => {
            btn.addEventListener('click', saveUSGExam);
        });
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                // Hide summary, show form
                const summaryContainer = container.querySelector('#usg-summary-container');
                if (summaryContainer) summaryContainer.style.display = 'none';
                
                if (editForm) {
                    editForm.style.display = 'block';
                    // Show only the saved trimester
                    const savedTrimester = context?.data?.trimester || 'first';
                    document.querySelectorAll('.trimester-content').forEach(content => {
                        content.style.display = 'none';
                    });
                    const savedContent = document.getElementById(`usg-${savedTrimester}-trimester`);
                    if (savedContent) savedContent.style.display = 'block';
                }
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset ALL USG data for this patient?')) {
                    try {
                        const patientId = state.derived?.patientId;
                        const mrId = state.currentMrId;
                        
                        if (!patientId) {
                            throw new Error('Patient ID not found');
                        }
                        
                        const response = await apiClient.delete(`/api/medical-records/by-type/usg?patientId=${patientId}&mrId=${mrId}`);
                        window.showSuccess(response.data?.message || 'USG data has been reset.');
                        
                        const SundayClinicApp = (await import('../main.js')).default;
                        await SundayClinicApp.fetchRecord(state.currentMrId);
                        SundayClinicApp.render(state.activeSection);
                    } catch (error) {
                        window.showError('Failed to reset USG data: ' + error.message);
                    }
                }
            });
        }
        
        const summaryCollapse = $(container).find('#usg-summary-collapse');
        if(summaryCollapse.length) {
            summaryCollapse.collapse('hide');
            summaryCollapse.on('show.bs.collapse', function () {
                $(this).closest('.alert').find('.fa-chevron-down').css('transform', 'rotate(0deg)');
            });
            summaryCollapse.on('hide.bs.collapse', function () {
                $(this).closest('.alert').find('.fa-chevron-down').css('transform', 'rotate(-90deg)');
            });
        }

        // Handle "Select All" checkbox for screening section
        const selectAllCheckbox = container.querySelector('#scr-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                const screeningCheckboxes = container.querySelectorAll('.screening-checkbox');
                screeningCheckboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
            });

            // Update "Select All" state when individual checkboxes change
            const screeningCheckboxes = container.querySelectorAll('.screening-checkbox');
            screeningCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    const allChecked = Array.from(screeningCheckboxes).every(cb => cb.checked);
                    const someChecked = Array.from(screeningCheckboxes).some(cb => cb.checked);
                    selectAllCheckbox.checked = allChecked;
                    selectAllCheckbox.indeterminate = someChecked && !allChecked;
                });
            });

            // Initialize indeterminate state
            const allChecked = Array.from(screeningCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(screeningCheckboxes).some(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        }
    }, 100);

    return html;
}

// Private flag to prevent double submission
let _savingUSGExam = false;

export async function saveUSGExam() {
    // Prevent double submission
    if (_savingUSGExam) {
        console.warn('[SundayClinic] USG save already in progress, ignoring duplicate call');
        return;
    }
    _savingUSGExam = true;
    
    const btn = document.getElementById('btn-save-usg');
    if (!btn) {
        _savingUSGExam = false;
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
        const state = stateManager.getState();
        const context = getMedicalRecordContext(state, 'usg');
        const existingRecordId = context?.record?.id;

        // Get trimester from selector, or from saved data if editing (when selector is locked/hidden)
        let activeTrimester = document.querySelector('.trimester-selector .btn.active input')?.value;
        if (!activeTrimester && context?.data?.trimester) {
            activeTrimester = context.data.trimester;
        }
        activeTrimester = activeTrimester || 'first';

        let usgData = { trimester: activeTrimester };

        if (activeTrimester === 'first') {
            usgData = {
                ...usgData,
                date: document.getElementById('usg-first-date')?.value || '',
                embryo_count: document.querySelector('input[name="first_embryo_count"]:checked')?.value || 'single',
                crl_cm: document.getElementById('usg-first-crl-cm')?.value || '',
                crl_weeks: document.getElementById('usg-first-crl-weeks')?.value || '',
                implantation: document.querySelector('input[name="first_implantation"]:checked')?.value || 'intrauterine',
                heart_rate: document.getElementById('usg-first-heart-rate')?.value || '',
                edd: document.getElementById('usg-first-edd')?.value || '',
                nt: document.getElementById('usg-first-nt')?.value || '',
                notes: document.getElementById('usg-first-notes')?.value || ''
            };
        } else if (activeTrimester === 'second') {
            usgData = {
                ...usgData,
                date: document.getElementById('usg-second-date')?.value || '',
                fetus_count: document.querySelector('input[name="second_fetus_count"]:checked')?.value || 'single',
                gender: document.querySelector('input[name="second_gender"]:checked')?.value || '',
                fetus_lie: document.querySelector('input[name="second_fetus_lie"]:checked')?.value || '',
                presentation: document.querySelector('input[name="second_presentation"]:checked')?.value || '',
                bpd: document.getElementById('usg-second-bpd')?.value || '',
                ac: document.getElementById('usg-second-ac')?.value || '',
                fl: document.getElementById('usg-second-fl')?.value || '',
                heart_rate: document.getElementById('usg-second-heart-rate')?.value || '',
                placenta: document.querySelector('input[name="second_placenta"]:checked')?.value || '',
                placenta_previa: document.getElementById('usg-second-placenta-previa')?.value || '',
                afi: document.getElementById('usg-second-afi')?.value || '',
                efw: document.getElementById('usg-second-efw')?.value || '',
                edd: document.getElementById('usg-second-edd')?.value || '',
                notes: document.getElementById('usg-second-notes')?.value || ''
            };
        } else if (activeTrimester === 'third') {
            const contraception = Array.from(document.querySelectorAll('input[name="third_contraception"]:checked'))
                .map(cb => cb.value);

            usgData = {
                ...usgData,
                date: document.getElementById('usg-third-date')?.value || '',
                fetus_count: document.querySelector('input[name="third_fetus_count"]:checked')?.value || 'single',
                gender: document.querySelector('input[name="third_gender"]:checked')?.value || '',
                fetus_lie: document.querySelector('input[name="third_fetus_lie"]:checked')?.value || '',
                presentation: document.querySelector('input[name="third_presentation"]:checked')?.value || '',
                bpd: document.getElementById('usg-third-bpd')?.value || '',
                ac: document.getElementById('usg-third-ac')?.value || '',
                fl: document.getElementById('usg-third-fl')?.value || '',
                heart_rate: document.getElementById('usg-third-heart-rate')?.value || '',
                placenta: document.querySelector('input[name="third_placenta"]:checked')?.value || '',
                placenta_previa: document.getElementById('usg-third-placenta-previa')?.value || '',
                afi: document.getElementById('usg-third-afi')?.value || '',
                efw: document.getElementById('usg-third-efw')?.value || '',
                edd: document.getElementById('usg-third-edd')?.value || '',
                membrane_sweep: document.querySelector('input[name="third_membrane_sweep"]:checked')?.value || 'no',
                contraception: contraception
            };
        } else if (activeTrimester === 'screening') {
            usgData = {
                ...usgData,
                date: document.getElementById('usg-screening-date')?.value || '',
                diameter_kepala: document.getElementById('scr-diameter-kepala-text')?.value || '',
                lingkar_kepala: document.getElementById('scr-lingkar-kepala-text')?.value || '',
                lingkar_perut: document.getElementById('scr-lingkar-perut-text')?.value || '',
                panjang_tulang_paha: document.getElementById('scr-panjang-tulang-paha-text')?.value || '',
                taksiran_berat_janin: document.getElementById('scr-taksiran-berat-janin-text')?.value || '',
                simetris_hemisfer: document.getElementById('scr-simetris-hemisfer')?.checked || false,
                falx_bpd: document.getElementById('scr-falx-bpd')?.checked || false,
                ventrikel: document.getElementById('scr-ventrikel')?.checked || false,
                cavum_septum: document.getElementById('scr-cavum-septum')?.checked || false,
                profil_muka: document.getElementById('scr-profil-muka')?.checked || false,
                tulang_hidung: document.getElementById('scr-bibir-langit')?.checked || false,
                garis_bibir: document.getElementById('scr-lens-bibir')?.checked || false,
                four_chamber: document.getElementById('scr-4chamber')?.checked || false,
                jantung_kiri: document.getElementById('scr-jantung-kiri')?.checked || false,
                septum_interv: document.getElementById('scr-septum-interv')?.checked || false,
                besar_jantung: document.getElementById('scr-besar-jantung')?.checked || false,
                dua_atrium: document.getElementById('scr-dua-atrium')?.checked || false,
                katup_atrioventricular: document.getElementById('scr-irama-jantung')?.checked || false,
                ritme_jantung: document.getElementById('scr-ritme-jantung')?.checked || false,
                echogenic_pads: document.getElementById('scr-echogenic-pads')?.checked || false,
                vertebra: document.getElementById('scr-vertebra')?.checked || false,
                kulit_dorsal: document.getElementById('scr-kulit-dorsal')?.checked || false,
                alat_gerak_atas: document.getElementById('scr-gerakan-lengan')?.checked || false,
                alat_gerak_bawah: document.getElementById('scr-alat-gerak')?.checked || false,
                visual_tangan: document.getElementById('scr-visual-tangan')?.checked || false,
                lambung_kiri: document.getElementById('scr-lambung-kiri')?.checked || false,
                posisi_liver: document.getElementById('scr-posisi-liver')?.checked || false,
                ginjal_kiri_kanan: document.getElementById('scr-ginjal-kiri-kanan')?.checked || false,
                ginjal_echohypoic: document.getElementById('scr-ginjal-echohypoic')?.checked || false,
                kandung_kemih: document.getElementById('scr-kandung-kemih')?.checked || false,
                insersi_tali_pusat: document.getElementById('scr-hawa-jantung')?.checked || false,
                dinding_perut: document.getElementById('scr-masa-padat')?.checked || false,
                lokasi_plasenta: document.getElementById('scr-lokasi-plasenta')?.checked || false,
                lokasi_plasenta_text: document.getElementById('scr-lokasi-plasenta-text')?.value || '',
                tekstur_plasenta: document.getElementById('scr-tekstur-plasenta')?.checked || false,
                volume_ketuban: document.getElementById('scr-volume-ketuban')?.checked || false,
                panjang_serviks: document.getElementById('scr-warna-jernih')?.checked || false,
                panjang_serviks_text: document.getElementById('scr-panjang-serviks-text')?.value || '',
                gerak_janin_baik: document.getElementById('scr-gerak-janin-baik')?.checked || false,
                gender: document.querySelector('input[name="screening_gender"]:checked')?.value || '',
                tidak_kelainan: document.getElementById('scr-tidak-kelainan')?.checked || false,
                kecurigaan: document.getElementById('scr-kecurigaan')?.checked || false,
                kecurigaan_text: document.getElementById('usg-screening-kecurigaan-text')?.value || ''
            };
        }

        const patientId = state.derived?.patientId;
        if (!patientId) {
            throw new Error('Patient ID not found');
        }

        const payload = {
            patientId,
            type: 'usg',
            data: usgData,
        };

        let response;
        if (existingRecordId) {
            response = await apiClient.put(`/api/medical-records/${existingRecordId}`, { 
                type: 'usg',
                data: usgData 
            });
        } else {
            response = await apiClient.post('/api/medical-records', payload);
        }

        window.showSuccess('USG data saved successfully!');
        const SundayClinicApp = (await import('../main.js')).default;
        await SundayClinicApp.fetchRecord(state.currentMrId);
        SundayClinicApp.render(state.activeSection);

    } catch (error) {
        console.error('Error saving USG record:', error);
        window.showError('Failed to save USG data: ' + error.message);
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
        }
        _savingUSGExam = false;
    }
}

// After render hook - setup event handlers after DOM is ready
async function afterRenderUSG() {
    console.log('[USG] afterRender called - setting up photo upload handler');

    const photoInput = document.getElementById('usg-photo-upload');
    if (photoInput) {
        console.log('[USG] Photo input found, attaching event handler');

        // Import the correct handler based on category
        const state = stateManager.getState();
        const category = state.derived?.mrCategory || 'obstetri';

        let handlePhotoUpload;

        try {
            if (category === 'obstetri') {
                const USGObstetri = (await import('../components/obstetri/usg-obstetri.js')).default;
                handlePhotoUpload = (e) => USGObstetri.handlePhotoUpload(e);
                USGObstetri.initPhotoRemoveHandlers();
            } else if (category === 'gyn_repro') {
                const module = await import('../components/gyn_repro/usg-gyn_repro.js');
                handlePhotoUpload = module.handlePhotoUpload || module.default?.handlePhotoUpload;
            } else {
                const USGGinekologi = (await import('../components/shared/usg-ginekologi.js')).default;
                handlePhotoUpload = (e) => USGGinekologi.handlePhotoUpload(e);
                USGGinekologi.initPhotoRemoveHandlers();
            }

            if (handlePhotoUpload) {
                photoInput.addEventListener('change', (e) => {
                    console.log('[USG] Photo input changed, files:', e.target.files.length);
                    handlePhotoUpload(e);
                });

                // Update label on file select
                photoInput.addEventListener('change', function() {
                    const label = this.nextElementSibling;
                    if (label && this.files.length > 0) {
                        label.textContent = this.files.length > 1
                            ? `${this.files.length} files selected`
                            : this.files[0].name;
                    }
                });

                console.log('[USG] Photo upload handler attached successfully');
            } else {
                console.warn('[USG] handlePhotoUpload function not found for category:', category);
            }
        } catch (err) {
            console.error('[USG] Error setting up photo upload handler:', err);
        }
    } else {
        console.warn('[USG] Photo input element not found');
    }

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

export default {
    render: renderUSG,
    afterRender: afterRenderUSG,
};
