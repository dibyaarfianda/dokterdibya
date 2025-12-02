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
        alert('Silakan pilih kategori terlebih dahulu');
        return;
    }

    if (!text) {
        alert('Silakan masukkan teks catatan medis atau upload file');
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
            alert('Gagal parsing: ' + result.message);
            return;
        }

        // Store parsed data
        parsedImportData = result.data;

        // Show preview
        showImportPreview(result.data);

    } catch (error) {
        console.error('Import error:', error);
        alert('Error: ' + error.message);
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
async function createNewMRAndNavigate(patientId, category, location, visitDate) {
    const token = localStorage.getItem('token') || localStorage.getItem('vps_auth_token');

    const response = await fetch('/api/sunday-clinic/start-walk-in', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            patient_id: patientId,
            category: category,
            location: location
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
        alert('Tidak ada data untuk diterapkan');
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
                alert('Silakan pilih pasien terlebih dahulu');
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
                // Create new MR
                const newMR = await createNewMRAndNavigate(patientId, category, visitLocation || 'klinik_private', visitDate);

                console.log('[Import] Created new MR:', newMR.mrId);

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
            const state = window.stateManager.getState();

            // Update visit info if available
            if (visitDate || visitLocation) {
                const visitUpdates = {};
                if (visitDate) visitUpdates.visit_date = visitDate;
                if (visitLocation) visitUpdates.visit_location = visitLocation;
                await window.stateManager.updateSection('visit_info', visitUpdates);
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
                    await window.stateManager.updateSection('identity', identityUpdates);
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
                    await window.stateManager.updateSection('anamnesa', anamnesaUpdates);
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
                    await window.stateManager.updateSection('physical_exam', examUpdates);
                }
            }

            // Update diagnosis
            if (template.diagnosis && checkedFields.diagnosis_utama) {
                await window.stateManager.updateSection('diagnosis', {
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
            alert('Data berhasil diterapkan ke form');
        }

    } catch (error) {
        console.error('Apply error:', error);
        alert('Error menerapkan data: ' + error.message);
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
 */
async function applyPendingImportData() {
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
                    await window.stateManager.updateSection('visit_info', visitUpdates);
                }

                // Update identity - apply ALL fields from template (not just checked)
                if (template.identitas) {
                    const identityUpdates = {};
                    for (const [key, value] of Object.entries(template.identitas)) {
                        if (value) identityUpdates[key] = value;
                    }
                    if (Object.keys(identityUpdates).length > 0) {
                        await window.stateManager.updateSection('identity', identityUpdates);
                    }
                }

                // Update anamnesa
                if (template.anamnesa) {
                    const anamnesaUpdates = { ...template.anamnesa };
                    if (template.obstetri) {
                        Object.assign(anamnesaUpdates, template.obstetri);
                    }
                    if (Object.keys(anamnesaUpdates).length > 0) {
                        await window.stateManager.updateSection('anamnesa', anamnesaUpdates);
                        sectionsToSave.push({ section: 'anamnesa', data: anamnesaUpdates });
                    }
                }

                // Update physical exam
                if (template.pemeriksaan_fisik) {
                    await window.stateManager.updateSection('physical_exam', template.pemeriksaan_fisik);
                    sectionsToSave.push({ section: 'physical_exam', data: template.pemeriksaan_fisik });
                }

                // Update diagnosis
                if (template.diagnosis) {
                    await window.stateManager.updateSection('diagnosis', template.diagnosis);
                    sectionsToSave.push({ section: 'diagnosis', data: template.diagnosis });
                }

                // Update obstetri if available
                if (template.obstetri) {
                    await window.stateManager.updateSection('pemeriksaan_obstetri', template.obstetri);
                    sectionsToSave.push({ section: 'pemeriksaan_obstetri', data: template.obstetri });
                }

                // Update planning if available
                if (template.planning) {
                    await window.stateManager.updateSection('planning', template.planning);
                    sectionsToSave.push({ section: 'planning', data: template.planning });
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
 * Fill form fields directly via DOM
 */
function fillFormFieldsDirect(template, checkedFields) {
    const fieldMappings = {
        // Identity
        nama: ['input[name="nama"]', '#nama', '#patient-name'],
        jenis_kelamin: ['select[name="jenis_kelamin"]', '#jenis_kelamin'],
        tanggal_lahir: ['input[name="tanggal_lahir"]', '#tanggal_lahir'],
        alamat: ['textarea[name="alamat"]', '#alamat', 'input[name="alamat"]'],
        no_hp: ['input[name="no_hp"]', '#no_hp', 'input[name="telepon"]'],
        pekerjaan: ['input[name="pekerjaan"]', '#pekerjaan'],
        tinggi_badan: ['input[name="tinggi_badan"]', '#tinggi_badan'],
        berat_badan: ['input[name="berat_badan"]', '#berat_badan'],

        // Anamnesa
        keluhan_utama: ['textarea[name="keluhan_utama"]', '#keluhan_utama'],
        riwayat_penyakit_sekarang: ['textarea[name="rps"]', '#rps', 'textarea[name="riwayat_penyakit_sekarang"]'],
        riwayat_penyakit_dahulu: ['textarea[name="rpd"]', '#rpd', 'textarea[name="riwayat_penyakit_dahulu"]'],
        riwayat_penyakit_keluarga: ['textarea[name="rpk"]', '#rpk', 'textarea[name="riwayat_penyakit_keluarga"]'],

        // Obstetri
        hpht: ['input[name="hpht"]', '#hpht'],
        hpl: ['input[name="hpl"]', '#hpl'],
        gravida: ['input[name="gravida"]', '#gravida'],
        para: ['input[name="para"]', '#para'],

        // Physical exam
        keadaan_umum: ['select[name="keadaan_umum"]', '#keadaan_umum'],
        tekanan_darah: ['input[name="tekanan_darah"]', '#tekanan_darah', 'input[name="tensi"]'],
        nadi: ['input[name="nadi"]', '#nadi'],
        suhu: ['input[name="suhu"]', '#suhu'],
        spo2: ['input[name="spo2"]', '#spo2'],

        // Diagnosis
        diagnosis_utama: ['textarea[name="diagnosis_utama"]', '#diagnosis_utama', 'textarea[name="diagnosis"]']
    };

    // Flatten template data
    const allData = {
        ...template.identitas,
        ...template.anamnesa,
        ...template.pemeriksaan_fisik,
        ...template.diagnosis,
        ...(template.obstetri || {})
    };

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
        alert('Maksimal 50 file per bulk import');
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
            alert('Gagal memproses: ' + result.message);
            return;
        }

        // Store results and display
        window.bulkImportResults = result.data;
        displayBulkImportResults(result.data, files);

    } catch (error) {
        console.error('Bulk import error:', error);
        alert('Error: ' + error.message);
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
        alert('Tidak ada data untuk diterapkan');
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
        alert('Pilih minimal 1 item untuk diterapkan');
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
        alert(message);
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

// Export functions to window for onclick handlers
window.importMedicalParse = importMedicalParse;
window.importMedicalBack = importMedicalBack;
window.importMedicalApply = importMedicalApply;
window.openImportModal = openImportModal;
window.openBulkImportModal = openBulkImportModal;
window.handleBulkFilesSelect = handleBulkFilesSelect;
window.toggleBulkSelectAll = toggleBulkSelectAll;
window.applyBulkImport = applyBulkImport;
window.applyPendingImportData = applyPendingImportData;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initMedicalImport();
    // Check for pending import data after page navigation
    applyPendingImportData();
});

export { openImportModal, importMedicalParse, importMedicalBack, importMedicalApply, applyPendingImportData };
