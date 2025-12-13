/**
 * SIMRS Melinda to Klinik Dibya Exporter
 * Content script - runs on simrs.melinda.co.id pages
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        API_URL: 'https://dokterdibya.com/api/medical-import/parse',
        STAFF_URL: 'https://dokterdibya.com/staff/public/index-adminlte.html',
        BUTTON_ID: 'dibya-export-btn',
        FLOATING_BUTTON_ID: 'dibya-floating-btn'
    };

    // Check if we're on a patient page
    function isPatientPage() {
        return window.location.pathname.includes('/kasus/med');
    }

    // Create and inject the export button
    function injectExportButton() {
        if (!isPatientPage()) return;
        if (document.getElementById(CONFIG.FLOATING_BUTTON_ID)) return;

        const btn = document.createElement('div');
        btn.id = CONFIG.FLOATING_BUTTON_ID;
        btn.innerHTML = `
            <button id="${CONFIG.BUTTON_ID}" title="Export ke Klinik Dibya">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <span>Export</span>
            </button>
        `;
        document.body.appendChild(btn);

        document.getElementById(CONFIG.BUTTON_ID).addEventListener('click', handleExport);
    }

    // Extract patient identity data
    function extractIdentitas() {
        const data = {};

        // Try to find identity section
        const infoUmum = document.querySelector('.card-body, [class*="informasi"]');
        if (!infoUmum) return data;

        // Common selectors for SIMRS data
        const selectors = {
            nama: ['NAMA PASIEN', 'Nama Pasien', 'NAMA'],
            jenis_kelamin: ['JENIS KELAMIN', 'Jenis Kelamin'],
            usia: ['USIA', 'Usia'],
            tanggal_lahir: ['TEMPAT, TANGGAL LAHIR', 'Tanggal Lahir', 'TTL'],
            alamat: ['ALAMAT', 'Alamat'],
            no_hp: ['NO HP', 'No HP', 'Telepon'],
            no_identitas: ['NO IDENTITAS', 'NIK', 'No Identitas'],
            pekerjaan: ['PEKERJAAN', 'Pekerjaan'],
            tinggi_badan: ['TINGGI BADAN', 'TB'],
            berat_badan: ['BERAT BADAN', 'BB']
        };

        // Method 1: Try extracting from labeled divs/spans
        const pageText = document.body.innerText;

        for (const [field, labels] of Object.entries(selectors)) {
            for (const label of labels) {
                // Find label element and get adjacent value
                const labelEls = Array.from(document.querySelectorAll('*')).filter(
                    el => el.innerText && el.innerText.trim().toUpperCase() === label.toUpperCase()
                );

                for (const labelEl of labelEls) {
                    // Check next sibling or parent's next element
                    let valueEl = labelEl.nextElementSibling;
                    if (!valueEl) {
                        valueEl = labelEl.parentElement?.nextElementSibling;
                    }
                    if (valueEl && valueEl.innerText) {
                        const value = valueEl.innerText.trim();
                        if (value && value !== '-' && !value.toUpperCase().includes(label.toUpperCase())) {
                            data[field] = value;
                            break;
                        }
                    }
                }
                if (data[field]) break;
            }
        }

        // Method 2: Regex extraction from page text
        const patterns = {
            nama: /NAMA\s*PASIEN[\s:]+([A-Z\s]+?)(?=\n|JENIS|STATUS)/i,
            no_identitas: /NO\s*IDENTITAS[\s:]+(\d{16})/i,
            no_hp: /NO\s*HP[\s:]+(\d{10,13})/i,
            tinggi_badan: /TINGGI\s*BADAN[\s:]+(\d+)\s*(?:cm)?/i,
            berat_badan: /BERAT\s*BADAN[\s:]+(\d+(?:[.,]\d+)?)\s*(?:kg)?/i
        };

        for (const [field, pattern] of Object.entries(patterns)) {
            if (!data[field]) {
                const match = pageText.match(pattern);
                if (match) {
                    data[field] = match[1].trim();
                }
            }
        }

        return data;
    }

    // Extract CPPT (medical progress notes)
    function extractCPPT() {
        const cpptData = {
            subjective: {},
            objective: {},
            assessment: {},
            plan: {}
        };

        // Find CPPT section
        const cpptSection = document.querySelector('[class*="cppt"], #cppt, [data-tab="cppt"]');
        let cpptText = '';

        if (cpptSection) {
            cpptText = cpptSection.innerText;
        } else {
            // Try to find SUBJECTIVE/OBJECTIVE sections directly
            const pageText = document.body.innerText;
            const cpptMatch = pageText.match(/SUBJECTIVE[\s\S]*?(?=Dibuat\s*Oleh|TTD|$)/i);
            if (cpptMatch) {
                cpptText = cpptMatch[0];
            }
        }

        if (!cpptText) return cpptData;

        // Parse SUBJECTIVE section
        const subjectiveMatch = cpptText.match(/SUBJECTIVE([\s\S]*?)(?=OBJECTIVE|$)/i);
        if (subjectiveMatch) {
            const subText = subjectiveMatch[1];

            const keluhanMatch = subText.match(/Keluhan\s*Utama\s*:?\s*([^\n]+)/i);
            if (keluhanMatch) cpptData.subjective.keluhan_utama = keluhanMatch[1].trim();

            const rpsMatch = subText.match(/(?:RPS|Riwayat\s*Penyakit\s*Sekarang)\s*(?:\([^)]+\))?\s*:?\s*([^\n]+)/i);
            if (rpsMatch) cpptData.subjective.rps = rpsMatch[1].trim();

            const rpdMatch = subText.match(/(?:RPD|Riwayat\s*Penyakit\s*Dahulu)\s*(?:\([^)]+\))?\s*:?\s*([^\n]+)/i);
            if (rpdMatch) cpptData.subjective.rpd = rpdMatch[1].trim();

            const rpkMatch = subText.match(/(?:RPK|Riwayat\s*Penyakit\s*Keluarga)\s*:?\s*([^\n]+)/i);
            if (rpkMatch) cpptData.subjective.rpk = rpkMatch[1].trim();

            const hplMatch = subText.match(/HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hplMatch) cpptData.subjective.hpl = hplMatch[1];

            const hphtMatch = subText.match(/HPHT\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hphtMatch) cpptData.subjective.hpht = hphtMatch[1];
        }

        // Parse OBJECTIVE section
        const objectiveMatch = cpptText.match(/OBJECTIVE([\s\S]*?)(?=ASSESSMENT|$)/i);
        if (objectiveMatch) {
            const objText = objectiveMatch[1];

            const kuMatch = objText.match(/(?:K\/U|KU|k\/u)\s*:?\s*(\w+)/i);
            if (kuMatch) cpptData.objective.keadaan_umum = kuMatch[1].trim();

            const tensiMatch = objText.match(/Tensi\s*:?\s*(\d+\/\d+)/i);
            if (tensiMatch) cpptData.objective.tensi = tensiMatch[1];

            const nadiMatch = objText.match(/Nadi\s*:?\s*(\d+)/i);
            if (nadiMatch) cpptData.objective.nadi = parseInt(nadiMatch[1]);

            const suhuMatch = objText.match(/Suhu\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (suhuMatch) cpptData.objective.suhu = parseFloat(suhuMatch[1].replace(',', '.'));

            const spo2Match = objText.match(/SpO2\s*:?\s*(\d+)/i);
            if (spo2Match) cpptData.objective.spo2 = parseInt(spo2Match[1]);

            const gcsMatch = objText.match(/GCS\s*:?\s*([\d\-]+)/i);
            if (gcsMatch) cpptData.objective.gcs = gcsMatch[1];

            const rrMatch = objText.match(/RR\s*:?\s*(\d+)/i);
            if (rrMatch) cpptData.objective.rr = parseInt(rrMatch[1]);

            const bbMatch = objText.match(/BB\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (bbMatch) cpptData.objective.berat_badan = parseFloat(bbMatch[1].replace(',', '.'));

            const usgMatch = objText.match(/USG\s*:?\s*([^\n]+)/i);
            if (usgMatch) cpptData.objective.usg = usgMatch[1].trim();
        }

        // Parse ASSESSMENT section
        const assessmentMatch = cpptText.match(/ASSESSMENT([\s\S]*?)(?=PLAN|PLANNING|$)/i);
        if (assessmentMatch) {
            const assText = assessmentMatch[1].trim();

            // Get first non-empty line as diagnosis
            const lines = assText.split('\n').filter(l => l.trim());
            if (lines.length > 0) {
                cpptData.assessment.diagnosis = lines[0].trim();
            }

            // Parse obstetric formula
            const obsMatch = assText.match(/G(\d+)\s*P([\d\-]+)/i);
            if (obsMatch) {
                cpptData.assessment.gravida = parseInt(obsMatch[1]);
                cpptData.assessment.para = obsMatch[2];
                cpptData.assessment.is_obstetric = true;
            }

            // Parse gestational age
            const ukMatch = assText.match(/uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
            if (ukMatch) {
                cpptData.assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
                cpptData.assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
            }
        }

        // Parse PLAN section
        const planMatch = cpptText.match(/(?:PLAN|PLANNING)([\s\S]*?)(?=Dibuat|TTD|$)/i);
        if (planMatch) {
            const planText = planMatch[1].trim();
            cpptData.plan.raw = planText;

            // Extract medications
            const lines = planText.split('\n').filter(l => l.trim());
            cpptData.plan.obat = lines.filter(l =>
                /\d+\s*x\s*\d+|tab|kap|botol|strip/i.test(l)
            );
        }

        return cpptData;
    }

    // Combine all scraped data into text format for AI parsing
    function combineDataAsText() {
        // Simple approach: grab ALL visible text from the page
        // Let the AI do the parsing - it's much better at it!

        let text = '';

        // Try to get main content area first
        const mainContent = document.querySelector('.main-content, #main-content, .content, main, [role="main"]');
        if (mainContent) {
            text = mainContent.innerText;
        }

        // If no main content, get body text but exclude nav/header/footer
        if (!text || text.length < 100) {
            // Clone body and remove unwanted elements
            const clone = document.body.cloneNode(true);

            // Remove navigation, headers, footers, scripts
            const removeSelectors = ['nav', 'header', 'footer', 'script', 'style', '.navbar', '.sidebar', '.menu'];
            removeSelectors.forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });

            text = clone.innerText;
        }

        // Clean up the text
        text = text
            .replace(/\t+/g, ' ')           // tabs to spaces
            .replace(/  +/g, ' ')           // multiple spaces to single
            .replace(/\n\s*\n\s*\n/g, '\n\n') // max 2 newlines
            .trim();

        // Limit to first 15000 chars to avoid token limits
        if (text.length > 15000) {
            text = text.substring(0, 15000);
        }

        console.log('[SIMRS Export] Extracted text length:', text.length);
        console.log('[SIMRS Export] First 500 chars:', text.substring(0, 500));

        return text;
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const existing = document.getElementById('dibya-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'dibya-notification';
        notification.className = `dibya-notif dibya-notif-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 5000);
    }

    // Check if extension context is still valid
    function isExtensionValid() {
        try {
            return chrome.runtime && chrome.runtime.id;
        } catch (e) {
            return false;
        }
    }

    // Handle export button click
    async function handleExport() {
        const btn = document.getElementById(CONFIG.BUTTON_ID);

        // Check if extension context is valid
        if (!isExtensionValid()) {
            showNotification('Extension perlu di-refresh. Reload halaman ini (F5)', 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `
            <svg class="dibya-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
            </svg>
            <span>Exporting...</span>
        `;

        try {
            // Combine scraped data as text
            const text = combineDataAsText();

            if (!text || text.length < 50) {
                throw new Error('Tidak dapat menemukan data rekam medis di halaman ini');
            }

            // Send to background script (avoids CORS)
            const result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'parseRecord',
                    text: text,
                    category: 'obstetri'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (result.success) {
                // Store parsed data for the staff panel
                try {
                    await chrome.storage.local.set({
                        'dibya_import_data': result.data,
                        'dibya_import_timestamp': Date.now(),
                        'dibya_import_source': 'simrs_melinda'
                    });
                } catch (e) {
                    // Ignore storage error, still show success
                }

                showNotification('Data berhasil di-parse! Membuka Staff Panel...', 'success');

                // Open staff panel in new tab with import data
                // Staff Panel will auto: search patient → create MR → navigate
                setTimeout(() => {
                    window.open(CONFIG.STAFF_URL + '?import=' + encodeURIComponent(JSON.stringify(result.data)), '_blank');
                }, 1000);
            } else {
                throw new Error(result.message || 'Gagal parsing data');
            }

        } catch (error) {
            console.error('Export error:', error);

            // Handle specific errors
            if (error.message.includes('Extension context invalidated')) {
                showNotification('Extension perlu di-refresh. Reload halaman ini (F5)', 'warning');
            } else {
                showNotification(`Error: ${error.message}`, 'error');
            }
        }

        resetButton(btn);
    }

    // Reset button to default state
    function resetButton(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <span>Export</span>
        `;
    }

    // Initialize when DOM is ready
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectExportButton);
        } else {
            injectExportButton();
        }

        // Also inject on URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(injectExportButton, 500);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    init();
})();
