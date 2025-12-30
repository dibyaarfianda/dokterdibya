/**
 * Medical Record Import Handler
 * Handles parsing text files and filling form fields
 */

// Store parsed data for applying to forms
let parsedImportData = null;

/**
 * Initialize file input handler
 */
function initMedicalImport() {
    const fileInput = document.getElementById('import-file');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Update custom file label when file is selected
    const customFileInput = document.querySelector('.custom-file-input');
    if (customFileInput) {
        customFileInput.addEventListener('change', function(e) {
            const fileName = e.target.files[0]?.name || 'Pilih file...';
            const label = this.nextElementSibling;
            if (label) label.textContent = fileName;
        });
    }
}

/**
 * Handle file selection
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const textarea = document.getElementById('import-text');
        if (textarea) {
            textarea.value = e.target.result;
        }
    };
    reader.readAsText(file);
}

/**
 * Parse the medical record text
 */
async function importMedicalParse() {
    const category = document.getElementById('import-category').value;
    const text = document.getElementById('import-text').value.trim();

    if (!category) {
        window.showToast('warning', 'Silakan pilih kategori terlebih dahulu');
        return;
    }

    if (!text) {
        window.showToast('warning', 'Silakan masukkan teks catatan medis atau upload file');
        return;
    }

    try {
        // Show loading
        const parseBtn = document.getElementById('btn-import-parse');
        const originalText = parseBtn.innerHTML;
        parseBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Parsing...';
        parseBtn.disabled = true;

        // Call API
        const token = localStorage.getItem('token');
        const response = await fetch('/api/medical-import/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text, category })
        });

        const result = await response.json();

        parseBtn.innerHTML = originalText;
        parseBtn.disabled = false;

        if (!result.success) {
            window.showToast('error', 'Gagal parsing: ' + result.message);
            return;
        }

        // Store parsed data
        parsedImportData = result.data;

        // Show preview
        showImportPreview(result.data);

    } catch (error) {
        console.error('Import error:', error);
        window.showToast('error', 'Error: ' + error.message);
        document.getElementById('btn-import-parse').innerHTML = '<i class="fas fa-search mr-1"></i>Parse & Preview';
        document.getElementById('btn-import-parse').disabled = false;
    }
}

/**
 * Check if there's an active MR loaded
 */
function hasActiveMR() {
    // Check via stateManager
    if (window.stateManager) {
        const state = window.stateManager.getState();
        if (state && state.mrId) {
            return true;
        }
    }

    // Check via URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mr')) {
        return true;
    }

    // Check via path
    const path = window.location.pathname;
    const match = path.match(/\/sunday-clinic\/([^\/]+)/);
    if (match && match[1]) {
        return true;
    }

    return false;
}

/**
 * Load patients for the selector
 */
async function loadPatientsForImport() {
    const select = document.getElementById('import-patient-select');
    if (!select) return;

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('vps_auth_token');
        const response = await fetch('/api/patients?limit=500', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success && result.data) {
            const patients = result.data.patients || result.data;
            select.innerHTML = '<option value="">-- Pilih Pasien --</option>';

            patients.forEach(p => {
                const patientId = p.id || p.patient_id;
                const name = p.full_name || p.name || 'Unknown';
                const option = document.createElement('option');
                option.value = patientId;
                option.textContent = `${patientId} - ${name}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

/**
 * Show preview of parsed data
 */
function showImportPreview(data) {
    const template = data.template;

    // Check if there's an active MR
    const hasActive = hasActiveMR();
    const patientSelectCard = document.getElementById('import-patient-select-card');
    const applyBtnText = document.getElementById('btn-import-apply-text');

    if (patientSelectCard) {
        if (hasActive) {
            patientSelectCard.style.display = 'none';
            if (applyBtnText) applyBtnText.textContent = 'Terapkan ke Form';
        } else {
            patientSelectCard.style.display = 'block';
            if (applyBtnText) applyBtnText.textContent = 'Buat MR & Terapkan';
            // Load patients for selector
            loadPatientsForImport();
        }
    }

    // Show AI parsing warning if applicable
    const warningContainer = document.getElementById('import-warning-container');
    if (warningContainer) {
        if (data.warning || data.ai_error) {
            let warningHtml = `<div class="alert alert-warning alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                <strong>Perhatian:</strong> ${data.warning || 'AI parsing gagal, hasil mungkin kurang akurat.'}`;
            if (data.ai_error) {
                warningHtml += `<br><small class="text-muted">Error: ${escapeHtml(data.ai_error)}</small>`;
            }
            warningHtml += `<button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button></div>`;
            warningContainer.innerHTML = warningHtml;
            warningContainer.style.display = 'block';
        } else {
            warningContainer.innerHTML = '';
            warningContainer.style.display = 'none';
        }
    }

    // Render Visit Info section (date and location)
    renderVisitInfoSection(data);

    // Render Identitas preview
    const identitasHtml = renderPreviewSection(template.identitas, {
        nama: 'Nama',
        jenis_kelamin: 'Jenis Kelamin',
        tanggal_lahir: 'Tanggal Lahir',
        tempat_lahir: 'Tempat Lahir',
        alamat: 'Alamat',
        no_hp: 'No HP',
        nik: 'NIK',
        pekerjaan: 'Pekerjaan',
        status_pernikahan: 'Status Pernikahan',
        tinggi_badan: 'Tinggi Badan (cm)',
        berat_badan: 'Berat Badan (kg)'
    });
    document.getElementById('preview-identitas').innerHTML = identitasHtml;

    // Render Anamnesa preview
    let anamnesaData = { ...template.anamnesa };
    if (template.obstetri) {
        anamnesaData = { ...anamnesaData, ...template.obstetri };
    }
    const anamnesaHtml = renderPreviewSection(anamnesaData, {
        keluhan_utama: 'Keluhan Utama',
        riwayat_penyakit_sekarang: 'Riwayat Penyakit Sekarang',
        riwayat_penyakit_dahulu: 'Riwayat Penyakit Dahulu',
        riwayat_penyakit_keluarga: 'Riwayat Penyakit Keluarga',
        hpht: 'HPHT',
        hpl: 'HPL',
        gravida: 'Gravida',
        para: 'Para',
        usia_kehamilan: 'Usia Kehamilan'
    });
    document.getElementById('preview-anamnesa').innerHTML = anamnesaHtml;

    // Render Pemeriksaan Fisik preview
    let pemeriksaanData = { ...template.pemeriksaan_fisik };
    if (template.obstetri) {
        pemeriksaanData.presentasi = template.obstetri.presentasi;
        pemeriksaanData.berat_janin = template.obstetri.berat_janin;
        pemeriksaanData.plasenta = template.obstetri.plasenta;
        pemeriksaanData.ketuban = template.obstetri.ketuban;
        pemeriksaanData.usg_findings = template.obstetri.usg_findings;
    }
    const pemeriksaanHtml = renderPreviewSection(pemeriksaanData, {
        keadaan_umum: 'Keadaan Umum',
        tekanan_darah: 'Tekanan Darah',
        nadi: 'Nadi',
        suhu: 'Suhu',
        spo2: 'SpO2',
        respirasi: 'Respirasi',
        presentasi: 'Presentasi',
        berat_janin: 'Berat Janin',
        plasenta: 'Plasenta',
        ketuban: 'Ketuban',
        usg_findings: 'Hasil USG'
    });
    document.getElementById('preview-pemeriksaan').innerHTML = pemeriksaanHtml;

    // Render Diagnosis & Planning preview
    let diagnosisData = {
        diagnosis_utama: template.diagnosis?.diagnosis_utama,
        gravida: template.diagnosis?.gravida,
        para: template.diagnosis?.para,
        usia_kehamilan_minggu: template.diagnosis?.usia_kehamilan_minggu,
        tindakan: template.planning?.tindakan?.join(', '),
        obat: template.planning?.obat?.join(', '),
        instruksi: template.planning?.instruksi?.join(', ')
    };
    const diagnosisHtml = renderPreviewSection(diagnosisData, {
        diagnosis_utama: 'Diagnosis',
        gravida: 'Gravida',
        para: 'Para',
        usia_kehamilan_minggu: 'UK (minggu)',
        tindakan: 'Tindakan',
        obat: 'Obat',
        instruksi: 'Instruksi'
    });
    document.getElementById('preview-diagnosis').innerHTML = diagnosisHtml;

    // Show confidence score
    const confidence = data.confidence;
    const confidenceEl = document.getElementById('import-confidence');
    confidenceEl.textContent = `Confidence: ${confidence.percentage}% (${confidence.score}/${confidence.total} fields parsed)`;
    confidenceEl.className = `badge ${confidence.percentage >= 70 ? 'badge-success' : confidence.percentage >= 40 ? 'badge-warning' : 'badge-danger'}`;

    // Switch to preview step
    document.getElementById('import-step-1').style.display = 'none';
    document.getElementById('import-step-2').style.display = 'block';
    document.getElementById('btn-import-parse').style.display = 'none';
    document.getElementById('btn-import-back').style.display = 'inline-block';
    document.getElementById('btn-import-apply').style.display = 'inline-block';
}

/**
 * Render a preview section with checkboxes
 */
function renderPreviewSection(data, labels) {
    if (!data) return '<p class="text-muted small">Tidak ada data</p>';

    let html = '<div class="preview-fields">';
    let hasData = false;

    for (const [key, label] of Object.entries(labels)) {
        const value = data[key];
        if (value !== null && value !== undefined && value !== '') {
            hasData = true;
            html += `
                <div class="custom-control custom-checkbox mb-1">
                    <input type="checkbox" class="custom-control-input" id="import-${key}" checked data-field="${key}">
                    <label class="custom-control-label small" for="import-${key}">
                        <strong>${label}:</strong> ${escapeHtml(String(value))}
                    </label>
                </div>
            `;
        }
    }

    html += '</div>';
    return hasData ? html : '<p class="text-muted small">Tidak ada data terdeteksi</p>';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Render visit info section with date and location
 */
function renderVisitInfoSection(data) {
    const container = document.getElementById('preview-visit-info');
    if (!container) return;

    const locationOptions = {
        'klinik_private': 'Klinik Privat dr. Dibya',
        'rsia_melinda': 'RSIA Melinda',
        'rsud_gambiran': 'RSUD Gambiran',
        'rs_bhayangkara': 'RS Bhayangkara'
    };

    let html = '<div class="row">';

    // Visit Date
    html += '<div class="col-md-6">';
    html += '<div class="form-group">';
    html += '<label class="small font-weight-bold">';
    html += '<i class="fas fa-calendar-alt mr-1"></i>Tanggal Kunjungan';
    if (data.visit_date_detected) {
        html += ' <span class="badge badge-success badge-sm">Terdeteksi</span>';
    } else {
        html += ' <span class="badge badge-warning badge-sm">Input Manual</span>';
    }
    html += '</label>';
    html += `<input type="date" class="form-control form-control-sm" id="import-visit-date" value="${data.visit_date || ''}">`;
    html += '</div>';
    html += '</div>';

    // Visit Location
    html += '<div class="col-md-6">';
    html += '<div class="form-group">';
    html += '<label class="small font-weight-bold">';
    html += '<i class="fas fa-hospital mr-1"></i>Lokasi Kunjungan';
    if (data.visit_location_detected) {
        html += ' <span class="badge badge-success badge-sm">Terdeteksi</span>';
    } else {
        html += ' <span class="badge badge-warning badge-sm">Pilih Manual</span>';
    }
    html += '</label>';
    html += '<select class="form-control form-control-sm" id="import-visit-location">';
    html += '<option value="">-- Pilih Lokasi --</option>';
    for (const [value, label] of Object.entries(locationOptions)) {
        const selected = data.visit_location === value ? 'selected' : '';
        html += `<option value="${value}" ${selected}>${label}</option>`;
    }
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;
}

/**
 * Go back to input step
 */
function importMedicalBack() {
    document.getElementById('import-step-1').style.display = 'block';
    document.getElementById('import-step-2').style.display = 'none';
    document.getElementById('btn-import-parse').style.display = 'inline-block';
    document.getElementById('btn-import-back').style.display = 'none';
    document.getElementById('btn-import-apply').style.display = 'none';
}

/**
 * Create a new MR via API and navigate to it
 */
async function createNewMRAndNavigate(patientId, category, location, visitDate, importSource) {
    const token = localStorage.getItem('token') || localStorage.getItem('vps_auth_token');

    // Derive import_source from location if not provided
    // rsud_gambiran → simrs_gambiran, rsia_melinda → simrs_melinda
    let finalImportSource = importSource;
    if (!finalImportSource && location && location !== 'klinik_private') {
        finalImportSource = 'simrs_' + location.replace('rsia_', '').replace('rsud_', '');
    }

    const response = await fetch('/api/sunday-clinic/start-walk-in', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            patient_id: patientId,
            category: category,
            location: location,
            import_source: finalImportSource || null
        })
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.message || 'Gagal membuat MR baru');
    }

    return result.data;
}

/**
 * Apply parsed data to form fields
 */
async function importMedicalApply() {
    if (!parsedImportData) {
        window.showToast('warning', 'Tidak ada data untuk diterapkan');
        return;
    }

    const template = parsedImportData.template;

    // Get visit info from form (may have been manually edited)
    const visitDate = document.getElementById('import-visit-date')?.value || parsedImportData.visit_date;
    const visitLocation = document.getElementById('import-visit-location')?.value || parsedImportData.visit_location;
    const category = document.getElementById('import-category')?.value || 'obstetri';

    // Store visit info in parsed data for later use
    parsedImportData.visit_date = visitDate;
    parsedImportData.visit_location = visitLocation;

    // Get checked fields
    const checkedFields = {};
    document.querySelectorAll('#import-step-2 input[type="checkbox"]:checked').forEach(cb => {
        checkedFields[cb.dataset.field] = true;
    });

    try {
        // Check if we need to create a new MR
        const hasActive = hasActiveMR();

        if (!hasActive) {
            // Need to create new MR
            const patientSelect = document.getElementById('import-patient-select');
            const patientId = patientSelect?.value;

            if (!patientId) {
                window.showToast('warning', 'Silakan pilih pasien terlebih dahulu');
                patientSelect?.focus();
                return;
            }

            // Show loading on button
            const applyBtn = document.getElementById('btn-import-apply');
            const originalBtnText = applyBtn?.innerHTML;
            if (applyBtn) {
                applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Membuat MR...';
                applyBtn.disabled = true;
            }

            try {
                // Create new MR with import_source from parsed data
                // parsedImportData.source contains: 'rsud_gambiran', 'simrs_melinda', etc.
                const importSource = parsedImportData?.source || null;
                const newMR = await createNewMRAndNavigate(patientId, category, visitLocation || 'klinik_private', visitDate, importSource);

                console.log('[Import] Created new MR:', newMR.mrId, 'importSource:', importSource);

                // Close modal first
                $('#import-medical-modal').modal('hide');

                // Store the parsed data in sessionStorage to apply after navigation
                const importDataToApply = {
                    template: template,
                    checkedFields: checkedFields,
                    visitDate: visitDate,
                    visitLocation: visitLocation
                };
                sessionStorage.setItem('pendingImportData', JSON.stringify(importDataToApply));

                // Reset modal state
                resetImportModal();

                // Navigate to the new MR
                const newUrl = `/sunday-clinic/${newMR.mrId}/identity`;

                if (window.Swal) {
                    await Swal.fire({
                        icon: 'success',
                        title: 'MR Berhasil Dibuat',
                        html: `MR ID: <strong>${newMR.mrId}</strong><br>Mengalihkan ke halaman MR...`,
                        timer: 1500,
                        showConfirmButton: false
                    });
                }

                // Redirect to new MR - will apply data after page load
                window.location.href = newUrl;
                return;

            } catch (error) {
                console.error('Create MR error:', error);
                if (applyBtn) {
                    applyBtn.innerHTML = originalBtnText;
                    applyBtn.disabled = false;
                }
                throw error;
            }
        }

        // Apply to existing state manager
        if (window.stateManager) {
            // Update visit info if available
            if (visitDate || visitLocation) {
                const visitUpdates = {};
                if (visitDate) visitUpdates.visit_date = visitDate;
                if (visitLocation) visitUpdates.visit_location = visitLocation;
                window.stateManager.updateSectionData('visit_info', visitUpdates);
            }

            // Update identity fields
            if (template.identitas) {
                const identityUpdates = {};
                for (const [key, value] of Object.entries(template.identitas)) {
                    if (checkedFields[key] && value) {
                        identityUpdates[key] = value;
                    }
                }
                if (Object.keys(identityUpdates).length > 0) {
                    window.stateManager.updateSectionData('identity', identityUpdates);
                }
            }

            // Update anamnesa fields
            if (template.anamnesa) {
                const anamnesaUpdates = {};
                for (const [key, value] of Object.entries(template.anamnesa)) {
                    if (checkedFields[key] && value) {
                        anamnesaUpdates[key] = value;
                    }
                }
                if (template.obstetri) {
                    for (const [key, value] of Object.entries(template.obstetri)) {
                        if (checkedFields[key] && value) {
                            anamnesaUpdates[key] = value;
                        }
                    }
                }
                if (Object.keys(anamnesaUpdates).length > 0) {
                    window.stateManager.updateSectionData('anamnesa', anamnesaUpdates);
                }
            }

            // Update physical exam fields
            if (template.pemeriksaan_fisik) {
                const examUpdates = {};
                for (const [key, value] of Object.entries(template.pemeriksaan_fisik)) {
                    if (checkedFields[key] && value) {
                        examUpdates[key] = value;
                    }
                }
                if (Object.keys(examUpdates).length > 0) {
                    window.stateManager.updateSectionData('physical_exam', examUpdates);
                }
            }

            // Update diagnosis
            if (template.diagnosis && checkedFields.diagnosis_utama) {
                window.stateManager.updateSectionData('diagnosis', {
                    diagnosis_utama: template.diagnosis.diagnosis_utama
                });
            }
        }

        // Also try to fill DOM elements directly as fallback
        fillFormFieldsDirect(template, checkedFields);

        // Close modal
        $('#import-medical-modal').modal('hide');

        // Reset modal state
        resetImportModal();

        // Show success message
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Berhasil',
                text: 'Data berhasil diterapkan ke form',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            window.showToast('success', 'Data berhasil diterapkan ke form');
        }

    } catch (error) {
        console.error('Apply error:', error);
        window.showToast('error', 'Error menerapkan data: ' + error.message);
    }
}

/**
 * Get MR ID from current URL
 */
function getMrIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/sunday-clinic\/([^\/]+)/);
    return match ? match[1] : null;
}

/**
 * Save section data to API for persistence
 */
async function saveSectionToApi(mrId, section, data) {
    if (!mrId || !section || !data || Object.keys(data).length === 0) {
        return false;
    }

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('vps_auth_token');
        const response = await fetch(`/api/sunday-clinic/records/${mrId}/${section}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            console.log(`[Import] Saved ${section} to database successfully`);
            return true;
        } else {
            console.warn(`[Import] Failed to save ${section}:`, result.message);
            return false;
        }
    } catch (error) {
        console.error(`[Import] Error saving ${section} to API:`, error);
        return false;
    }
}

/**
 * Apply pending import data after page navigation
 * Called on page load to check for pending data
 * Supports both 'pendingImportData' and 'simrs_import_data' keys
 */
async function applyPendingImportData() {
    console.log('[Import] applyPendingImportData called');
    console.log('[Import] sessionStorage keys:', Object.keys(sessionStorage));

    // Check for SIMRS import data first (from Chrome extension flow)
    const simrsData = sessionStorage.getItem('simrs_import_data');
    const simrsMrId = sessionStorage.getItem('simrs_import_mr_id');

    console.log('[Import] simrsData exists:', !!simrsData);
    console.log('[Import] simrsMrId:', simrsMrId);

    if (simrsData) {
        console.log('[Import] Found SIMRS import data, processing...');
        console.log('[Import] Raw simrsData:', simrsData.substring(0, 500));
        try {
            const importData = JSON.parse(simrsData);
            const parsed = importData.raw_parsed || importData;
            const template = importData.template || {};

            // Field mapping from hospital (Melinda/Gambiran MEDIFY):
            // - Keluhan Utama → keluhan_utama
            // - RPS (Riwayat Penyakit Sekarang) → riwayat_kehamilan_saat_ini
            // - RPD (Riwayat Penyakit Dahulu) → detail_riwayat_penyakit
            // - RPK (Riwayat Penyakit Keluarga) → riwayat_keluarga
            // NO LONGER concatenating all subjective fields - each field goes to its specific target
            console.log('[Import] Subjective fields:', {
                keluhan_utama: parsed.subjective?.keluhan_utama,
                rps: parsed.subjective?.rps,
                rpd: parsed.subjective?.rpd,
                rpk: parsed.subjective?.rpk
            });

            // Map SIMRS data to our template format
            // Field mapping from hospital (Melinda/Gambiran MEDIFY):
            // - Keluhan Utama → keluhan_utama
            // - RPS (Riwayat Penyakit Sekarang) → riwayat_kehamilan_saat_ini
            // - RPD (Riwayat Penyakit Dahulu) → detail_riwayat_penyakit
            // - RPK (Riwayat Penyakit Keluarga) → riwayat_keluarga
            const mappedTemplate = {
                identitas: parsed.identity || template.identitas || {},
                anamnesa: {
                    keluhan_utama: parsed.subjective?.keluhan_utama,
                    riwayat_kehamilan_saat_ini: parsed.subjective?.rps,  // RPS only, no fallback
                    detail_riwayat_penyakit: parsed.subjective?.rpd,
                    riwayat_keluarga: parsed.subjective?.rpk,
                    // Also include MEDIFY obstetric data
                    gravida: parsed.assessment?.gravida,
                    para: parsed.assessment?.para,
                    abortus: parsed.assessment?.abortus,
                    anak_hidup: parsed.assessment?.anak_hidup,
                    hpl: parsed.subjective?.hpl,
                    hpht: parsed.subjective?.hpht,
                    ...template.anamnesa
                },
                pemeriksaan_fisik: {
                    keadaan_umum: parsed.objective?.keadaan_umum,
                    tekanan_darah: parsed.objective?.tensi,
                    nadi: parsed.objective?.nadi,
                    suhu: parsed.objective?.suhu,
                    spo2: parsed.objective?.spo2,
                    respirasi: parsed.objective?.rr,
                    // TB/BB can be in objective OR identity (Gambiran puts it in identity)
                    tinggi_badan: parsed.objective?.tinggi_badan || parsed.identity?.tinggi_badan,
                    berat_badan: parsed.objective?.berat_badan || parsed.identity?.berat_badan,
                    ...template.pemeriksaan_fisik
                },
                diagnosis: {
                    diagnosis_utama: parsed.assessment?.diagnosis,
                    gravida: parsed.assessment?.gravida,
                    para: parsed.assessment?.para,
                    usia_kehamilan_minggu: parsed.assessment?.usia_kehamilan_minggu,
                    usia_kehamilan_hari: parsed.assessment?.usia_kehamilan_hari,
                    presentasi: parsed.assessment?.presentasi,
                    ...template.diagnosis
                },
                obstetri: {
                    hpht: parsed.subjective?.hpht,
                    hpl: parsed.subjective?.hpl,
                    gravida: parsed.assessment?.gravida,
                    para: parsed.assessment?.para,
                    usia_kehamilan: parsed.assessment?.usia_kehamilan,
                    presentasi: parsed.assessment?.presentasi || parsed.objective?.presentasi,
                    berat_janin: parsed.objective?.berat_janin,
                    plasenta: parsed.objective?.plasenta,
                    ketuban: parsed.objective?.ketuban,
                    usg_findings: parsed.objective?.usg,
                    ...template.obstetri
                },
                planning: {
                    obat: parsed.plan?.obat || [],
                    tindakan: parsed.plan?.tindakan || [],
                    instruksi: parsed.plan?.instruksi || [],
                    raw: parsed.plan?.raw,
                    ...template.planning
                }
            };

            // Clear SIMRS data from sessionStorage
            sessionStorage.removeItem('simrs_import_data');
            sessionStorage.removeItem('simrs_import_mr_id');

            // Apply data using existing logic
            await applySIMRSImportData(mappedTemplate, importData.visit_date, importData.visit_time, importData.visit_location);
            return;
        } catch (e) {
            console.error('[Import] Error parsing SIMRS data:', e);
            sessionStorage.removeItem('simrs_import_data');
            sessionStorage.removeItem('simrs_import_mr_id');
        }
    }

    // Check for standard pendingImportData
    const pendingData = sessionStorage.getItem('pendingImportData');
    if (!pendingData) {
        console.log('[Import] No pending import data found');
        return;
    }

    try {
        const { template, checkedFields, visitDate, visitTime, visitLocation } = JSON.parse(pendingData);
        console.log('[Import] Found pending data:', { template, checkedFields, visitDate, visitTime, visitLocation });

        // Get MR ID from URL for API persistence
        const mrId = getMrIdFromUrl();
        console.log('[Import] MR ID from URL:', mrId);

        // Wait for stateManager to be ready
        let attempts = 0;
        while (!window.stateManager && attempts < 30) {
            await new Promise(r => setTimeout(r, 200));
            attempts++;
        }

        // Wait for DOM to be fully rendered
        await new Promise(r => setTimeout(r, 1000));

        console.log('[Import] Applying pending import data...');

        // Prepare data for API persistence
        const sectionsToSave = [];

        // Apply data to stateManager if available
        if (window.stateManager) {
            try {
                // Update visit info
                if (visitDate || visitLocation) {
                    const visitUpdates = {};
                    if (visitDate) visitUpdates.visit_date = visitDate;
                    if (visitLocation) visitUpdates.visit_location = visitLocation;
                    window.stateManager.updateSectionData('visit_info', visitUpdates);
                }

                // Update identity - apply ALL fields from template (not just checked)
                if (template.identitas) {
                    const identityUpdates = {};
                    for (const [key, value] of Object.entries(template.identitas)) {
                        if (value) identityUpdates[key] = value;
                    }
                    if (Object.keys(identityUpdates).length > 0) {
                        window.stateManager.updateSectionData('identity', identityUpdates);
                    }
                }

                // Update anamnesa
                if (template.anamnesa) {
                    const anamnesaUpdates = { ...template.anamnesa };
                    if (template.obstetri) {
                        Object.assign(anamnesaUpdates, template.obstetri);
                    }
                    if (Object.keys(anamnesaUpdates).length > 0) {
                        window.stateManager.updateSectionData('anamnesa', anamnesaUpdates);
                        sectionsToSave.push({ section: 'anamnesa', data: anamnesaUpdates });
                    }
                }

                // Update physical exam
                if (template.pemeriksaan_fisik) {
                    window.stateManager.updateSectionData('physical_exam', template.pemeriksaan_fisik);
                    sectionsToSave.push({ section: 'physical_exam', data: template.pemeriksaan_fisik });
                }

                // Update diagnosis
                if (template.diagnosis) {
                    window.stateManager.updateSectionData('diagnosis', template.diagnosis);
                    sectionsToSave.push({ section: 'diagnosis', data: template.diagnosis });
                }

                // Update obstetri if available
                if (template.obstetri) {
                    window.stateManager.updateSectionData('pemeriksaan_obstetri', template.obstetri);
                    sectionsToSave.push({ section: 'pemeriksaan_obstetri', data: template.obstetri });
                }

                // Update planning if available
                if (template.planning && (template.planning.obat?.length || template.planning.tindakan?.length || template.planning.raw)) {
                    // Convert planning data to include terapi and tindakan strings
                    const planningData = { ...template.planning };

                    // Build terapi text from obat/raw data (medications only)
                    let terapiText = '';
                    if (template.planning.raw) {
                        terapiText = template.planning.raw;
                    }
                    if (!terapiText && template.planning.obat && template.planning.obat.length > 0) {
                        terapiText = template.planning.obat.join('\n');
                    }
                    if (terapiText) {
                        planningData.terapi = terapiText;
                    }

                    // Build tindakan text separately (procedures)
                    if (template.planning.tindakan && template.planning.tindakan.length > 0) {
                        planningData.tindakan = template.planning.tindakan.join('\n');
                    }

                    window.stateManager.updateSectionData('planning', planningData);
                    sectionsToSave.push({ section: 'planning', data: planningData });
                }

                console.log('[Import] StateManager updated successfully');
            } catch (stateError) {
                console.error('[Import] StateManager update error:', stateError);
            }
        }

        // Also fill DOM elements directly for immediate feedback
        fillFormFieldsDirect(template, checkedFields || {});

        // PERSIST TO DATABASE via API
        if (mrId && sectionsToSave.length > 0) {
            console.log('[Import] Persisting data to database...');
            let savedCount = 0;

            for (const { section, data } of sectionsToSave) {
                const saved = await saveSectionToApi(mrId, section, data);
                if (saved) savedCount++;
            }

            console.log(`[Import] Saved ${savedCount}/${sectionsToSave.length} sections to database`);
        }

        // Clear pending data
        sessionStorage.removeItem('pendingImportData');

        console.log('[Import] Pending import data applied and persisted successfully');

        // Show notification
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Data Import Diterapkan',
                text: 'Data dari import telah disimpan ke rekam medis',
                timer: 2500,
                showConfirmButton: false
            });
        }

    } catch (error) {
        console.error('[Import] Error applying pending data:', error);
        sessionStorage.removeItem('pendingImportData');
    }
}

/**
 * Apply SIMRS import data to form
 * Similar to applyPendingImportData but handles SIMRS-specific data structure
 */
async function applySIMRSImportData(template, visitDate, visitTime, visitLocation) {
    console.log('[Import] applySIMRSImportData called');
    console.log('[Import] Template anamnesa:', template.anamnesa);
    console.log('[Import] Template obstetri:', template.obstetri);
    console.log('[Import] Template pemeriksaan_fisik:', template.pemeriksaan_fisik);
    console.log('[Import] Template planning:', template.planning);
    console.log('[Import] visitDate/Time/Location:', { visitDate, visitTime, visitLocation });

    // Get MR ID from URL
    const mrId = getMrIdFromUrl();
    console.log('[Import] MR ID from URL:', mrId);

    // Wait for stateManager to be ready
    let attempts = 0;
    while (!window.stateManager && attempts < 30) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
    }
    console.log('[Import] stateManager ready after', attempts, 'attempts');

    // Wait for DOM to be fully rendered
    await new Promise(r => setTimeout(r, 1500)); // Increased to 1.5s
    console.log('[Import] DOM wait complete, checking elements...');

    // Debug: Check if anamnesa and physical exam elements exist
    const keluhanEl = document.querySelector('#anamnesa-keluhan-utama');
    const hphtEl = document.querySelector('#anamnesa-hpht');
    const gravidaEl = document.querySelector('#anamnesa-gravida');
    const tinggiBadanEl = document.querySelector('#pe-tinggi-badan');
    const beratBadanEl = document.querySelector('#pe-berat-badan');
    console.log('[Import] Element check:', {
        keluhanUtama: !!keluhanEl,
        hpht: !!hphtEl,
        gravida: !!gravidaEl,
        tinggiBadan: !!tinggiBadanEl,
        beratBadan: !!beratBadanEl
    });
    console.log('[Import] pemeriksaan_fisik data:', template.pemeriksaan_fisik);

    console.log('[Import] Applying SIMRS import data...');

    // Prepare sections to save to database
    const sectionsToSave = [];

    // Apply to stateManager if available
    if (window.stateManager) {
        try {
            // Update anamnesa
            if (template.anamnesa && Object.keys(template.anamnesa).some(k => template.anamnesa[k])) {
                const anamnesaUpdates = { ...template.anamnesa };
                if (template.obstetri) {
                    Object.assign(anamnesaUpdates, template.obstetri);
                }
                window.stateManager.updateSectionData('anamnesa', anamnesaUpdates);
                sectionsToSave.push({ section: 'anamnesa', data: anamnesaUpdates });
            }

            // Update physical exam
            if (template.pemeriksaan_fisik && Object.keys(template.pemeriksaan_fisik).some(k => template.pemeriksaan_fisik[k])) {
                window.stateManager.updateSectionData('physical_exam', template.pemeriksaan_fisik);
                sectionsToSave.push({ section: 'physical_exam', data: template.pemeriksaan_fisik });
            }

            // Update diagnosis
            if (template.diagnosis && Object.keys(template.diagnosis).some(k => template.diagnosis[k])) {
                window.stateManager.updateSectionData('diagnosis', template.diagnosis);
                sectionsToSave.push({ section: 'diagnosis', data: template.diagnosis });
            }

            // Update obstetri if available
            if (template.obstetri && Object.keys(template.obstetri).some(k => template.obstetri[k])) {
                window.stateManager.updateSectionData('pemeriksaan_obstetri', template.obstetri);
                sectionsToSave.push({ section: 'pemeriksaan_obstetri', data: template.obstetri });
            }

            // Update planning if available
            if (template.planning && (template.planning.obat?.length || template.planning.tindakan?.length || template.planning.raw)) {
                // Convert planning data to include terapi and tindakan strings
                const planningData = { ...template.planning };

                // Build terapi text from obat/raw data (medications only)
                let terapiText = '';
                if (template.planning.raw) {
                    terapiText = template.planning.raw;
                }
                if (!terapiText && template.planning.obat && template.planning.obat.length > 0) {
                    terapiText = template.planning.obat.join('\n');
                }
                if (terapiText) {
                    planningData.terapi = terapiText;
                }

                // Build tindakan text separately (procedures)
                if (template.planning.tindakan && template.planning.tindakan.length > 0) {
                    planningData.tindakan = template.planning.tindakan.join('\n');
                }

                window.stateManager.updateSectionData('planning', planningData);
                sectionsToSave.push({ section: 'planning', data: planningData });
            }

            console.log('[Import] StateManager updated with SIMRS data');
        } catch (stateError) {
            console.error('[Import] StateManager update error:', stateError);
        }
    }

    // Also fill DOM elements directly for immediate feedback
    fillFormFieldsDirect(template, {});

    // Retry fill for fields after additional delay (they might load later)
    setTimeout(() => {
        console.log('[Import] Retrying fill for TB/BB/Riwayat Kehamilan after delay...');

        // TB/BB - Fill values and manually calculate BMI
        const tbEl = document.querySelector('#pe-tinggi-badan');
        const bbEl = document.querySelector('#pe-berat-badan');
        const imtEl = document.querySelector('#pe-imt');
        const kategoriImtEl = document.querySelector('#pe-kategori-imt');

        if (tbEl && template.pemeriksaan_fisik?.tinggi_badan) {
            tbEl.value = template.pemeriksaan_fisik.tinggi_badan;
            console.log('[Import] Filled TB:', template.pemeriksaan_fisik.tinggi_badan);
        }
        if (bbEl && template.pemeriksaan_fisik?.berat_badan) {
            bbEl.value = template.pemeriksaan_fisik.berat_badan;
            console.log('[Import] Filled BB:', template.pemeriksaan_fisik.berat_badan);
        }

        // Debug: Check element existence
        console.log('[Import] Element check - TB:', !!tbEl, 'BB:', !!bbEl, 'IMT:', !!imtEl, 'KategoriIMT:', !!kategoriImtEl);
        console.log('[Import] TB value:', tbEl?.value, 'BB value:', bbEl?.value);

        // Manually calculate BMI since event listeners may not be ready
        const tinggi = parseFloat(tbEl?.value);
        const berat = parseFloat(bbEl?.value);
        console.log('[Import] Parsed - tinggi:', tinggi, 'berat:', berat);

        if (tinggi && berat && tinggi > 0) {
            const tinggiMeter = tinggi / 100;
            const imt = (berat / (tinggiMeter * tinggiMeter)).toFixed(1);
            console.log('[Import] Calculated IMT value:', imt);

            if (imtEl) {
                imtEl.value = imt;
                console.log('[Import] Set IMT field to:', imt);
            } else {
                console.error('[Import] IMT element not found!');
            }

            // Set kategori IMT
            const imtNum = parseFloat(imt);
            let kategori = '';
            if (imtNum < 18.5) kategori = 'Kurang Energi Kronis';
            else if (imtNum < 25.0) kategori = 'Normal';
            else if (imtNum < 30.0) kategori = 'Kelebihan Berat Badan';
            else if (imtNum < 35.0) kategori = 'Obesitas Grade 1';
            else if (imtNum < 40.0) kategori = 'Obesitas Grade 2';
            else kategori = 'Obesitas Grade 3';

            if (kategoriImtEl) {
                kategoriImtEl.value = kategori;
                console.log('[Import] Set Kategori IMT to:', kategori);
            } else {
                console.error('[Import] Kategori IMT element not found!');
            }
        } else {
            console.log('[Import] Cannot calculate IMT - missing TB or BB values');
        }

        // Riwayat Kehamilan Saat Ini
        const riwayatEl = document.querySelector('#anamnesa-riwayat-kehamilan');
        if (riwayatEl && template.anamnesa?.riwayat_kehamilan_saat_ini) {
            riwayatEl.value = template.anamnesa.riwayat_kehamilan_saat_ini;
            riwayatEl.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[Import] Filled Riwayat Kehamilan:', template.anamnesa.riwayat_kehamilan_saat_ini.substring(0, 100));
        }
    }, 3000); // Retry after 3 more seconds

    // Persist to database via API
    if (mrId && sectionsToSave.length > 0) {
        console.log('[Import] Persisting SIMRS data to database...');
        let savedCount = 0;

        for (const { section, data } of sectionsToSave) {
            const saved = await saveSectionToApi(mrId, section, data);
            if (saved) savedCount++;
        }

        console.log(`[Import] Saved ${savedCount}/${sectionsToSave.length} SIMRS sections to database`);
    }

    console.log('[Import] SIMRS import data applied successfully');

    // Show notification with correct hospital name
    const hospitalNames = {
        'simrs_melinda': 'SIMRS Melinda',
        'rsud_gambiran': 'RSUD Gambiran',
        'rs_bhayangkara': 'RS Bhayangkara'
    };
    const source = parsedImportData?.source || 'simrs_melinda';
    const hospitalName = hospitalNames[source] || 'SIMRS';

    if (window.Swal) {
        Swal.fire({
            icon: 'success',
            title: 'Data SIMRS Diterapkan',
            text: `Data dari ${hospitalName} telah disimpan ke rekam medis`,
            timer: 2500,
            showConfirmButton: false
        });
    }
}

/**
 * Fill form fields directly via DOM
 * Maps imported data fields to actual form element IDs in the Sunday Clinic components
 */
function fillFormFieldsDirect(template, checkedFields) {
    console.log('[Import] fillFormFieldsDirect called with template:', template);

    // Fill datetime fields for all sections using visit_date and visit_time from template
    const visitDate = template.visit_date || parsedImportData?.visit_date || '';
    const visitTime = template.visit_time || parsedImportData?.visit_time || '12:00';
    if (visitDate) {
        const datetime = `${visitDate}T${visitTime}`;
        const datetimeFields = [
            '#anamnesa-datetime',
            '#physical-exam-datetime',
            '#pemeriksaan-obstetri-datetime',
            '#penunjang-datetime',
            '#usg-datetime',
            '#usg-gyn-datetime',
            '#diagnosis-datetime',
            '#planning-datetime'
        ];
        datetimeFields.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.value = datetime;
                console.log(`[Import] Filled datetime ${selector} with: ${datetime}`);
            }
        });
    }

    const fieldMappings = {
        // Anamnesa fields (anamnesa-obstetri.js uses #anamnesa-* IDs)
        // Mapping from hospital export fields to our form fields:
        // - Keluhan Utama → Keluhan Utama
        // - RPS (Riwayat Penyakit Sekarang) → Riwayat Kehamilan Saat Ini
        // - RPD (Riwayat Penyakit Dahulu) → Detail Riwayat Penyakit
        // - RPK (Riwayat Penyakit Keluarga) → Riwayat Keluarga
        keluhan_utama: ['#anamnesa-keluhan-utama'],
        riwayat_kehamilan_saat_ini: ['#anamnesa-riwayat-kehamilan'],
        rps: ['#anamnesa-riwayat-kehamilan'],
        riwayat_penyakit_sekarang: ['#anamnesa-riwayat-kehamilan'],
        detail_riwayat_penyakit: ['#anamnesa-detail-riwayat'],
        rpd: ['#anamnesa-detail-riwayat'],
        rpk: ['#anamnesa-riwayat-keluarga'],
        riwayat_penyakit_keluarga: ['#anamnesa-riwayat-keluarga'],
        riwayat_keluarga: ['#anamnesa-riwayat-keluarga'],

        // Obstetri fields
        hpht: ['#anamnesa-hpht'],
        hpl: ['#anamnesa-hpl'],
        gravida: ['#anamnesa-gravida'],
        para: ['#anamnesa-para'],
        abortus: ['#anamnesa-abortus'],
        anak_hidup: ['#anamnesa-anak-hidup'],

        // Allergy fields
        alergi_obat: ['#anamnesa-alergi-obat'],
        alergi_makanan: ['#anamnesa-alergi-makanan'],
        alergi_lingkungan: ['#anamnesa-alergi-lingkungan'],

        // Menstrual history
        usia_menarche: ['#anamnesa-usia-menarche'],
        lama_siklus: ['#anamnesa-lama-siklus'],
        siklus_teratur: ['#anamnesa-siklus-teratur'],

        // KB history
        metode_kb_terakhir: ['#anamnesa-metode-kb'],
        kegagalan_kb: ['#anamnesa-kegagalan-kb'],
        jenis_kb_gagal: ['#anamnesa-jenis-kb-gagal'],

        // Physical exam fields (physical-exam.js uses #pe-* IDs)
        tekanan_darah: ['#pe-tekanan-darah'],
        tensi: ['#pe-tekanan-darah'],
        nadi: ['#pe-nadi'],
        suhu: ['#pe-suhu'],
        respirasi: ['#pe-respirasi'],
        rr: ['#pe-respirasi'],
        tinggi_badan: ['#pe-tinggi-badan'],
        berat_badan: ['#pe-berat-badan'],
        kepala_leher: ['#pe-kepala-leher'],
        thorax: ['#pe-thorax'],
        abdomen: ['#pe-abdomen'],
        ekstremitas: ['#pe-ekstremitas'],

        // Diagnosis fields
        diagnosis_utama: ['#diagnosis-utama', 'textarea[name="diagnosis_utama"]'],
        diagnosis: ['#diagnosis-utama', 'textarea[name="diagnosis"]'],

        // Planning/Terapi fields
        terapi: ['#planning-terapi'],
        obat: ['#planning-terapi'],
        raw: ['#planning-terapi'],

        // Tindakan field (separate from terapi)
        tindakan: ['#planning-tindakan']
    };

    // Flatten template data
    const allData = {
        ...template.identitas,
        ...template.anamnesa,
        ...template.pemeriksaan_fisik,
        ...template.diagnosis,
        ...(template.obstetri || {})
    };

    // Add planning data - convert obat array to terapi string, tindakan array to tindakan string
    if (template.planning) {
        // Build terapi text from obat/raw data (medications only)
        let terapiText = '';

        // Add raw plan text if available
        if (template.planning.raw) {
            terapiText = template.planning.raw;
        }

        // If no raw text, build from obat array
        if (!terapiText && template.planning.obat && template.planning.obat.length > 0) {
            terapiText = template.planning.obat.join('\n');
        }

        // Add instruksi to terapi if available
        if (template.planning.instruksi && template.planning.instruksi.length > 0) {
            if (terapiText) terapiText += '\n\n';
            terapiText += 'Instruksi:\n' + template.planning.instruksi.join('\n');
        }

        if (terapiText) {
            allData.terapi = terapiText;
            console.log('[Import] Built terapi text:', terapiText.substring(0, 200));
        }

        // Build tindakan text separately (procedures)
        if (template.planning.tindakan && template.planning.tindakan.length > 0) {
            const tindakanText = template.planning.tindakan.join('\n');
            allData.tindakan = tindakanText;
            console.log('[Import] Built tindakan text:', tindakanText.substring(0, 200));
        }
    }

    console.log('[Import] fillFormFieldsDirect allData keys:', Object.keys(allData));

    let filledCount = 0;
    for (const [field, selectors] of Object.entries(fieldMappings)) {
        // Apply if data exists (ignore checkedFields for auto-apply)
        if (!allData[field]) continue;

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`[Import] Filling ${field} with:`, allData[field]);
                if (element.tagName === 'SELECT') {
                    // Try to find matching option
                    const value = String(allData[field]).toLowerCase();
                    for (const option of element.options) {
                        if (option.value.toLowerCase() === value ||
                            option.text.toLowerCase().includes(value)) {
                            element.value = option.value;
                            break;
                        }
                    }
                } else {
                    element.value = allData[field];
                }
                // Trigger change event
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
                filledCount++;
                break;
            }
        }
    }
    console.log(`[Import] Filled ${filledCount} form fields via DOM`);

    // Trigger gestational age calculation if HPL or HPHT is filled
    // Wait a bit for form to stabilize then trigger calculation
    setTimeout(() => {
        const hphtInput = document.getElementById('anamnesa-hpht');
        const hplInput = document.getElementById('anamnesa-hpl');
        const usiaKehamilanDisplay = document.getElementById('anamnesa-usia-kehamilan-display');

        // If we have HPL but not HPHT, calculate HPHT from HPL (HPHT = HPL - 280 days)
        if (hplInput?.value && !hphtInput?.value) {
            const hplDate = parseImportDate(hplInput.value);
            if (hplDate) {
                // HPHT = HPL - 280 days (Naegele's rule reverse)
                const hphtDate = new Date(hplDate);
                hphtDate.setDate(hphtDate.getDate() - 280);
                const hphtValue = `${hphtDate.getFullYear()}-${String(hphtDate.getMonth() + 1).padStart(2, '0')}-${String(hphtDate.getDate()).padStart(2, '0')}`;
                if (hphtInput) {
                    hphtInput.value = hphtValue;
                    hphtInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('[Import] Calculated HPHT from HPL:', hphtValue);
                }
            }
        }

        // Trigger change event to recalculate gestational age
        if (hphtInput?.value) {
            hphtInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, 500);

    // Helper function to parse date in various formats
    function parseImportDate(dateStr) {
        if (!dateStr) return null;

        // Try DD/MM/YY or DD/MM/YYYY format
        const dmyMatch = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
        if (dmyMatch) {
            let [, day, month, year] = dmyMatch;
            year = parseInt(year);
            // Handle 2-digit year (assume 2000s)
            if (year < 100) {
                year = year > 50 ? 1900 + year : 2000 + year;
            }
            return new Date(year, parseInt(month) - 1, parseInt(day));
        }

        // Try YYYY-MM-DD format
        const ymdMatch = dateStr.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (ymdMatch) {
            const [, year, month, day] = ymdMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }

        return null;
    }
}

/**
 * Reset modal to initial state
 */
function resetImportModal() {
    document.getElementById('import-category').value = '';
    document.getElementById('import-text').value = '';
    document.getElementById('import-file').value = '';
    document.querySelector('.custom-file-label').textContent = 'Pilih file...';
    document.getElementById('import-step-1').style.display = 'block';
    document.getElementById('import-step-2').style.display = 'none';
    document.getElementById('btn-import-parse').style.display = 'inline-block';
    document.getElementById('btn-import-back').style.display = 'none';
    document.getElementById('btn-import-apply').style.display = 'none';
    parsedImportData = null;
}

/**
 * Open import modal
 */
function openImportModal() {
    resetImportModal();
    $('#import-medical-modal').modal('show');
}

/**
 * Open import modal with pre-parsed data from Chrome extension
 * Reads data from sessionStorage (set by main.js from URL param)
 */
function openImportModalWithExtensionData() {
    const simrsData = sessionStorage.getItem('simrs_import_data');
    if (!simrsData) {
        console.log('[Import] No SIMRS data in sessionStorage, opening empty modal');
        openImportModal();
        return;
    }

    try {
        const data = JSON.parse(simrsData);
        console.log('[Import] Opening import modal with extension data');
        console.log('[Import] Source:', data.source);
        console.log('[Import] Visit location:', data.visit_location);

        // Store as parsedImportData for the apply function
        parsedImportData = data;

        // Set category dropdown if available
        const categorySelect = document.getElementById('import-category');
        if (categorySelect && data.category) {
            categorySelect.value = data.category;
        }

        // Show preview directly (skip text input step)
        showImportPreview(data);

        // Show the modal
        $('#import-medical-modal').modal('show');

    } catch (e) {
        console.error('[Import] Error parsing extension data:', e);
        openImportModal();
    }
}

/**
 * Open bulk import modal
 */
function openBulkImportModal() {
    resetBulkImportModal();
    $('#bulk-import-modal').modal('show');
}

/**
 * Reset bulk import modal
 */
function resetBulkImportModal() {
    const filesInput = document.getElementById('bulk-import-files');
    if (filesInput) filesInput.value = '';

    const resultsContainer = document.getElementById('bulk-import-results');
    if (resultsContainer) resultsContainer.innerHTML = '';

    const progressContainer = document.getElementById('bulk-import-progress');
    if (progressContainer) progressContainer.style.display = 'none';

    window.bulkImportResults = null;
}

/**
 * Handle bulk file selection
 */
async function handleBulkFilesSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    if (files.length > 50) {
        window.showToast('warning', 'Maksimal 50 file per bulk import');
        return;
    }

    const category = document.getElementById('bulk-import-category')?.value || 'obstetri';
    const defaultLocation = document.getElementById('bulk-import-location')?.value || '';

    // Show progress
    const progressContainer = document.getElementById('bulk-import-progress');
    const progressBar = document.getElementById('bulk-import-progress-bar');
    const progressText = document.getElementById('bulk-import-progress-text');

    if (progressContainer) progressContainer.style.display = 'block';

    // Read all files
    const records = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await readFileAsText(file);
        records.push({
            text: text,
            filename: file.name,
            category: category
        });

        // Update progress
        if (progressBar) progressBar.style.width = `${((i + 1) / files.length) * 50}%`;
        if (progressText) progressText.textContent = `Membaca file ${i + 1}/${files.length}...`;
    }

    // Call bulk parse API
    if (progressText) progressText.textContent = 'Memproses data...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/medical-import/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                records: records,
                default_category: category,
                default_location: defaultLocation
            })
        });

        const result = await response.json();

        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'Selesai!';

        if (!result.success) {
            window.showToast('error', 'Gagal memproses: ' + result.message);
            return;
        }

        // Store results and display
        window.bulkImportResults = result.data;
        displayBulkImportResults(result.data, files);

    } catch (error) {
        console.error('Bulk import error:', error);
        window.showToast('error', 'Error: ' + error.message);
    }
}

/**
 * Read file as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * Display bulk import results
 */
function displayBulkImportResults(data, files) {
    const container = document.getElementById('bulk-import-results');
    if (!container) return;

    const locationLabels = {
        'klinik_private': 'Klinik Privat',
        'rsia_melinda': 'RSIA Melinda',
        'rsud_gambiran': 'RSUD Gambiran',
        'rs_bhayangkara': 'RS Bhayangkara'
    };

    let html = `
        <div class="alert alert-info">
            <strong>Hasil Parsing:</strong> ${data.successful} berhasil, ${data.failed} gagal dari ${data.total} file
        </div>
        <div class="table-responsive">
        <table class="table table-sm table-bordered">
            <thead class="thead-light">
                <tr>
                    <th><input type="checkbox" id="bulk-select-all" checked onchange="toggleBulkSelectAll(this)"></th>
                    <th>File</th>
                    <th>Nama Pasien</th>
                    <th>Tanggal Kunjungan</th>
                    <th>Lokasi</th>
                    <th>Confidence</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.results.forEach((result, idx) => {
        const filename = files[result.index]?.name || `Record ${result.index + 1}`;
        const dateClass = result.visit_date_detected ? 'text-success' : 'text-warning';
        const locationClass = result.visit_location_detected ? 'text-success' : 'text-warning';

        html += `
            <tr>
                <td><input type="checkbox" class="bulk-item-check" data-index="${idx}" checked></td>
                <td class="small">${escapeHtml(filename)}</td>
                <td>${escapeHtml(result.patient_name || '-')}</td>
                <td>
                    <input type="date" class="form-control form-control-sm bulk-visit-date"
                           data-index="${idx}" value="${result.visit_date || ''}"
                           style="max-width: 150px;">
                    <small class="${dateClass}">${result.visit_date_detected ? '(terdeteksi)' : '(manual)'}</small>
                </td>
                <td>
                    <select class="form-control form-control-sm bulk-visit-location" data-index="${idx}" style="max-width: 150px;">
                        <option value="">-- Pilih --</option>
                        ${Object.entries(locationLabels).map(([v, l]) =>
                            `<option value="${v}" ${result.visit_location === v ? 'selected' : ''}>${l}</option>`
                        ).join('')}
                    </select>
                    <small class="${locationClass}">${result.visit_location_detected ? '(terdeteksi)' : '(manual)'}</small>
                </td>
                <td>
                    <span class="badge ${result.confidence.percentage >= 70 ? 'badge-success' : result.confidence.percentage >= 40 ? 'badge-warning' : 'badge-danger'}">
                        ${result.confidence.percentage}%
                    </span>
                </td>
            </tr>
        `;
    });

    // Show errors if any
    if (data.errors.length > 0) {
        data.errors.forEach(err => {
            const filename = files[err.index]?.name || `Record ${err.index + 1}`;
            html += `
                <tr class="table-danger">
                    <td><input type="checkbox" disabled></td>
                    <td class="small">${escapeHtml(filename)}</td>
                    <td colspan="4" class="text-danger small">${escapeHtml(err.error)}</td>
                </tr>
            `;
        });
    }

    html += '</tbody></table></div>';

    html += `
        <div class="mt-3">
            <button type="button" class="btn btn-success" onclick="applyBulkImport()">
                <i class="fas fa-check mr-1"></i>Terapkan Data Terpilih
            </button>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Toggle select all in bulk import
 */
function toggleBulkSelectAll(checkbox) {
    document.querySelectorAll('.bulk-item-check').forEach(cb => {
        cb.checked = checkbox.checked;
    });
}

/**
 * Apply bulk import data
 */
async function applyBulkImport() {
    if (!window.bulkImportResults) {
        window.showToast('warning', 'Tidak ada data untuk diterapkan');
        return;
    }

    const selectedItems = [];
    document.querySelectorAll('.bulk-item-check:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.index);
        const result = window.bulkImportResults.results[idx];
        if (result) {
            // Get updated values from form
            const dateInput = document.querySelector(`.bulk-visit-date[data-index="${idx}"]`);
            const locationSelect = document.querySelector(`.bulk-visit-location[data-index="${idx}"]`);

            selectedItems.push({
                ...result,
                visit_date: dateInput?.value || result.visit_date,
                visit_location: locationSelect?.value || result.visit_location
            });
        }
    });

    if (selectedItems.length === 0) {
        window.showToast('warning', 'Pilih minimal 1 item untuk diterapkan');
        return;
    }

    // For now, apply the first selected item to the current form
    // In the future, this could save directly to database for multiple patients
    if (selectedItems.length === 1) {
        parsedImportData = selectedItems[0];
        $('#bulk-import-modal').modal('hide');

        // Show single item preview
        showImportPreview(selectedItems[0]);
        $('#import-medical-modal').modal('show');
    } else {
        // Multiple items - show confirmation for batch save
        if (confirm(`Akan menyimpan ${selectedItems.length} catatan medis ke database. Lanjutkan?`)) {
            await saveBulkRecords(selectedItems);
        }
    }
}

/**
 * Save multiple records to database
 */
async function saveBulkRecords(items) {
    const token = localStorage.getItem('token');
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const item of items) {
        try {
            // Get patient ID from the form or search
            const patientId = await findOrCreatePatient(item.template.identitas);

            if (!patientId) {
                errors.push(`Pasien "${item.patient_name}" tidak ditemukan`);
                errorCount++;
                continue;
            }

            // Generate MR ID if needed
            const mrId = `MR-${patientId}-${Date.now()}`;

            const response = await fetch('/api/medical-import/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_id: patientId,
                    mr_id: mrId,
                    category: item.category,
                    visit_date: item.visit_date,
                    visit_location: item.visit_location,
                    record_data: item.template
                })
            });

            const result = await response.json();
            if (result.success) {
                successCount++;
            } else {
                errors.push(`${item.patient_name}: ${result.message}`);
                errorCount++;
            }
        } catch (err) {
            errors.push(`${item.patient_name}: ${err.message}`);
            errorCount++;
        }
    }

    // Show result
    let message = `Berhasil menyimpan ${successCount} dari ${items.length} catatan.`;
    if (errorCount > 0) {
        message += `\n\nGagal (${errorCount}):\n` + errors.join('\n');
    }

    if (window.Swal) {
        Swal.fire({
            icon: errorCount === 0 ? 'success' : 'warning',
            title: errorCount === 0 ? 'Berhasil' : 'Sebagian Berhasil',
            text: message
        });
    } else {
        window.showToast(errorCount === 0 ? 'success' : 'warning', message);
    }

    $('#bulk-import-modal').modal('hide');
    resetBulkImportModal();
}

/**
 * Find or create patient based on identity data
 * Returns patient_id or null
 */
async function findOrCreatePatient(identitas) {
    // This is a placeholder - actual implementation would search/create patient
    // For now, return null to skip automatic patient creation
    console.log('Finding patient:', identitas);
    return null;
}

/**
 * Check for import data in URL parameter (from Chrome extension)
 * The extension opens: /staff/public/index-adminlte.html?import={json_data}
 */
function checkUrlImportParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const importData = urlParams.get('import');

    if (importData) {
        try {
            const data = JSON.parse(importData);
            console.log('[Import] Found import data in URL parameter');
            console.log('[Import] Source:', data.source);
            console.log('[Import] Visit location:', data.visit_location);

            // Store in sessionStorage for processing by applyPendingImportData
            sessionStorage.setItem('simrs_import_data', JSON.stringify(data));

            // Also store MR ID if we're on a Sunday Clinic page
            const mrMatch = window.location.pathname.match(/\/sunday-clinic\/([^\/]+)/);
            if (mrMatch) {
                sessionStorage.setItem('simrs_import_mr_id', mrMatch[1]);
            }

            // Clean up URL to remove import param (prevents re-processing on refresh)
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, '', newUrl);

            console.log('[Import] Stored in sessionStorage, cleaned URL');
            return true;
        } catch (e) {
            console.error('[Import] Error parsing import URL param:', e);
        }
    }
    return false;
}

// Export functions to window for onclick handlers
window.importMedicalParse = importMedicalParse;
window.importMedicalBack = importMedicalBack;
window.importMedicalApply = importMedicalApply;
window.openImportModal = openImportModal;
window.openImportModalWithExtensionData = openImportModalWithExtensionData;
window.openBulkImportModal = openBulkImportModal;
window.handleBulkFilesSelect = handleBulkFilesSelect;
window.toggleBulkSelectAll = toggleBulkSelectAll;
window.applyBulkImport = applyBulkImport;
window.applyPendingImportData = applyPendingImportData;
window.checkUrlImportParam = checkUrlImportParam;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initMedicalImport();
    // Check for import data in URL first (from Chrome extension)
    checkUrlImportParam();
    // Then check for pending import data after page navigation
    applyPendingImportData();
});

export { openImportModal, importMedicalParse, importMedicalBack, importMedicalApply, applyPendingImportData };
