/**
 * MEDIFY Puppeteer Service
 * Handles browser automation for RSIA Melinda and RSUD Gambiran SIMRS
 */

const puppeteer = require('puppeteer');
const { encrypt, decrypt } = require('../utils/encryption');
const pool = require('../utils/database');

const DELAY_BETWEEN_REQUESTS = parseInt(process.env.MEDIFY_DELAY_BETWEEN_REQUESTS) || 5000;

// SIMRS URLs
const SIMRS_CONFIG = {
    rsia_melinda: {
        name: 'RSIA Melinda',
        loginUrl: 'https://simrs.melinda.co.id/login',
        historyUrl: 'https://simrs.melinda.co.id/rawatjalan/histori-transaksi',
        cpptUrlTemplate: 'https://simrs.melinda.co.id/kasus/{medId}/datamedis/cppt',
        identityUrlTemplate: 'https://simrs.melinda.co.id/kasus/{medId}/datamedis',
        patientIdPrefix: 'med'
    },
    rsud_gambiran: {
        name: 'RSUD Gambiran',
        loginUrl: 'https://simrsg.kedirikota.go.id/login',
        historyUrl: 'https://simrsg.kedirikota.go.id/rawatjalan/histori-transaksi',
        cpptUrlTemplate: 'https://simrsg.kedirikota.go.id/kasus/{medId}/datamedis/cppt',
        identityUrlTemplate: 'https://simrsg.kedirikota.go.id/kasus/{medId}/datamedis',
        patientIdPrefix: 'gbr'
    }
};

let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
    }
    return browserInstance;
}

/**
 * Close browser instance
 */
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

/**
 * Get credentials from database
 */
async function getCredentials(source) {
    // pool.query already returns rows directly (no destructuring needed)
    const rows = await pool.query(
        'SELECT username_encrypted, password_encrypted FROM medify_credentials WHERE simrs_source = ? AND is_active = TRUE',
        [source]
    );

    if (!rows || rows.length === 0) {
        throw new Error(`No active credentials found for ${source}`);
    }

    return {
        username: decrypt(rows[0].username_encrypted),
        password: decrypt(rows[0].password_encrypted)
    };
}

/**
 * Save credentials to database
 */
async function saveCredentials(source, username, password) {
    const usernameEncrypted = encrypt(username);
    const passwordEncrypted = encrypt(password);

    await pool.query(
        `INSERT INTO medify_credentials (simrs_source, username_encrypted, password_encrypted)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            username_encrypted = VALUES(username_encrypted),
            password_encrypted = VALUES(password_encrypted),
            is_active = TRUE`,
        [source, usernameEncrypted, passwordEncrypted]
    );
}

/**
 * Login to SIMRS
 */
async function login(page, source) {
    const config = SIMRS_CONFIG[source];
    const credentials = await getCredentials(source);

    console.log(`[Medify] Logging in to ${config.name}...`);

    await page.goto(config.loginUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    // Check if already logged in (redirected away from login page)
    const currentUrl = page.url();
    if (!currentUrl.includes('login')) {
        console.log(`[Medify] Already logged in to ${config.name}`);
        return true;
    }

    // Try to find login form, but don't fail if not found (might be logged in)
    try {
        await page.waitForSelector('input[name="email"], input[name="username"]', { timeout: 10000 });
    } catch (e) {
        // Check again if we're logged in
        const urlNow = page.url();
        if (!urlNow.includes('login')) {
            console.log(`[Medify] Already logged in to ${config.name} (no login form found)`);
            return true;
        }
        throw new Error(`Login page not loading properly: ${e.message}`);
    }

    // Fill login form
    const emailInput = await page.$('input[name="email"]') || await page.$('input[name="username"]');
    const passwordInput = await page.$('input[name="password"]');

    if (!emailInput || !passwordInput) {
        throw new Error('Login form fields not found');
    }

    await emailInput.type(credentials.username, { delay: 50 });
    await passwordInput.type(credentials.password, { delay: 50 });

    // Submit form
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        page.click('button[type="submit"], input[type="submit"]')
    ]);

    // Check if login was successful
    const finalUrl = page.url();
    if (finalUrl.includes('login')) {
        throw new Error('Login failed - check credentials');
    }

    console.log(`[Medify] Successfully logged in to ${config.name}`);
    return true;
}

/**
 * Search for patient history
 */
async function searchPatientHistory(page, source, dateFrom, dateTo) {
    const config = SIMRS_CONFIG[source];

    console.log(`[Medify] Navigating to history page...`);
    await page.goto(config.historyUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    // Wait for the page to load
    await page.waitForSelector('table', { timeout: 10000 });
    await delay(2000);

    // Set date filter - use the actual Melinda form field IDs
    try {
        // First click Reset to clear all filters
        const resetBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button.btn-info');
            for (const btn of buttons) {
                if (btn.innerText.includes('Reset')) {
                    return btn;
                }
            }
            return null;
        });

        if (resetBtn) {
            console.log(`[Medify] Clicking reset button...`);
            await resetBtn.click();
            await delay(2000);
        }

        // Set dates using JavaScript to ensure they're properly set
        await page.evaluate((from, to) => {
            const fromEl = document.querySelector('#tanggalMulai');
            const toEl = document.querySelector('#tanggalAkhir');
            if (fromEl) {
                fromEl.value = from;
                fromEl.dispatchEvent(new Event('input', { bubbles: true }));
                fromEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (toEl) {
                toEl.value = to;
                toEl.dispatchEvent(new Event('input', { bubbles: true }));
                toEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, dateFrom, dateTo);

        console.log(`[Medify] Set date range: ${dateFrom} to ${dateTo}`);
        await delay(500);

        // Click the "Cari" button
        const searchBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button.btn-primary');
            for (const btn of buttons) {
                if (btn.innerText.includes('Cari')) {
                    return btn;
                }
            }
            return null;
        });

        if (searchBtn) {
            console.log(`[Medify] Clicking search button...`);
            await searchBtn.click();
            await delay(3000); // Wait for AJAX to load data
        }
    } catch (e) {
        console.log('[Medify] Could not set date filter:', e.message);
    }

    // Wait for table to update
    await delay(2000);

    // IMPORTANT: Change DataTable to show ALL rows before scraping
    try {
        const lengthChanged = await page.evaluate(() => {
            const lengthSelect = document.querySelector('select[name="historiTable_length"]');
            if (lengthSelect) {
                // Find "All" option (usually value="-1" or text="All"/"Semua")
                const allOption = Array.from(lengthSelect.options).find(o =>
                    o.value === '-1' || o.text.toLowerCase().includes('all') || o.text.toLowerCase().includes('semua')
                );
                if (allOption) {
                    lengthSelect.value = allOption.value;
                    lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, value: allOption.value, text: allOption.text };
                }
                // Fallback: use the largest available option
                const maxOption = Array.from(lengthSelect.options).reduce((max, opt) =>
                    parseInt(opt.value) > parseInt(max.value) ? opt : max
                );
                if (maxOption && parseInt(maxOption.value) > 10) {
                    lengthSelect.value = maxOption.value;
                    lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, value: maxOption.value, text: maxOption.text };
                }
            }
            return { success: false };
        });

        if (lengthChanged.success) {
            console.log(`[Medify] Changed DataTable to show: ${lengthChanged.text} (value: ${lengthChanged.value})`);
            await delay(3000); // Wait for table to reload with all rows
        } else {
            console.log(`[Medify] Could not change DataTable length - may only get partial results`);
        }
    } catch (e) {
        console.log('[Medify] Could not change DataTable length:', e.message);
    }

    // Extract patient list from table - ONLY Dr. Dibya's patients
    const patients = await page.evaluate((prefix) => {
        const rows = document.querySelectorAll('table tbody tr');
        const results = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
                // Get patient name from PASIEN column
                const patientCell = cells[2]; // Usually 3rd column
                const patientName = patientCell?.innerText?.trim() || '';

                // Get doctor name from DOKTER/DPJP column (usually 4th column)
                const doctorCell = cells[3];
                const doctorName = doctorCell?.innerText?.trim() || '';

                // FILTER: Only include patients handled by Dr. Dibya
                const isDibyaPatient = doctorName.toLowerCase().includes('dibya');
                if (!isDibyaPatient) {
                    return; // Skip this patient - not Dr. Dibya's patient
                }

                // Get date from TGL PEMERIKSAAN column
                const dateCell = cells[5]; // Usually 6th column
                const visitDate = dateCell?.innerText?.trim() || '';

                // Get medId from AKSI column link
                const actionCell = cells[cells.length - 1];
                const actionLink = actionCell?.querySelector('a[href*="/kasus/"]');
                let medId = null;

                if (actionLink) {
                    const href = actionLink.getAttribute('href');
                    const match = href.match(/\/kasus\/([\w]+)/);
                    if (match) {
                        medId = match[1];
                    }
                }

                if (patientName && medId) {
                    results.push({
                        name: patientName,
                        medId: medId,
                        visitDate: visitDate,
                        doctor: doctorName
                    });
                }
            }
        });

        return results;
    }, config.patientIdPrefix);

    console.log(`[Medify] Found ${patients.length} Dr. Dibya patients in history (filtered)`);
    return patients;
}

/**
 * Extract patient identity from datamedis page
 */
async function extractPatientIdentity(page, source, medId) {
    const config = SIMRS_CONFIG[source];
    const url = config.identityUrlTemplate.replace('{medId}', medId);

    console.log(`[Medify] Extracting identity for ${medId}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await delay(1000);

    const identity = await page.evaluate(() => {
        const data = {};
        const pageText = document.body.innerText;

        // Extract patient info using regex
        const patterns = {
            nama: /NAMA\s*PASIEN[\s:]+([A-Z\s.]+?)(?=\n|JENIS|STATUS|NIK)/i,
            jenis_kelamin: /JENIS\s*KELAMIN[\s:]+(\w+)/i,
            tanggal_lahir: /(?:TEMPAT.*?TANGGAL\s*LAHIR|TTL|TANGGAL\s*LAHIR)[\s:,]+([^\n]+)/i,
            alamat: /ALAMAT[\s:]+([^\n]+)/i,
            no_hp: /NO\s*HP[\s:]+(\d{10,13})/i,
            no_identitas: /(?:NO\s*IDENTITAS|NIK)[\s:]+(\d{16})/i,
            usia: /USIA[\s:]+(\d+)/i
        };

        for (const [field, pattern] of Object.entries(patterns)) {
            const match = pageText.match(pattern);
            if (match) {
                data[field] = match[1].trim();
            }
        }

        return data;
    });

    return identity;
}

/**
 * Extract CPPT from page
 */
async function extractCPPT(page, source, medId) {
    const config = SIMRS_CONFIG[source];
    const url = config.cpptUrlTemplate.replace('{medId}', medId);

    console.log(`[Medify] Extracting CPPT for ${medId}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await delay(3000);

    // Click all expand buttons to show CPPT content (try multiple selectors)
    const expandedCount = await page.evaluate(() => {
        let clicked = 0;

        // Try various expand button selectors
        const expandSelectors = [
            'button .si-arrow-down',
            'button.btn-block-option i.si-arrow-down',
            '.btn-toggle',
            'button[data-toggle="collapse"]',
            '.collapse-toggle',
            'a[data-toggle="collapse"]',
            '.accordion-toggle',
            '.card-header button',
            'button.collapsed',
            // Gambiran specific selectors
            '.block-header button',
            '.block-options button',
            '.toggle-cppt'
        ];

        for (const sel of expandSelectors) {
            document.querySelectorAll(sel).forEach(el => {
                const btn = el.closest('button') || el;
                try {
                    btn.click();
                    clicked++;
                } catch (e) {}
            });
        }

        return clicked;
    });
    console.log(`[Medify] Clicked ${expandedCount} expand buttons`);
    await delay(2000);

    // Debug: Log page structure
    const pageInfo = await page.evaluate(() => {
        return {
            hasSubjective: document.body.innerText.includes('SUBJECTIVE') || document.body.innerText.includes('Subjective'),
            hasObjective: document.body.innerText.includes('OBJECTIVE') || document.body.innerText.includes('Objective'),
            textLength: document.body.innerText.length,
            blockCount: document.querySelectorAll('.block').length,
            cardCount: document.querySelectorAll('.card').length,
            tables: document.querySelectorAll('table').length
        };
    });
    console.log(`[Medify] CPPT page info:`, pageInfo);

    // Get CPPT content - ONLY from Dr. Dibya's entries, not nurses or other doctors
    const text = await page.evaluate(() => {
        const fullText = document.body.innerText;

        // IMPORTANT: Filter to only Dr. Dibya's CPPT entries
        // CPPT entries are usually in format:
        // "CPPT 1 DD-MM-YYYY Dokter - dr. Dibya Arfianda, SpOG..."
        // or "Dibuat Oleh\ndr. Dibya..."
        // We need to find sections that contain "Dibya" as the author

        // Split the page into individual CPPT entries
        // Each CPPT entry typically starts with "CPPT \d+" or "Catatan Perkembangan"
        const cpptEntryPattern = /(?:CPPT\s*\d+|Catatan\s*Perkembangan|SOAP\s*\d*)/gi;
        const entries = fullText.split(cpptEntryPattern);

        // Find entries authored by Dr. Dibya
        // Dr. Dibya's entries contain variations like:
        // - "dr. Dibya Arfianda"
        // - "Dibya Arfianda, SpOG"
        // - "Dokter - dr. Dibya"
        const dibyaPatterns = [
            /dibya\s*arfianda/i,
            /dr\.?\s*dibya/i,
            /Dibya.*SpOG/i,
            /Dokter\s*[-:]\s*.*dibya/i
        ];

        let dibyaText = '';
        let foundDibyaEntry = false;

        // Check each segment for Dr. Dibya's authorship
        // IMPORTANT: Only take the FIRST (most recent) Dr. Dibya entry, not all entries!
        // CPPT entries are in reverse chronological order (newest first)
        // CRITICAL: Entry must contain BOTH Dr. Dibya AND SOAP content (SUBJECTIVE/OBJECTIVE)
        //           to avoid matching page header which has "DPJP Utama: dr. DIBYA"
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const isDibyaEntry = dibyaPatterns.some(pattern => pattern.test(entry));
            const hasSOAPContent = /SUBJECTIVE|OBJECTIVE|Subjective|Objective|SUBYEKTIF|OBYEKTIF/i.test(entry);

            // Must have BOTH Dr. Dibya AND SOAP content - skip page header/navigation
            if (isDibyaEntry && hasSOAPContent) {
                foundDibyaEntry = true;
                // Extract ONLY this entry (the most recent one) - DO NOT combine multiple entries
                dibyaText = entry;
                break; // Stop after finding the first (most recent) Dr. Dibya entry
            }
        }

        // If no explicit Dr. Dibya entries found, try alternative approach:
        // Find text blocks from SUBJECTIVE to Dr. Dibya's signature
        if (!foundDibyaEntry) {
            // Look for Dr. Dibya's signature in the text and extract SOAP content BEFORE it
            const dibyaMatch = fullText.match(/dibya\s*arfianda|dr\.?\s*dibya/i);
            if (dibyaMatch) {
                const dibyaIdx = fullText.search(/dibya\s*arfianda|dr\.?\s*dibya/i);

                // Find the SUBJECTIVE that precedes this entry
                const textBefore = fullText.substring(0, dibyaIdx);
                const lastSubjective = textBefore.lastIndexOf('SUBJECTIVE');
                const lastSubjectif = textBefore.lastIndexOf('Subjective');
                const lastSubyektif = textBefore.lastIndexOf('SUBYEKTIF');

                const cpptStart = Math.max(lastSubjective, lastSubjectif, lastSubyektif);

                if (cpptStart !== -1) {
                    // End at the signature line (include a bit after "Dibya" to get full signature)
                    // Stop before the next CPPT entry or other doctor/nurse
                    const signatureEnd = Math.min(dibyaIdx + 100, fullText.length);
                    dibyaText = fullText.substring(cpptStart, signatureEnd);
                    foundDibyaEntry = true;
                }
            }
        }

        // NO FALLBACK - If no Dr. Dibya entry found, return empty string
        // This will cause the patient to be skipped (no data from other doctors/nurses)
        if (!foundDibyaEntry || !dibyaText.trim()) {
            console.warn('[CPPT] No Dr. Dibya entry found - skipping this patient');
            return '';
        }

        // Clean up the text
        let text = dibyaText
            .replace(/\t+/g, ' ')
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        // Limit to 20000 chars for AI parsing
        if (text.length > 20000) {
            text = text.substring(0, 20000);
        }

        return text;
    });

    console.log(`[Medify] Extracted CPPT text length: ${text.length}, contains Dibya: ${/dibya/i.test(text)}`);

    // If no text extracted (no Dr. Dibya entry), return empty
    if (!text || text.length < 50) {
        console.log(`[Medify] No Dr. Dibya CPPT found, skipping patient`);
        return {
            rawText: '',
            structured: { subjective: {}, objective: {}, assessment: {}, plan: {} },
            skipReason: 'no_dibya_cppt'
        };
    }

    // Parse structured CPPT data FROM THE FILTERED TEXT (not full page)
    // This ensures we only parse Dr. Dibya's entries
    const cpptData = await page.evaluate((dibyaText) => {
        const cpptData = {
            subjective: {},
            objective: {},
            assessment: {},
            plan: {}
        };

        // Use the filtered Dr. Dibya text, not full page
        const pageText = dibyaText;

        // Parse SUBJECTIVE section
        const subjectiveMatch = pageText.match(/SUBJECTIVE([\s\S]*?)(?=OBJECTIVE|$)/i);
        if (subjectiveMatch) {
            const subText = subjectiveMatch[1];

            const keluhanMatch = subText.match(/Keluhan\s*Utama\s*:?\s*([^\n]+)/i);
            if (keluhanMatch) cpptData.subjective.keluhan_utama = keluhanMatch[1].trim();

            const hplMatch = subText.match(/HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hplMatch) cpptData.subjective.hpl = hplMatch[1];

            const hphtMatch = subText.match(/HPHT\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hphtMatch) cpptData.subjective.hpht = hphtMatch[1];
        }

        // Parse OBJECTIVE section
        const objectiveMatch = pageText.match(/OBJECTIVE([\s\S]*?)(?=ASSESSMENT|$)/i);
        if (objectiveMatch) {
            const objText = objectiveMatch[1];

            const tensiMatch = objText.match(/Tensi\s*:?\s*(\d+\/\d+)/i);
            if (tensiMatch) cpptData.objective.tensi = tensiMatch[1];

            const nadiMatch = objText.match(/Nadi\s*:?\s*(\d+)/i);
            if (nadiMatch) cpptData.objective.nadi = parseInt(nadiMatch[1]);

            const bbMatch = objText.match(/BB\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (bbMatch) cpptData.objective.berat_badan = parseFloat(bbMatch[1].replace(',', '.'));
        }

        // Parse ASSESSMENT section - try multiple patterns (Gambiran may use different labels)
        const assessmentPatterns = [
            /ASSESSMENT([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,
            /ASSESMEN([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,      // Indonesian variant
            /ASSESMENT([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,     // Typo variant
            /A\s*:\s*([\s\S]*?)(?=P\s*:|PLAN|$)/i                     // SOAP format A:
        ];

        let assText = null;
        for (const pattern of assessmentPatterns) {
            const match = pageText.match(pattern);
            if (match) {
                assText = match[1].trim();
                break;
            }
        }

        if (assText) {
            // Get ALL lines as diagnosis (join with space, not just first line)
            // This captures full diagnosis like "G2P0101 uk 9 3/7mgg + kepala + TB"
            const lines = assText.split('\n').filter(l => l.trim());
            if (lines.length > 0) {
                // Join all meaningful lines for full diagnosis
                cpptData.assessment.diagnosis = lines.slice(0, 3).join(' ').trim();
            }

            // Parse obstetric formula (MEDIFY format: G2P0101)
            const medifyMatch = assText.match(/G(\d+)P(\d)(\d)(\d)(\d)/i);
            if (medifyMatch) {
                cpptData.assessment.gravida = parseInt(medifyMatch[1]);
                cpptData.assessment.para = parseInt(medifyMatch[2]) + parseInt(medifyMatch[3]); // Aterm + Premature
                cpptData.assessment.abortus = parseInt(medifyMatch[4]);
                cpptData.assessment.anak_hidup = parseInt(medifyMatch[5]);
                cpptData.assessment.is_obstetric = true;
            } else {
                // Try dash format: G1 P0-0 or G2P1-1
                const dashMatch = assText.match(/G(\d+)\s*P(\d+)-(\d+)/i);
                if (dashMatch) {
                    cpptData.assessment.gravida = parseInt(dashMatch[1]);
                    cpptData.assessment.para = parseInt(dashMatch[2]);
                    cpptData.assessment.abortus = 0;
                    cpptData.assessment.anak_hidup = parseInt(dashMatch[3]);
                    cpptData.assessment.is_obstetric = true;
                } else {
                    // Standard format
                    const obsMatch = assText.match(/G(\d+)\s*P([\d\-]+)/i);
                    if (obsMatch) {
                        cpptData.assessment.gravida = parseInt(obsMatch[1]);
                        cpptData.assessment.para = parseInt(obsMatch[2]);
                        cpptData.assessment.is_obstetric = true;
                    }
                }
            }

            // Parse gestational age
            const ukMatch = assText.match(/uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
            if (ukMatch) {
                cpptData.assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
                cpptData.assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
            }
        }

        // Parse PLAN section
        const planMatch = pageText.match(/(?:PLAN|PLANNING)([\s\S]*?)(?=Dibuat|TTD|$)/i);
        if (planMatch) {
            const planText = planMatch[1].trim();
            cpptData.plan.raw = planText;
        }

        return cpptData;
    }, text);  // Pass the filtered Dr. Dibya text as parameter

    return {
        rawText: text,
        structured: cpptData
    };
}

/**
 * Calculate patient age from birth date
 */
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

/**
 * Normalize name for comparison
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/^(ny\.?|tn\.?|sdr\.?|sdri\.?|dr\.?|drg\.?)\s*/i, '')
        .replace(/[.,]/g, '')
        .trim();
}

/**
 * Levenshtein distance for fuzzy name matching
 */
function levenshtein(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Check if names match (fuzzy)
 */
function isNameMatch(name1, name2) {
    const n1 = normalizeName(name1);
    const n2 = normalizeName(name2);

    if (!n1 || !n2) return false;

    // Exact match
    if (n1 === n2) return true;

    // Check if any name part matches
    const parts1 = n1.split(/\s+/);
    const parts2 = n2.split(/\s+/);

    return parts1.some(p1 =>
        parts2.some(p2 => p1 === p2 || (p1.length >= 3 && p2.length >= 3 && levenshtein(p1, p2) <= 1))
    );
}

/**
 * Extract address keywords for comparison
 */
function extractAddressKeywords(address) {
    if (!address) return [];

    const keywords = [];
    const addr = address.toLowerCase();

    // Extract RT/RW
    const rtRwMatch = addr.match(/rt\s*\.?\s*(\d+)\s*[\/\-]\s*rw\s*\.?\s*(\d+)/i);
    if (rtRwMatch) {
        keywords.push(`rt${rtRwMatch[1]}rw${rtRwMatch[2]}`);
    }

    // Extract kelurahan/desa
    const kelMatch = addr.match(/(?:kel\.?|desa\.?|ds\.?)\s*(\w+)/i);
    if (kelMatch) {
        keywords.push(kelMatch[1]);
    }

    // Extract kecamatan
    const kecMatch = addr.match(/(?:kec\.?|kecamatan)\s*(\w+)/i);
    if (kecMatch) {
        keywords.push(kecMatch[1]);
    }

    // Extract common area names
    const words = addr.split(/[\s,\/]+/);
    words.forEach(w => {
        if (w.length >= 4 && !['jalan', 'jl', 'gang', 'gg', 'nomor', 'no'].includes(w)) {
            keywords.push(w);
        }
    });

    return keywords;
}

/**
 * Check if addresses are similar
 */
function isAddressSimilar(addr1, addr2) {
    const keywords1 = extractAddressKeywords(addr1);
    const keywords2 = extractAddressKeywords(addr2);

    if (keywords1.length === 0 || keywords2.length === 0) return false;

    return keywords1.some(k => keywords2.includes(k));
}

/**
 * Count matching factors between SIMRS patient and Dibya patient
 */
function countMatchingFactors(simrsPatient, dibyaPatient) {
    let matchCount = 0;
    const factors = [];

    // Debug: Log extracted identity for comparison
    console.log(`[Medify] Identity extracted:`, {
        simrs_nama: simrsPatient.nama || simrsPatient.name,
        simrs_hp: simrsPatient.no_hp,
        simrs_dob: simrsPatient.tanggal_lahir,
        simrs_age: simrsPatient.usia,
        dibya_name: dibyaPatient.full_name,
        dibya_phone: dibyaPatient.whatsapp || dibyaPatient.phone,
        dibya_dob: dibyaPatient.birth_date
    });

    // Factor 1: Name similarity
    if (isNameMatch(simrsPatient.nama || simrsPatient.name, dibyaPatient.full_name)) {
        matchCount++;
        factors.push('name');
    }

    // Factor 2: Age match (exact or ±1 year)
    const simrsAge = simrsPatient.usia ? parseInt(simrsPatient.usia) : null;
    const dibyaAge = dibyaPatient.age || calculateAge(dibyaPatient.birth_date);

    if (simrsAge && dibyaAge) {
        const ageDiff = Math.abs(simrsAge - dibyaAge);
        if (ageDiff <= 1) {
            matchCount++;
            factors.push('age');
        }
    }

    // Factor 3: Date of birth match
    if (simrsPatient.tanggal_lahir && dibyaPatient.birth_date) {
        // Normalize dates for comparison
        const simrsDob = normalizeDate(simrsPatient.tanggal_lahir);
        const dibyaDob = normalizeDate(dibyaPatient.birth_date);
        if (simrsDob && dibyaDob && simrsDob === dibyaDob) {
            matchCount++;
            factors.push('dob');
        }
    }

    // Factor 4: Address similarity
    if (isAddressSimilar(simrsPatient.alamat, dibyaPatient.alamat || '')) {
        matchCount++;
        factors.push('address');
    }

    // Factor 5: Phone number match
    if (simrsPatient.no_hp) {
        const simrsPhone = normalizePhone(simrsPatient.no_hp);
        const dibyaPhone = normalizePhone(dibyaPatient.whatsapp || dibyaPatient.phone || '');
        if (simrsPhone && dibyaPhone && simrsPhone === dibyaPhone) {
            matchCount++;
            factors.push('phone');
        }
    }

    return { matchCount, factors };
}

/**
 * Normalize phone number for comparison (remove non-digits, handle +62/0 prefix)
 */
function normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters
    let digits = String(phone).replace(/\D/g, '');
    // Handle Indonesian phone prefixes
    if (digits.startsWith('62')) {
        digits = '0' + digits.substring(2);
    } else if (digits.startsWith('8') && digits.length >= 10) {
        digits = '0' + digits;
    }
    // Return last 10-12 digits (ignore country code variations)
    if (digits.length > 12) {
        digits = digits.slice(-12);
    }
    return digits.length >= 10 ? digits : null;
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(dateInput) {
    if (!dateInput) return null;

    // Handle Date objects from MySQL
    if (dateInput instanceof Date) {
        const year = dateInput.getFullYear();
        const month = String(dateInput.getMonth() + 1).padStart(2, '0');
        const day = String(dateInput.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Convert to string if not already
    const dateStr = String(dateInput);

    // Handle already formatted dates
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    // Handle DD/MM/YYYY or DD-MM-YYYY
    const match = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (match) {
        let [_, day, month, year] = match;
        if (year.length === 2) {
            year = parseInt(year) > 50 ? '19' + year : '20' + year;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return null;
}

/**
 * Find best matching patient in SIMRS results
 */
function findBestMatch(simrsPatients, dibyaPatient) {
    const MIN_MATCH_FACTORS = 3;

    const results = simrsPatients.map(sp => ({
        patient: sp,
        ...countMatchingFactors(sp, dibyaPatient)
    }));

    const bestMatch = results
        .filter(r => r.matchCount >= MIN_MATCH_FACTORS)
        .sort((a, b) => b.matchCount - a.matchCount)[0];

    if (!bestMatch) {
        return {
            found: false,
            reason: 'Less than 3 matching factors',
            candidates: results.filter(r => r.matchCount >= 2).map(r => ({
                name: r.patient.nama || r.patient.name,
                matchCount: r.matchCount,
                factors: r.factors
            }))
        };
    }

    return {
        found: true,
        patient: bestMatch.patient,
        matchCount: bestMatch.matchCount,
        factors: bestMatch.factors
    };
}

/**
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process a single patient import
 */
async function processPatientImport(source, dibyaPatient, options = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Login
        await login(page, source);

        // Get patient history from last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const dateFrom = thirtyDaysAgo.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const dateTo = today.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const patients = await searchPatientHistory(page, source, dateFrom, dateTo);

        // Find matching patient
        const matchResult = findBestMatch(patients, dibyaPatient);

        if (!matchResult.found) {
            await page.close();
            return {
                success: false,
                status: 'skipped',
                reason: matchResult.reason,
                candidates: matchResult.candidates
            };
        }

        // Extract CPPT
        const cpptResult = await extractCPPT(page, source, matchResult.patient.medId);

        // Extract identity
        const identity = await extractPatientIdentity(page, source, matchResult.patient.medId);

        await page.close();

        return {
            success: true,
            status: 'success',
            simrsPatient: matchResult.patient,
            matchCount: matchResult.matchCount,
            factors: matchResult.factors,
            cppt: cpptResult,
            identity: identity
        };

    } catch (error) {
        await page.close();
        throw error;
    }
}

module.exports = {
    getBrowser,
    closeBrowser,
    login,
    searchPatientHistory,
    extractPatientIdentity,
    extractCPPT,
    processPatientImport,
    saveCredentials,
    getCredentials,
    countMatchingFactors,
    findBestMatch,
    SIMRS_CONFIG,
    delay
};
