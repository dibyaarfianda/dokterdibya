    function onPatientToolsReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    }

    // Socket.IO is now initialized via initRealtimeSync() which handles user registration
    // The socket is available as window.socket after initRealtimeSync completes

    // Global helper to hide floating panel
    window.hideFloatingPanel = function() {
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel && !floatingPanel.classList.contains('d-none')) {
            console.log('Hiding floating panel');
            floatingPanel.classList.add('d-none');
        }
    };

    // Helper function to get valid token
    window.getValidToken = function() {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        if (!token) {
            console.error('[ERROR] No authentication token found');
            alert('Sesi Anda telah habis. Silakan login kembali.');
            window.location.replace('login.html');
            return null;
        }
        return token;
    };

    // Safe fetch wrapper with token validation
    window.safeFetch = async function(url, options = {}) {
        try {
            const token = window.getValidToken();
            if (!token) return null;

            // Add auth header if not already present
            if (!options.headers) options.headers = {};
            if (!options.headers['Authorization']) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, options);

            if (response.status === 401) {
                console.error('[ERROR] Unauthorized - token expired');
                localStorage.removeItem(window.TOKEN_KEY);
                sessionStorage.removeItem(window.TOKEN_KEY);
                alert('Token Anda telah kadaluarsa. Silakan login kembali.');
                window.location.replace('login.html');
                return null;
            }

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.error('[ERROR] Fetch error:', error);
            throw error;
        }
    };
    // Intercept all navigation clicks to hide floating panel except Kelola Pasien
    document.addEventListener('click', function(e) {
        const navLink = e.target.closest('.nav-link');
        if (!navLink) return;

        const onclickValue = navLink.getAttribute('onclick') || '';
        const shellAction = navLink.dataset.shellAction || '';
        const isKelolaPasienNav =
            onclickValue.includes('showManagePatientsPage') ||
            onclickValue.includes('showKelolaPasienPage') ||
            shellAction === 'show-manage-patients';

        // Only hide if NOT navigating to Kelola Pasien page
        if (!isKelolaPasienNav && (onclickValue || shellAction)) {
            setTimeout(() => hideFloatingPanel(), 100);
        }
    });

    // Watch for page changes and hide floating panel if not on Kelola Pasien page
    const pageObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                const target = mutation.target;
                // If manage-patients-page becomes hidden, hide the floating panel
                if (target.id === 'manage-patients-page' && target.classList.contains('d-none')) {
                    setTimeout(() => hideFloatingPanel(), 50);
                }
            }
        });
    });

    // Start observing when DOM is ready
    setTimeout(() => {
        const managePatientsPage = document.getElementById('manage-patients-page');
        if (managePatientsPage) {
            pageObserver.observe(managePatientsPage, { attributes: true, attributeFilter: ['class'] });
        }
    }, 1000);

    // Manage Web Patients Page Functions
    window.showManagePatientsPage = async function() {
        if (typeof window.ensureStaffFeature === 'function') {
            await Promise.all([
                window.ensureStaffFeature('dataTables'),
                window.ensureStaffFeature('patientSearchDetail')
            ]);
        }
        try { sessionStorage.setItem('lastStaffNavId', 'nav-kelola-pasien'); } catch (_storageError) {}
        document.documentElement.classList.remove('kantor-saya-active');
        document.body.classList.remove('kantor-saya-active');
        document.documentElement.style.overflowY = 'auto';
        document.body.style.overflowY = 'auto';

        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show manage patients page
        document.getElementById('manage-patients-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const kelolaPasienNav = document.querySelector('#nav-kelola-pasien .nav-link');
        if (kelolaPasienNav) {
            kelolaPasienNav.classList.add('active');
        }

        const titleEl = document.getElementById('page-title');
        if (titleEl) {
            titleEl.textContent = 'Kelola Pasien';
        }
        window.dispatchStaffPageChanged?.('kelola-pasien');

        // Show floating panel (only for superadmin)
        const userRole = localStorage.getItem('vps_user_role');
        const isSuperadmin = window.staffRoleConstants?.isSuperadminUser?.(
            window.auth?.currentUser || { role: userRole }
        );
        if (isSuperadmin) {
            const floatingPanel = document.getElementById('floating-kelola-pasien');
            if (floatingPanel) {
                floatingPanel.classList.remove('d-none');
            }
        }

        // Load the managed patient table only; the legacy new-patient table is no longer rendered.
        loadWebPatients();
        if (typeof window.loadHplRiskPatients === 'function') {
            window.loadHplRiskPatients();
        }
    };

    // ==================== Medical Import Functions ====================
    let parsedImportData = null;

    window.openImportModal = function() {
        resetImportModal();
        $('#import-medical-modal').modal('show');
    };

    window.openBulkImportModal = function() {
        resetBulkImportModal();
        $('#bulk-import-modal').modal('show');
    };

    // Auto-fix patient names to proper title case
    window.fixPatientNames = async function() {
        const confirmed = await Swal.fire({
            title: 'Auto-Fix Nama Pasien?',
            html: `
                <p>Fungsi ini akan memperbaiki kapitalisasi nama pasien:</p>
                <ul class="text-left" style="font-size: 0.9rem;">
                    <li><strong>RAHAYU</strong> -> <strong>Rahayu</strong></li>
                    <li><strong>perama indah hapsari</strong> -> <strong>Perama Indah Hapsari</strong></li>
                    <li><strong>sITI AMINAH</strong> -> <strong>Siti Aminah</strong></li>
                </ul>
                <p class="text-warning mt-2"><i class="fas fa-exclamation-triangle"></i> Proses ini tidak bisa dibatalkan!</p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-magic mr-1"></i>Ya, Perbaiki',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#f0ad4e'
        });

        if (!confirmed.isConfirmed) return;

        // Show loading
        Swal.fire({
            title: 'Memproses...',
            html: 'Memperbaiki nama pasien...',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const token = getAuthToken();
            const response = await fetch('/api/patients/fix-names', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                // Show results
                let changesHtml = '';
                if (data.changes && data.changes.length > 0) {
                    changesHtml = `
                        <div class="mt-3" style="max-height: 200px; overflow-y: auto; text-align: left; font-size: 0.85rem;">
                            <table class="table table-sm table-bordered">
                                <thead><tr><th>ID</th><th>Sebelum</th><th>Sesudah</th></tr></thead>
                                <tbody>
                                    ${data.changes.map(c => `<tr><td>${c.id}</td><td>${c.before}</td><td class="text-success">${c.after}</td></tr>`).join('')}
                                </tbody>
                            </table>
                            ${data.updatedCount > 50 ? `<p class="text-muted">...dan ${data.updatedCount - 50} lainnya</p>` : ''}
                        </div>
                    `;
                }

                await Swal.fire({
                    title: 'Berhasil!',
                    html: `<p>${data.message}</p>${changesHtml}`,
                    icon: 'success',
                    confirmButtonText: 'OK'
                });

                // Reload patient list if function exists
                if (typeof loadPatientsForManage === 'function') {
                    loadPatientsForManage();
                }
            } else {
                throw new Error(data.message || 'Failed to fix names');
            }
        } catch (error) {
            console.error('Fix names error:', error);
            Swal.fire({
                title: 'Gagal!',
                text: error.message || 'Terjadi kesalahan saat memperbaiki nama',
                icon: 'error'
            });
        }
    };

    function resetImportModal() {
        const categoryEl = document.getElementById('import-category');
        const textEl = document.getElementById('import-text');
        const fileEl = document.getElementById('import-file');
        const step1 = document.getElementById('import-step-1');
        const step2 = document.getElementById('import-step-2');
        const parseBtn = document.getElementById('btn-import-parse');
        const backBtn = document.getElementById('btn-import-back');
        const applyBtn = document.getElementById('btn-import-apply');

        if (categoryEl) categoryEl.value = '';
        if (textEl) textEl.value = '';
        if (fileEl) fileEl.value = '';
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (parseBtn) parseBtn.style.display = 'inline-block';
        if (backBtn) backBtn.style.display = 'none';
        if (applyBtn) applyBtn.style.display = 'none';
        parsedImportData = null;
    }

    function resetBulkImportModal() {
        const filesInput = document.getElementById('bulk-import-files');
        if (filesInput) filesInput.value = '';
        const resultsContainer = document.getElementById('bulk-import-results');
        if (resultsContainer) resultsContainer.innerHTML = '';
        const progressContainer = document.getElementById('bulk-import-progress');
        if (progressContainer) progressContainer.style.display = 'none';
        window.bulkImportResults = null;
    }

    window.importMedicalParse = async function() {
        const category = document.getElementById('import-category').value;
        const text = document.getElementById('import-text').value.trim();

        if (!category) { alert('Silakan pilih kategori terlebih dahulu'); return; }
        if (!text) { alert('Silakan masukkan teks catatan medis atau upload file'); return; }

        const parseBtn = document.getElementById('btn-import-parse');
        const originalText = parseBtn.innerHTML;
        parseBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Parsing...';
        parseBtn.disabled = true;

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/medical-import/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ text, category })
            });
            const result = await response.json();
            parseBtn.innerHTML = originalText;
            parseBtn.disabled = false;

            if (!result.success) { alert('Gagal parsing: ' + result.message); return; }

            parsedImportData = result.data;
            showImportPreview(result.data);
        } catch (error) {
            console.error('Import error:', error);
            alert('Error: ' + error.message);
            parseBtn.innerHTML = originalText;
            parseBtn.disabled = false;
        }
    };

    function showImportPreview(data) {
        const template = data.template;

        // Load patients for selector
        loadPatientsForImport();

        renderVisitInfoSection(data);
        document.getElementById('preview-identitas').innerHTML = renderPreviewSection(template.identitas, {
            nama: 'Nama', jenis_kelamin: 'Jenis Kelamin', tanggal_lahir: 'Tanggal Lahir', alamat: 'Alamat', no_hp: 'No HP'
        });
        document.getElementById('preview-anamnesa').innerHTML = renderPreviewSection(template.anamnesa, {
            keluhan_utama: 'Keluhan Utama', riwayat_penyakit_sekarang: 'RPS', riwayat_penyakit_dahulu: 'RPD'
        });
        document.getElementById('preview-pemeriksaan').innerHTML = renderPreviewSection(template.pemeriksaan_fisik, {
            keadaan_umum: 'Keadaan Umum', tekanan_darah: 'Tekanan Darah', nadi: 'Nadi', suhu: 'Suhu'
        });
        document.getElementById('preview-diagnosis').innerHTML = renderPreviewSection(template.diagnosis, {
            diagnosis_utama: 'Diagnosis'
        });

        const confidence = data.confidence;
        const confidenceEl = document.getElementById('import-confidence');
        confidenceEl.textContent = `Confidence: ${confidence.percentage}% (${confidence.score}/${confidence.total} fields)`;
        confidenceEl.className = `badge ${confidence.percentage >= 70 ? 'badge-success' : confidence.percentage >= 40 ? 'badge-warning' : 'badge-danger'}`;

        document.getElementById('import-step-1').style.display = 'none';
        document.getElementById('import-step-2').style.display = 'block';
        document.getElementById('btn-import-parse').style.display = 'none';
        document.getElementById('btn-import-back').style.display = 'inline-block';
        document.getElementById('btn-import-apply').style.display = 'inline-block';
    }

    function renderVisitInfoSection(data) {
        const container = document.getElementById('preview-visit-info');
        if (!container) return;
        const locationOptions = {
            'klinik_private': 'Klinik Privat', 'rsia_melinda': 'RSIA Melinda',
            'rsud_gambiran': 'RSUD Gambiran', 'rs_bhayangkara': 'RS Bhayangkara'
        };
        // Default to today's date if not detected
        const today = formatDateLocal(new Date());
        const visitDate = data.visit_date || today;

        let html = '<div class="row">';
        // Date
        html += '<div class="col-md-4"><div class="form-group mb-2">';
        html += '<label class="small font-weight-bold"><i class="fas fa-calendar-alt mr-1"></i>Tanggal';
        html += data.visit_date_detected ? ' <span class="badge badge-success badge-sm">Terdeteksi</span>' : '';
        html += `</label><input type="date" class="form-control form-control-sm" id="import-visit-date" value="${visitDate}">`;
        html += '</div></div>';
        // Time
        html += '<div class="col-md-3"><div class="form-group mb-2">';
        html += '<label class="small font-weight-bold"><i class="fas fa-clock mr-1"></i>Jam</label>';
        html += '<input type="time" class="form-control form-control-sm" id="import-visit-time" value="09:00">';
        html += '</div></div>';
        // Location
        html += '<div class="col-md-5"><div class="form-group mb-2">';
        html += '<label class="small font-weight-bold"><i class="fas fa-hospital mr-1"></i>Lokasi';
        html += data.visit_location_detected ? ' <span class="badge badge-success badge-sm">Terdeteksi</span>' : '';
        html += '</label><select class="form-control form-control-sm" id="import-visit-location">';
        for (const [v, l] of Object.entries(locationOptions)) {
            html += `<option value="${v}" ${data.visit_location === v ? 'selected' : ''}>${l}</option>`;
        }
        html += '</select></div></div></div>';
        container.innerHTML = html;
    }

    // Load patients for import selector
    async function loadPatientsForImport() {
        const select = document.getElementById('import-patient-select');
        if (!select) return;

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/patients?limit=500', {
                headers: { 'Authorization': `Bearer ${token}` }
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
            console.error('Error loading patients for import:', error);
            select.innerHTML = '<option value="">-- Gagal memuat pasien --</option>';
        }
    }

    function renderPreviewSection(data, labels) {
        if (!data) return '<p class="text-muted small">Tidak ada data</p>';
        let html = '<div class="preview-fields">';
        let hasData = false;
        for (const [key, label] of Object.entries(labels)) {
            const value = data[key];
            if (value !== null && value !== undefined && value !== '') {
                hasData = true;
                const escaped = String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                html += `<div class="custom-control custom-checkbox mb-1">
                    <input type="checkbox" class="custom-control-input" id="import-${key}" checked data-field="${key}">
                    <label class="custom-control-label small" for="import-${key}"><strong>${label}:</strong> ${escaped}</label>
                </div>`;
            }
        }
        html += '</div>';
        return hasData ? html : '<p class="text-muted small">Tidak ada data terdeteksi</p>';
    }

    window.importMedicalBack = function() {
        document.getElementById('import-step-1').style.display = 'block';
        document.getElementById('import-step-2').style.display = 'none';
        document.getElementById('btn-import-parse').style.display = 'inline-block';
        document.getElementById('btn-import-back').style.display = 'none';
        document.getElementById('btn-import-apply').style.display = 'none';
    };

    window.importMedicalApply = async function() {
        if (!parsedImportData) { alert('Tidak ada data untuk diterapkan'); return; }

        const patientSelect = document.getElementById('import-patient-select');
        const patientId = patientSelect?.value;

        if (!patientId) {
            alert('Silakan pilih pasien terlebih dahulu');
            patientSelect?.focus();
            return;
        }

        const visitDate = document.getElementById('import-visit-date')?.value;
        const visitTime = document.getElementById('import-visit-time')?.value || '09:00';
        const visitLocation = document.getElementById('import-visit-location')?.value || 'klinik_private';
        const category = document.getElementById('import-category')?.value || 'obstetri';

        // Get checked fields
        const checkedFields = {};
        document.querySelectorAll('#import-step-2 input[type="checkbox"]:checked').forEach(cb => {
            checkedFields[cb.dataset.field] = true;
        });

        const applyBtn = document.getElementById('btn-import-apply');
        const originalBtnText = applyBtn?.innerHTML;

        try {
            if (applyBtn) {
                applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memeriksa MR...';
                applyBtn.disabled = true;
            }

            // Check for existing DRD - DO NOT create new one (only PERIKSA can create)
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const checkRes = await fetch(`/api/sunday-clinic/check-existing?patient_id=${patientId}&location=${visitLocation}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const checkResult = await checkRes.json();

            let mrId;
            if (checkResult.success && checkResult.existingMrId) {
                // Use existing DRD
                mrId = checkResult.existingMrId;
                console.log('[Import] Using existing DRD:', mrId);
            } else {
                // No existing DRD - show error
                if (applyBtn) {
                    applyBtn.innerHTML = originalBtnText;
                    applyBtn.disabled = false;
                }

                if (window.Swal) {
                    await Swal.fire({
                        icon: 'warning',
                        title: 'Belum Ada DRD',
                        html: 'Pasien belum memiliki rekam medis hari ini.<br><br>Gunakan tombol <b>PERIKSA</b> di halaman Appointment untuk membuat rekam medis baru terlebih dahulu.',
                        confirmButtonText: 'OK'
                    });
                } else {
                    alert('Pasien belum memiliki rekam medis hari ini.\n\nGunakan tombol PERIKSA di halaman Appointment untuk membuat rekam medis baru terlebih dahulu.');
                }
                return;
            }

            // Store parsed data in sessionStorage to apply after navigation
            const importDataToApply = {
                template: parsedImportData.template,
                checkedFields: checkedFields,
                visitDate: visitDate,
                visitTime: visitTime,
                visitLocation: visitLocation
            };
            sessionStorage.setItem('pendingImportData', JSON.stringify(importDataToApply));

            // Close modal
            $('#import-medical-modal').modal('hide');
            resetImportModal();

            // Show info and navigate
            if (window.Swal) {
                await Swal.fire({
                    icon: 'info',
                    title: 'Menggunakan MR yang Ada',
                    html: `MR ID: <strong>${mrId}</strong><br>Mengalihkan ke form rekam medis...`,
                    timer: 1500,
                    showConfirmButton: false
                });
            }

            // Navigate to sunday-clinic with the existing MR
            window.location.href = window.buildSundayClinicAppUrl
                ? window.buildSundayClinicAppUrl(mrId, 'identity')
                : `/staff/public/index-adminlte.html?page=sunday-clinic&mr=${encodeURIComponent(mrId)}&section=identity`;

        } catch (error) {
            console.error('Import apply error:', error);
            if (applyBtn) {
                applyBtn.innerHTML = originalBtnText;
                applyBtn.disabled = false;
            }
            alert('Error: ' + error.message);
        }
    };

    // Bulk import functions
    window.handleBulkFilesSelect = async function(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        if (files.length > 50) { alert('Maksimal 50 file'); return; }

        const category = document.getElementById('bulk-import-category')?.value || 'obstetri';
        const defaultLocation = document.getElementById('bulk-import-location')?.value || '';
        const progressContainer = document.getElementById('bulk-import-progress');
        const progressBar = document.getElementById('bulk-import-progress-bar');
        const progressText = document.getElementById('bulk-import-progress-text');

        if (progressContainer) progressContainer.style.display = 'block';

        const records = [];
        for (let i = 0; i < files.length; i++) {
            const text = await readFileAsText(files[i]);
            records.push({ text, filename: files[i].name, category });
            if (progressBar) progressBar.style.width = `${((i + 1) / files.length) * 50}%`;
            if (progressText) progressText.textContent = `Membaca file ${i + 1}/${files.length}...`;
        }

        if (progressText) progressText.textContent = 'Memproses data...';

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/medical-import/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ records, default_category: category, default_location: defaultLocation })
            });
            const result = await response.json();
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = 'Selesai!';
            if (!result.success) { alert('Gagal: ' + result.message); return; }
            window.bulkImportResults = result.data;
            displayBulkImportResults(result.data, files);
        } catch (error) {
            console.error('Bulk import error:', error);
            alert('Error: ' + error.message);
        }
    };

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    function displayBulkImportResults(data, files) {
        const container = document.getElementById('bulk-import-results');
        if (!container) return;
        const locationLabels = { 'klinik_private': 'Klinik Privat', 'rsia_melinda': 'RSIA Melinda', 'rsud_gambiran': 'RSUD Gambiran', 'rs_bhayangkara': 'RS Bhayangkara' };
        let html = `<div class="alert alert-info"><strong>Hasil:</strong> ${data.successful} berhasil, ${data.failed} gagal dari ${data.total} file</div>`;
        html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead class="thead-light"><tr>';
        html += '<th><input type="checkbox" id="bulk-select-all" checked onchange="toggleBulkSelectAll(this)"></th>';
        html += '<th>File</th><th>Nama Pasien</th><th>Tanggal</th><th>Lokasi</th><th>Confidence</th></tr></thead><tbody>';
        data.results.forEach((r, idx) => {
            const fname = files[r.index]?.name || `Record ${r.index + 1}`;
            const dateClass = r.visit_date_detected ? 'text-success' : 'text-warning';
            const locClass = r.visit_location_detected ? 'text-success' : 'text-warning';
            html += `<tr><td><input type="checkbox" class="bulk-item-check" data-index="${idx}" checked></td>`;
            html += `<td class="small">${fname}</td><td>${r.patient_name || '-'}</td>`;
            html += `<td><input type="date" class="form-control form-control-sm bulk-visit-date" data-index="${idx}" value="${r.visit_date || ''}" style="max-width:130px;"><small class="${dateClass}">${r.visit_date_detected ? '(auto)' : '(manual)'}</small></td>`;
            html += `<td><select class="form-control form-control-sm bulk-visit-location" data-index="${idx}" style="max-width:130px;"><option value="">--</option>`;
            for (const [v, l] of Object.entries(locationLabels)) html += `<option value="${v}" ${r.visit_location === v ? 'selected' : ''}>${l}</option>`;
            html += `</select><small class="${locClass}">${r.visit_location_detected ? '(auto)' : '(manual)'}</small></td>`;
            html += `<td><span class="badge ${r.confidence.percentage >= 70 ? 'badge-success' : r.confidence.percentage >= 40 ? 'badge-warning' : 'badge-danger'}">${r.confidence.percentage}%</span></td></tr>`;
        });
        html += '</tbody></table></div>';
        html += '<div class="mt-3"><button class="btn btn-success" onclick="applyBulkImport()"><i class="fas fa-check mr-1"></i>Terapkan Terpilih</button></div>';
        container.innerHTML = html;
    }

    window.toggleBulkSelectAll = function(checkbox) {
        document.querySelectorAll('.bulk-item-check').forEach(cb => cb.checked = checkbox.checked);
    };

    window.applyBulkImport = function() {
        if (!window.bulkImportResults) { alert('Tidak ada data'); return; }
        const selected = [];
        document.querySelectorAll('.bulk-item-check:checked').forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            const r = window.bulkImportResults.results[idx];
            if (r) {
                const dateInput = document.querySelector(`.bulk-visit-date[data-index="${idx}"]`);
                const locSelect = document.querySelector(`.bulk-visit-location[data-index="${idx}"]`);
                selected.push({ ...r, visit_date: dateInput?.value || r.visit_date, visit_location: locSelect?.value || r.visit_location });
            }
        });
        if (selected.length === 0) { alert('Pilih minimal 1 item'); return; }
        console.log('Selected records:', selected);
        $('#bulk-import-modal').modal('hide');
        resetBulkImportModal();
        if (window.Swal) {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: `${selected.length} catatan berhasil di-parse.`, timer: 2000, showConfirmButton: false });
        } else {
            alert(`${selected.length} catatan berhasil di-parse`);
        }
    };

    // File input label update and file reading
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('custom-file-input')) {
            const label = e.target.nextElementSibling;
            if (label && e.target.files.length > 0) {
                label.textContent = e.target.files.length > 1 ? `${e.target.files.length} files selected` : e.target.files[0].name;
            }

            // Read file content into textarea for single import
            if (e.target.id === 'import-file' && e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(ev) {
                    document.getElementById('import-text').value = ev.target.result;
                };
                reader.onerror = function() {
                    alert('Gagal membaca file');
                };
                reader.readAsText(file);
            }
        }
    });
    // ==================== End Medical Import Functions ====================

    // Registrasi Pasien Page Functions
    let newPatientsCurrentPage = 1;
    let newPatientsTotalPages = 1;

    window.showRegistrasiPasienPage = function() {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show registrasi pasien page
        document.getElementById('registrasi-pasien-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const regPasienNav = document.querySelector('#nav-registrasi-pasien .nav-link');
        if (regPasienNav) {
            regPasienNav.classList.add('active');
        }

        const titleEl = document.getElementById('page-title');
        if (titleEl) {
            titleEl.textContent = 'Registrasi Pasien';
        }
        window.dispatchStaffPageChanged?.('registrasi-pasien');

        // Load new patients
        loadNewPatients();
    };

    async function loadNewPatients(page = 1) {
        const tbody = document.getElementById('new-patients-tbody');
        if (!tbody) return;

        try {
            newPatientsCurrentPage = page;
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch(`/api/patients?view=basic&last_visit_location=no_visit&sort=recent&limit=10&page=${page}&fresh=1`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load patients');

            const data = await response.json();

            // Update pagination info
            const pagination = data.pagination || { total: 0, page: 1, totalPages: 1 };
            newPatientsTotalPages = pagination.totalPages;
            const start = data.data && data.data.length > 0 ? ((page - 1) * 10) + 1 : 0;
            const end = start > 0 ? start + data.data.length - 1 : 0;

            const paginationInfo = document.getElementById('new-patients-pagination-info');
            if (paginationInfo) {
                paginationInfo.textContent = `Menampilkan ${start}-${end} dari ${pagination.total}`;
            }

            // Update button states
            const prevBtn = document.getElementById('new-patients-prev-btn');
            const nextBtn = document.getElementById('new-patients-next-btn');
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= newPatientsTotalPages;

            if (!data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada pasien terdaftar</td></tr>';
                return;
            }

            tbody.innerHTML = data.data.map(patient => {
                const regDate = patient.created_at ? (() => { const d = new Date(patient.created_at); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`; })() : '-';

                return `
                    <tr>
                        <td><code class="font-weight-bold">${patient.id}</code></td>
                        <td>${patient.full_name || '-'}</td>
                        <td>${patient.whatsapp || patient.phone || '-'}</td>
                        <td>${regDate}</td>
                        <td>
                            <button class="btn btn-xs btn-info" onclick="viewPatientDetail('${patient.id}')" title="Lihat Detail">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (error) {
            console.error('Load new patients error:', error);
            const tbody = document.getElementById('new-patients-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Gagal memuat data</td></tr>';
            }
        }
    }
    window.loadNewPatients = loadNewPatients;

    // Format patient type from last visit for display
    function formatPatientType(type) {
        if (!type) return '<span class="badge badge-light">-</span>';
        const typeMap = {
            'obstetri': '<span class="badge badge-info">Obstetri</span>',
            'gyn_repro': '<span class="badge badge-purple" style="background:#9c27b0;color:#fff">Gyn Repro</span>',
            'gyn_special': '<span class="badge badge-warning">Gyn</span>'
        };
        return typeMap[type] || `<span class="badge badge-secondary">${type}</span>`;
    }
    window.formatPatientType = formatPatientType;

    function escapeHtmlSafe(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatControlDate(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return escapeHtmlSafe(value);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatHplDate(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return escapeHtmlSafe(value);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    }

    function renderHplRiskRows(items, tbodyId, riskType) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        if (!Array.isArray(items) || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada pasien.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(patient => {
            const fullNameRaw = String(patient.full_name || '-');
            const patientName = escapeHtmlSafe(fullNameRaw);
            const patientId = escapeHtmlSafe(patient.patient_id || '');
            const patientIdRaw = String(patient.patient_id || '');
            const patientNameJs = fullNameRaw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const phone = escapeHtmlSafe(patient.contact_phone || patient.whatsapp || patient.phone || '-');
            const diagnosis = escapeHtmlSafe(patient.last_diagnosis || '-');
            const diagnosisShort = diagnosis.length > 90 ? `${diagnosis.slice(0, 90)}...` : diagnosis;
            const lastControlDate = formatControlDate(patient.last_visit);
            const hplDate = formatHplDate(patient.hpl);
            const riskBadge = riskType === 'overdue'
                ? `<span class="badge badge-danger ml-1">Lewat HPL ${hplDate}</span>`
                : `<span class="badge badge-warning ml-1">Mendekati HPL ${hplDate}</span>`;
            const actionButton = `<button type="button" class="btn btn-xs btn-success" onclick="markAsDelivered('${patientIdRaw}', '${patientNameJs}', this)" title="Tandai Sudah Melahirkan"><i class="fas fa-baby"></i> Sudah Lahir</button>`;

            return `
                <tr>
                    <td>
                        <a href="#" onclick="showPatientMRList('${patientId}', '${patientName}'); return false;">${patientName}</a>
                        ${riskBadge}
                    </td>
                    <td>${phone}</td>
                    <td title="${diagnosis}">${diagnosisShort}</td>
                    <td>${lastControlDate}</td>
                    <td class="text-nowrap">${actionButton}</td>
                </tr>
            `;
        }).join('');
    }

    window.loadHplRiskPatients = async function() {
        const nearTbody = document.getElementById('near-hpl-patients-tbody');
        const overdueTbody = document.getElementById('overdue-hpl-patients-tbody');
        const nearCount = document.getElementById('near-hpl-count');
        const overdueCount = document.getElementById('overdue-hpl-count');

        if (!nearTbody || !overdueTbody) return;

        nearTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat data...</td></tr>';
        overdueTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat data...</td></tr>';

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const headers = { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' };

            const [nearRes, overdueRes] = await Promise.all([
                fetch(`/api/patients/near-due-pregnancies?_=${Date.now()}`, { headers }),
                fetch(`/api/patients/overdue-pregnancies?_=${Date.now()}`, { headers })
            ]);

            const nearData = await nearRes.json().catch(() => ({ success: false, data: [] }));
            const overdueData = await overdueRes.json().catch(() => ({ success: false, data: [] }));

            if (!nearRes.ok || !nearData.success) {
                throw new Error(nearData.message || 'Gagal memuat pasien mendekati HPL');
            }
            if (!overdueRes.ok || !overdueData.success) {
                throw new Error(overdueData.message || 'Gagal memuat pasien lewat HPL');
            }

            const nearItems = nearData.data || [];
            const overdueItems = overdueData.data || [];

            if (nearCount) nearCount.textContent = String(nearItems.length);
            if (overdueCount) overdueCount.textContent = String(overdueItems.length);

            renderHplRiskRows(nearItems, 'near-hpl-patients-tbody', 'near');
            renderHplRiskRows(overdueItems, 'overdue-hpl-patients-tbody', 'overdue');
        } catch (error) {
            console.error('Error loading HPL risk patients:', error);
            nearTbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${escapeHtmlSafe(error.message || 'Gagal memuat data')}</td></tr>`;
            overdueTbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${escapeHtmlSafe(error.message || 'Gagal memuat data')}</td></tr>`;
            if (nearCount) nearCount.textContent = '0';
            if (overdueCount) overdueCount.textContent = '0';
        }
    };

    // ─── Shared row renderer for #manage-patients-tbody ──────────────────────
    // Used by BOTH loadWebPatients() and performAdvancedSearch() to keep the
    // template consistent and avoid the dual-render bug (AGENTS.md rule #24).
    function getPatientTableDateValue(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatPatientTableDate(value) {
        const date = getPatientTableDateValue(value);
        if (!date) return '-';
        return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear().toString().slice(-2)}`;
    }

    function getPatientTableDateSort(value) {
        const date = getPatientTableDateValue(value);
        return date ? String(date.getTime()) : '0';
    }

    function getManagePatientDataTableOptions(extraOptions = {}) {
        return Object.assign({
            "pageLength": 25,
            "searching": false,
            "columnDefs": [
                {
                    "targets": [3, 5, 6],
                    "orderDataType": "dokterdibya-data-order-date",
                    "type": "num"
                }
            ]
        }, extraOptions);
    }

    function renderManagePatientRow(patient) {
        const registeredAt = patient.registration_date || patient.created_at;
        const registerDate = formatPatientTableDate(registeredAt);
        const registerDateSort = getPatientTableDateSort(registeredAt);
        const visitDate = formatPatientTableDate(patient.last_visit);
        const visitDateSort = getPatientTableDateSort(patient.last_visit);
        const hplDateSort = getPatientTableDateSort(patient.hpl);
        const resumeStatusMap = {
            'sudah_kirim_usg_resume': '<span class="badge badge-success">USG + Resume OK</span>',
            'sudah_kirim_resume': '<span class="badge badge-info">Resume OK</span>',
            'sudah_simpan': '<span class="badge badge-warning">Tersimpan</span>',
            'belum_generate': '<span class="badge badge-secondary">Belum Generate</span>'
        };
        const resumeStatusBadge = resumeStatusMap[patient.resume_status] || '<span class="badge badge-light">Belum ada resume</span>';
        const visitHistoryBadgeMap = {
            sudah_ada_drd: '',
            pernah_kontrol_tanpa_drd: '<span class="badge badge-info mt-1">Pernah kontrol, belum ada DRD</span>',
            belum_pernah_kontrol: '<span class="d-inline-block border bg-white mt-1" style="width: 10px; height: 10px; border-radius: 2px;" title="Belum pernah kontrol" aria-label="Belum pernah kontrol"></span>'
        };
        const visitHistoryBadge = visitHistoryBadgeMap[patient.visit_history_status] ?? visitHistoryBadgeMap.belum_pernah_kontrol;
        const statusBadge = patient.status === 'active' ?
            '<span class="badge badge-success">Aktif</span>' :
            '<span class="badge badge-secondary">Nonaktif</span>';
        const accessBlockBadge = (patient.is_access_blocked === true || Number(patient.is_access_blocked) === 1)
            ? '<span class="badge badge-danger ml-1"><i class="fas fa-ban mr-1"></i>Blocked</span>'
            : '';
        const locationLabels = { 'klinik_private': 'Prv', 'rsia_melinda': 'Mel', 'rsud_gambiran': 'Gmb', 'rs_bhayangkara': 'Bhy' };
        const locationBadge = patient.visit_location
            ? `<span class="badge badge-sm badge-info ml-1">${locationLabels[patient.visit_location] || '?'}</span>` : '';
        const escapedName = (patient.full_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const mrIdUrl = window.buildSundayClinicAppUrl
            ? window.buildSundayClinicAppUrl(patient.mr_id, 'identitas')
            : `/staff/public/index-adminlte.html?page=sunday-clinic&mr=${encodeURIComponent(patient.mr_id)}&section=identitas`;
        const mrIdCell = patient.mr_id
            ? `<div><a href="${mrIdUrl}" class="text-primary" title="Buka Rekam Medis"><small>${patient.mr_id.toUpperCase()}</small></a>${locationBadge}</div>${visitHistoryBadge}`
            : `<span class="text-muted">-</span>${visitHistoryBadge ? `<div>${visitHistoryBadge}</div>` : ''}`;
        const nameMeta = patient.mr_id
            ? `${patient.id} - <a href="${mrIdUrl}" class="text-primary" title="Buka Rekam Medis"><small>${patient.mr_id.toUpperCase()}</small></a>${locationBadge}`
            : `${patient.id}${visitHistoryBadge ? ` - ${visitHistoryBadge}` : ''}`;
        const nameCell = `<div><a href="#" class="text-primary font-weight-semibold" onclick="showPatientMRList('${patient.id}', '${escapedName}'); return false;" title="Lihat Daftar Rekam Medis">${patient.full_name || '-'}</a></div><div class="small text-muted">${nameMeta}</div>`;
        let hplCell = '-';
        if (patient.is_obstetri && patient.hpl && !patient.has_delivered) {
            const hplDate = new Date(patient.hpl);
            const hplFormatted = `${hplDate.getDate().toString().padStart(2,'0')}/${(hplDate.getMonth()+1).toString().padStart(2,'0')}/${hplDate.getFullYear().toString().slice(-2)}`;
            const weeksPregnant = Math.floor(patient.days_pregnant / 7);
            let bgClass = '', textClass = '', icon = '';
            if (patient.days_pregnant >= 280) { bgClass = 'bg-danger'; textClass = 'text-white'; icon = '<i class="fas fa-exclamation-triangle mr-1"></i>'; }
            else if (patient.days_pregnant >= 259) { bgClass = 'bg-warning'; icon = '<i class="fas fa-clock mr-1"></i>'; }
            hplCell = `<span class="${bgClass} ${textClass} px-1 rounded" title="Usia kehamilan: ${weeksPregnant} minggu">${icon}${hplFormatted}</span>`;
        } else if (patient.has_delivered) {
            hplCell = '<span class="badge badge-success"><i class="fas fa-baby mr-1"></i>Sudah Lahir</span>';
        }
        let deliveryButton = '';
        if (patient.is_obstetri && !patient.has_delivered) {
            deliveryButton = `<button type="button" class="btn btn-sm btn-success" onclick="markAsDelivered('${patient.id}', '${escapedName}', this)" title="Tandai Sudah Melahirkan"><i class="fas fa-baby"></i></button>`;
        }
        return `
            <tr>
                <td class="text-nowrap">
                    <button type="button" class="btn btn-sm btn-info btn-view-patient" data-patient-id="${patient.id}" title="Detail">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${deliveryButton}
                    <button type="button" class="btn btn-sm btn-${patient.status === 'active' ? 'warning' : 'success'}"
                            onclick="togglePatientStatus('${patient.id}', '${patient.status}', '${escapedName}', this)"
                            title="${patient.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}">
                        <i class="fas fa-${patient.status === 'active' ? 'ban' : 'check'}"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deletePatient('${patient.id}', '${escapedName}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
                <td>${nameCell}</td>
                <td>${formatPatientType(patient.last_visit_type)}</td>
                <td data-order="${hplDateSort}">${hplCell}</td>
                <td>${resumeStatusBadge}</td>
                <td data-order="${registerDateSort}">${registerDate}</td>
                <td data-order="${visitDateSort}">${visitDate}</td>
                <td>${statusBadge}${accessBlockBadge}</td>
            </tr>
        `;
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function loadWebPatients() {
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            window.staffDebugLog('PatientSearch', 'Loading all patients', { hasToken: Boolean(token) });

            // Use unified patients endpoint
            const response = await fetch(`/api/patients?_=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            window.staffDebugLog('PatientSearch', 'Load patients response', { status: response.status });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Error response:', errorData);
                throw new Error('Failed to load patients');
            }

            const data = await response.json();
            window.staffDebugLog('PatientSearch', 'Loaded patients', { count: Array.isArray(data.data) ? data.data.length : 0 });
            const tbody = document.getElementById('manage-patients-tbody');

            if (!data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tidak ada pasien</td></tr>';
                return;
            }

            // Save current DataTable page before destroying so we can restore position
            let savedPage = 0;
            if ($.fn.DataTable && $.fn.DataTable.isDataTable('#manage-patients-table')) {
                savedPage = $('#manage-patients-table').DataTable().page();
                $('#manage-patients-table').DataTable().clear().destroy();
            }

            tbody.innerHTML = data.data.map(renderManagePatientRow).join('');

            // Initialize DataTable with fresh data (already cleared before DOM update)
            if ($.fn.DataTable) {
                const dt = $('#manage-patients-table').DataTable(getManagePatientDataTableOptions({
                    "order": [[6, 'desc']], // Sort by visit date (column 6: Terakhir Visit) - newest first
                }));
                // Restore previous page position so user doesn't jump back to page 1
                if (savedPage > 0) {
                    dt.page(savedPage).draw('page');
                }
            }

            if (typeof window.installPatientViewButtons === 'function') {
                window.installPatientViewButtons({
                    onView: viewPatientDetail
                });
            }

            // Also update floating panel if it's visible
            const floatingPanel = document.getElementById('floating-kelola-pasien');
            if (floatingPanel && !floatingPanel.classList.contains('d-none') && typeof loadFloatingPanelPatients === 'function') {
                loadFloatingPanelPatients();
            }

        } catch (error) {
            console.error('Error loading web patients:', error);
            document.getElementById('manage-patients-tbody').innerHTML =
                '<tr><td colspan="8" class="text-center text-danger">Gagal memuat data pasien</td></tr>';
        }
    }

    // Advanced Search Functions
    let advancedSearchActive = false;

    // Debounce function for live search
    let searchDebounceTimer = null;
    function debounceSearch(delay = 300) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            performAdvancedSearch();
        }, delay);
    }

    // Handle advanced search form submission and live search
    onPatientToolsReady(function() {
        const advSearchForm = document.getElementById('advanced-search-form');
        if (advSearchForm) {
            advSearchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                performAdvancedSearch();
            });
        }

        // Live search - trigger search on typing (with debounce)
        const searchFields = [
            'adv-search-name',
            'adv-search-id',
            'adv-search-mr',
            'adv-search-email',
            'adv-search-phone',
            'adv-search-whatsapp',
            'adv-search-husband'
        ];

        searchFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', function() {
                    // Trigger search after 1 character minimum
                    if (this.value.length >= 1 || this.value.length === 0) {
                        debounceSearch(400); // 400ms delay for smoother UX
                    }
                });
            }
        });

        // For age fields, trigger on change
        ['adv-search-age-min', 'adv-search-age-max'].forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', function() {
                    debounceSearch(500);
                });
            }
        });
    });

    async function performAdvancedSearch() {
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const tbody = document.getElementById('manage-patients-tbody');
            const resultCount = document.getElementById('adv-search-result-count');

            // Show loading
            tbody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Mencari...</td></tr>';

            // Collect search parameters
            const params = new URLSearchParams();

            const name = document.getElementById('adv-search-name')?.value;
            const id = document.getElementById('adv-search-id')?.value;
            const mr_id = document.getElementById('adv-search-mr')?.value;
            const email = document.getElementById('adv-search-email')?.value;
            const age_min = document.getElementById('adv-search-age-min')?.value;
            const age_max = document.getElementById('adv-search-age-max')?.value;
            const phone = document.getElementById('adv-search-phone')?.value;
            const whatsapp = document.getElementById('adv-search-whatsapp')?.value;
            const husband = document.getElementById('adv-search-husband')?.value;
            const visit_date = document.getElementById('adv-search-visit-date')?.value;

            if (name) params.append('name', name);
            if (id) params.append('id', id);
            if (mr_id) params.append('mr_id', mr_id);
            if (email) params.append('email', email);
            if (age_min) params.append('age_min', age_min);
            if (age_max) params.append('age_max', age_max);
            if (phone) params.append('phone', phone);
            if (whatsapp) params.append('whatsapp', whatsapp);
            if (husband) params.append('husband', husband);
            if (visit_date) params.append('visit_date', visit_date);
            params.append('limit', '100');

            // Check if any filter is applied
            const hasFilters = name || id || mr_id || email || age_min || age_max || phone || whatsapp || husband || visit_date;

            if (!hasFilters) {
                // No filters, load all patients
                loadWebPatients();
                if (resultCount) resultCount.textContent = '';
                advancedSearchActive = false;
                return;
            }

            advancedSearchActive = true;

            const response = await fetch(`/api/patients/search/advanced?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();

            window.staffDebugLog('PatientSearch', 'Advanced search response', {
                filters: {
                    name: Boolean(name),
                    id: Boolean(id),
                    mr_id: Boolean(mr_id),
                    email: Boolean(email),
                    phone: Boolean(phone),
                    whatsapp: Boolean(whatsapp),
                    husband: Boolean(husband),
                    visit_date: Boolean(visit_date)
                },
                count: Array.isArray(data.data) ? data.data.length : 0
            });

            // Update result count
            if (resultCount) {
                resultCount.textContent = `${data.total || data.count || 0} hasil ditemukan`;
            }

            // IMPORTANT: Destroy DataTable FIRST before modifying DOM
            if ($.fn.DataTable && $.fn.DataTable.isDataTable('#manage-patients-table')) {
                $('#manage-patients-table').DataTable().clear().destroy();
            }

            if (!data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada pasien yang sesuai dengan kriteria pencarian</td></tr>';
                return;
            }

            // Render results - uses shared renderManagePatientRow (same template as loadWebPatients)
            tbody.innerHTML = data.data.map(renderManagePatientRow).join('');

            // Reinitialize DataTable with fresh data
            $('#manage-patients-table').DataTable(getManagePatientDataTableOptions({
                "order": [[1, 'asc']], // Sort by name (column 1)
                "paging": data.data.length > 25, // Only show pagination if more than 25 results
                "info": true
            }));

            if (typeof window.installPatientViewButtons === 'function') {
                window.installPatientViewButtons({
                    onView: viewPatientDetail
                });
            }

        } catch (error) {
            console.error('Error in advanced search:', error);
            document.getElementById('manage-patients-tbody').innerHTML =
                '<tr><td colspan="8" class="text-center text-danger">Gagal melakukan pencarian</td></tr>';
        }
    }

    window.resetAdvancedSearch = function() {
        // Clear all search fields
        document.getElementById('adv-search-name').value = '';
        document.getElementById('adv-search-id').value = '';
        document.getElementById('adv-search-mr').value = '';
        document.getElementById('adv-search-email').value = '';
        document.getElementById('adv-search-age-min').value = '';
        document.getElementById('adv-search-age-max').value = '';
        document.getElementById('adv-search-phone').value = '';
        document.getElementById('adv-search-whatsapp').value = '';
        document.getElementById('adv-search-husband').value = '';
        document.getElementById('adv-search-visit-date').value = '';

        // Clear result count
        const resultCount = document.getElementById('adv-search-result-count');
        if (resultCount) resultCount.textContent = '';

        // Reload all patients
        advancedSearchActive = false;
        loadWebPatients();
    };

    window.performAdvancedSearch = performAdvancedSearch;

    window.deletePatient = async function(patientId, patientName, event) {
        // Get button reference from event if provided
        const deleteBtn = event ? event.target.closest('button') : null;
        const originalHtml = deleteBtn ? deleteBtn.innerHTML : '';

        // Konfirmasi dengan pesan detail tentang apa yang akan dihapus
        const confirmMessage = `PERINGATAN: Hapus Pasien dan Semua Data Terkait

Anda akan menghapus pasien: "${patientName}"

Data yang akan DIHAPUS PERMANEN:
- Data pasien (profil, email, nomor telepon)
- Riwayat billing dan invoice
- Detail item billing
- Transaksi pembayaran
- Rekam medis (medical records)
- Data pemeriksaan medis
- Riwayat kunjungan
- Janji temu (appointments)
- Form patient intake

PERINGATAN: TINDAKAN INI TIDAK DAPAT DIBATALKAN!

Apakah Anda yakin ingin melanjutkan?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        // Konfirmasi kedua untuk keamanan
        const secondConfirm = prompt('Ketik "HAPUS" (huruf besar) untuk konfirmasi penghapusan:');
        if (secondConfirm !== 'HAPUS') {
            alert('Penghapusan dibatalkan');
            return;
        }

        try {
            // Show loading
            if (deleteBtn) {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            // Use unified patients endpoint
            const response = await fetch(`/api/patients/${patientId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${(window.getAuthToken ? window.getAuthToken() : '')}`
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to delete patient');
            }

            // Show success message with details
            let successMessage = `[OK] Pasien "${patientName}" berhasil dihapus!\n\nData yang dihapus:`;
            if (result.deleted_data) {
                successMessage += `\n- Billing Items: ${result.deleted_data.billing_items || 0}`;
                successMessage += `\n- Payment Transactions: ${result.deleted_data.payment_transactions || 0}`;
                successMessage += `\n- Billings: ${result.deleted_data.billings || 0}`;
                successMessage += `\n- Patient Records: ${result.deleted_data.patient_records || 0}`;
                successMessage += `\n- Medical Records: ${result.deleted_data.medical_records || 0}`;
                successMessage += `\n- Medical Exams: ${result.deleted_data.medical_exams || 0}`;
                successMessage += `\n- Visits: ${result.deleted_data.visits || 0}`;
                successMessage += `\n- Appointments: ${result.deleted_data.appointments || 0}`;
                successMessage += `\n- Intake Submissions: ${result.deleted_data.patient_intake_submissions || 0}`;
            }

            alert(successMessage);
            loadWebPatients(); // Reload the main list
            if (typeof window.loadHplRiskPatients === 'function') {
                window.loadHplRiskPatients();
            }

            // Also reload floating panel if visible
            const floatingPanel = document.getElementById('floating-kelola-pasien');
            if (floatingPanel && !floatingPanel.classList.contains('d-none') && typeof loadFloatingPanelPatients === 'function') {
                loadFloatingPanelPatients();
            }

            // Reload patient list in appointments module
            if (typeof window.reloadAppointmentPatients === 'function') {
                console.log('[INFO] Reloading appointment patients...');
                await window.reloadAppointmentPatients();
            }

            // Reload Klinik Private appointments if available
            if (window.klinikPrivate && typeof window.klinikPrivate.reload === 'function') {
                console.log('[INFO] Reloading Klinik Private appointments...');
                await window.klinikPrivate.reload();
            }

            console.log('[OK] All patient lists refreshed after deletion');

        } catch (error) {
            console.error('Error deleting patient:', error);
            alert('Gagal menghapus pasien:\n' + error.message);

            // Restore button
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = originalHtml;
            }
        }
    };

    // Mark patient as delivered (create birth_congratulations entry)
    window.markAsDelivered = async function(patientId, patientName, btnEl) {
        const confirmResult = await Swal.fire({
            title: 'Tandai Sudah Melahirkan?',
            text: `Tandai "${patientName}" sudah melahirkan? Ini akan menghapus pasien dari daftar monitoring kehamilan.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Tandai',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#28a745'
        });

        if (!confirmResult.isConfirmed) return;

        // Disable button while processing
        const originalHtml = btnEl ? btnEl.innerHTML : '';
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const response = await fetch(`/api/patients/${patientId}/mark-delivered`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${(window.getAuthToken ? window.getAuthToken() : '')}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Gagal menandai pasien');
            }

            // Update the row in-place — no table reload needed
            if (btnEl) {
                const row = btnEl.closest('tr');
                if (row) {
                    // Update HPL column (4th cell, index 3) to show "Sudah Lahir"
                    const hplCell = row.cells[3];
                    if (hplCell) {
                        hplCell.innerHTML = '<span class="badge badge-success"><i class="fas fa-baby mr-1"></i>Sudah Lahir</span>';
                    }
                    // Remove the delivery button
                    btnEl.remove();
                }
            }

            if (typeof window.loadHplRiskPatients === 'function') {
                window.loadHplRiskPatients();
            }

            Swal.fire({ icon: 'success', title: 'Berhasil', text: `${patientName} ditandai sudah melahirkan!`, timer: 2000, showConfirmButton: false });

        } catch (error) {
            console.error('Error marking patient as delivered:', error);
            Swal.fire({ icon: 'error', title: 'Gagal', text: error.message });
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = originalHtml;
            }
        }
    };

    window.togglePatientStatus = async function(patientId, currentStatus, patientName, btnEl) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const action = newStatus === 'active' ? 'mengaktifkan' : 'menonaktifkan';

        const confirmResult = await Swal.fire({
            title: `${action.charAt(0).toUpperCase() + action.slice(1)} pasien?`,
            text: `Apakah Anda yakin ingin ${action} pasien "${patientName}"?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya',
            cancelButtonText: 'Batal'
        });

        if (!confirmResult.isConfirmed) return;

        const originalHtml = btnEl ? btnEl.innerHTML : '';
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const response = await fetch(`/api/patients/${patientId}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${(window.getAuthToken ? window.getAuthToken() : '')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                throw new Error('Failed to update status');
            }

            // Update the row in-place
            if (btnEl) {
                const row = btnEl.closest('tr');
                if (row) {
                    const statusCell = row.cells[7];
                    if (statusCell) {
                        statusCell.innerHTML = newStatus === 'active'
                            ? '<span class="badge badge-success">Aktif</span>'
                            : '<span class="badge badge-secondary">Nonaktif</span>';
                    }
                    const escapedName = patientName.replace(/'/g, "\\'");
                    btnEl.disabled = false;
                    btnEl.className = `btn btn-sm btn-${newStatus === 'active' ? 'warning' : 'success'}`;
                    btnEl.setAttribute('onclick', `togglePatientStatus('${patientId}', '${newStatus}', '${escapedName}', this)`);
                    btnEl.setAttribute('title', newStatus === 'active' ? 'Nonaktifkan' : 'Aktifkan');
                    btnEl.innerHTML = `<i class="fas fa-${newStatus === 'active' ? 'ban' : 'check'}"></i>`;
                }
            }

            Swal.fire({ icon: 'success', title: 'Berhasil', text: `Status diubah menjadi ${newStatus === 'active' ? 'aktif' : 'nonaktif'}`, timer: 2000, showConfirmButton: false });

        } catch (error) {
            console.error('Error updating patient status:', error);
            Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal mengubah status pasien' });
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = originalHtml;
            }
        }
    };

    window.viewPatientDetail = async function(patientId) {
        // Redirect to showPatientDetail which has "Mulai Kunjungan" feature
        if (typeof window.showPatientDetail === 'function') {
            return window.showPatientDetail(patientId);
        }

        // Fallback to old implementation if showPatientDetail not available
        try {
            window.staffDebugLog('PatientDetail', 'Fallback detail loader called', {
                patientId,
                hasToken: Boolean(window.getAuthToken ? window.getAuthToken() : '')
            });

            const response = await fetch(`/api/admin/web-patients/${patientId}`, {
                headers: {
                    'Authorization': `Bearer ${(window.getAuthToken ? window.getAuthToken() : '')}`
                }
            });

            if (!response.ok) {
                console.error('Failed to load patient details, status:', response.status);
                throw new Error('Failed to load patient details');
            }

            const data = await response.json();
            window.staffDebugLog('PatientDetail', 'Fallback detail response received', {
                hasPatient: Boolean(data?.data?.patient),
                hasIntake: Boolean(data?.data?.intake)
            });
            const patient = data.data.patient;
            const intake = data.data.intake;

            // Create modal for patient details
            const modal = `
                <div class="modal fade" id="patientDetailModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-xl" role="document">
                        <div class="modal-content">
                            <div class="modal-header bg-info">
                                <h4 class="modal-title">
                                    <i class="fas fa-user-circle"></i> Detail Pasien
                                </h4>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <table class="table table-bordered">
                                            <tr>
                                                <th width="40%">ID Pasien</th>
                                                <td>${patient.id}</td>
                                            </tr>
                                            <tr>
                                                <th>Nama Lengkap</th>
                                                <td><strong>${patient.fullname}</strong></td>
                                            </tr>
                                            <tr>
                                                <th>Email</th>
                                                <td>${patient.email}</td>
                                            </tr>
                                            <tr>
                                                <th>Telepon</th>
                                                <td>${patient.phone || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Tanggal Lahir</th>
                                                <td>${patient.birth_date ? new Date(patient.birth_date).toLocaleDateString('id-ID', {year: 'numeric', month: 'long', day: 'numeric'}) : '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Usia</th>
                                                <td>${patient.age || '-'} tahun</td>
                                            </tr>
                                        </table>
                                    </div>
                                    <div class="col-md-6">
                                        <table class="table table-bordered">
                                            <tr>
                                                <th width="40%">Foto Profil</th>
                                                <td>
                                                    ${patient.photo_url ?
                                                        `<img src="${patient.photo_url}" alt="Photo" style="max-width: 100px; border-radius: 50%;">` :
                                                        '<span class="text-muted">Tidak ada foto</span>'}
                                                </td>
                                            </tr>
                                            <tr>
                                                <th>Google ID</th>
                                                <td>${patient.google_id || '<span class="text-muted">Email registration</span>'}</td>
                                            </tr>
                                            <tr>
                                                <th>Profil Lengkap</th>
                                                <td>${patient.profile_completed ?
                                                    '<span class="badge badge-success"><i class="fas fa-check"></i> Ya</span>' :
                                                    '<span class="badge badge-warning"><i class="fas fa-times"></i> Belum</span>'}</td>
                                            </tr>
                                            <tr>
                                                <th>Status</th>
                                                <td>${patient.status === 'active' ?
                                                    '<span class="badge badge-success">Aktif</span>' :
                                                    '<span class="badge badge-secondary">Nonaktif</span>'}</td>
                                            </tr>
                                            <tr>
                                                <th>Tgl Registrasi</th>
                                                <td>${new Date(patient.registration_date).toLocaleString('id-ID', {
                                                    year: 'numeric', month: 'long', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}</td>
                                            </tr>
                                            <tr>
                                                <th>Terakhir Update</th>
                                                <td>${patient.updated_at ? new Date(patient.updated_at).toLocaleString('id-ID', {
                                                    year: 'numeric', month: 'long', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                }) : '-'}</td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>

                                ${intake ? `
                                <hr>
                                <h5 class="mb-3">
                                    <i class="fas fa-file-medical"></i> Formulir Rekam Medis Awal
                                    <span class="badge badge-${intake.highRisk ? 'danger' : 'success'} ml-2">
                                        ${intake.highRisk ? 'High Risk' : 'Normal'}
                                    </span>
                                </h5>
                                <div class="row">
                                    <div class="col-md-6">
                                        <table class="table table-sm table-bordered">
                                            <tr>
                                                <th width="40%">Nama Lengkap</th>
                                                <td>${intake.payload.full_name || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Tanggal Lahir</th>
                                                <td>${intake.payload.dob ? new Date(intake.payload.dob).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Usia</th>
                                                <td>${intake.payload.age || '-'} tahun</td>
                                            </tr>
                                            <tr>
                                                <th>Telepon</th>
                                                <td>${intake.payload.phone || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>NIK</th>
                                                <td>${intake.payload.nik || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Alamat</th>
                                                <td>${intake.payload.address || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Status Pernikahan</th>
                                                <td>${intake.payload.marital_status || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Pekerjaan Suami</th>
                                                <td>${intake.payload.husband_job || '-'}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    <div class="col-md-6">
                                        <table class="table table-sm table-bordered">
                                            <tr>
                                                <th width="40%">Gravida</th>
                                                <td>${intake.payload.gravida || '0'}</td>
                                            </tr>
                                            <tr>
                                                <th>Para</th>
                                                <td>${intake.payload.para || '0'}</td>
                                            </tr>
                                            <tr>
                                                <th>Abortus</th>
                                                <td>${intake.payload.abortus || '0'}</td>
                                            </tr>
                                            <tr>
                                                <th>Anak Hidup</th>
                                                <td>${intake.payload.living_children || '0'}</td>
                                            </tr>
                                            <tr>
                                                <th>HPHT</th>
                                                <td>${intake.payload.lmp ? new Date(intake.payload.lmp).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>HPL</th>
                                                <td>${intake.payload.edd || '-'}</td>
                                            </tr>
                                            <tr>
                                                <th>Status</th>
                                                <td><span class="badge badge-${intake.status === 'verified' ? 'success' : 'warning'}">${intake.status}</span></td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>
                                ${intake.payload.medications && intake.payload.medications.length > 0 ? `
                                <div class="mt-2">
                                    <strong>Obat-obatan:</strong>
                                    <ul class="mb-0">
                                        ${intake.payload.medications.map(m => `<li>${m.name || m}</li>`).join('')}
                                    </ul>
                                </div>
                                ` : ''}
                                ${intake.payload.allergies ? `
                                <div class="mt-2">
                                    <strong>Alergi:</strong> ${intake.payload.allergies}
                                </div>
                                ` : ''}
                                <div class="mt-2 text-muted small">
                                    <i class="far fa-clock"></i> Diisi: ${new Date(intake.createdAt).toLocaleString('id-ID')}
                                    ${intake.updatedAt ? ` | Diperbarui: ${new Date(intake.updatedAt).toLocaleString('id-ID')}` : ''}
                                </div>
                                ` : '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Belum ada formulir rekam medis awal</div>'}
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Remove existing modal if any
            $('#patientDetailModal').remove();

            // Add and show modal
            $('body').append(modal);
            $('#patientDetailModal').modal('show');

            // Clean up modal after close
            $('#patientDetailModal').on('hidden.bs.modal', function () {
                $(this).remove();
            });

        } catch (error) {
            console.error('Error viewing patient detail:', error);
            console.error('Error stack:', error.stack);
            alert('Gagal memuat detail pasien: ' + error.message);
        }
    };

    /**
     * Show patient's medical records list in a modal
     * @param {string} patientId - Patient ID
     * @param {string} patientName - Patient name
     */
    window.showPatientMRList = async function(patientId, patientName) {
        try {
            // Show loading modal first
            const loadingModal = `
                <div class="modal fade" id="patientMRListModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-lg" role="document">
                        <div class="modal-content">
                            <div class="modal-header bg-primary">
                                <h5 class="modal-title text-white">
                                    <i class="fas fa-notes-medical mr-2"></i>
                                    Daftar Rekam Medis - ${patientName || patientId}
                                </h5>
                                <button type="button" class="close text-white" data-dismiss="modal">
                                    <span>&times;</span>
                                </button>
                            </div>
                            <div class="modal-body text-center py-5">
                                <i class="fas fa-spinner fa-spin fa-3x text-primary mb-3"></i>
                                <p>Memuat data rekam medis...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Remove existing modal if any
            $('#patientMRListModal').remove();
            $('body').append(loadingModal);
            $('#patientMRListModal').modal('show');

            // Fetch medical records for this patient
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch(`/api/sunday-clinic/patient-visits/${patientId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Gagal memuat data rekam medis');
            }

            const result = await response.json();
            const records = result.data || [];

            // Build records table
            let recordsHtml = '';
            const escapedPatientName = (patientName || '').replace(/'/g, "\\'");
            if (records.length === 0) {
                recordsHtml = `
                    <div class="text-center py-4">
                        <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                        <p class="text-muted mb-0">Belum ada rekam medis untuk pasien ini</p>
                    </div>
                `;
            } else {
                recordsHtml = `
                    <div class="table-responsive">
                        <table class="table table-bordered table-hover">
                            <thead class="thead-light">
                                <tr>
                                    <th>MR ID</th>
                                    <th>Tanggal Kunjungan</th>
                                    <th>Lokasi</th>
                                    <th>Kategori</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.map(record => {
                                    const visitDate = record.visit_date ? new Date(record.visit_date).toLocaleDateString('id-ID', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric'
                                    }) : '-';
                                    const category = record.mr_category || '-';
                                    const statusBadge = record.status === 'finalized'
                                        ? '<span class="badge badge-success">Selesai</span>'
                                        : record.status === 'in_progress'
                                        ? '<span class="badge badge-warning">Dalam Proses</span>'
                                        : '<span class="badge badge-secondary">Draft</span>';

                                    return `
                                        <tr>
                                            <td>
                                                <strong class="text-primary">${record.mr_id ? record.mr_id.toUpperCase() : '-'}</strong>
                                            </td>
                                            <td>${visitDate}</td>
                                            <td><small>${record.location_short || record.visit_location || '-'}</small></td>
                                            <td><small>${category}</small></td>
                                            <td>${statusBadge}</td>
                                            <td>
                                                                <a href="${window.buildSundayClinicAppUrl ? window.buildSundayClinicAppUrl(record.mr_id, 'identitas') : `/staff/public/index-adminlte.html?page=sunday-clinic&mr=${encodeURIComponent(record.mr_id)}&section=identitas`}"
                                                   class="btn btn-sm btn-info" title="Buka Rekam Medis">
                                                    <i class="fas fa-external-link-alt"></i>
                                                </a>
                                                <button class="btn btn-sm ${record.status === 'finalized' ? 'btn-outline-danger' : 'btn-danger'} ml-1"
                                                        onclick="deleteMedicalRecord('${record.mr_id}', ${record.status === 'finalized'})"
                                                        title="${record.status === 'finalized' ? 'Hapus (Finalized - konfirmasi ekstra)' : 'Hapus Rekam Medis'}">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            // Update modal body content only (don't replace entire modal to avoid Bootstrap state issues)
            const modalBodyContent = `
                <p class="text-muted mb-3">
                    <i class="fas fa-user mr-1"></i> ID Pasien: <strong>${patientId}</strong>
                    <span class="badge badge-info ml-2">${records.length} rekam medis</span>
                </p>
                ${recordsHtml}
            `;

            // Update only the modal body
            $('#patientMRListModal .modal-body').html(modalBodyContent);

            // Add footer if not exists
            if ($('#patientMRListModal .modal-footer').length === 0) {
                $('#patientMRListModal .modal-content').append(`
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                    </div>
                `);
            }

            // Clean up modal after close
            $('#patientMRListModal').on('hidden.bs.modal', function () {
                $(this).remove();
                $('.modal-backdrop').remove();
            });

        } catch (error) {
            console.error('Error loading patient MR list:', error);

            // Update modal with error
            $('#patientMRListModal .modal-body').html(`
                <div class="text-center py-4">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">${error.message || 'Gagal memuat data rekam medis'}</p>
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                </div>
            `);
        }
    };

    window.syncWebPatients = async function() {
        if (!confirm('Apakah Anda yakin ingin menyinkronkan semua pasien web yang sudah lengkap profil ke tabel Data Pasien?\n\nIni akan membuat ID pasien baru (P###) untuk setiap pasien web yang belum ada di Data Pasien.')) {
            return;
        }

        const syncBtn = document.getElementById('sync-web-patients-btn');
        const originalText = syncBtn.innerHTML;

        try {
            // Disable button and show loading
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyinkronkan...';

            const response = await fetch('/api/admin/sync-web-patients', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${(window.getAuthToken ? window.getAuthToken() : '')}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to sync patients');
            }

            const data = await response.json();
            const result = data.data;

            let message = `Sinkronisasi selesai!\n\n`;
            message += `OK Berhasil disinkronkan: ${result.syncedCount} pasien\n`;
            message += `- Dilewati (sudah ada): ${result.skippedCount} pasien\n`;
            if (result.errorsCount > 0) {
                message += `X Gagal: ${result.errorsCount} pasien\n\n`;
                if (result.errors && result.errors.length > 0) {
                    message += 'Error pertama:\n';
                    result.errors.slice(0, 3).forEach(err => {
                        message += `- ${err.email}: ${err.error}\n`;
                    });
                }
            }

            alert(message);

            // Reload the web patients list
            loadWebPatients();

        } catch (error) {
            console.error('Error syncing web patients:', error);
            alert('Gagal menyinkronkan pasien: ' + error.message);
        } finally {
            // Re-enable button
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
        }
    };

    // Kelola Obat Page Function
    window.showKelolaObatPage = async function() {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show kelola obat page
        document.getElementById('kelola-obat-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector('#management-nav-kelola-obat .nav-link').classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }

        // Always load the latest kelola-obat module with current asset version.
        try {
            const v = window.__assetVersion || Date.now().toString();
            const module = await import('./scripts/kelola-obat.js?v=' + encodeURIComponent(v));
            if (module?.initKelolaObat) {
                module.initKelolaObat();
            }
        } catch (error) {
            console.error('Failed to load kelola-obat.js:', error);
        }
    };

    // Kelola Supplier Page Function
    window.showKelolaSupplierPage = function() {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show kelola supplier page
        document.getElementById('kelola-supplier-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector('#management-nav-kelola-supplier .nav-link')?.classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }

        // Load suppliers
        loadSuppliers();
    };

    // Activity Log Page Function
    window.showActivityLogPage = async function() {
        await window.staffPageRegistry?.ensureLoaded('activity-log');
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show activity log page
        document.getElementById('activity-log-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector('#management-nav-activity-log .nav-link')?.classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }

        // Set default date range (last 7 days) - use local timezone
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Format as YYYY-MM-DD in local timezone (not UTC)
        const formatLocalDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        document.getElementById('activity-log-start-date').value = formatLocalDate(weekAgo);
        document.getElementById('activity-log-end-date').value = formatLocalDate(today);

        // Load activity log
        loadActivityLog();
    };

    // ============================================
    // Activity Log Functions
    // ============================================
    let activityLogPage = 0;
    const activityLogLimit = 50;

    window.loadActivityLog = async function(page = 0) {
        activityLogPage = page;
        const tbody = document.getElementById('activity-log-body');

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const startDate = document.getElementById('activity-log-start-date').value;
            const endDate = document.getElementById('activity-log-end-date').value;
            const movementType = document.getElementById('activity-log-type').value;
            const createdBy = document.getElementById('activity-log-user').value;
            const search = document.getElementById('activity-log-search').value;

            let url = `/api/inventory/activity-log?limit=${activityLogLimit}&offset=${page * activityLogLimit}`;
            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;
            if (movementType) url += `&movement_type=${movementType}`;
            if (createdBy) url += `&created_by=${encodeURIComponent(createdBy)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load activity log');

            const result = await response.json();
            const data = result.data || [];
            const pagination = result.pagination || {};
            const filters = result.filters || {};

            // Populate user filter dropdown
            const userSelect = document.getElementById('activity-log-user');
            const currentUser = userSelect.value;
            userSelect.innerHTML = '<option value="">Semua User</option>';
            (filters.users || []).forEach(u => {
                userSelect.innerHTML += `<option value="${u}" ${u === currentUser ? 'selected' : ''}>${u}</option>`;
            });

            // Filter by search if provided
            let filteredData = data;
            if (search) {
                const searchLower = search.toLowerCase();
                filteredData = data.filter(d => d.obat_name?.toLowerCase().includes(searchLower));
            }

            // Calculate summaries
            let totalIn = 0, totalOut = 0, totalAdjust = 0, totalValue = 0;
            filteredData.forEach(d => {
                const qty = Math.abs(d.quantity);
                const unitPrice = parseFloat(d.display_price ?? d.cost_price ?? 0);
                const value = qty * unitPrice;
                if (d.movement_type === 'purchase') {
                    totalIn += qty;
                    totalValue += value;
                } else if (d.movement_type === 'sale') {
                    totalOut += qty;
                    totalValue += value;
                } else if (d.movement_type === 'adjustment') {
                    totalAdjust += Math.abs(d.quantity);
                    totalValue += value;
                }
            });

            document.getElementById('activity-total-in').textContent = totalIn.toLocaleString('id-ID');
            document.getElementById('activity-total-out').textContent = totalOut.toLocaleString('id-ID');
            document.getElementById('activity-total-adjust').textContent = totalAdjust.toLocaleString('id-ID');
            document.getElementById('activity-total-value').textContent = 'Rp ' + totalValue.toLocaleString('id-ID');
            document.getElementById('activity-log-count').textContent = pagination.total + ' records';

            if (filteredData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Tidak ada data aktivitas</p></td></tr>';
                document.getElementById('activity-log-pagination-info').textContent = 'No data';
                document.getElementById('activity-log-pagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = filteredData.map(d => {
                const date = new Date(d.created_at);
                const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                let typeBadge = '';
                let qtyClass = '';
                if (d.movement_type === 'purchase') {
                    typeBadge = '<span class="badge badge-success">MASUK</span>';
                    qtyClass = 'text-success';
                } else if (d.movement_type === 'sale') {
                    typeBadge = '<span class="badge badge-danger">KELUAR</span>';
                    qtyClass = 'text-danger';
                } else if (d.movement_type === 'adjustment') {
                    typeBadge = '<span class="badge badge-warning">ADJUST</span>';
                    qtyClass = d.quantity > 0 ? 'text-success' : 'text-danger';
                }

                const qty = d.quantity > 0 ? '+' + d.quantity : d.quantity;
                const price = parseFloat(d.display_price ?? d.cost_price ?? 0);
                const total = Math.abs(d.quantity) * price;

                return `<tr>
                    <td><small>${dateStr}<br><span class="text-muted">${timeStr}</span></small></td>
                    <td><strong>${d.obat_name}</strong><br><small class="text-muted">${d.obat_code}</small></td>
                    <td class="text-center">${typeBadge}</td>
                    <td class="text-center ${qtyClass}"><strong>${qty}</strong></td>
                    <td class="text-right">Rp ${price.toLocaleString('id-ID')}</td>
                    <td class="text-right">Rp ${total.toLocaleString('id-ID')}</td>
                    <td><code>${d.batch_number || '-'}</code></td>
                    <td><small>${d.supplier_name || '-'}</small></td>
                    <td>${d.created_by || '-'}</td>
                    <td><small>${d.notes || '-'}</small></td>
                </tr>`;
            }).join('');

            // Pagination info
            const start = page * activityLogLimit + 1;
            const end = Math.min((page + 1) * activityLogLimit, pagination.total);
            document.getElementById('activity-log-pagination-info').textContent = `Showing ${start}-${end} of ${pagination.total}`;

            // Pagination buttons
            const paginationEl = document.getElementById('activity-log-pagination');
            let paginationHtml = '';
            if (page > 0) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadActivityLog(${page - 1}); return false;">Prev</a></li>`;
            }
            for (let i = 0; i < pagination.pages && i < 5; i++) {
                const startPage = Math.max(0, page - 2);
                const pageNum = startPage + i;
                if (pageNum >= pagination.pages) break;
                paginationHtml += `<li class="page-item ${pageNum === page ? 'active' : ''}"><a class="page-link" href="#" onclick="loadActivityLog(${pageNum}); return false;">${pageNum + 1}</a></li>`;
            }
            if (page < pagination.pages - 1) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadActivityLog(${page + 1}); return false;">Next</a></li>`;
            }
            paginationEl.innerHTML = paginationHtml;

        } catch (error) {
            console.error('Load activity log error:', error);
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p class="mb-0">Gagal memuat data</p></td></tr>';
        }
    };

    // ============================================
    // Staff Activity Log Functions (Login/Logout Audit)
    // ============================================
    let staffActivityPage = 0;
    const staffActivityLimit = 50;

    window.showStaffActivityPage = function() {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show staff activity page
        document.getElementById('staff-activity-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector('#nav-staff-activity .nav-link')?.classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }

        // Load data
        loadStaffActivityLogs();
    };

    window.loadStaffActivityLogs = async function(page = 0) {
        staffActivityPage = page;
        const tbody = document.getElementById('staff-activity-body');

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const userFilter = document.getElementById('staff-activity-user-filter')?.value || '';
            const actionFilter = document.getElementById('staff-activity-action-filter')?.value || '';
            const startDate = document.getElementById('staff-activity-start-date')?.value || '';
            const endDate = document.getElementById('staff-activity-end-date')?.value || '';

            let url = `/api/logs?limit=${staffActivityLimit}&offset=${page * staffActivityLimit}`;
            if (userFilter) url += `&user_id=${encodeURIComponent(userFilter)}`;
            if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`;
            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load staff activity logs');

            const result = await response.json();
            const data = result.data || [];

            // Load summary
            loadStaffActivitySummary();

            // Load filter options
            loadStaffActivityFilters();

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Tidak ada log aktivitas</p></td></tr>';
                document.getElementById('staff-activity-pagination-info').textContent = 'No data';
                document.getElementById('staff-activity-pagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = data.map(d => {
                const date = new Date(d.timestamp);
                const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                let actionBadge = '<span class="badge badge-secondary">' + d.action + '</span>';
                if (d.action === 'Login') {
                    actionBadge = '<span class="badge badge-success"><i class="fas fa-sign-in-alt mr-1"></i>Login</span>';
                } else if (d.action === 'Logout') {
                    actionBadge = '<span class="badge badge-warning"><i class="fas fa-sign-out-alt mr-1"></i>Logout</span>';
                } else if (d.action.includes('Create') || d.action.includes('Add')) {
                    actionBadge = '<span class="badge badge-primary"><i class="fas fa-plus mr-1"></i>' + d.action + '</span>';
                } else if (d.action.includes('Update') || d.action.includes('Edit')) {
                    actionBadge = '<span class="badge badge-info"><i class="fas fa-edit mr-1"></i>' + d.action + '</span>';
                } else if (d.action.includes('Delete')) {
                    actionBadge = '<span class="badge badge-danger"><i class="fas fa-trash mr-1"></i>' + d.action + '</span>';
                }

                return `<tr>
                    <td><small>${dateStr}<br><span class="text-muted">${timeStr}</span></small></td>
                    <td><strong>${d.user_name}</strong><br><small class="text-muted">${d.user_id}</small></td>
                    <td>${actionBadge}</td>
                    <td><small>${d.details || '-'}</small></td>
                </tr>`;
            }).join('');

            // Pagination info
            const total = result.count || data.length;
            const start = page * staffActivityLimit + 1;
            const end = Math.min((page + 1) * staffActivityLimit, total);
            document.getElementById('staff-activity-pagination-info').textContent = `Showing ${start}-${end} of ${total}`;

            // Pagination buttons
            const totalPages = Math.ceil(total / staffActivityLimit);
            const paginationEl = document.getElementById('staff-activity-pagination');
            let paginationHtml = '';
            if (page > 0) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadStaffActivityLogs(${page - 1}); return false;">Prev</a></li>`;
            }
            for (let i = 0; i < totalPages && i < 5; i++) {
                const startPage = Math.max(0, page - 2);
                const pageNum = startPage + i;
                if (pageNum >= totalPages) break;
                paginationHtml += `<li class="page-item ${pageNum === page ? 'active' : ''}"><a class="page-link" href="#" onclick="loadStaffActivityLogs(${pageNum}); return false;">${pageNum + 1}</a></li>`;
            }
            if (page < totalPages - 1) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadStaffActivityLogs(${page + 1}); return false;">Next</a></li>`;
            }
            paginationEl.innerHTML = paginationHtml;

        } catch (error) {
            console.error('Load staff activity log error:', error);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p class="mb-0">Gagal memuat data</p></td></tr>';
        }
    };

    async function loadStaffActivitySummary() {
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/logs/summary?days=7', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) return;

            const result = await response.json();
            const data = result.data || {};

            document.getElementById('staff-activity-total').textContent = data.total_activities || 0;
            document.getElementById('staff-activity-users').textContent = data.unique_users || 0;

            // Top users
            const topUsersEl = document.getElementById('staff-activity-top-users');
            if (data.most_active_users && data.most_active_users.length > 0) {
                topUsersEl.innerHTML = data.most_active_users.slice(0, 5).map(u => `
                    <div class="d-flex justify-content-between small mb-1">
                        <span>${u.user_name}</span>
                        <span class="badge badge-primary">${u.action_count}</span>
                    </div>
                `).join('');
            } else {
                topUsersEl.innerHTML = '<p class="text-muted small mb-0">No data</p>';
            }
        } catch (error) {
            console.error('Load staff activity summary error:', error);
        }
    }

    async function loadStaffActivityFilters() {
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');

            // Load unique actions
            const actionsResponse = await fetch('/api/logs/actions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (actionsResponse.ok) {
                const actionsData = await actionsResponse.json();
                const actionSelect = document.getElementById('staff-activity-action-filter');
                const currentAction = actionSelect.value;
                actionSelect.innerHTML = '<option value="">Semua Aksi</option>';
                (actionsData.data || []).forEach(a => {
                    actionSelect.innerHTML += `<option value="${a}" ${a === currentAction ? 'selected' : ''}>${a}</option>`;
                });
            }

            // Load unique users from logs
            const logsResponse = await fetch('/api/logs?limit=1000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (logsResponse.ok) {
                const logsData = await logsResponse.json();
                const users = [...new Set((logsData.data || []).map(l => l.user_id))];
                const userNames = {};
                (logsData.data || []).forEach(l => { userNames[l.user_id] = l.user_name; });

                const userSelect = document.getElementById('staff-activity-user-filter');
                const currentUser = userSelect.value;
                userSelect.innerHTML = '<option value="">Semua Staff</option>';
                users.forEach(uid => {
                    userSelect.innerHTML += `<option value="${uid}" ${uid === currentUser ? 'selected' : ''}>${userNames[uid] || uid}</option>`;
                });
            }
        } catch (error) {
            console.error('Load staff activity filters error:', error);
        }
    }

    // ============================================
    // Patient Activity Functions
    // ============================================
    let patientActivityPage = 0;
    const patientActivityLimit = 50;
    let patientActivitySearchTimeout = null;

    function escapePatientActivityHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    window.showPatientActivityPage = async function() {
        await window.staffPageRegistry?.ensureLoaded('patient-activity');
        if (typeof window.updateStaffPageRoute === 'function') {
            window.updateStaffPageRoute('patient-activity', 'nav-patient-activity');
        }
        document.documentElement.classList.remove('kantor-saya-active');
        document.body.classList.remove('kantor-saya-active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';

        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show patient activity page
        document.getElementById('patient-activity-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const patientActivityNav = document.getElementById('nav-patient-activity');
        if (patientActivityNav && !patientActivityNav.classList.contains('sidebar-widgetized')) {
            patientActivityNav.removeAttribute('hidden');
            patientActivityNav.classList.remove('d-none');
        }
        patientActivityNav?.querySelector('.nav-link')?.classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }

        // Set default date range (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        document.getElementById('pa-filter-from').value = formatDateLocal(thirtyDaysAgo);
        document.getElementById('pa-filter-to').value = formatDateLocal(today);

        // Load data
        loadPatientActivity();
    };

    window.debouncePatientActivitySearch = function() {
        clearTimeout(patientActivitySearchTimeout);
        patientActivitySearchTimeout = setTimeout(() => loadPatientActivity(), 500);
    };

    window.loadPatientActivity = async function(page = 0) {
        patientActivityPage = page;
        const tbody = document.getElementById('patient-activity-body');

        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x mb-2"></i><p class="mb-0">Memuat data...</p></td></tr>';

        try {
            const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            const typeFilter = document.getElementById('pa-filter-type')?.value || '';
            const fromDate = document.getElementById('pa-filter-from')?.value || '';
            const toDate = document.getElementById('pa-filter-to')?.value || '';
            const search = document.getElementById('pa-filter-search')?.value || '';

            let url = `/api/patient-activity?limit=${patientActivityLimit}&offset=${page * patientActivityLimit}`;
            if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
            if (fromDate) url += `&from=${fromDate}`;
            if (toDate) url += `&to=${toDate}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load patient activity');

            const result = await response.json();
            const data = result.data || [];
            const stats = result.stats || {};

            // Update stats
            document.getElementById('pa-stat-appointments').textContent = stats.appointments || 0;
            document.getElementById('pa-stat-intakes').textContent = stats.intakes || 0;
            document.getElementById('pa-stat-registrations').textContent = stats.registrations || 0;
            document.getElementById('pa-stat-total-patients').textContent = stats.totalPatients || 0;
            document.getElementById('pa-stat-logins').textContent = stats.logins || 0;
            document.getElementById('pa-stat-page-views').textContent = stats.pageViews || 0;
            document.getElementById('pa-stat-payments').textContent = stats.payments || 0;
            document.getElementById('pa-stat-community-chats').textContent = stats.communityChats || 0;
            document.getElementById('pa-stat-bug-reports').textContent = stats.bugReports || 0;
            document.getElementById('pa-stat-support-chats').textContent = stats.supportChats || 0;
            document.getElementById('pa-stat-doctor-questions').textContent = stats.doctorQuestions || 0;
            document.getElementById('pa-stat-tool-usage').textContent = stats.toolUsage || 0;
            document.getElementById('pa-stat-my-corner').textContent = stats.myCorner || 0;

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Tidak ada aktivitas pasien</p></td></tr>';
                document.getElementById('patient-activity-pagination-info').textContent = 'No data';
                document.getElementById('patient-activity-pagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = data.map(d => {
                const date = new Date(d.timestamp);
                const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                let typeBadge = '<span class="badge badge-secondary">' + escapePatientActivityHtml(d.type || '-') + '</span>';
                if (d.type === 'booking') {
                    typeBadge = '<span class="badge badge-info"><i class="fas fa-calendar-check mr-1"></i>Booking</span>';
                } else if (d.type === 'intake') {
                    typeBadge = '<span class="badge badge-success"><i class="fas fa-file-medical mr-1"></i>Intake</span>';
                } else if (d.type === 'registration') {
                    typeBadge = '<span class="badge badge-warning"><i class="fas fa-user-plus mr-1"></i>Registrasi</span>';
                } else if (d.type === 'login') {
                    typeBadge = '<span class="badge badge-secondary"><i class="fas fa-sign-in-alt mr-1"></i>Login</span>';
                } else if (d.type === 'view_halaman') {
                    typeBadge = '<span class="badge badge-dark"><i class="fas fa-eye mr-1"></i>Page View</span>';
                } else if (d.type === 'tool_pasien') {
                    typeBadge = '<span class="badge badge-secondary"><i class="fas fa-tools mr-1"></i>Tool Pasien</span>';
                } else if (d.type === 'ruang_saya') {
                    typeBadge = '<span class="badge badge-info"><i class="fas fa-door-open mr-1"></i>Ruang Saya</span>';
                } else if (d.type === 'pembayaran') {
                    typeBadge = '<span class="badge badge-danger"><i class="fas fa-credit-card mr-1"></i>Pembayaran</span>';
                } else if (d.type === 'community_chat') {
                    typeBadge = '<span class="badge badge-info"><i class="fas fa-comments mr-1"></i>Chat Komunitas</span>';
                } else if (d.type === 'bug_report') {
                    typeBadge = '<span class="badge badge-danger"><i class="fas fa-bug mr-1"></i>Bug/Error</span>';
                } else if (d.type === 'support_chat') {
                    typeBadge = '<span class="badge badge-success"><i class="fas fa-headset mr-1"></i>Support Chat</span>';
                } else if (d.type === 'tanya_dokter') {
                    typeBadge = '<span class="badge badge-primary"><i class="fas fa-user-md mr-1"></i>Tanya Dokter</span>';
                }

                const patientName = escapePatientActivityHtml(d.patient_name || '-');
                const patientMeta = escapePatientActivityHtml(d.patient_email || d.patient_phone || '-');
                const details = escapePatientActivityHtml(d.details || '-');

                return `<tr>
                    <td><small>${dateStr}<br><span class="text-muted">${timeStr}</span></small></td>
                    <td><strong>${patientName}</strong><br><small class="text-muted">${patientMeta}</small></td>
                    <td>${typeBadge}</td>
                    <td><small>${details}</small></td>
                </tr>`;
            }).join('');

            // Pagination info
            const total = result.count || data.length;
            const start = page * patientActivityLimit + 1;
            const end = Math.min((page + 1) * patientActivityLimit, total);
            document.getElementById('patient-activity-pagination-info').textContent = `Showing ${start}-${end} of ${total}`;

            // Pagination buttons
            const totalPages = Math.ceil(total / patientActivityLimit);
            const paginationEl = document.getElementById('patient-activity-pagination');
            let paginationHtml = '';
            if (page > 0) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadPatientActivity(${page - 1}); return false;">Prev</a></li>`;
            }
            for (let i = 0; i < totalPages && i < 5; i++) {
                const startPage = Math.max(0, page - 2);
                const pageNum = startPage + i;
                if (pageNum >= totalPages) break;
                paginationHtml += `<li class="page-item ${pageNum === page ? 'active' : ''}"><a class="page-link" href="#" onclick="loadPatientActivity(${pageNum}); return false;">${pageNum + 1}</a></li>`;
            }
            if (page < totalPages - 1) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadPatientActivity(${page + 1}); return false;">Next</a></li>`;
            }
            paginationEl.innerHTML = paginationHtml;

        } catch (error) {
            console.error('Load patient activity error:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p class="mb-0">Gagal memuat data</p></td></tr>';
        }
    };

    // ============================================
    // Guest / Demo Activity Functions
    // ============================================
    let guestActivityPage = 0;
    const guestActivityLimit = 50;
    let guestActivitySearchTimeout = null;

    function escapeGuestActivityHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function formatGuestActivityType(type) {
        const badges = {
            guest_start: '<span class="badge badge-info"><i class="fas fa-play mr-1"></i>Mulai Demo</span>',
            page_view: '<span class="badge badge-dark"><i class="fas fa-eye mr-1"></i>Page View</span>',
            demo_navigation: '<span class="badge badge-success"><i class="fas fa-compass mr-1"></i>Navigasi</span>',
            upgrade_prompt: '<span class="badge badge-warning"><i class="fas fa-lock mr-1"></i>Prompt Login</span>',
            login_redirect: '<span class="badge badge-primary"><i class="fas fa-right-to-bracket mr-1"></i>Masuk / Daftar</span>'
        };
        return badges[type] || '<span class="badge badge-secondary">' + escapeGuestActivityHtml(type || '-') + '</span>';
    }

    window.showGuestActivityPage = function() {
        if (typeof window.updateStaffPageRoute === 'function') {
            window.updateStaffPageRoute('guest-activity', 'nav-guest-activity');
        }
        document.documentElement.classList.remove('kantor-saya-active');
        document.body.classList.remove('kantor-saya-active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';

        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));
        document.getElementById('guest-activity-page')?.classList.remove('d-none');

        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const guestActivityNav = document.getElementById('nav-guest-activity');
        if (guestActivityNav && !guestActivityNav.classList.contains('sidebar-widgetized')) {
            guestActivityNav.removeAttribute('hidden');
            guestActivityNav.classList.remove('d-none');
        }
        guestActivityNav?.querySelector('.nav-link')?.classList.add('active');

        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) floatingPanel.classList.add('d-none');

        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const fromEl = document.getElementById('ga-filter-from');
        const toEl = document.getElementById('ga-filter-to');
        if (fromEl && !fromEl.value) fromEl.value = formatDateLocal(thirtyDaysAgo);
        if (toEl && !toEl.value) toEl.value = formatDateLocal(today);

        loadGuestActivity();
    };

    window.debounceGuestActivitySearch = function() {
        clearTimeout(guestActivitySearchTimeout);
        guestActivitySearchTimeout = setTimeout(() => loadGuestActivity(), 500);
    };

    window.loadGuestActivity = async function(page = 0) {
        guestActivityPage = page;
        const tbody = document.getElementById('guest-activity-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x mb-2"></i><p class="mb-0">Memuat data...</p></td></tr>';

        try {
            const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            const typeFilter = document.getElementById('ga-filter-type')?.value || '';
            const fromDate = document.getElementById('ga-filter-from')?.value || '';
            const toDate = document.getElementById('ga-filter-to')?.value || '';
            const search = document.getElementById('ga-filter-search')?.value || '';

            let url = `/api/guest-activity?limit=${guestActivityLimit}&offset=${page * guestActivityLimit}`;
            if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
            if (fromDate) url += `&from=${fromDate}`;
            if (toDate) url += `&to=${toDate}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to load guest activity');

            const result = await response.json();
            const data = result.data || [];
            const stats = result.stats || {};

            document.getElementById('ga-stat-sessions-today').textContent = stats.sessionsToday || 0;
            document.getElementById('ga-stat-sessions').textContent = stats.sessions || 0;
            document.getElementById('ga-stat-page-views').textContent = stats.pageViews || 0;
            document.getElementById('ga-stat-upgrade-prompts').textContent = stats.upgradePrompts || 0;

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Belum ada aktivitas guest/demo</p></td></tr>';
                document.getElementById('guest-activity-pagination-info').textContent = 'No data';
                document.getElementById('guest-activity-pagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = data.map(d => {
                const date = new Date(d.timestamp);
                const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                const session = escapeGuestActivityHtml(d.session_id || '-');
                const shortSession = session.length > 18 ? session.slice(0, 18) + '...' : session;
                const path = escapeGuestActivityHtml(d.page_path || '-');
                const title = escapeGuestActivityHtml(d.page_title || 'Demo portal');
                const details = escapeGuestActivityHtml(d.details || '-');
                const userAgent = escapeGuestActivityHtml(d.user_agent || '-');
                return `<tr>
                    <td><small>${dateStr}<br><span class="text-muted">${timeStr}</span></small></td>
                    <td><strong title="${session}">${shortSession}</strong><br><small class="text-muted">${escapeGuestActivityHtml(d.ip_address || '-')}</small></td>
                    <td>${formatGuestActivityType(d.type)}</td>
                    <td><small><strong>${title}</strong><br><span class="text-muted">${path}</span><br>${details}<br><span class="text-muted" title="${userAgent}">${userAgent}</span></small></td>
                </tr>`;
            }).join('');

            const total = result.count || data.length;
            const start = page * guestActivityLimit + 1;
            const end = Math.min((page + 1) * guestActivityLimit, total);
            document.getElementById('guest-activity-pagination-info').textContent = `Showing ${start}-${end} of ${total}`;

            const totalPages = Math.ceil(total / guestActivityLimit);
            const paginationEl = document.getElementById('guest-activity-pagination');
            let paginationHtml = '';
            if (page > 0) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadGuestActivity(${page - 1}); return false;">Prev</a></li>`;
            }
            for (let i = 0; i < totalPages && i < 5; i++) {
                const startPage = Math.max(0, page - 2);
                const pageNum = startPage + i;
                if (pageNum >= totalPages) break;
                paginationHtml += `<li class="page-item ${pageNum === page ? 'active' : ''}"><a class="page-link" href="#" onclick="loadGuestActivity(${pageNum}); return false;">${pageNum + 1}</a></li>`;
            }
            if (page < totalPages - 1) {
                paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="loadGuestActivity(${page + 1}); return false;">Next</a></li>`;
            }
            paginationEl.innerHTML = paginationHtml;
        } catch (error) {
            console.error('Load guest activity error:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p class="mb-0">Gagal memuat data</p></td></tr>';
        }
    };

    // ============================================
    // Patient Activity Statistics
    // ============================================
    let paStatsLoaded = false;

    window.togglePatientStats = function() {
        const body = document.getElementById('pa-stats-body');
        const icon = document.getElementById('pa-stats-toggle-icon');
        if (body.style.display === 'none') {
            body.style.display = '';
            icon.className = 'fas fa-chevron-up';
            if (!paStatsLoaded) loadPatientStats();
        } else {
            body.style.display = 'none';
            icon.className = 'fas fa-chevron-down';
        }
    };

    window.loadPatientStats = async function() {
        const content = document.getElementById('pa-stats-content');
        content.innerHTML = '<div class="text-center py-4 w-100 text-muted"><i class="fas fa-spinner fa-spin fa-lg"></i><p class="mb-0 mt-2">Memuat statistik...</p></div>';

        try {
            const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            const response = await fetch('/api/patient-activity/stats?days=30', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) throw new Error('Failed to load stats');
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Error');

            paStatsLoaded = true;
            document.getElementById('pa-stats-period').textContent = result.days + ' hari terakhir';

            // Event type labels
            const eventLabels = {
                login: 'Login',
                view_halaman: 'Page View',
                tool_pasien: 'Tool Pasien',
                ruang_saya: 'Ruang Saya',
                booking: 'Booking',
                pembayaran: 'Pembayaran',
                community_chat: 'Chat Komunitas',
                bug_report: 'Bug/Error',
                support_chat: 'Support Chat',
                tanya_dokter: 'Tanya Dokter'
            };

            const eventIcons = {
                login: 'fas fa-sign-in-alt text-secondary',
                view_halaman: 'fas fa-eye text-dark',
                tool_pasien: 'fas fa-tools text-secondary',
                ruang_saya: 'fas fa-door-open text-info',
                booking: 'fas fa-calendar-check text-info',
                pembayaran: 'fas fa-credit-card text-danger',
                community_chat: 'fas fa-comments text-info',
                bug_report: 'fas fa-bug text-danger',
                support_chat: 'fas fa-headset text-success',
                tanya_dokter: 'fas fa-user-md text-primary'
            };

            // Build HTML for all stats panels
            let html = '';

            // --- Column 1: Top Pages + Event Breakdown ---
            html += '<div class="col-lg-4 col-12 mb-3">';

            // Top Pages
            html += '<h6 class="font-weight-bold"><i class="fas fa-file-alt mr-1 text-primary"></i> Halaman Terpopuler</h6>';
            if (result.topPages && result.topPages.length > 0) {
                html += '<table class="table table-sm table-borderless mb-3"><tbody>';
                const maxViews = result.topPages[0].views;
                result.topPages.forEach(function(p, i) {
                    const pct = Math.round((p.views / maxViews) * 100);
                    html += '<tr>' +
                        '<td class="py-1" style="width:20px;"><small class="text-muted">' + (i + 1) + '.</small></td>' +
                        '<td class="py-1"><small>' + escapePatientActivityHtml(p.page_name || '-') + '</small>' +
                        '<div class="progress" style="height:4px;"><div class="progress-bar bg-primary" style="width:' + pct + '%"></div></div></td>' +
                        '<td class="py-1 text-right" style="width:40px;"><strong>' + p.views + '</strong></td>' +
                        '</tr>';
                });
                html += '</tbody></table>';
            } else {
                html += '<p class="text-muted small">Belum ada data page view</p>';
            }

            // Event Breakdown
            html += '<h6 class="font-weight-bold mt-3"><i class="fas fa-chart-pie mr-1 text-success"></i> Breakdown Event</h6>';
            if (result.eventBreakdown && result.eventBreakdown.length > 0) {
                var totalEvents = result.eventBreakdown.reduce(function(s, e) { return s + e.count; }, 0);
                html += '<table class="table table-sm table-borderless mb-0"><tbody>';
                result.eventBreakdown.forEach(function(e) {
                    var pct = totalEvents > 0 ? Math.round((e.count / totalEvents) * 100) : 0;
                    var icon = eventIcons[e.event_type] || 'fas fa-circle text-muted';
                    var label = eventLabels[e.event_type] || e.event_type;
                    html += '<tr>' +
                        '<td class="py-1"><i class="' + icon + ' mr-1"></i><small>' + escapePatientActivityHtml(label) + '</small></td>' +
                        '<td class="py-1 text-right"><strong>' + e.count + '</strong> <small class="text-muted">(' + pct + '%)</small></td>' +
                        '</tr>';
                });
                html += '<tr class="border-top"><td class="py-1"><small class="font-weight-bold">Total</small></td><td class="py-1 text-right"><strong>' + totalEvents + '</strong></td></tr>';
                html += '</tbody></table>';
            } else {
                html += '<p class="text-muted small">Belum ada data</p>';
            }

            html += '<h6 class="font-weight-bold mt-3"><i class="fas fa-layer-group mr-1 text-primary"></i> Interaksi Fitur</h6>';
            if (result.featureBreakdown && result.featureBreakdown.length > 0) {
                var totalFeatures = result.featureBreakdown.reduce(function(s, e) { return s + e.count; }, 0);
                html += '<table class="table table-sm table-borderless mb-0"><tbody>';
                result.featureBreakdown.forEach(function(e) {
                    var pct = totalFeatures > 0 ? Math.round((e.count / totalFeatures) * 100) : 0;
                    var icon = eventIcons[e.feature_type] || 'fas fa-circle text-muted';
                    var label = eventLabels[e.feature_type] || e.feature_type;
                    html += '<tr>' +
                        '<td class="py-1"><i class="' + icon + ' mr-1"></i><small>' + escapePatientActivityHtml(label) + '</small></td>' +
                        '<td class="py-1 text-right"><strong>' + e.count + '</strong> <small class="text-muted">(' + pct + '%)</small></td>' +
                        '</tr>';
                });
                html += '</tbody></table>';
            } else {
                html += '<p class="text-muted small">Belum ada interaksi fitur tambahan</p>';
            }

            html += '</div>';

            // --- Column 2: Login Trend ---
            html += '<div class="col-lg-4 col-12 mb-3">';
            html += '<h6 class="font-weight-bold"><i class="fas fa-chart-line mr-1 text-info"></i> Tren Login Harian</h6>';
            if (result.loginTrend && result.loginTrend.length > 0) {
                var maxLogin = Math.max.apply(null, result.loginTrend.map(function(d) { return d.count; }));
                html += '<div style="max-height:280px; overflow-y:auto;">';
                html += '<table class="table table-sm table-borderless mb-0"><tbody>';
                result.loginTrend.forEach(function(d) {
                    var dt = new Date(d.date);
                    var dayStr = dt.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
                    var pct = maxLogin > 0 ? Math.round((d.count / maxLogin) * 100) : 0;
                    html += '<tr>' +
                        '<td class="py-1" style="width:100px;"><small>' + dayStr + '</small></td>' +
                        '<td class="py-1"><div class="progress" style="height:14px;"><div class="progress-bar bg-info" style="width:' + pct + '%; font-size:10px; line-height:14px;">' + (pct > 20 ? d.count : '') + '</div></div></td>' +
                        '<td class="py-1 text-right" style="width:30px;"><strong>' + d.count + '</strong></td>' +
                        '</tr>';
                });
                html += '</tbody></table></div>';
            } else {
                html += '<p class="text-muted small">Belum ada data login</p>';
            }

            // Hourly Pattern
            html += '<h6 class="font-weight-bold mt-3"><i class="fas fa-clock mr-1 text-warning"></i> Jam Aktif</h6>';
            if (result.hourlyPattern && result.hourlyPattern.length > 0) {
                var maxHour = Math.max.apply(null, result.hourlyPattern.map(function(h) { return h.count; }));
                html += '<div style="display:flex; align-items:flex-end; gap:2px; height:60px; margin-bottom:4px;">';
                for (var h = 0; h < 24; h++) {
                    var found = result.hourlyPattern.find(function(x) { return x.hour === h; });
                    var cnt = found ? found.count : 0;
                    var barH = maxHour > 0 ? Math.max(2, Math.round((cnt / maxHour) * 55)) : 2;
                    var color = cnt === maxHour && cnt > 0 ? '#28a745' : (cnt > 0 ? '#17a2b8' : '#e9ecef');
                    html += '<div title="' + String(h).padStart(2, '0') + ':00 - ' + cnt + ' event" style="flex:1; height:' + barH + 'px; background:' + color + '; border-radius:2px 2px 0 0;"></div>';
                }
                html += '</div>';
                html += '<div style="display:flex; justify-content:space-between;"><small class="text-muted">00</small><small class="text-muted">06</small><small class="text-muted">12</small><small class="text-muted">18</small><small class="text-muted">23</small></div>';
            } else {
                html += '<p class="text-muted small">Belum ada data</p>';
            }

            html += '</div>';

            // --- Column 3: Top Active Patients ---
            html += '<div class="col-lg-4 col-12 mb-3">';
            html += '<h6 class="font-weight-bold"><i class="fas fa-users mr-1 text-purple"></i> Pasien Paling Aktif</h6>';
            if (result.topPatients && result.topPatients.length > 0) {
                html += '<table class="table table-sm table-hover mb-0"><thead><tr>' +
                    '<th class="py-1"><small>Pasien</small></th>' +
                    '<th class="py-1 text-center" title="Login"><small><i class="fas fa-sign-in-alt"></i></small></th>' +
                    '<th class="py-1 text-center" title="Page View"><small><i class="fas fa-eye"></i></small></th>' +
                    '<th class="py-1 text-center" title="Booking"><small><i class="fas fa-calendar-check"></i></small></th>' +
                    '<th class="py-1 text-center" title="Bayar"><small><i class="fas fa-credit-card"></i></small></th>' +
                    '<th class="py-1 text-right"><small>Total</small></th>' +
                    '</tr></thead><tbody>';
                result.topPatients.forEach(function(pt) {
                    var name = pt.full_name || pt.patient_id;
                    html += '<tr>' +
                        '<td class="py-1"><small>' + name + '</small></td>' +
                        '<td class="py-1 text-center"><small>' + (pt.logins || 0) + '</small></td>' +
                        '<td class="py-1 text-center"><small>' + (pt.page_views || 0) + '</small></td>' +
                        '<td class="py-1 text-center"><small>' + (pt.bookings || 0) + '</small></td>' +
                        '<td class="py-1 text-center"><small>' + (pt.payments || 0) + '</small></td>' +
                        '<td class="py-1 text-right"><strong>' + pt.total_events + '</strong></td>' +
                        '</tr>';
                });
                html += '</tbody></table>';
            } else {
                html += '<p class="text-muted small">Belum ada data</p>';
            }
            html += '</div>';

            content.innerHTML = html;

        } catch (error) {
            console.error('Load patient stats error:', error);
            content.innerHTML = '<div class="text-center py-4 w-100 text-danger"><i class="fas fa-exclamation-triangle fa-lg"></i><p class="mb-0 mt-2">Gagal memuat statistik</p></div>';
        }
    };

    // ============================================
    // Supplier Management Functions
    // ============================================
    let suppliersCache = [];

    async function loadSuppliers() {
        const tbody = document.getElementById('kelola-supplier-list-body');
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/suppliers?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load suppliers');

            const data = await response.json();
            suppliersCache = data.data || [];

            if (suppliersCache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada supplier</td></tr>';
                return;
            }

            tbody.innerHTML = suppliersCache.map((s, i) => `
                <tr>
                    <td><code>${s.code}</code></td>
                    <td>${s.name}</td>
                    <td>${s.phone || '-'}</td>
                    <td>${s.address || '-'}</td>
                    <td class="text-center">
                        <button class="btn btn-xs btn-warning" onclick="editSupplier(${s.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-xs btn-danger" onclick="deleteSupplier(${s.id})" title="Hapus">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Load suppliers error:', error);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Gagal memuat data</td></tr>';
        }
    }

    window.resetSupplierForm = function() {
        document.getElementById('kelola-supplier-id').value = '';
        document.getElementById('kelola-supplier-name').value = '';
        document.getElementById('kelola-supplier-phone').value = '';
        document.getElementById('kelola-supplier-address').value = '';
        document.querySelector('#kelola-supplier-form button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-1"></i>Tambah';
    };

    window.editSupplier = function(id) {
        const supplier = suppliersCache.find(s => s.id === id);
        if (!supplier) return;

        document.getElementById('kelola-supplier-id').value = supplier.id;
        document.getElementById('kelola-supplier-name').value = supplier.name;
        document.getElementById('kelola-supplier-phone').value = supplier.phone || '';
        document.getElementById('kelola-supplier-address').value = supplier.address || '';
        document.querySelector('#kelola-supplier-form button[type="submit"]').innerHTML = '<i class="fas fa-save mr-1"></i>Update';
    };

    window.deleteSupplier = async function(id) {
        if (!confirm('Hapus supplier ini?')) return;

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch(`/api/suppliers/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Gagal menghapus');

            showSuccess('Supplier berhasil dihapus');
            loadSuppliers();
        } catch (error) {
            showError('Error: ' + error.message);
        }
    };

    // Supplier form submit handler
    onPatientToolsReady(function() {
        const supplierForm = document.getElementById('kelola-supplier-form');
        if (supplierForm) {
            supplierForm.addEventListener('submit', async function(e) {
                e.preventDefault();

                const id = document.getElementById('kelola-supplier-id').value;
                const name = document.getElementById('kelola-supplier-name').value.trim();
                const phone = document.getElementById('kelola-supplier-phone').value.trim();
                const address = document.getElementById('kelola-supplier-address').value.trim();

                if (!name) {
                    showWarning('Nama supplier harus diisi');
                    return;
                }

                try {
                    const token = (window.getAuthToken ? window.getAuthToken() : '');
                    const method = id ? 'PUT' : 'POST';
                    const url = id ? `/api/suppliers/${id}` : '/api/suppliers';

                    const response = await fetch(url, {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ name, phone, address })
                    });

                    if (!response.ok) throw new Error('Gagal menyimpan');

                    showSuccess(id ? 'Supplier berhasil diupdate' : 'Supplier berhasil ditambahkan');
                    resetSupplierForm();
                    loadSuppliers();
                } catch (error) {
                    showError('Error: ' + error.message);
                }
            });
        }
    });

    // ============================================
    // Purchase Stock (Tambah Stok) Functions
    // ============================================

    window.openPurchaseModal = async function(obatId, obatName) {
        // Set obat info
        document.getElementById('purchase-obat-id').value = obatId;
        document.getElementById('purchase-obat-name').value = obatName;

        // Set default date to today
        document.getElementById('purchase-date').value = formatDateLocal(new Date());

        // Clear other fields
        document.getElementById('purchase-supplier').value = '';
        document.getElementById('purchase-quantity').value = '';
        document.getElementById('purchase-cost-price').value = '';
        document.getElementById('purchase-total-cost').value = '';
        document.getElementById('purchase-expiry-date').value = '';
        document.getElementById('purchase-batch-number').value = '';
        document.getElementById('purchase-invoice').value = '';
        document.getElementById('purchase-notes').value = '';

        // Load suppliers for dropdown and existing batches
        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');

            // Load suppliers
            const suppliersRes = await fetch('/api/suppliers?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const suppliersData = await suppliersRes.json();

            const select = document.getElementById('purchase-supplier');
            select.innerHTML = '<option value="">-- Pilih Supplier --</option>';
            (suppliersData.data || []).forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });

            // Load existing batches for this obat
            const batchesContainer = document.getElementById('existing-batches-container');
            batchesContainer.innerHTML = '<p class="text-muted small mb-0">Memuat batch...</p>';

            const batchesRes = await fetch(`/api/inventory/batches/${obatId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const batchesData = await batchesRes.json();
            const batches = batchesData.data || [];

            if (batches.length === 0) {
                batchesContainer.innerHTML = '<p class="text-muted small mb-0"><i class="fas fa-info-circle mr-1"></i>Belum ada batch tercatat untuk obat ini</p>';
            } else {
                let html = '<table class="table table-sm table-bordered mb-0"><thead class="bg-light"><tr><th>Batch</th><th>Supplier</th><th class="text-center">Sisa</th><th>Harga Beli</th><th>Kadaluarsa</th></tr></thead><tbody>';
                batches.forEach(b => {
                    const expDate = b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('id-ID') : '-';
                    const daysLeft = b.expiry_date ? Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                    let expBadge = '';
                    if (daysLeft !== null) {
                        if (daysLeft <= 0) expBadge = '<span class="badge badge-danger ml-1">Expired</span>';
                        else if (daysLeft <= 30) expBadge = '<span class="badge badge-warning ml-1">' + daysLeft + ' hari</span>';
                        else if (daysLeft <= 60) expBadge = '<span class="badge badge-info ml-1">' + daysLeft + ' hari</span>';
                    }
                    html += `<tr>
                        <td><code>${b.batch_number || '-'}</code></td>
                        <td>${b.supplier_name || '-'}</td>
                        <td class="text-center"><strong>${b.quantity_remaining}</strong></td>
                        <td>Rp ${parseFloat(b.cost_price).toLocaleString('id-ID')}</td>
                        <td>${expDate}${expBadge}</td>
                    </tr>`;
                });
                html += '</tbody></table>';
                batchesContainer.innerHTML = html;
            }
        } catch (error) {
            console.error('Load data error:', error);
            document.getElementById('existing-batches-container').innerHTML = '<p class="text-danger small mb-0">Gagal memuat data</p>';
        }

        $('#purchaseStockModal').modal('show');
    };

    // Calculate total on input change
    onPatientToolsReady(function() {
        const qtyInput = document.getElementById('purchase-quantity');
        const costInput = document.getElementById('purchase-cost-price');
        const totalInput = document.getElementById('purchase-total-cost');

        function updateTotal() {
            const qty = parseInt(qtyInput?.value) || 0;
            const cost = parseFloat(costInput?.value) || 0;
            if (totalInput) {
                totalInput.value = 'Rp ' + (qty * cost).toLocaleString('id-ID');
            }
        }

        qtyInput?.addEventListener('input', updateTotal);
        costInput?.addEventListener('input', updateTotal);
    });

    window.submitPurchaseStock = async function() {
        const submitBtn = document.getElementById('purchase-submit-btn');
        const cancelBtn = document.getElementById('purchase-cancel-btn');
        if (submitBtn?.dataset.submitting === '1') return;

        const obatId = document.getElementById('purchase-obat-id').value;
        const supplierId = document.getElementById('purchase-supplier').value;
        const quantity = document.getElementById('purchase-quantity').value;
        const costPrice = document.getElementById('purchase-cost-price').value;
        const purchaseDate = document.getElementById('purchase-date').value;
        const expiryDate = document.getElementById('purchase-expiry-date').value;
        const batchNumber = document.getElementById('purchase-batch-number').value.trim();
        const invoiceNumber = document.getElementById('purchase-invoice').value;
        const notes = document.getElementById('purchase-notes').value;

        // Validation
        if (!quantity || quantity <= 0) {
            showWarning('Jumlah harus diisi');
            return;
        }
        if (!costPrice || costPrice <= 0) {
            showWarning('Harga beli harus diisi');
            return;
        }
        if (!purchaseDate) {
            showWarning('Tanggal pembelian harus diisi');
            return;
        }
        if (!batchNumber) {
            showWarning('No. batch wajib diisi');
            return;
        }

        const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.dataset.submitting = '1';
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-1" role="status" aria-hidden="true"></span>Menyimpan...';
        }
        if (cancelBtn) cancelBtn.disabled = true;
        showPurchaseStockLoading(true);

        try {
            const token = (window.getAuthToken ? window.getAuthToken() : '');
            const response = await fetch('/api/inventory/purchase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    obat_id: obatId,
                    supplier_id: supplierId || null,
                    quantity: parseInt(quantity),
                    cost_price: parseFloat(costPrice),
                    purchase_date: purchaseDate,
                    expiry_date: expiryDate || null,
                    batch_number: batchNumber,
                    invoice_number: invoiceNumber || null,
                    notes: notes || null
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Gagal menyimpan');
            }

            showSuccess('Stok berhasil ditambahkan');
            $('#purchaseStockModal').modal('hide');

            // Reload obat list
            if (typeof window.loadKelolaObatList === 'function') {
                window.loadKelolaObatList();
            } else {
                // Fallback: reload kelola-obat module if available
                const v = window.__assetVersion || Date.now().toString();
                const { initKelolaObat } = await import('./scripts/kelola-obat.js?v=' + encodeURIComponent(v));
                if (initKelolaObat) initKelolaObat();
            }
        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.dataset.submitting = '0';
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
            if (cancelBtn) cancelBtn.disabled = false;
            showPurchaseStockLoading(false);
        }
    };

    function showPurchaseStockLoading(show) {
        let overlay = document.getElementById('purchase-stock-loading-overlay');
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'purchase-stock-loading-overlay';
                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:20000;display:flex;align-items:center;justify-content:center;';
                overlay.innerHTML = '<div style="background:#fff;padding:24px 32px;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.25);display:flex;flex-direction:column;align-items:center;gap:12px;min-width:200px;"><div class="spinner-border text-success" role="status" style="width:3rem;height:3rem;"></div><div style="font-weight:500;color:#333;">Menyimpan...</div><div style="font-size:12px;color:#888;">Mohon tunggu, jangan tutup</div></div>';
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'flex';
        } else if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Kelola Tindakan (Pengaturan) Page Function
    window.showPengaturanPage = function() {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show pengaturan page
        document.getElementById('pengaturan-page').classList.remove('d-none');

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector('#nav-pengaturan .nav-link')?.classList.add('active');

        // Hide floating panel
        const floatingPanel = document.getElementById('floating-kelola-pasien');
        if (floatingPanel) {
            floatingPanel.classList.add('d-none');
        }
    };

    // Download Tindakan Price List PDF
    window.downloadTindakanPriceList = async function() {
        try {
            const token = await getIdToken();
            if (!token) {
                alert('Anda tidak terautentikasi. Silakan login kembali.');
                return;
            }

            const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
                ? 'http://localhost:3001'
                : window.location.origin.replace(/\/$/, '');

            // Show loading
            const btn = event.target.closest('button');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const response = await fetch(`${apiBase}/api/tindakan/download/price-list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to generate PDF');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Daftar_Harga_Tindakan_${formatDateLocal(new Date())}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            btn.innerHTML = originalHtml;
            btn.disabled = false;
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Gagal mengunduh PDF: ' + error.message);
            if (btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
    };

    // Download Obat Price List PDF
    window.downloadObatPriceList = async function() {
        try {
            const token = await getIdToken();
            if (!token) {
                alert('Anda tidak terautentikasi. Silakan login kembali.');
                return;
            }

            const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
                ? 'http://localhost:3001'
                : window.location.origin.replace(/\/$/, '');

            // Show loading
            const btn = event.target.closest('button');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const response = await fetch(`${apiBase}/api/obat/download/price-list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to generate PDF');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Daftar_Harga_Obat_${formatDateLocal(new Date())}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            btn.innerHTML = originalHtml;
            btn.disabled = false;
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Gagal mengunduh PDF: ' + error.message);
            if (btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
    };
