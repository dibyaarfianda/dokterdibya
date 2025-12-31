/**
 * RSUD Gambiran to Klinik Dibya Exporter
 * Content script - runs on simrsg.kedirikota.go.id pages
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

    // Check if we're on a patient/medical record page
    function isPatientPage() {
        const path = window.location.pathname;
        // Match patterns like /kasus/med.../datamedis/cppt or /kasus/med...
        return path.includes('/kasus/med') || path.includes('/datamedis');
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

    // Extract CPPT (Catatan Perkembangan Pasien Terintegrasi) data
    function extractCPPT() {
        const cpptData = {
            subjective: {},
            objective: {},
            assessment: {},
            plan: {},
            visit_date: null,
            visit_time: null
        };

        const pageText = document.body.innerText;

        // Extract date/time from signature block at end (e.g., "30 December 2025 21:20" or "30/12/2025 10:30")
        // Pattern 1: "30 December 2025 21:20" (English month with time)
        const signatureMatch1 = pageText.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+(\d{1,2}:\d{2})/i);
        if (signatureMatch1) {
            const monthMap = { 'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06', 'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12' };
            const day = signatureMatch1[1].padStart(2, '0');
            const month = monthMap[signatureMatch1[2].toLowerCase()];
            const year = signatureMatch1[3];
            cpptData.visit_date = `${year}-${month}-${day}`;
            cpptData.visit_time = signatureMatch1[4];
            console.log('[RSUD Gambiran Export] Extracted signature date/time:', cpptData.visit_date, cpptData.visit_time);
        } else {
            // Pattern 2: "30 Desember 2025 21:20" (Indonesian month with time)
            const signatureMatch2 = pageText.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\s+(\d{1,2}:\d{2})/i);
            if (signatureMatch2) {
                const monthMapId = { 'januari': '01', 'februari': '02', 'maret': '03', 'april': '04', 'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'desember': '12' };
                const day = signatureMatch2[1].padStart(2, '0');
                const month = monthMapId[signatureMatch2[2].toLowerCase()];
                const year = signatureMatch2[3];
                cpptData.visit_date = `${year}-${month}-${day}`;
                cpptData.visit_time = signatureMatch2[4];
                console.log('[RSUD Gambiran Export] Extracted signature date/time (ID):', cpptData.visit_date, cpptData.visit_time);
            } else {
                // Pattern 3: "30/12/2025 10:30" or "30-12-2025 10:30"
                const signatureMatch3 = pageText.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}:\d{2})/);
                if (signatureMatch3) {
                    const day = signatureMatch3[1].padStart(2, '0');
                    const month = signatureMatch3[2].padStart(2, '0');
                    const year = signatureMatch3[3];
                    cpptData.visit_date = `${year}-${month}-${day}`;
                    cpptData.visit_time = signatureMatch3[4];
                    console.log('[RSUD Gambiran Export] Extracted numeric date/time:', cpptData.visit_date, cpptData.visit_time);
                }
            }
        }

        // Parse SUBJECTIVE section
        const subjectiveMatch = pageText.match(/SUBJECTIVE([\s\S]*?)(?=OBJECTIVE|$)/i);
        if (subjectiveMatch) {
            const subText = subjectiveMatch[1];

            // Capture FULL subjective text for riwayat_kehamilan_saat_ini
            cpptData.subjective.riwayat_kehamilan_saat_ini = subText.trim();

            // Pattern that stops at next field label (handles comma-separated MEDIFY format)
            const nextFieldPattern = '(?=,?\\s*(?:Riwayat\\s*Penyakit|RPD|RPK|RPO|HPL|HPHT|Alergi)|\\n|$)';

            // Keluhan Utama - capture until next field
            const keluhanMatch = subText.match(new RegExp('Keluhan\\s*Utama\\s*:?\\s*(.*?)' + nextFieldPattern, 'i'));
            if (keluhanMatch && keluhanMatch[1]) {
                cpptData.subjective.keluhan_utama = keluhanMatch[1].replace(/,\s*$/, '').trim();
            }

            // RPS - capture until RPD/RPK or newline
            const rpsMatch = subText.match(new RegExp('(?:RPS|Riwayat\\s*Penyakit\\s*Sekarang)\\s*(?:\\([^)]+\\))?\\s*:?\\s*(.*?)(?=,?\\s*(?:RPD|Riwayat\\s*Penyakit\\s*Dahulu|RPK)|\\n|$)', 'i'));
            if (rpsMatch && rpsMatch[1]) {
                cpptData.subjective.rps = rpsMatch[1].replace(/,\s*$/, '').trim();
            }

            // RPD - capture until RPK or newline
            const rpdMatch = subText.match(new RegExp('(?:RPD|Riwayat\\s*Penyakit\\s*Dahulu)\\s*(?:\\([^)]+\\))?\\s*:?\\s*(.*?)(?=,?\\s*(?:RPK|Riwayat\\s*Penyakit\\s*Keluarga|HPL|HPHT)|\\n|$)', 'i'));
            if (rpdMatch && rpdMatch[1]) {
                cpptData.subjective.rpd = rpdMatch[1].replace(/,\s*$/, '').trim();
            }

            // RPK - capture until HPL/HPHT or newline
            const rpkMatch = subText.match(new RegExp('(?:RPK|Riwayat\\s*Penyakit\\s*Keluarga)\\s*:?\\s*(.*?)(?=,?\\s*(?:HPL|HPHT|Alergi)|\\n|$)', 'i'));
            if (rpkMatch && rpkMatch[1]) {
                cpptData.subjective.rpk = rpkMatch[1].replace(/,\s*$/, '').trim();
            }

            // HPL - also check in Keluhan Utama (e.g., "kontrol hamil, HPL 29/1/26")
            const hplMatch = subText.match(/HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hplMatch) {
                cpptData.subjective.hpl = hplMatch[1];
            } else if (cpptData.subjective.keluhan_utama) {
                // Try to extract from Keluhan Utama
                const hplFromKeluhan = cpptData.subjective.keluhan_utama.match(/HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
                if (hplFromKeluhan) cpptData.subjective.hpl = hplFromKeluhan[1];
            }

            // HPHT
            const hphtMatch = subText.match(/HPHT\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hphtMatch) cpptData.subjective.hpht = hphtMatch[1];

            // Extract TB (Tinggi Badan) and BB (Berat Badan) from SUBJECTIVE
            // Store in objective since they belong to pemeriksaan fisik
            const tbSubMatch = subText.match(/(?:TB|Tinggi\s*Badan)\s*:?\s*(\d+)\s*(?:cm)?/i);
            if (tbSubMatch) cpptData.objective.tinggi_badan = parseInt(tbSubMatch[1]);

            const bbSubMatch = subText.match(/(?:BB|Berat\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?/i);
            if (bbSubMatch) cpptData.objective.berat_badan = parseFloat(bbSubMatch[1].replace(',', '.'));
        }

        // Parse OBJECTIVE section
        const objectiveMatch = pageText.match(/OBJECTIVE([\s\S]*?)(?=ASSESSMENT|$)/i);
        if (objectiveMatch) {
            const objText = objectiveMatch[1];

            const kuMatch = objText.match(/(?:K\/U|KU|k\/u|Keadaan\s*Umum)\s*:?\s*(\w+)/i);
            if (kuMatch) cpptData.objective.keadaan_umum = kuMatch[1].trim();

            const tensiMatch = objText.match(/(?:Tensi|TD|Tekanan\s*Darah)\s*:?\s*(\d+\/\d+)/i);
            if (tensiMatch) cpptData.objective.tensi = tensiMatch[1];

            const nadiMatch = objText.match(/(?:Nadi|HR)\s*:?\s*(\d+)/i);
            if (nadiMatch) cpptData.objective.nadi = parseInt(nadiMatch[1]);

            const suhuMatch = objText.match(/Suhu\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (suhuMatch) cpptData.objective.suhu = parseFloat(suhuMatch[1].replace(',', '.'));

            const spo2Match = objText.match(/SpO2\s*:?\s*(\d+)/i);
            if (spo2Match) cpptData.objective.spo2 = parseInt(spo2Match[1]);

            const gcsMatch = objText.match(/GCS\s*:?\s*([\d\-]+)/i);
            if (gcsMatch) cpptData.objective.gcs = gcsMatch[1];

            const rrMatch = objText.match(/(?:RR|Resp)\s*:?\s*(\d+)/i);
            if (rrMatch) cpptData.objective.rr = parseInt(rrMatch[1]);

            const bbMatch = objText.match(/(?:BB|Berat\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (bbMatch) cpptData.objective.berat_badan = parseFloat(bbMatch[1].replace(',', '.'));

            const tbMatch = objText.match(/(?:TB|Tinggi\s*Badan)\s*:?\s*(\d+)/i);
            if (tbMatch) cpptData.objective.tinggi_badan = parseInt(tbMatch[1]);

            const usgMatch = objText.match(/USG\s*:?\s*([^\n]+)/i);
            if (usgMatch) cpptData.objective.usg = usgMatch[1].trim();
        }

        // Parse ASSESSMENT section
        const assessmentMatch = pageText.match(/ASSESSMENT([\s\S]*?)(?=PLAN|PLANNING|$)/i);
        if (assessmentMatch) {
            const assText = assessmentMatch[1].trim();

            const lines = assText.split('\n').filter(l => l.trim());
            if (lines.length > 0) {
                cpptData.assessment.diagnosis = lines[0].trim();
            }

            // Helper function to convert Roman numerals to numbers
            function romanToNumber(roman) {
                const romanMap = { 'I': 1, 'V': 5, 'X': 10 };
                let result = 0;
                const upper = roman.toUpperCase();
                for (let i = 0; i < upper.length; i++) {
                    const current = romanMap[upper[i]] || 0;
                    const next = romanMap[upper[i + 1]] || 0;
                    if (current < next) {
                        result -= current;
                    } else {
                        result += current;
                    }
                }
                return result;
            }

            // Parse obstetric formula - MEDIFY format first (G2P0000 = P followed by 4 digits)
            // Format: G2P0101 means Gravida=2, Aterm=0, Premature=1, Abortus=0, AnakHidup=1
            // In our app: Para = Aterm + Premature
            const medifyMatch = assText.match(/G(\d+)P(\d)(\d)(\d)(\d)/i);
            if (medifyMatch) {
                const gravida = parseInt(medifyMatch[1]);
                const aterm = parseInt(medifyMatch[2]);
                const premature = parseInt(medifyMatch[3]);
                const abortus = parseInt(medifyMatch[4]);
                const anakHidup = parseInt(medifyMatch[5]);

                cpptData.assessment.gravida = gravida;
                cpptData.assessment.para = aterm + premature;  // Para = Aterm + Premature
                cpptData.assessment.abortus = abortus;
                cpptData.assessment.anak_hidup = anakHidup;
                cpptData.assessment.is_obstetric = true;
            } else {
                // Try dash format: G1 P0-0 or G2P1-1 (dash means premature=0, abortus=0)
                const dashMatch = assText.match(/G([IVX]+|\d+)\s*P(\d+)-(\d+)/i);
                if (dashMatch) {
                    // Check if gravida is Roman numeral or number
                    let gravida = dashMatch[1];
                    if (/^[IVX]+$/i.test(gravida)) {
                        gravida = romanToNumber(gravida);
                    } else {
                        gravida = parseInt(gravida);
                    }
                    cpptData.assessment.gravida = gravida;
                    cpptData.assessment.para = parseInt(dashMatch[2]);  // Aterm only (dash format)
                    cpptData.assessment.abortus = 0;  // Dash means 0
                    cpptData.assessment.anak_hidup = parseInt(dashMatch[3]);
                    cpptData.assessment.is_obstetric = true;
                } else {
                    // Fallback to standard format (G_P_ or Roman GI, GII, etc.)
                    const obsMatch = assText.match(/G([IVX]+|\d+)\s*P(\d+)/i);
                    if (obsMatch) {
                        let gravida = obsMatch[1];
                        if (/^[IVX]+$/i.test(gravida)) {
                            gravida = romanToNumber(gravida);
                        } else {
                            gravida = parseInt(gravida);
                        }
                        cpptData.assessment.gravida = gravida;
                        cpptData.assessment.para = parseInt(obsMatch[2]);
                        cpptData.assessment.abortus = 0;
                        cpptData.assessment.anak_hidup = 0;
                        cpptData.assessment.is_obstetric = true;
                    }
                }
            }

            // Parse gestational age
            const ukMatch = assText.match(/(?:uk|usia\s*kehamilan)\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
            if (ukMatch) {
                cpptData.assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
                cpptData.assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
            }
        }

        // Parse PLAN section
        const planMatch = pageText.match(/(?:PLAN|PLANNING)([\s\S]*?)(?=Dibuat|TTD|Tanggal|$)/i);
        if (planMatch) {
            const planText = planMatch[1].trim();
            cpptData.plan.raw = planText;

            const lines = planText.split('\n').filter(l => l.trim());
            cpptData.plan.obat = lines.filter(l =>
                /\d+\s*x\s*\d+|tab|kap|botol|strip|mg|ml/i.test(l)
            );
        }

        return cpptData;
    }

    // Combine all scraped data into text format for AI parsing
    function combineDataAsText() {
        let text = '';

        // Try to get main content area first (Medify uses various containers)
        const mainContent = document.querySelector(
            '.main-content, #main-content, .content, main, [role="main"], ' +
            '.card-body, .container-fluid, .page-content'
        );

        if (mainContent) {
            text = mainContent.innerText;
        }

        // If no main content found or too short, get body text
        if (!text || text.length < 100) {
            const clone = document.body.cloneNode(true);

            // Remove navigation, headers, footers, scripts
            const removeSelectors = [
                'nav', 'header', 'footer', 'script', 'style',
                '.navbar', '.sidebar', '.menu', '.nav', '.breadcrumb',
                '[role="navigation"]', '.modal', '.dropdown-menu'
            ];
            removeSelectors.forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });

            text = clone.innerText;
        }

        // Clean up the text
        text = text
            .replace(/\t+/g, ' ')
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        // Limit to first 15000 chars to avoid token limits
        if (text.length > 15000) {
            text = text.substring(0, 15000);
        }

        console.log('[RSUD Gambiran Export] Extracted text length:', text.length);
        console.log('[RSUD Gambiran Export] First 500 chars:', text.substring(0, 500));

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

    // Show category selection modal
    function showCategoryModal() {
        return new Promise((resolve) => {
            // Remove existing modal if any
            const existingModal = document.getElementById('dibya-category-modal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = 'dibya-category-modal';
            modal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                    <div style="background: white; border-radius: 12px; padding: 24px; width: 320px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">Pilih Kategori</h3>
                        <select id="dibya-category-select" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px;">
                            <option value="obstetri">Obstetri (Kehamilan)</option>
                            <option value="gyn_repro">Ginekologi Reproduksi</option>
                            <option value="gyn_special">Ginekologi Spesial</option>
                        </select>
                        <div style="display: flex; gap: 12px;">
                            <button id="dibya-category-cancel" style="flex: 1; padding: 12px; border: 1px solid #ddd; background: white; border-radius: 8px; cursor: pointer; font-size: 14px;">Batal</button>
                            <button id="dibya-category-confirm" style="flex: 1; padding: 12px; border: none; background: #007bff; color: white; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Export</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('dibya-category-cancel').onclick = () => {
                modal.remove();
                resolve(null);
            };

            document.getElementById('dibya-category-confirm').onclick = () => {
                const category = document.getElementById('dibya-category-select').value;
                modal.remove();
                resolve(category);
            };
        });
    }

    // Handle export button click
    async function handleExport() {
        const btn = document.getElementById(CONFIG.BUTTON_ID);

        // Check if extension context is valid
        if (!isExtensionValid()) {
            showNotification('Extension perlu di-refresh. Reload halaman ini (F5)', 'warning');
            return;
        }

        // Show category selection modal
        const selectedCategory = await showCategoryModal();
        if (!selectedCategory) {
            return; // User cancelled
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
                    category: selectedCategory,
                    source: 'rsud_gambiran'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (result.success) {
                // Get local CPPT extraction and merge with API result
                const localCPPT = extractCPPT();
                const mergedData = result.data;

                // Merge local extraction into API result (local takes priority for specific fields)
                if (localCPPT.subjective) {
                    mergedData.raw_parsed = mergedData.raw_parsed || {};
                    mergedData.raw_parsed.subjective = mergedData.raw_parsed.subjective || {};

                    // Merge riwayat_kehamilan_saat_ini from local extraction
                    if (localCPPT.subjective.riwayat_kehamilan_saat_ini) {
                        mergedData.raw_parsed.subjective.riwayat_kehamilan_saat_ini = localCPPT.subjective.riwayat_kehamilan_saat_ini;
                    }

                    // Merge HPL and HPHT from local extraction (if API didn't find them)
                    if (localCPPT.subjective.hpl && !mergedData.raw_parsed.subjective.hpl) {
                        mergedData.raw_parsed.subjective.hpl = localCPPT.subjective.hpl;
                    }
                    if (localCPPT.subjective.hpht && !mergedData.raw_parsed.subjective.hpht) {
                        mergedData.raw_parsed.subjective.hpht = localCPPT.subjective.hpht;
                    }
                }
                if (localCPPT.objective) {
                    mergedData.raw_parsed = mergedData.raw_parsed || {};
                    mergedData.raw_parsed.objective = mergedData.raw_parsed.objective || {};

                    // Merge TB/BB from local extraction (from SUBJECTIVE section)
                    if (localCPPT.objective.tinggi_badan) {
                        mergedData.raw_parsed.objective.tinggi_badan = localCPPT.objective.tinggi_badan;
                    }
                    if (localCPPT.objective.berat_badan) {
                        mergedData.raw_parsed.objective.berat_badan = localCPPT.objective.berat_badan;
                    }
                }
                // Merge obstetric fields from local extraction (if API didn't find them or returned null)
                // Check for both undefined AND null because AI might return null for missing fields
                if (localCPPT.assessment) {
                    mergedData.raw_parsed = mergedData.raw_parsed || {};
                    mergedData.raw_parsed.assessment = mergedData.raw_parsed.assessment || {};

                    if (localCPPT.assessment.gravida !== undefined && (mergedData.raw_parsed.assessment.gravida === undefined || mergedData.raw_parsed.assessment.gravida === null)) {
                        mergedData.raw_parsed.assessment.gravida = localCPPT.assessment.gravida;
                    }
                    if (localCPPT.assessment.para !== undefined && (mergedData.raw_parsed.assessment.para === undefined || mergedData.raw_parsed.assessment.para === null)) {
                        mergedData.raw_parsed.assessment.para = localCPPT.assessment.para;
                    }
                    if (localCPPT.assessment.abortus !== undefined && (mergedData.raw_parsed.assessment.abortus === undefined || mergedData.raw_parsed.assessment.abortus === null)) {
                        mergedData.raw_parsed.assessment.abortus = localCPPT.assessment.abortus;
                    }
                    if (localCPPT.assessment.anak_hidup !== undefined && (mergedData.raw_parsed.assessment.anak_hidup === undefined || mergedData.raw_parsed.assessment.anak_hidup === null)) {
                        mergedData.raw_parsed.assessment.anak_hidup = localCPPT.assessment.anak_hidup;
                    }
                    if (localCPPT.assessment.is_obstetric) {
                        mergedData.raw_parsed.assessment.is_obstetric = true;
                    }
                }

                // Merge visit_date and visit_time from local extraction (signature timestamp)
                if (localCPPT.visit_date) {
                    mergedData.visit_date = localCPPT.visit_date;
                    console.log('[RSUD Gambiran] Using local visit_date:', localCPPT.visit_date);
                }
                if (localCPPT.visit_time) {
                    mergedData.visit_time = localCPPT.visit_time;
                    console.log('[RSUD Gambiran] Using local visit_time:', localCPPT.visit_time);
                }

                console.log('[RSUD Gambiran] Local CPPT:', localCPPT);
                console.log('[RSUD Gambiran] Merged data:', mergedData);

                // Add category to merged data
                mergedData.category = selectedCategory;

                // Store parsed data for the staff panel
                try {
                    await chrome.storage.local.set({
                        'dibya_import_data': mergedData,
                        'dibya_import_timestamp': Date.now(),
                        'dibya_import_source': 'rsud_gambiran',
                        'dibya_import_category': selectedCategory
                    });
                } catch (e) {
                    // Ignore storage error, still show success
                }

                showNotification('Data berhasil di-parse! Membuka Staff Panel...', 'success');

                // Open staff panel in new tab
                setTimeout(() => {
                    window.open(CONFIG.STAFF_URL + '?import=' + encodeURIComponent(JSON.stringify(mergedData)), '_blank');
                }, 1000);
            } else {
                throw new Error(result.message || 'Gagal parsing data');
            }

        } catch (error) {
            console.error('Export error:', error);

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
