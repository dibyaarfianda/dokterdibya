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
            clinicLabel: options.clinicLabel || 'Poli Obgyn'
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

        const extractStat = (label) => {
            const regex = new RegExp(`${label}\\s+(\\d+)`, 'i');
            const match = text.match(regex);
            return match ? parseInt(match[1], 10) : 0;
        };

        const total = extractStat('TOTAL ANTRIAN');
        const waiting = extractStat('BELUM DILAYANI');
        const serving = extractStat('DILAYANI');

        const itemRegex = /(DAF-[A-Z]-\d+)[\s\S]*?NO\.RM:\s*([^\n]+)[\s\S]*?(LAKI-LAKI|PEREMPUAN)\s*,\s*(\d+)[\s\S]*?\n([^\n]+?)(?:\nTunai|\nBPJS|\nAsuransi|\nWaktu Pendaftaran)[\s\S]*?Waktu Pendaftaran\s+([^\n]+)[\s\S]*?(?=(?:DAF-[A-Z]-\d+)|$)/gi;

        const items = [];
        let match;
        while ((match = itemRegex.exec(text)) !== null) {
            const queueNumber = (match[1] || '').trim();
            const recordNo = (match[2] || '').trim();
            const gender = (match[3] || '').trim();
            const age = parseInt(match[4], 10);
            const trailingText = match[0];

            const lines = trailingText
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

            const patientName = lines[1] || '-';
            const doctorLine = (match[5] || '').trim();
            const registeredAt = (match[6] || '').trim();
            const hasCppt = /\bCPPT\b/i.test(trailingText);
            const paymentStatus = /Belum Lunas/i.test(trailingText)
                ? 'Belum Lunas'
                : (/Lunas/i.test(trailingText) ? 'Lunas' : '-');

            items.push({
                queueNumber,
                patientName,
                medicalRecordNo: recordNo,
                gender,
                age: Number.isFinite(age) ? age : null,
                doctorName: doctorLine,
                registeredAt,
                paymentStatus,
                hasCppt
            });
        }

        return {
            source: this.source,
            queueUrl: meta.queueUrl || '',
            clinicLabel: meta.clinicLabel || 'Poliklinik',
            doctorFilter: meta.doctorFilter || 'Semua Dokter',
            stats: {
                waiting,
                serving,
                total
            },
            items
        };
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

        // Use same regex patterns as puppeteer service
        const data = {};
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
        const cpptData = {
            subjective: {},
            objective: {},
            assessment: {},
            plan: {}
        };

        // Parse SUBJECTIVE
        const subjectiveMatch = text.match(/SUBJECTIVE([\s\S]*?)(?=OBJECTIVE|$)/i);
        if (subjectiveMatch) {
            const subText = subjectiveMatch[1];

            const keluhanMatch = subText.match(/Keluhan\s*Utama\s*:?\s*([^\n]+)/i);
            if (keluhanMatch) cpptData.subjective.keluhan_utama = keluhanMatch[1].trim();

            const hplMatch = subText.match(/HPL\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hplMatch) cpptData.subjective.hpl = hplMatch[1];

            const hphtMatch = subText.match(/HPHT\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
            if (hphtMatch) cpptData.subjective.hpht = hphtMatch[1];

            const rpsMatch = subText.match(/(?:RPS|Riwayat\s*Penyakit\s*Sekarang)\s*:?\s*([^\n]+)/i);
            if (rpsMatch) cpptData.subjective.rps = rpsMatch[1].trim();

            const rpdMatch = subText.match(/(?:RPD|Riwayat\s*Penyakit\s*Dahulu)\s*:?\s*([^\n]+)/i);
            if (rpdMatch) cpptData.subjective.rpd = rpdMatch[1].trim();

            const rpkMatch = subText.match(/(?:RPK|Riwayat\s*Penyakit\s*Keluarga)\s*:?\s*([^\n]+)/i);
            if (rpkMatch) cpptData.subjective.rpk = rpkMatch[1].trim();
        }

        // Parse OBJECTIVE
        const objectiveMatch = text.match(/OBJECTIVE([\s\S]*?)(?=ASSESSMENT|ASSESMEN|$)/i);
        if (objectiveMatch) {
            const objText = objectiveMatch[1];

            const tensiMatch = objText.match(/(?:Tensi|TD|Tekanan\s*Darah)\s*:?\s*(\d+\/\d+)/i);
            if (tensiMatch) cpptData.objective.tensi = tensiMatch[1];

            const nadiMatch = objText.match(/Nadi\s*:?\s*(\d+)/i);
            if (nadiMatch) cpptData.objective.nadi = parseInt(nadiMatch[1]);

            const suhuMatch = objText.match(/Suhu\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (suhuMatch) cpptData.objective.suhu = parseFloat(suhuMatch[1].replace(',', '.'));

            const spo2Match = objText.match(/SpO2\s*:?\s*(\d+)/i);
            if (spo2Match) cpptData.objective.spo2 = parseInt(spo2Match[1]);

            const rrMatch = objText.match(/(?:RR|Respirasi)\s*:?\s*(\d+)/i);
            if (rrMatch) cpptData.objective.rr = parseInt(rrMatch[1]);

            const bbMatch = objText.match(/(?:BB|Berat\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (bbMatch) cpptData.objective.berat_badan = parseFloat(bbMatch[1].replace(',', '.'));

            const tbMatch = objText.match(/(?:TB|Tinggi\s*Badan)\s*:?\s*(\d+(?:[.,]\d+)?)/i);
            if (tbMatch) cpptData.objective.tinggi_badan = parseFloat(tbMatch[1].replace(',', '.'));
        }

        // Parse ASSESSMENT (multiple pattern variants)
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
            // Diagnosis: join first 3 lines
            const lines = assText.split('\n').filter(l => l.trim());
            if (lines.length > 0) {
                cpptData.assessment.diagnosis = lines.slice(0, 3).join(' ').trim();
            }

            // Obstetric formula: MEDIFY format G2P0101
            const medifyMatch = assText.match(/G(\d+)P(\d)(\d)(\d)(\d)/i);
            if (medifyMatch) {
                cpptData.assessment.gravida = parseInt(medifyMatch[1]);
                cpptData.assessment.para = parseInt(medifyMatch[2]) + parseInt(medifyMatch[3]);
                cpptData.assessment.abortus = parseInt(medifyMatch[4]);
                cpptData.assessment.anak_hidup = parseInt(medifyMatch[5]);
                cpptData.assessment.is_obstetric = true;
            } else {
                // Dash format: G1 P0-0
                const dashMatch = assText.match(/G(\d+)\s*P(\d+)-(\d+)/i);
                if (dashMatch) {
                    cpptData.assessment.gravida = parseInt(dashMatch[1]);
                    cpptData.assessment.para = parseInt(dashMatch[2]);
                    cpptData.assessment.abortus = 0;
                    cpptData.assessment.anak_hidup = parseInt(dashMatch[3]);
                    cpptData.assessment.is_obstetric = true;
                } else {
                    const obsMatch = assText.match(/G(\d+)\s*P([\d\-]+)/i);
                    if (obsMatch) {
                        cpptData.assessment.gravida = parseInt(obsMatch[1]);
                        cpptData.assessment.para = parseInt(obsMatch[2]);
                        cpptData.assessment.is_obstetric = true;
                    }
                }
            }

            // Gestational age
            const ukMatch = assText.match(/uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
            if (ukMatch) {
                cpptData.assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
                cpptData.assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
            }
        }

        // Parse PLAN
        const planMatch = text.match(/(?:PLAN|PLANNING)([\s\S]*?)(?=Dibuat|TTD|$)/i);
        if (planMatch) {
            cpptData.plan.raw = planMatch[1].trim();
        }

        return cpptData;
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
    // Re-export matching functions from puppeteer service
    countMatchingFactors: puppeteerService.countMatchingFactors,
    findBestMatch: puppeteerService.findBestMatch
};
