/**
 * MEDIFY HTTP Service
 * Lightweight HTTP-based alternative to Puppeteer for SIMRS scraping.
 * Uses direct HTTP requests instead of headless browser (~95% less RAM).
 *
 * Usage:
 *   const httpService = require('./medifyHttpService');
 *   const session = httpService.createSession('rsia_melinda');
 *   await session.login();
 *   const patients = await session.searchPatientHistory(dateFrom, dateTo);
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { decrypt } = require('../utils/encryption');
const pool = require('../utils/database');

// Import matching utilities and config from puppeteer service (shared logic)
const puppeteerService = require('./medifyPuppeteerService');
const SIMRS_CONFIG = puppeteerService.SIMRS_CONFIG;

/**
 * Simple concurrency limiter (replaces p-limit dependency)
 */
function pLimit(concurrency) {
    const queue = [];
    let running = 0;

    function next() {
        while (running < concurrency && queue.length > 0) {
            running++;
            const { fn, resolve, reject } = queue.shift();
            fn().then(resolve, reject).finally(() => {
                running--;
                next();
            });
        }
    }

    return function limit(fn) {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            next();
        });
    };
}

function normalizeStructuredLine(line) {
    return String(line || '')
        .replace(/\r/g, '')
        .replace(/^[\s\-•*]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function appendStructuredText(existingValue, nextValue) {
    const current = normalizeStructuredLine(existingValue);
    const next = normalizeStructuredLine(nextValue);

    if (!next) {
        return current;
    }

    if (!current) {
        return next;
    }

    return current.includes(next) ? current : `${current} ${next}`.trim();
}

function isAssessmentHeaderLine(line) {
    const normalized = normalizeStructuredLine(line);
    if (!normalized) {
        return true;
    }

    return /^(?:ICD\s*10(?:\s+Tipe)?|Tipe|Type|Utama|Sekunder|Differential|Diferensial|Rule\s*Out|No|Kode|Code|\-|\.)$/i.test(normalized);
}

function buildAssessmentDiagnosisText(assessmentText) {
    const lines = String(assessmentText || '')
        .split('\n')
        .map(normalizeStructuredLine)
        .filter(line => line && !isAssessmentHeaderLine(line));

    if (lines.length === 0) {
        return '';
    }

    return lines.slice(0, 3).join(' ').trim();
}

function parseStructuredCPPTText(text) {
    const cpptData = {
        subjective: {},
        objective: {},
        assessment: {},
        plan: {}
    };

    const subjectiveMatch = text.match(/SUBJECTIVE([\s\S]*?)(?=OBJECTIVE|$)/i);
    if (subjectiveMatch) {
        const subText = subjectiveMatch[1];
        const lines = subText.split(/\n+/).map(normalizeStructuredLine).filter(Boolean);
        const freeTextLines = [];

        for (const line of lines) {
            let match = null;

            match = line.match(/^Keluhan\s*Utama\s*:?\s*(.+)$/i);
            if (match) {
                cpptData.subjective.keluhan_utama = appendStructuredText(cpptData.subjective.keluhan_utama, match[1]);
                continue;
            }

            match = line.match(/^HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (match) {
                cpptData.subjective.hpl = match[1];
                continue;
            }

            match = line.match(/^HPHT\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (match) {
                cpptData.subjective.hpht = match[1];
                continue;
            }

            match = line.match(/^(?:RPS|Riwayat\s*Penyakit\s*Sekarang)\s*:?\s*(.+)$/i);
            if (match) {
                cpptData.subjective.rps = appendStructuredText(cpptData.subjective.rps, match[1]);
                continue;
            }

            match = line.match(/^(?:\+?\s*PBL|PBL|RPD|Riwayat\s*Penyakit\s*Dahulu)\s*:?\s*(.+)$/i);
            if (match) {
                cpptData.subjective.rpd = appendStructuredText(cpptData.subjective.rpd, match[1]);
                continue;
            }

            match = line.match(/^(?:RPK|Riwayat\s*Penyakit\s*Keluarga)\s*:?\s*(.+)$/i);
            if (match) {
                cpptData.subjective.rpk = appendStructuredText(cpptData.subjective.rpk, match[1]);
                continue;
            }

            freeTextLines.push(line);
        }

        const freeText = freeTextLines.join(' ').trim();
        if (freeText) {
            if (!cpptData.subjective.keluhan_utama) {
                cpptData.subjective.keluhan_utama = freeText;
            }

            if (!cpptData.subjective.rps) {
                cpptData.subjective.rps = freeText;
            }
        }
    }

    const objectiveMatch = text.match(/OBJECTIVE([\s\S]*?)(?=ASSESSMENT|ASSESMEN|$)/i);
    if (objectiveMatch) {
        const objText = objectiveMatch[1];

        const tensiMatch = objText.match(/(?:Tensi|TD|Tekanan\s*Darah)\s*:?\s*(\d+\/\d+)/i);
        if (tensiMatch) cpptData.objective.tensi = tensiMatch[1];

        const nadiMatch = objText.match(/Nadi\s*:?\s*(\d+)/i);
        if (nadiMatch) cpptData.objective.nadi = parseInt(nadiMatch[1], 10);

        const suhuMatch = objText.match(/Suhu\s*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (suhuMatch) cpptData.objective.suhu = parseFloat(suhuMatch[1].replace(',', '.'));

        const spo2Match = objText.match(/SpO2\s*:?\s*(\d+)/i);
        if (spo2Match) cpptData.objective.spo2 = parseInt(spo2Match[1], 10);

        const rrMatch = objText.match(/(?:RR|Respirasi)\s*:?\s*(\d+)/i);
        if (rrMatch) cpptData.objective.rr = parseInt(rrMatch[1], 10);

        const bbMatch = objText.match(/(?:BB|Berat\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (bbMatch) cpptData.objective.berat_badan = parseFloat(bbMatch[1].replace(',', '.'));

        const tbMatch = objText.match(/(?:TB|Tinggi\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (tbMatch) cpptData.objective.tinggi_badan = parseFloat(tbMatch[1].replace(',', '.'));

        const gcsMatch = objText.match(/GCS\s*:?\s*E\s*:?\s*(\d)\s*V\s*:?\s*(\d)\s*M\s*:?\s*(\d)/i)
            || objText.match(/GCS\s*:?\s*E(\d)\s*V(\d)\s*M(\d)/i);
        if (gcsMatch) {
            cpptData.objective.gcs = `E${gcsMatch[1]} V${gcsMatch[2]} M${gcsMatch[3]}`;
        }

        const consciousnessMatch = objText.match(/Kesadaran\s*:?\s*([^,\n]+)/i);
        if (consciousnessMatch) {
            cpptData.objective.kesadaran = normalizeStructuredLine(consciousnessMatch[1]);
        }
    }

    const assessmentPatterns = [
        /ASSESSMENT([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,
        /ASSESMEN([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,
        /ASSESMENT([\s\S]*?)(?=PLAN|PLANNING|Dibuat|TTD|$)/i,
        /A\s*:\s*([\s\S]*?)(?=P\s*:|PLAN|$)/i
    ];

    let assText = null;
    for (const pattern of assessmentPatterns) {
        const match = text.match(pattern);
        if (match) {
            assText = match[1].trim();
            break;
        }
    }

    if (assText) {
        cpptData.assessment.diagnosis = buildAssessmentDiagnosisText(assText);

        const medifyMatch = assText.match(/G(\d+)P(\d)(\d)(\d)(\d)/i);
        if (medifyMatch) {
            cpptData.assessment.gravida = parseInt(medifyMatch[1], 10);
            cpptData.assessment.para = parseInt(medifyMatch[2], 10) + parseInt(medifyMatch[3], 10);
            cpptData.assessment.abortus = parseInt(medifyMatch[4], 10);
            cpptData.assessment.anak_hidup = parseInt(medifyMatch[5], 10);
            cpptData.assessment.is_obstetric = true;
        } else {
            const dashMatch = assText.match(/G(\d+)\s*P(\d+)-(\d+)/i);
            if (dashMatch) {
                cpptData.assessment.gravida = parseInt(dashMatch[1], 10);
                cpptData.assessment.para = parseInt(dashMatch[2], 10);
                cpptData.assessment.abortus = 0;
                cpptData.assessment.anak_hidup = parseInt(dashMatch[3], 10);
                cpptData.assessment.is_obstetric = true;
            } else {
                const obsMatch = assText.match(/G(\d+)\s*P([\d\-]+)/i);
                if (obsMatch) {
                    cpptData.assessment.gravida = parseInt(obsMatch[1], 10);
                    cpptData.assessment.para = parseInt(obsMatch[2], 10);
                    cpptData.assessment.is_obstetric = true;
                }
            }
        }

        const ukMatch = assText.match(/uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
        if (ukMatch) {
            cpptData.assessment.usia_kehamilan_minggu = parseInt(ukMatch[1], 10);
            cpptData.assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2], 10) : 0;
        }
    }

    const planMatch = text.match(/(?:PLAN|PLANNING)([\s\S]*?)(?=Dibuat|TTD|$)/i);
    if (planMatch) {
        const rawPlan = planMatch[1].trim();
        cpptData.plan.raw = rawPlan;

        const obat = [];
        const tindakan = [];
        const instruksi = [];
        const planLines = rawPlan.split(/\n+/).map(normalizeStructuredLine).filter(Boolean);

        for (const line of planLines) {
            if (/^(?:B\/|R\/)/i.test(line)) {
                obat.push(line);
                continue;
            }

            if (/^(?:Ruj\.?|Kontrol|Konsul|Follow\s*up|Observasi|Edukasi|Anjur|USG\s*ulang|Lab\s*ulang)/i.test(line)) {
                instruksi.push(line);
                continue;
            }

            tindakan.push(line);
        }

        if (obat.length > 0) {
            cpptData.plan.obat = obat;
        }

        if (tindakan.length > 0) {
            cpptData.plan.tindakan = tindakan;
        }

        if (instruksi.length > 0) {
            cpptData.plan.instruksi = instruksi;
        }
    }

    return cpptData;
}

/**
 * Get credentials from database (same as puppeteer service)
 */
async function getCredentials(source) {
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
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTTP Session for a single SIMRS source.
 * Manages cookies, CSRF tokens, and provides data extraction methods.
 */
class MedifyHttpSession {
    constructor(source) {
        this.source = source;
        this.config = SIMRS_CONFIG[source];
        if (!this.config) {
            throw new Error(`Unknown SIMRS source: ${source}`);
        }
        this.cookies = '';
        this.csrfToken = '';
        this.isLoggedIn = false;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Make an HTTP request with cookie and CSRF management.
     * Automatically follows redirects (up to 5 hops).
     */
    async request(url, options = {}) {
        const maxRedirects = options.maxRedirects ?? 5;
        let currentUrl = url;
        let redirectCount = 0;

        while (redirectCount <= maxRedirects) {
            const response = await this._rawRequest(currentUrl, options);

            // Capture cookies from every response
            const setCookies = response.headers['set-cookie'];
            if (setCookies) {
                this._updateCookies(Array.isArray(setCookies) ? setCookies : [setCookies]);
            }

            // Handle redirects
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                if (options.redirect === 'manual') {
                    return response;
                }
                const location = response.headers.location;
                currentUrl = location.startsWith('http')
                    ? location
                    : new URL(location, currentUrl).toString();
                redirectCount++;
                // Switch to GET after redirect (POST-Redirect-GET pattern)
                options = { ...options, method: 'GET', body: undefined };
                continue;
            }

            return response;
        }

        throw new Error(`Too many redirects (${maxRedirects})`);
    }

    /**
     * Raw HTTP request (no redirect following)
     */
    _rawRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;

            const headers = {
                'User-Agent': this.userAgent,
                'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                ...(options.headers || {})
            };

            if (this.cookies) {
                headers['Cookie'] = this.cookies;
            }

            if (options.body) {
                headers['Content-Length'] = Buffer.byteLength(options.body);
            }

            const reqOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers,
                timeout: options.timeout || 30000,
                rejectUnauthorized: false // Some hospital SIMRS use self-signed certs
            };

            const req = client.request(reqOptions, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf-8')
                    });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout: ${url}`));
            });

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    /**
     * Update stored cookies from Set-Cookie headers
     */
    _updateCookies(setCookieHeaders) {
        const existing = this._parseCookieString(this.cookies);

        for (const header of setCookieHeaders) {
            const cookie = header.split(';')[0];
            const eqIdx = cookie.indexOf('=');
            if (eqIdx > 0) {
                const name = cookie.substring(0, eqIdx).trim();
                const value = cookie.substring(eqIdx + 1).trim();
                existing[name] = value;
            }
        }

        this.cookies = Object.entries(existing)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    /**
     * Parse a cookie string into key-value pairs
     */
    _parseCookieString(cookieStr) {
        if (!cookieStr) return {};
        const cookies = {};
        cookieStr.split(';').forEach(c => {
            const eqIdx = c.indexOf('=');
            if (eqIdx > 0) {
                cookies[c.substring(0, eqIdx).trim()] = c.substring(eqIdx + 1).trim();
            }
        });
        return cookies;
    }

    /**
     * Login to SIMRS and establish session
     */
    async login() {
        const credentials = await getCredentials(this.source);
        console.log(`[HTTP] Logging in to ${this.config.name}...`);

        // Step 1: GET login page to get CSRF token and session cookie
        const loginPage = await this.request(this.config.loginUrl, { redirect: 'manual' });

        // If redirected away from login, we're already logged in
        if (loginPage.status >= 300 && loginPage.headers.location && !loginPage.headers.location.includes('login')) {
            console.log(`[HTTP] Already logged in to ${this.config.name}`);
            this.isLoggedIn = true;
            return true;
        }

        // Follow redirect to get the actual login page
        let loginHtml = loginPage.body;
        if (loginPage.status >= 300 && loginPage.headers.location) {
            const redirected = await this.request(loginPage.headers.location);
            loginHtml = redirected.body;
        }

        // Extract CSRF token from HTML
        this.csrfToken = this._extractCsrfToken(loginHtml);

        // Also check XSRF-TOKEN cookie (Laravel's cookie-based CSRF)
        const cookieObj = this._parseCookieString(this.cookies);
        if (!this.csrfToken && cookieObj['XSRF-TOKEN']) {
            this.csrfToken = decodeURIComponent(cookieObj['XSRF-TOKEN']);
        }

        if (!this.csrfToken) {
            console.warn(`[HTTP] No CSRF token found, attempting login without it`);
        }

        // Step 2: POST login credentials
        const formParts = [
            `email=${encodeURIComponent(credentials.username)}`,
            `password=${encodeURIComponent(credentials.password)}`
        ];
        if (this.csrfToken) {
            formParts.push(`_token=${encodeURIComponent(this.csrfToken)}`);
        }

        const loginResponse = await this.request(this.config.loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': this.config.loginUrl,
                'Origin': new URL(this.config.loginUrl).origin
            },
            body: formParts.join('&'),
            redirect: 'manual'
        });

        // Capture cookies from login response
        if (loginResponse.headers['set-cookie']) {
            const sc = loginResponse.headers['set-cookie'];
            this._updateCookies(Array.isArray(sc) ? sc : [sc]);
        }

        // Successful login usually redirects (302) to dashboard
        if (loginResponse.status >= 300 && loginResponse.status < 400) {
            const location = loginResponse.headers.location || '';
            if (!location.includes('login')) {
                console.log(`[HTTP] Login successful for ${this.config.name}`);
                this.isLoggedIn = true;
                return true;
            }
        }

        // Sometimes login returns 200 with redirect in body (JavaScript redirect)
        if (loginResponse.status === 200 && !loginResponse.body.includes('login-form') && !loginResponse.body.includes('Login gagal')) {
            // Verify by accessing history page
            const testResponse = await this._rawRequest(this.config.historyUrl, {});
            if (testResponse.headers['set-cookie']) {
                this._updateCookies(Array.isArray(testResponse.headers['set-cookie'])
                    ? testResponse.headers['set-cookie'] : [testResponse.headers['set-cookie']]);
            }
            if (testResponse.status === 200 || (testResponse.status >= 300 && !testResponse.headers.location?.includes('login'))) {
                console.log(`[HTTP] Login successful for ${this.config.name} (verified)`);
                this.isLoggedIn = true;
                return true;
            }
        }

        throw new Error(`Login failed for ${this.config.name} - check credentials`);
    }

    /**
     * Search patient history for a date range.
     * Returns array of { name, medId, visitDate, doctor }
     */
    async searchPatientHistory(dateFrom, dateTo) {
        if (!this.isLoggedIn) throw new Error('Not authenticated - call login() first');

        console.log(`[HTTP] Fetching history for ${dateFrom} to ${dateTo}...`);

        // Strategy 1: Try DataTables server-side AJAX endpoint
        let patients = await this._tryDataTablesAjax(dateFrom, dateTo);

        // Strategy 2: Fall back to full HTML page parsing
        if (patients.length === 0) {
            console.log(`[HTTP] DataTables AJAX returned no results, trying HTML parsing...`);
            patients = await this._parseHistoryPageHtml(dateFrom, dateTo);
        }

        // Filter to Dr. Dibya's patients only
        const dibyaPatients = patients.filter(p => {
            const doctor = (p.doctor || '').toLowerCase();
            return doctor.includes('dibya');
        });

        console.log(`[HTTP] Found ${dibyaPatients.length} Dr. Dibya patients (from ${patients.length} total)`);
        return dibyaPatients;
    }

    /**
     * Fetch current polyclinic queue for the source.
     * Returns stats and current queue items parsed from the live Medify page.
     */
    async getPolyclinicQueue(options = {}) {
        if (!this.isLoggedIn) throw new Error('Not authenticated - call login() first');

        const queueUrl = options.queueUrl || this._buildPolyclinicUrl(options);
        const response = await this.request(queueUrl, {
            headers: {
                'Referer': this.config.historyUrl
            }
        });

        if (response.status !== 200) {
            throw new Error(`Failed to fetch polyclinic queue (${response.status})`);
        }

        return this._parsePolyclinicQueue(response.body, {
            queueUrl,
            doctorFilter: options.doctorFilter || 'Semua Dokter',
            clinicLabel: options.clinicLabel || 'Poli Obgyn',
            onlyToday: options.onlyToday !== false
        });
    }

    _buildPolyclinicUrl(options = {}) {
        const baseUrl = new URL(this.config.historyUrl);
        const queueUrl = new URL('/rawatjalan/poliklinik', `${baseUrl.protocol}//${baseUrl.host}`);

        queueUrl.searchParams.set('poli_id', options.poliId || '1');
        queueUrl.searchParams.set('group_id', options.groupId || '0');
        queueUrl.searchParams.set('show_id', options.showId || '0');
        queueUrl.searchParams.set('by_dokter', options.byDokter || '0');

        return queueUrl.toString();
    }

    _parsePolyclinicQueue(html, meta = {}) {
        const text = this._htmlToText(html);
        const queueNumberPattern = '[A-Z]{2,4}-[A-Z]-\\d+';
        const medIdByQueueNumber = new Map();
        const supplementalByQueueNumber = this._extractTransaksiQueueSupplemental(html);

        for (const [queueNumber, supplemental] of supplementalByQueueNumber.entries()) {
            if (supplemental.medId) {
                medIdByQueueNumber.set(queueNumber, supplemental.medId);
            }
        }

        for (const match of html.matchAll(new RegExp(`<h5[^>]*>\\s*(${queueNumberPattern})\\s*<\\/h5>[\\s\\S]*?data-nomor_kasus="([^"]+)"`, 'gi'))) {
            medIdByQueueNumber.set((match[1] || '').trim(), (match[2] || '').trim());
        }

        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        const extractStat = (label) => {
            const index = lines.findIndex(line => line.toUpperCase() === label);
            if (index === -1) {
                return 0;
            }

            const nextValue = lines[index + 1] || '';
            const parsed = parseInt(nextValue, 10);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const total = extractStat('TOTAL ANTRIAN');
        const waiting = extractStat('BELUM DILAYANI');
        const serving = extractStat('DILAYANI');

        const queueBlockRegex = new RegExp(`^${queueNumberPattern}`, 'i');
        const queueBlocks = text
            .split(new RegExp(`(?=${queueNumberPattern})`, 'g'))
            .filter(block => queueBlockRegex.test(block.trim()));

        let items = queueBlocks.map((block) => {
            const blockLines = block
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

            const queueNumber = blockLines[0] || '';
            const supplemental = supplementalByQueueNumber.get(queueNumber) || {};
            const patientName = blockLines[1] || '-';
            const medicalRecordLine = blockLines.find(line => /^NO\.RM:/i.test(line)) || '';
            const medicalRecordNo = medicalRecordLine.replace(/^NO\.RM:\s*/i, '').trim();

            const genderAgeIndex = blockLines.findIndex(line => /^(LAKI-LAKI|PEREMPUAN)\b/i.test(line));
            const genderAgeLine = genderAgeIndex >= 0
                ? `${blockLines[genderAgeIndex]} ${blockLines[genderAgeIndex + 1] || ''}`.trim()
                : '';
            const genderAgeMatch = genderAgeLine.match(/(LAKI-LAKI|PEREMPUAN)\s*,?\s*(\d+)?/i);

            const doctorName = blockLines.find(line => /^DR\./i.test(line) || /^dr\./i.test(line)) || '-';
            const registeredAtIndex = blockLines.findIndex(line => /WAKTU PENDAFTARAN/i.test(line));
            const registeredAt = registeredAtIndex >= 0
                ? (blockLines[registeredAtIndex + 1] || '-')
                : (supplemental.registeredAt || '-');

            const paymentStatus = /BELUM LUNAS/i.test(block)
                ? 'Belum Lunas'
                : (/\bLUNAS\b/i.test(block) ? 'Lunas' : (supplemental.paymentStatus || '-'));

            return {
                queueNumber,
                medId: medIdByQueueNumber.get(queueNumber) || null,
                identityNik: supplemental.identityNik || null,
                birthDate: supplemental.birthDate || null,
                patientName,
                medicalRecordNo,
                gender: genderAgeMatch ? genderAgeMatch[1] : (supplemental.gender || '-'),
                age: genderAgeMatch ? parseInt(genderAgeMatch[2], 10) : (supplemental.age ?? null),
                doctorName,
                registeredAt,
                paymentStatus,
                hasCppt: /\bCPPT\b/i.test(block) || Boolean(supplemental.hasCppt)
            };
        }).filter(item => item.queueNumber && item.patientName);

        if (meta.onlyToday) {
            const todayPrefix = this._getMedifyTodayPrefix();
            items = items.filter(item => item.registeredAt.startsWith(todayPrefix));
        }

        const normalizedServing = Number.isFinite(serving) ? serving : 0;
        const normalizedWaiting = items.length;
        const normalizedTotal = normalizedWaiting + normalizedServing;

        return {
            source: this.source,
            queueUrl: meta.queueUrl || '',
            clinicLabel: meta.clinicLabel || 'Poliklinik',
            doctorFilter: meta.doctorFilter || 'Semua Dokter',
            stats: {
                waiting: normalizedWaiting,
                serving: normalizedServing,
                total: normalizedTotal
            },
            items
        };
    }

    _extractTransaksiQueueSupplemental(html) {
        const transaksiJson = this._extractAssignedObjectLiteral(html, 'transaksi_data');
        if (!transaksiJson) {
            return new Map();
        }

        try {
            const transaksiData = JSON.parse(transaksiJson);
            const queueSupplemental = new Map();

            for (const transaksi of Object.values(transaksiData || {})) {
                const queueNumber = (transaksi?.nomor_antrian || '').trim();
                if (!queueNumber) {
                    continue;
                }

                const patientDetail = transaksi?.pasien_detail || {};
                const kasus = transaksi?.kasus || {};

                queueSupplemental.set(queueNumber, {
                    medId: typeof kasus.nomor_kasus === 'string' ? kasus.nomor_kasus.trim() : null,
                    identityNik: String(patientDetail.no_identitas || '').replace(/\D/g, '').trim() || null,
                    birthDate: patientDetail.date_of_birth || null,
                    gender: patientDetail.jenis_kelamin || this._normalizePatientGender(patientDetail.gender),
                    age: Number.isFinite(patientDetail.age)
                        ? patientDetail.age
                        : this._parsePatientAge(patientDetail.detailed_age_short || patientDetail.detailed_long_age),
                    registeredAt: this._formatQueueTimestamp(
                        transaksi?.ordered_at || transaksi?.waktu_masuk || patientDetail.antrian_at
                    ),
                    paymentStatus: this._normalizeQueuePaymentStatus(transaksi?.status_pembayaran),
                    hasCppt: Array.isArray(kasus.cppt_all) && kasus.cppt_all.length > 0
                });
            }

            return queueSupplemental;
        } catch (error) {
            console.log(`[HTTP] Failed to parse transaksi_data queue supplemental: ${error.message}`);
            return new Map();
        }
    }

    _extractAssignedObjectLiteral(source, variableName) {
        const marker = `var ${variableName}`;
        const markerIndex = source.indexOf(marker);
        if (markerIndex === -1) {
            return null;
        }

        const objectStart = source.indexOf('{', markerIndex);
        if (objectStart === -1) {
            return null;
        }

        let depth = 0;
        let quote = null;
        let escaped = false;

        for (let index = objectStart; index < source.length; index += 1) {
            const char = source[index];

            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === quote) {
                    quote = null;
                }
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }

            if (char === '{') {
                depth += 1;
                continue;
            }

            if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    return source.slice(objectStart, index + 1);
                }
            }
        }

        return null;
    }

    _normalizePatientGender(genderValue) {
        if (genderValue === 1 || genderValue === '1') {
            return 'Laki-Laki';
        }

        if (genderValue === 2 || genderValue === '2') {
            return 'Perempuan';
        }

        return '-';
    }

    _parsePatientAge(ageText) {
        const match = String(ageText || '').match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    _formatQueueTimestamp(value) {
        if (!value) {
            return '-';
        }

        const normalized = String(value).trim().replace(' ', 'T');
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) {
            return String(value).trim() || '-';
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = months[parsed.getMonth()];
        const year = String(parsed.getFullYear()).slice(-2);
        const hours = String(parsed.getHours()).padStart(2, '0');
        const minutes = String(parsed.getMinutes()).padStart(2, '0');

        return `${day} ${month} ${year} ${hours}:${minutes}`;
    }

    _normalizeQueuePaymentStatus(status) {
        const normalized = String(status || '').trim();
        if (!normalized) {
            return '-';
        }

        if (/belum/i.test(normalized)) {
            return 'Belum Lunas';
        }

        if (/lunas|paid|bayar/i.test(normalized)) {
            return 'Lunas';
        }

        return normalized;
    }

    _getMedifyTodayPrefix() {
        const date = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(date.getDate()).padStart(2, '0');
        const month = months[date.getMonth()];
        const year = String(date.getFullYear()).slice(-2);
        return `${day} ${month} ${year}`;
    }

    /**
     * Try to fetch patient data via DataTables AJAX endpoint
     */
    async _tryDataTablesAjax(dateFrom, dateTo) {
        try {
            const baseUrl = this.config.historyUrl;
            const ajaxUrl = `${baseUrl}?draw=1&start=0&length=-1` +
                `&tanggalMulai=${encodeURIComponent(dateFrom)}` +
                `&tanggalAkhir=${encodeURIComponent(dateTo)}`;

            const response = await this.request(ajaxUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01'
                }
            });

            // Check if response is JSON
            const body = response.body.trim();
            if (!body.startsWith('{') && !body.startsWith('[')) {
                return [];
            }

            const data = JSON.parse(body);

            // DataTables format: { draw, recordsTotal, recordsFiltered, data: [...] }
            if (!data.data || !Array.isArray(data.data)) {
                return [];
            }

            console.log(`[HTTP] DataTables returned ${data.data.length} rows`);
            return this._parseDataTablesRows(data.data);

        } catch (e) {
            console.log(`[HTTP] DataTables AJAX attempt failed: ${e.message}`);
            return [];
        }
    }

    /**
     * Parse DataTables JSON rows into patient objects
     */
    _parseDataTablesRows(rows) {
        return rows.map(row => {
            if (Array.isArray(row)) {
                // Array format: [no, noRM, pasien, dokter, poli, tanggal, aksi]
                const patientName = this._stripHtml(row[2] || '').split('\n')[0].trim();
                const doctorName = this._stripHtml(row[3] || '').trim();
                const visitDate = this._stripHtml(row[5] || '').trim();
                const medIdMatch = (row[row.length - 1] || '').match(/\/kasus\/([\w]+)/);

                return {
                    name: patientName,
                    doctor: doctorName,
                    visitDate,
                    medId: medIdMatch ? medIdMatch[1] : null
                };
            } else if (typeof row === 'object') {
                // Object format (key names vary by SIMRS)
                const patientName = this._stripHtml(
                    row.pasien || row.patient_name || row.nama_pasien || row.nama || ''
                ).split('\n')[0].trim();
                const doctorName = this._stripHtml(
                    row.dokter || row.doctor || row.dpjp || row.nama_dokter || ''
                ).trim();
                const visitDate = row.tanggal || row.date || row.tgl_periksa || row.tgl || '';
                const actionHtml = row.aksi || row.action || row.actions || '';
                const medIdMatch = actionHtml.match(/\/kasus\/([\w]+)/);

                return {
                    name: patientName,
                    doctor: doctorName,
                    visitDate,
                    medId: medIdMatch ? medIdMatch[1] : null
                };
            }
            return null;
        }).filter(p => p && p.name && p.medId);
    }

    /**
     * Parse history page HTML to extract patient list
     */
    async _parseHistoryPageHtml(dateFrom, dateTo) {
        const response = await this.request(this.config.historyUrl);
        const html = response.body;

        const patients = [];

        // Match table rows in <tbody>
        const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
        if (!tbodyMatch) {
            console.log(`[HTTP] No <tbody> found in history page`);
            return patients;
        }

        const tbody = tbodyMatch[1];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(tbody)) !== null) {
            const rowHtml = rowMatch[1];
            const cells = [];
            const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cellMatch;

            while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                cells.push(cellMatch[1]);
            }

            if (cells.length >= 6) {
                const patientName = this._stripHtml(cells[2] || '').split('\n')[0].trim();
                const doctorName = this._stripHtml(cells[3] || '').trim();
                const visitDate = this._stripHtml(cells[5] || '').trim();

                // Extract medId from action column (last cell)
                const actionHtml = cells[cells.length - 1] || '';
                const medIdMatch = actionHtml.match(/\/kasus\/([\w]+)/);

                if (patientName && medIdMatch) {
                    patients.push({
                        name: patientName,
                        doctor: doctorName,
                        visitDate,
                        medId: medIdMatch[1]
                    });
                }
            }
        }

        console.log(`[HTTP] Parsed ${patients.length} patients from HTML`);
        return patients;
    }

    /**
     * Extract patient identity from datamedis page
     */
    async extractPatientIdentity(medId) {
        if (!this.isLoggedIn) throw new Error('Not authenticated');

        const url = this.config.identityUrlTemplate.replace('{medId}', medId);
        console.log(`[HTTP] Extracting identity for ${medId}...`);

        const response = await this.request(url);
        const pageText = this._htmlToText(response.body);

        const data = {};
        const identityPatterns = {
            nama: [
                /NAMA\s*PASIEN[\s:]+([^\n]+?)(?=\n(?:JENIS|STATUS|NO\s*IDENTITAS|PEKERJAAN|USIA)\b)/i,
                /NAMA\s*PASIEN[\s:]+([^\n]+)/i
            ],
            jenis_kelamin: [/JENIS\s*KELAMIN[\s:]+([^\n]+)/i],
            status_pernikahan: [/STATUS\s*PERNIKAHAN[\s:]+([^\n]+)/i],
            tanggal_lahir: [/(?:TEMPAT.*?TANGGAL\s*LAHIR|TTL|TANGGAL\s*LAHIR)[\s:,]+([^\n]+)/i],
            alamat: [
                /ALAMAT[\s:]+([\s\S]*?)(?=\n(?:ASAL\s+RUJUKAN|INFORMASI\s+PEMBAYARAN|PEMBAYARAN\s+UTAMA|INFORMASI\s+KUNJUNGAN|NO\s*HP)\b)/i,
                /ALAMAT[\s:]+([^\n]+)/i
            ],
            no_hp: [/NO\s*HP[\s:]+([0-9+\-\s()]{8,20})/i],
            no_identitas: [/(?:NO\s*IDENTITAS|NIK)[\s:]+([0-9.\-\s]{8,24})/i],
            usia: [/USIA[\s:]+([^\n]+)/i],
            pekerjaan: [/PEKERJAAN[\s:]+([^\n]+)/i],
            pembayaran_utama: [/PEMBAYARAN\s*UTAMA[\s:]+([^\n]+)/i],
            nomor_pembayaran: [/(?:NO\s*SEP|NO\s*KARTU|NO\s*PESERTA|NOMOR\s*SEP)[\s:]+([^\n]+)/i],
            kelas_pembayaran: [/(?:KELAS(?:\s+RAWAT)?)\s*:?\s*([^\n]+)/i]
        };

        const normalizeValue = (value) => String(value || '')
            .replace(/\s*\n\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        for (const [field, patterns] of Object.entries(identityPatterns)) {
            for (const pattern of patterns) {
                const match = pageText.match(pattern);
                if (match && match[1]) {
                    data[field] = normalizeValue(match[1]);
                    break;
                }
            }
        }

        return data;
    }

    /**
     * Extract CPPT for a specific medId.
     * Returns { rawText, structured, skipReason? }
     */
    async extractCPPT(medId) {
        if (!this.isLoggedIn) throw new Error('Not authenticated');

        const url = this.config.cpptUrlTemplate.replace('{medId}', medId);
        console.log(`[HTTP] Extracting CPPT for ${medId}...`);

        const response = await this.request(url);

        // Convert HTML to plain text (unlike Puppeteer, we get ALL content
        // including collapsed sections, since CSS display:none doesn't affect HTML)
        const pageText = this._htmlToText(response.body);

        console.log(`[HTTP] CPPT page text length: ${pageText.length}`);

        // --- Filter to Dr. Dibya's entries only (same logic as puppeteer service) ---
        const dibyaPatterns = [
            /dibya\s*arfianda/i,
            /dr\.?\s*dibya/i,
            /Dibya.*SpOG/i,
            /Dokter\s*[-:]\s*.*dibya/i
        ];

        const entries = pageText.split(/(?:CPPT\s*\d+|Catatan\s*Perkembangan|SOAP\s*\d*)/gi);

        let dibyaText = '';
        let foundDibyaEntry = false;

        // Find first (most recent) Dr. Dibya entry with SOAP content
        for (const entry of entries) {
            const isDibyaEntry = dibyaPatterns.some(p => p.test(entry));
            const hasSOAPContent = /SUBJECTIVE|OBJECTIVE|Subjective|Objective|SUBYEKTIF|OBYEKTIF/i.test(entry);

            if (isDibyaEntry && hasSOAPContent) {
                foundDibyaEntry = true;
                dibyaText = entry;
                break;
            }
        }

        // Fallback: find Dr. Dibya signature and extract SOAP before it
        if (!foundDibyaEntry) {
            const dibyaIdx = pageText.search(/dibya\s*arfianda|dr\.?\s*dibya/i);
            if (dibyaIdx !== -1) {
                const textBefore = pageText.substring(0, dibyaIdx);
                const lastSubjective = Math.max(
                    textBefore.lastIndexOf('SUBJECTIVE'),
                    textBefore.lastIndexOf('Subjective'),
                    textBefore.lastIndexOf('SUBYEKTIF')
                );

                if (lastSubjective !== -1) {
                    const signatureEnd = Math.min(dibyaIdx + 100, pageText.length);
                    dibyaText = pageText.substring(lastSubjective, signatureEnd);
                    foundDibyaEntry = true;
                }
            }
        }

        // No Dr. Dibya entry found → skip
        if (!foundDibyaEntry || !dibyaText.trim()) {
            console.log(`[HTTP] No Dr. Dibya CPPT found for ${medId}`);
            return {
                rawText: '',
                structured: { subjective: {}, objective: {}, assessment: {}, plan: {} },
                skipReason: 'no_dibya_cppt'
            };
        }

        // Clean up
        let text = dibyaText
            .replace(/\t+/g, ' ')
            .replace(/  +/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        if (text.length > 20000) {
            text = text.substring(0, 20000);
        }

        if (text.length < 50) {
            console.log(`[HTTP] CPPT text too short (${text.length} chars) for ${medId}`);
            return {
                rawText: '',
                structured: { subjective: {}, objective: {}, assessment: {}, plan: {} },
                skipReason: 'no_dibya_cppt'
            };
        }

        // Parse structured CPPT data
        const structured = this._parseStructuredCPPT(text);

        console.log(`[HTTP] Extracted CPPT: ${text.length} chars, contains Dibya: ${/dibya/i.test(text)}`);

        return { rawText: text, structured };
    }

    /**
     * Parse structured CPPT data from plain text.
     * Same logic as puppeteer service's page.evaluate callback.
     */
    _parseStructuredCPPT(text) {
        return parseStructuredCPPTText(text);
    }

    /**
     * Extract CSRF token from HTML
     */
    _extractCsrfToken(html) {
        // Try meta tag first (most common in Laravel)
        const metaMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
        if (metaMatch) return metaMatch[1];

        // Try hidden input
        const inputMatch = html.match(/<input[^>]+name="_token"[^>]+value="([^"]+)"/i)
            || html.match(/name="_token"[^>]*value="([^"]+)"/i)
            || html.match(/value="([^"]+)"[^>]*name="_token"/i);
        if (inputMatch) return inputMatch[1];

        return '';
    }

    /**
     * Strip HTML tags and decode entities → plain text
     */
    _stripHtml(html) {
        if (!html) return '';
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
            .trim();
    }

    /**
     * Convert full HTML document to plain text (mimics document.body.innerText).
     * Block elements become newlines, inline elements are stripped.
     */
    _htmlToText(html) {
        if (!html) return '';

        // Remove script and style content
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '');

        // Block elements → newlines
        text = text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|pre|section|article|header|footer)>/gi, '\n')
            .replace(/<\/td>/gi, '\t')
            .replace(/<\/th>/gi, '\t');

        // Strip remaining tags
        text = text.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        text = text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

        // Clean up whitespace
        text = text
            .replace(/\t+/g, '\t')
            .replace(/[ \t]+$/gm, '')
            .replace(/^\s+$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return text;
    }

    /**
     * Close the session (no-op for HTTP, but matches puppeteer interface)
     */
    async close() {
        this.cookies = '';
        this.csrfToken = '';
        this.isLoggedIn = false;
    }
}

/**
 * Factory: create a new HTTP session for a SIMRS source
 */
function createSession(source) {
    return new MedifyHttpSession(source);
}

module.exports = {
    createSession,
    getCredentials,
    delay,
    pLimit,
    SIMRS_CONFIG,
    parseStructuredCPPTText,
    // Re-export matching functions from puppeteer service
    countMatchingFactors: puppeteerService.countMatchingFactors,
    findBestMatch: puppeteerService.findBestMatch
};
