/**
 * Medical Record Import Parser
 * Uses GPT-4o-mini AI for intelligent parsing of medical records
 * Categories: obstetri, gyn_repro, gyn_special
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { OPENAI_API_KEY, OPENAI_API_URL } = require('../services/openaiService');
const logger = require('../utils/logger');

/**
 * Fixed AI prompt for medical record parsing (GPT-4o optimized)
 * No database dependency - all field definitions are hardcoded
 */
const MEDICAL_PARSER_PROMPT = `You are a medical record parser for an Indonesian obstetrics and gynecology clinic.
Extract information from the given medical record text and return ONLY valid JSON (no markdown, no code blocks, no explanation).

IMPORTANT: The document may have labels on one line and values on the NEXT line. Check both formats.

Return this exact JSON structure:
{
  "identity": {
    "nama": "Patient name or null",
    "jenis_kelamin": "L/P/Laki-laki/Perempuan or null",
    "usia": "Age as number or null",
    "tanggal_lahir": "DD/MM/YYYY or null",
    "tempat_lahir": "Birth place or null",
    "alamat": "Address or null",
    "no_hp": "Phone starting with 08/62 (10+ digits) or null - NOT dates!",
    "tinggi_badan": "Height in cm as number or null",
    "berat_badan": "Weight in kg as number or null",
    "pekerjaan": "Occupation or null",
    "no_identitas": "NIK/KTP number or null"
  },
  "subjective": {
    "keluhan_utama": "Chief complaint or null",
    "rps": "History of present illness or null",
    "rpd": "Past medical history or null",
    "rpk": "Family history or null",
    "hpht": "Last menstrual period DD/MM/YYYY or null",
    "hpl": "Expected delivery date DD/MM/YYYY or null"
  },
  "objective": {
    "keadaan_umum": "General condition (Baik/Sedang/Lemah) or null",
    "tensi": "Blood pressure like 120/80 or null",
    "nadi": "Pulse as number or null",
    "suhu": "Temperature as number or null",
    "spo2": "Oxygen saturation as number or null",
    "gcs": "GCS score or null",
    "rr": "Respiratory rate as number or null",
    "usg": "USG findings text or null",
    "berat_janin": "Fetal weight in grams as number or null",
    "presentasi": "Presentation (Kepala/Sungsang/Lintang) or null",
    "plasenta": "Placenta position or null",
    "ketuban": "Amniotic fluid status or null"
  },
  "assessment": {
    "diagnosis": "Full diagnosis text or null",
    "gravida": "Number of pregnancies as number or null",
    "para": "Parity like '1-0-0-1' or as number",
    "usia_kehamilan": "Gestational age text like '9 3/7mgg' or null",
    "usia_kehamilan_minggu": "Weeks as number or null",
    "usia_kehamilan_hari": "Days as number or null",
    "presentasi": "Presentation or null",
    "is_obstetric": true
  },
  "plan": {
    "obat": ["Array of medications with dosage like 'Folamil genio 1x1 (1 botol)'"],
    "tindakan": ["Array of procedures"],
    "instruksi": ["Array of instructions"],
    "raw": "Original plan text or null"
  }
}

FIELD KEYWORDS (Indonesian medical terms):
- NAMA: Nama Pasien, Nama Lengkap, Name, Nm
- TB/TINGGI: Tinggi Badan, TB, T.B., Height
- BB/BERAT: Berat Badan, BB, B.B., Weight
- HPHT: Hari Pertama Haid Terakhir, LMP
- HPL: Hari Perkiraan Lahir, EDD
- SpO2: Saturasi, SaO2, Oxygen Sat
- RR: Respirasi, Respiratory Rate, Nafas
- GCS: Glasgow Coma Scale
- UK: Usia Kehamilan, Gestational Age, GA

CRITICAL RULES:
1. NO HP: ONLY extract phone if it starts with 08 or 62 and has 10+ digits. "29/9/25" is a DATE, not a phone!
2. TB/BB: Search EVERYWHERE in the text, including in diagnosis section
3. Look for multi-line format: label on one line, value on next line
4. For obstetric diagnosis like "G1 P0-0 uk 9 3/7mgg": extract gravida=1, para="0-0", usia_kehamilan="9 3/7mgg"
5. Numbers should be numbers (not strings), except para which can be string like "1-0-0-1"
6. Return null for fields not found - DO NOT GUESS
7. Medications must include dosage: "Folamil genio 1x1 (1 botol)" not just "Folamil"`;

/**
 * Parse medical record text using GPT-4o
 */
async function parseWithAI(text, category) {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }

    logger.info('Using GPT-4o for medical record parsing');

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: MEDICAL_PARSER_PROMPT },
                { role: 'user', content: `Parse this ${category} medical record:\n\n${text}` }
            ],
            temperature: 0.1,
            max_tokens: 2000
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI API error: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorMessage;
            logger.error('OpenAI API error:', errorMessage);
            logger.error('OpenAI error details:', errorJson);
        } catch {
            logger.error('OpenAI API error:', errorText);
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
        throw new Error('No response from OpenAI');
    }

    // Parse JSON from response (handle markdown code blocks if present)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
    }

    try {
        return JSON.parse(jsonStr.trim());
    } catch (e) {
        logger.error('Failed to parse AI response:', jsonStr);
        throw new Error('Failed to parse AI response as JSON');
    }
}

/**
 * Parse visit date from text
 * Looks for common date patterns in Indonesian medical records
 */
function parseVisitDate(text) {
    // Common date patterns in Indonesian medical records
    const patterns = [
        // "Tanggal: 15 November 2024" or "Tanggal : 15/11/2024"
        /(?:Tanggal|TGL|Tgl)\s*:?\s*(\d{1,2}[-\/\s](?:\w+|\d{1,2})[-\/\s]\d{2,4})/i,
        // "15 November 2024" at start of line
        /^(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})/im,
        // "Waktu Kunjungan: 15/11/2024"
        /(?:Waktu\s*Kunjungan|Kunjungan|Visit\s*Date)\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        // "Dibuat pada: 15-11-2024"
        /(?:Dibuat\s*(?:pada|tanggal)?|Created)\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        // ISO date format "2024-11-15"
        /(\d{4}-\d{2}-\d{2})/,
        // European format "15.11.2024"
        /(\d{1,2}\.\d{1,2}\.\d{4})/,
        // "Jam : 10:45 Tanggal : 15-11-2024"
        /Tanggal\s*:\s*(\d{1,2}-\d{1,2}-\d{4})/i,
        // Standalone date at start of line: "15/11/2024" or "15-11-2024"
        /^(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\s*$/m
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return normalizeDate(match[1]);
        }
    }

    return null;
}

/**
 * Normalize various date formats to YYYY-MM-DD
 */
function normalizeDate(dateStr) {
    if (!dateStr) return null;

    const months = {
        'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
        'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
        'september': '09', 'oktober': '10', 'november': '11', 'desember': '12',
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    // Indonesian format with month name: "15 November 2024"
    const indonesianMatch = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (indonesianMatch) {
        const day = indonesianMatch[1].padStart(2, '0');
        const monthName = indonesianMatch[2].toLowerCase();
        const year = indonesianMatch[3];
        const month = months[monthName];
        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const numericMatch = dateStr.match(/(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
    if (numericMatch) {
        let day = numericMatch[1].padStart(2, '0');
        let month = numericMatch[2].padStart(2, '0');
        let year = numericMatch[3];

        // Handle 2-digit year
        if (year.length === 2) {
            year = parseInt(year) > 50 ? '19' + year : '20' + year;
        }

        // Swap if day > 12 and month <= 12 (assume DD/MM/YYYY)
        // Or if looks like MM/DD/YYYY where month > 12
        if (parseInt(day) > 12 && parseInt(month) <= 12) {
            // Already DD/MM/YYYY format
        } else if (parseInt(day) <= 12 && parseInt(month) > 12) {
            // Swap - it's MM/DD/YYYY
            [day, month] = [month, day];
        }

        return `${year}-${month}-${day}`;
    }

    return null;
}

/**
 * Detect hospital/location from text
 */
function detectLocation(text) {
    const locationPatterns = [
        { pattern: /RSIA\s*Melinda|RS\.?\s*Ibu\s*Anak\s*Melinda/i, location: 'rsia_melinda' },
        { pattern: /RSUD\s*Gambiran|RS\.?\s*Umum\s*Daerah\s*Gambiran/i, location: 'rsud_gambiran' },
        { pattern: /RS\.?\s*Bhayangkara|Rumah\s*Sakit\s*Bhayangkara/i, location: 'rs_bhayangkara' },
        { pattern: /Klinik\s*(?:dr\.?\s*)?Dibya|Praktek\s*dr\.?\s*Dibya/i, location: 'klinik_private' }
    ];

    for (const { pattern, location } of locationPatterns) {
        if (pattern.test(text)) {
            return location;
        }
    }

    return null;
}

/**
 * Parse patient identity section
 */
function parseIdentity(text) {
    const identity = {};

    // Helper to extract value after label with multiple variations
    const extractMulti = (labels, options = {}) => {
        const { allowMidLine = false, allowTab = true } = options;
        for (const label of labels) {
            // Match label followed by : or whitespace or tab, then capture until newline or semicolon
            // Allow optional space before colon (e.g., "BB : 64" or "BB: 64")
            const startPattern = allowMidLine ? '' : '(?:^|\\n)\\s*';
            const separatorPattern = allowTab ? '[:\\-\\t]\\s*' : '[:\\-]\\s*';
            const regex = new RegExp(`${startPattern}${label}\\s*${separatorPattern}([^\\n;]+)`, 'im');
            const match = text.match(regex);
            if (match && match[1].trim()) {
                return match[1].trim();
            }
        }
        return null;
    };

    // Try to find header line patterns (e.g., "Nama\tNy. Siti" or "Nama : Ny. Siti")
    const extractFromTable = (labels) => {
        for (const label of labels) {
            // Match label with flexible separator (tab, colon, spaces)
            const regex = new RegExp(`(?:^|\\n)\\s*${label}[\\s\\t:]+([^\\n\\t]+)`, 'im');
            const match = text.match(regex);
            if (match && match[1].trim() && match[1].trim().length > 1) {
                return match[1].trim();
            }
        }
        return null;
    };

    // Handle multi-line format where label is on one line and value is on the next line
    // e.g., "NAMA PASIEN\nHELNA CHUSNIATUL LUTFIANA"
    const extractNextLine = (labels) => {
        for (const label of labels) {
            // Match label at start/middle of text, then capture the next non-empty line
            const regex = new RegExp(`(?:^|\\n)\\s*${label}\\s*\\n([^\\n]+)`, 'im');
            const match = text.match(regex);
            if (match && match[1].trim() && match[1].trim().length > 1) {
                // Make sure the captured value is not another label (all caps with no numbers)
                const value = match[1].trim();
                if (!/^[A-Z\s,]+$/.test(value) || /\d/.test(value)) {
                    return value;
                }
            }
        }
        return null;
    };

    // Name variations - try multiple patterns including multi-line
    identity.nama = extractMulti([
        'NAMA PASIEN', 'Nama Pasien', 'NAMA LENGKAP', 'Nama Lengkap',
        'NAMA', 'Nama', 'NAME', 'Name', 'Nm\\.?', 'Nm Pasien', 'Pasien'
    ]) || extractFromTable(['NAMA', 'Nama', 'Name', 'Pasien'])
       || extractNextLine(['NAMA PASIEN', 'NAMA LENGKAP', 'NAMA']);

    // Gender variations
    identity.jenis_kelamin = extractMulti([
        'JENIS KELAMIN', 'Jenis Kelamin', 'JK', 'J\\.K\\.', 'GENDER', 'Gender',
        'Kelamin', 'L/P', 'SEX'
    ]) || extractFromTable(['JK', 'Kelamin', 'L/P'])
       || extractNextLine(['JENIS KELAMIN', 'JK', 'GENDER']);

    // Age variations
    identity.usia = extractMulti([
        'USIA', 'Usia', 'UMUR', 'Umur', 'AGE', 'Age', 'Thn', 'TAHUN'
    ]) || extractFromTable(['Usia', 'Umur', 'Age'])
       || extractNextLine(['USIA', 'UMUR']);

    // Birth date/place variations
    identity.tempat_tanggal_lahir = extractMulti([
        'TEMPAT, TANGGAL LAHIR', 'Tempat, Tanggal Lahir', 'TTL',
        'TEMPAT/TANGGAL LAHIR', 'Tempat/Tgl Lahir', 'Tempat & Tgl Lahir',
        'TGL LAHIR', 'Tgl Lahir', 'TANGGAL LAHIR', 'Tanggal Lahir',
        'DOB', 'BIRTH DATE', 'Birth Date'
    ]) || extractFromTable(['TTL', 'Tgl Lahir', 'Tanggal Lahir'])
       || extractNextLine(['TEMPAT, TANGGAL LAHIR', 'TEMPAT TANGGAL LAHIR', 'TTL']);

    // Address variations
    identity.alamat = extractMulti([
        'ALAMAT', 'Alamat', 'ADDRESS', 'Address', 'Almt', 'ALMT'
    ]) || extractFromTable(['Alamat', 'Address'])
       || extractNextLine(['ALAMAT', 'ADDRESS']);

    // Marital status variations
    identity.status_pernikahan = extractMulti([
        'STATUS PERNIKAHAN', 'Status Pernikahan', 'STATUS KAWIN', 'Status Kawin',
        'STATUS', 'Kawin/Belum', 'MARITAL', 'Marital Status'
    ]);

    // ID number variations
    identity.no_identitas = extractMulti([
        'NO IDENTITAS', 'No Identitas', 'NIK', 'NO KTP', 'No KTP',
        'NO\\. KTP', 'NO\\. IDENTITAS', 'KTP', 'ID NUMBER'
    ]);

    // Occupation variations
    identity.pekerjaan = extractMulti([
        'PEKERJAAN', 'Pekerjaan', 'OCCUPATION', 'Occupation', 'KERJA', 'Kerja'
    ]);

    // Phone number variations - must contain digits to be valid phone
    const phoneCandidate = extractMulti([
        'NO HP', 'No HP', 'NO\\. HP', 'No\\. HP', 'NO TELEPON', 'No Telepon',
        'NO\\. TELEPON', 'TELEPON', 'Telepon', 'TELP', 'Telp', 'HANDPHONE',
        'PHONE', 'Phone', 'NO\\. TELP', 'No\\. Telp', 'KONTAK', 'Kontak'
    ]);
    // Only accept if it looks like a phone number (starts with 0 or 6 and has 10+ digits)
    if (phoneCandidate && /^[06]\d{9,}/.test(phoneCandidate.replace(/[\s\-]/g, ''))) {
        identity.no_hp = phoneCandidate;
    } else {
        identity.no_hp = null;
    }

    // Referral variations
    identity.asal_rujukan = extractMulti([
        'ASAL RUJUKAN', 'Asal Rujukan', 'RUJUKAN', 'Rujukan', 'REFERRED BY',
        'Referred By', 'REFERRAL'
    ]);

    // Height variations - try line-start first, then mid-line, then multi-line
    identity.tinggi_badan = extractMulti([
        'TINGGI BADAN', 'Tinggi Badan', 'TB', 'T\\.B\\.', 'HEIGHT', 'Height', 'TINGGI'
    ]) || extractMulti([
        'TB', 'T\\.B\\.', 'TINGGI BADAN', 'Tinggi Badan'
    ], { allowMidLine: true })
       || extractNextLine(['TINGGI BADAN', 'TINGGI']);

    // Weight variations - try line-start first, then mid-line, then multi-line
    identity.berat_badan = extractMulti([
        'BERAT BADAN', 'Berat Badan', 'BB', 'B\\.B\\.', 'WEIGHT', 'Weight', 'BERAT'
    ]) || extractMulti([
        'BB', 'B\\.B\\.', 'BERAT BADAN', 'Berat Badan'
    ], { allowMidLine: true })
       || extractNextLine(['BERAT BADAN', 'BERAT']);

    // Parse birth date from tempat_tanggal_lahir
    if (identity.tempat_tanggal_lahir) {
        const parts = identity.tempat_tanggal_lahir.split(',');
        if (parts.length >= 2) {
            identity.tempat_lahir = parts[0].trim();
            identity.tanggal_lahir = parts[1].trim();
        } else {
            // Try to extract date directly if no comma
            const dateMatch = identity.tempat_tanggal_lahir.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
            if (dateMatch) {
                identity.tanggal_lahir = dateMatch[1];
            }
        }
    }

    // Parse height and weight numbers
    if (identity.tinggi_badan) {
        const tbMatch = identity.tinggi_badan.match(/(\d+(?:[.,]\d+)?)/);
        identity.tinggi_badan_cm = tbMatch ? parseFloat(tbMatch[1].replace(',', '.')) : null;
    }
    if (identity.berat_badan) {
        const bbMatch = identity.berat_badan.match(/(\d+(?:[.,]\d+)?)/);
        identity.berat_badan_kg = bbMatch ? parseFloat(bbMatch[1].replace(',', '.')) : null;
    }

    return identity;
}

/**
 * Parse SUBJECTIVE section (Anamnesis)
 */
function parseSubjective(text) {
    const subjective = {};

    // Try to extract SUBJECTIVE section, or use full text
    const subjectiveMatch = text.match(/(?:SUBJECTIVE|ANAMNESA|ANAMNESIS|S\s*:)\s*([\s\S]*?)(?=OBJECTIVE|PEMERIKSAAN|O\s*:|$)/i);
    const subText = subjectiveMatch ? subjectiveMatch[1] : text;

    // Helper to extract with multiple pattern variations
    const extractField = (patterns) => {
        for (const pattern of patterns) {
            const match = subText.match(pattern);
            if (match && match[1] && match[1].trim()) {
                return match[1].trim();
            }
        }
        return null;
    };

    // Keluhan Utama variations
    subjective.keluhan_utama = extractField([
        /Keluhan\s*(?:Utama)?\s*[:\-]\s*([^\n]+)/i,
        /Chief\s*Complaint\s*[:\-]\s*([^\n]+)/i,
        /CC\s*[:\-]\s*([^\n]+)/i,
        /KU\s*[:\-]\s*([^\n]+)/i,
        /Alasan\s*(?:Datang|Kunjungan)\s*[:\-]\s*([^\n]+)/i
    ]);

    // RPS variations
    subjective.rps = extractField([
        /Riwayat\s*Penyakit\s*Sekarang\s*(?:\(RPS\))?\s*[:\-]\s*([^\n]+)/i,
        /RPS\s*[:\-]\s*([^\n]+)/i,
        /History\s*of\s*Present\s*Illness\s*[:\-]\s*([^\n]+)/i,
        /HPI\s*[:\-]\s*([^\n]+)/i
    ]);

    // RPD variations
    subjective.rpd = extractField([
        /Riwayat\s*Penyakit\s*(?:Dahulu|Terdahulu)\s*(?:\(RPD\))?\s*[:\-]\s*([^\n]+)/i,
        /RPD\s*[:\-]\s*([^\n]+)/i,
        /Past\s*Medical\s*History\s*[:\-]\s*([^\n]+)/i,
        /PMH\s*[:\-]\s*([^\n]+)/i
    ]);

    // RPK variations
    subjective.rpk = extractField([
        /Riwayat\s*Penyakit\s*Keluarga\s*(?:\(RPK\))?\s*[:\-]\s*([^\n]*)/i,
        /RPK\s*[:\-]\s*([^\n]*)/i,
        /Family\s*History\s*[:\-]\s*([^\n]*)/i,
        /FH\s*[:\-]\s*([^\n]*)/i
    ]);

    // HPL (Hari Perkiraan Lahir) - search in section and full text
    subjective.hpl = extractField([
        /HPL\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /Hari\s*Perkiraan\s*Lahir\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /EDD\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ]) || extractFromFullText([
        /HPL\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ]);

    // HPHT (Hari Pertama Haid Terakhir) - search in section and full text
    subjective.hpht = extractField([
        /HPHT\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /Hari\s*Pertama\s*Haid\s*Terakhir\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /LMP\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /Last\s*Menstrual\s*Period\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ]) || extractFromFullText([
        /HPHT\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ]);

    return subjective;

    // Helper to search in full text
    function extractFromFullText(patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return null;
    }
}

/**
 * Parse OBJECTIVE section (Physical Examination)
 */
function parseObjective(text) {
    const objective = {};

    // Try to extract OBJECTIVE section, or use full text
    const objectiveMatch = text.match(/(?:OBJECTIVE|PEMERIKSAAN\s*FISIK|PEMERIKSAAN|O\s*:)\s*([\s\S]*?)(?=ASSESSMENT|DIAGNOSIS|A\s*:|$)/i);
    const objText = objectiveMatch ? objectiveMatch[1] : text;

    // Helper to extract with multiple pattern variations
    const extractField = (patterns) => {
        for (const pattern of patterns) {
            const match = objText.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        // Also try full text
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return null;
    };

    // General condition variations
    objective.keadaan_umum = extractField([
        /(?:K\/U|KU|Keadaan\s*Umum|Kesadaran)\s*[:\-]?\s*(\w+)/i,
        /General\s*Condition\s*[:\-]?\s*(\w+)/i
    ]);

    // USG findings
    objective.usg = extractField([
        /USG\s*[:\-]\s*([^\n]+)/i,
        /Ultrasonografi\s*[:\-]\s*([^\n]+)/i,
        /Hasil\s*USG\s*[:\-]\s*([^\n]+)/i
    ]);

    // Parse USG details if present
    if (objective.usg) {
        const weightMatch = objective.usg.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|gram|gr)/i);
        objective.berat_janin = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : null;

        if (/kepala/i.test(objective.usg)) objective.presentasi = 'Kepala';
        else if (/bokong|sungsang/i.test(objective.usg)) objective.presentasi = 'Sungsang';
        else if (/lintang/i.test(objective.usg)) objective.presentasi = 'Lintang';

        const plasentaMatch = objective.usg.match(/plasenta\s+(\w+)/i);
        objective.plasenta = plasentaMatch ? plasentaMatch[1] : null;

        if (/ketuban\s+cukup/i.test(objective.usg)) objective.ketuban = 'Cukup';
        else if (/ketuban\s+sedikit|oligohidramnion/i.test(objective.usg)) objective.ketuban = 'Sedikit';
        else if (/ketuban\s+banyak|polihidramnion/i.test(objective.usg)) objective.ketuban = 'Banyak';
    }

    // Blood pressure variations
    const tensiVal = extractField([
        /(?:Tensi|TD|Tekanan\s*Darah|Blood\s*Pressure|BP)\s*[:\-]?\s*(\d+\s*\/\s*\d+)/i
    ]);
    objective.tensi = tensiVal ? tensiVal.replace(/\s/g, '') : null;

    // Pulse variations
    const nadiVal = extractField([
        /(?:Nadi|Pulse|HR|Heart\s*Rate|Denyut\s*Nadi)\s*[:\-]?\s*(\d+)/i
    ]);
    objective.nadi = nadiVal ? parseInt(nadiVal) : null;

    // Temperature variations
    const suhuVal = extractField([
        /(?:Suhu|Temp|Temperature|T)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i
    ]);
    objective.suhu = suhuVal ? parseFloat(suhuVal.replace(',', '.')) : null;

    // SpO2 variations - also check for multi-line format
    const spo2Val = extractField([
        /(?:SpO2|Saturasi|Oxygen\s*Sat|SaO2)\s*[:\-]?\s*(\d+)/i
    ]) || extractNextLine(['SPO2', 'SpO2', 'SATURASI']);
    objective.spo2 = spo2Val ? parseInt(spo2Val) : null;

    // GCS variations - also check for multi-line format
    objective.gcs = extractField([
        /GCS\s*[:\-]?\s*([\dE\dV\dM\d\-]+)/i,
        /Glasgow\s*[:\-]?\s*([\d\-]+)/i
    ]) || extractNextLine(['GCS', 'GLASGOW']);

    // Respiratory rate variations - also check for multi-line format
    const rrVal = extractField([
        /(?:RR|Respirasi|Respiratory\s*Rate|Nafas)\s*[:\-]?\s*(\d+)/i
    ]) || extractNextLine(['RR', 'RESPIRASI', 'NAFAS']);
    objective.rr = rrVal ? parseInt(rrVal) : null;

    // Helper for multi-line extraction (label on one line, value on next)
    function extractNextLine(labels) {
        for (const label of labels) {
            const regex = new RegExp(`(?:^|\\n)\\s*${label}\\s*\\n([^\\n]+)`, 'im');
            const match = text.match(regex);
            if (match && match[1].trim() && /\d/.test(match[1])) {
                return match[1].trim();
            }
        }
        return null;
    }

    // Weight variations
    const bbVal = extractField([
        /(?:BB|Berat\s*Badan|Weight)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i
    ]);
    objective.berat_badan = bbVal ? parseFloat(bbVal.replace(',', '.')) : null;

    return objective;
}

/**
 * Parse ASSESSMENT section (Diagnosis)
 */
function parseAssessment(text) {
    const assessment = {};

    // Try to extract ASSESSMENT section with proper boundaries
    const assessmentMatch = text.match(/(?:ASSESSMENT|DIAGNOSIS|DIAGNOSA|A\s*:)\s*([\s\S]*?)(?=PLAN|PLANNING|TERAPI|TATALAKSANA|P\s*:|INSTRUKSI|OBAT|$)/i);
    let assText = assessmentMatch ? assessmentMatch[1].trim() : '';

    // If section text is too long (likely grabbed too much), try to limit it
    if (assText.length > 500) {
        // Take only first few lines
        const lines = assText.split('\n').slice(0, 5);
        assText = lines.join('\n').trim();
    }

    // If no section found, try to find diagnosis line directly
    if (!assText) {
        // Try multiple patterns for diagnosis line
        const diagPatterns = [
            /(?:Diagnosis|Diagnosa|Dx)\s*[:\-]\s*([^\n]+)/i,
            /(?:Assesment|Assessment)\s*[:\-]\s*([^\n]+)/i,
            /(?:DIAGNOSIS|DIAGNOSA)\s*(?:UTAMA)?[:\s]+([^\n]+)/i
        ];

        for (const pattern of diagPatterns) {
            const diagMatch = text.match(pattern);
            if (diagMatch && diagMatch[1].trim()) {
                assText = diagMatch[1].trim();
                break;
            }
        }
    }

    // Handle multi-line format: ASSESSMENT\nG1 P0-0 uk 9 3/7mgg
    if (!assText || assText.length < 3) {
        const multiLinePatterns = [
            /(?:^|\n)\s*ASSESSMENT\s*\n([^\n]+)/im,
            /(?:^|\n)\s*DIAGNOSIS\s*\n([^\n]+)/im,
            /(?:^|\n)\s*DIAGNOSA\s*\n([^\n]+)/im,
            /(?:^|\n)\s*A\s*:\s*\n([^\n]+)/im
        ];

        for (const pattern of multiLinePatterns) {
            const match = text.match(pattern);
            if (match && match[1].trim() && match[1].trim().length > 2) {
                // Make sure it's not another section header
                const val = match[1].trim();
                if (!/^(PLAN|PLANNING|TERAPI|OBJECTIVE|SUBJECTIVE|P\s*:)/i.test(val)) {
                    assText = val;
                    break;
                }
            }
        }
    }

    // Clean up diagnosis text - remove extra whitespace and limit length
    if (assText) {
        // Remove excessive whitespace
        assText = assText.replace(/\s+/g, ' ').trim();
        // Limit to reasonable length for diagnosis
        if (assText.length > 300) {
            assText = assText.substring(0, 300) + '...';
        }
    }

    assessment.diagnosis = assText;

    // Parse obstetric formula (G P A) with more variations
    const obstetricPatterns = [
        /G\s*(\d+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s*P\s*([\d\-]+)/i,
        /Gravida\s*(\d+)\s*Para\s*([\d\-]+)/i,
        /G(\d+)P(\d+)/i
    ];

    for (const pattern of obstetricPatterns) {
        const obstetricMatch = assText.match(pattern) || text.match(pattern);
        if (obstetricMatch) {
            const romanToNum = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };
            let gravida = obstetricMatch[1];
            assessment.gravida = romanToNum[gravida.toUpperCase()] || parseInt(gravida);
            assessment.para = obstetricMatch[2];
            assessment.is_obstetric = true;
            break;
        }
    }

    // UK (Usia Kehamilan / Gestational Age) with more patterns
    const ukPatterns = [
        /uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu|weeks?)/i,
        /(?:Usia\s*Kehamilan|Gestational\s*Age|GA)\s*[:\-]?\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu|weeks?)/i,
        /(\d+)\s*(?:\+\s*(\d+))?\s*(?:mgg|minggu|weeks?)/i
    ];

    for (const pattern of ukPatterns) {
        const ukMatch = assText.match(pattern) || text.match(pattern);
        if (ukMatch) {
            assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
            assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
            assessment.is_obstetric = true;
            break;
        }
    }

    // Presentation
    const fullText = assText + ' ' + text;
    if (/\+?\s*Kepala|Presentasi\s*Kepala|Letak\s*Kepala/i.test(fullText)) assessment.presentasi = 'Kepala';
    else if (/\+?\s*Bokong|Sungsang|Presentasi\s*Bokong|Letak\s*Sungsang/i.test(fullText)) assessment.presentasi = 'Sungsang';
    else if (/Lintang|Presentasi\s*Lintang/i.test(fullText)) assessment.presentasi = 'Lintang';

    return assessment;
}

/**
 * Parse PLAN section (Treatment Plan)
 */
function parsePlan(text) {
    const plan = {};

    // Try multiple section headers
    const planMatch = text.match(/(?:PLAN|PLANNING|TERAPI|TATALAKSANA|TREATMENT|P\s*:)\s*([\s\S]*?)(?=INSTRUKSI|Dibuat\s*Oleh|TTD|Dokter\s*Pemeriksa|$)/i);

    let planText = '';
    if (planMatch) {
        planText = planMatch[1].trim();
    }

    // If no plan text or too short, try multi-line format: PLAN\nFolamil genio 1x1
    if (!planText || planText.length < 3) {
        const multiLinePatterns = [
            /(?:^|\n)\s*PLAN\s*\n([\s\S]*?)(?=INSTRUKSI|Dibuat\s*Oleh|TTD|Dokter|$)/im,
            /(?:^|\n)\s*PLANNING\s*\n([\s\S]*?)(?=INSTRUKSI|Dibuat\s*Oleh|TTD|Dokter|$)/im,
            /(?:^|\n)\s*TERAPI\s*\n([\s\S]*?)(?=INSTRUKSI|Dibuat\s*Oleh|TTD|Dokter|$)/im,
            /(?:^|\n)\s*P\s*:\s*\n([\s\S]*?)(?=INSTRUKSI|Dibuat\s*Oleh|TTD|Dokter|$)/im
        ];

        for (const pattern of multiLinePatterns) {
            const match = text.match(pattern);
            if (match && match[1].trim()) {
                planText = match[1].trim();
                break;
            }
        }
    }

    if (!planText) {
        // Try to find therapy/medication lines directly
        const therapyLines = [];
        const lines = text.split('\n');
        let inTherapy = false;

        for (const line of lines) {
            if (/(?:Terapi|Obat|Resep|R\/)\s*[:\-]/i.test(line)) {
                inTherapy = true;
            }
            if (inTherapy && line.trim()) {
                therapyLines.push(line.trim());
            }
            if (inTherapy && /^\s*$/.test(line) && therapyLines.length > 2) {
                break;
            }
        }
        planText = therapyLines.join('\n');
    }

    const lines = planText.split('\n').filter(l => l.trim());

    plan.tindakan = [];
    plan.obat = [];
    plan.instruksi = [];

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        // Skip section headers
        if (/^(?:PLAN|Terapi|Obat|R\/)\s*:?\s*$/i.test(line)) return;

        // Detect medications (dosage patterns, common drug names)
        if (/\d+\s*(?:tab|kap|botol|strip|box|sachet|mg|ml|gr|x|\/)/i.test(line) ||
            /folamil|asam\s*folat|vitamin|kalk|fe\s|tablet|kapsul|sirup|drops|cream|salep|obat/i.test(line) ||
            /(?:1|2|3)\s*x\s*(?:1|2|sehari)/i.test(line)) {
            plan.obat.push(line);
        }
        // Detect procedures
        else if (/USG|sweep|CTG|NST|pemeriksaan|injeksi|infus|lab|rontgen|foto|EKG/i.test(line)) {
            plan.tindakan.push(line);
        }
        // Instructions
        else if (/kontrol|kembali|datang|minggu|hari|jika|bila|istirahat|hindari|makan|minum|tidur/i.test(line)) {
            plan.instruksi.push(line);
        }
        else {
            // Default to tindakan if unclear
            plan.tindakan.push(line);
        }
    });

    plan.raw = planText;

    return plan;
}

/**
 * Detect category based on parsed content
 * Returns: 'obstetri', 'gyn_repro', or 'gyn_special'
 */
function detectCategory(parsed) {
    // Obstetri indicators
    const obstetriKeywords = [
        'hamil', 'kehamilan', 'janin', 'fetal', 'hpl', 'hpht',
        'gravida', 'para', 'abortus', 'uk ', 'minggu', 'kontrol hamil',
        'anc', 'prenatal', 'usg', 'kepala', 'bokong', 'plasenta', 'ketuban'
    ];

    // Gyn reproductive indicators
    const gynReproKeywords = [
        'haid', 'menstruasi', 'kb', 'kontrasepsi', 'iud', 'implant',
        'pil', 'suntik', 'infertil', 'program hamil', 'promil',
        'siklus', 'ovulasi', 'endometriosis'
    ];

    // Gyn special indicators
    const gynSpecialKeywords = [
        'kista', 'miom', 'tumor', 'kanker', 'ca ', 'karsinoma',
        'prolaps', 'inkontinensia', 'menopause', 'pap smear',
        'biopsi', 'histerektomi', 'operasi', 'laparoskopi'
    ];

    const fullText = JSON.stringify(parsed).toLowerCase();

    // Check for obstetric indicators first
    if (parsed.assessment?.is_obstetric || parsed.subjective?.hpl || parsed.subjective?.hpht) {
        return 'obstetri';
    }

    // Count keyword matches
    const obstetriCount = obstetriKeywords.filter(k => fullText.includes(k)).length;
    const gynReproCount = gynReproKeywords.filter(k => fullText.includes(k)).length;
    const gynSpecialCount = gynSpecialKeywords.filter(k => fullText.includes(k)).length;

    // Determine category based on keyword matches
    if (obstetriCount > gynReproCount && obstetriCount > gynSpecialCount) {
        return 'obstetri';
    } else if (gynSpecialCount > gynReproCount) {
        return 'gyn_special';
    } else if (gynReproCount > 0) {
        return 'gyn_repro';
    }

    // Default to obstetri if unclear (most common case)
    return 'obstetri';
}

/**
 * Build diagnosis text from obstetric fields if diagnosis is null
 */
function buildDiagnosisText(assessment) {
    const parts = [];
    if (assessment.gravida) parts.push(`G${assessment.gravida}`);
    if (assessment.para) parts.push(`P${assessment.para}`);
    if (assessment.usia_kehamilan) {
        parts.push(`uk ${assessment.usia_kehamilan}`);
    } else if (assessment.usia_kehamilan_minggu) {
        let uk = `uk ${assessment.usia_kehamilan_minggu}`;
        if (assessment.usia_kehamilan_hari) uk += ` ${assessment.usia_kehamilan_hari}/7`;
        uk += ' mgg';
        parts.push(uk);
    }
    if (assessment.presentasi) parts.push(`+ ${assessment.presentasi}`);
    return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Parse usia kehamilan text like "9 3/7mgg" into minggu and hari
 */
function parseUsiaKehamilan(ukText) {
    if (!ukText) return null;
    const match = ukText.match(/(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu|weeks?)/i);
    if (match) {
        return {
            minggu: parseInt(match[1]),
            hari: match[2] ? parseInt(match[2]) : 0
        };
    }
    return null;
}

/**
 * Helper to unwrap arrays (AI sometimes returns single values as arrays)
 */
function unwrapValue(val) {
    if (Array.isArray(val)) return val[0] || null;
    return val;
}

/**
 * Map parsed data to our medical record template format
 * Works with both AI-parsed and regex-parsed data
 */
function mapToTemplate(parsed, category) {
    // Handle both AI and regex parsed structures for height/weight (AI may return as array)
    const tinggi = unwrapValue(parsed.identity.tinggi_badan_cm || parsed.identity.tinggi_badan);
    const berat = unwrapValue(parsed.identity.berat_badan_kg || parsed.identity.berat_badan || parsed.objective?.berat_badan);

    const template = {
        category: category,
        identitas: {
            nama: parsed.identity.nama,
            jenis_kelamin: parsed.identity.jenis_kelamin,
            tanggal_lahir: parsed.identity.tanggal_lahir,
            tempat_lahir: parsed.identity.tempat_lahir,
            alamat: parsed.identity.alamat,
            no_hp: parsed.identity.no_hp,
            nik: parsed.identity.no_identitas,
            pekerjaan: parsed.identity.pekerjaan,
            status_pernikahan: parsed.identity.status_pernikahan,
            tinggi_badan: tinggi,
            berat_badan: berat
        },
        anamnesa: {
            keluhan_utama: parsed.subjective.keluhan_utama,
            riwayat_penyakit_sekarang: parsed.subjective.rps,
            riwayat_penyakit_dahulu: parsed.subjective.rpd,
            riwayat_penyakit_keluarga: parsed.subjective.rpk
        },
        pemeriksaan_fisik: {
            keadaan_umum: parsed.objective.keadaan_umum,
            tekanan_darah: parsed.objective.tensi,
            nadi: parsed.objective.nadi,
            suhu: parsed.objective.suhu,
            spo2: parsed.objective.spo2,
            gcs: parsed.objective.gcs,
            respirasi: parsed.objective.rr
        },
        diagnosis: {
            diagnosis_utama: parsed.assessment.diagnosis || buildDiagnosisText(parsed.assessment),
            gravida: parsed.assessment.gravida,
            para: parsed.assessment.para,
            usia_kehamilan_minggu: parsed.assessment.usia_kehamilan_minggu || parseUsiaKehamilan(parsed.assessment.usia_kehamilan)?.minggu,
            usia_kehamilan_hari: parsed.assessment.usia_kehamilan_hari || parseUsiaKehamilan(parsed.assessment.usia_kehamilan)?.hari,
            presentasi: parsed.assessment.presentasi || parsed.objective.presentasi
        },
        planning: {
            tindakan: parsed.plan.tindakan,
            obat: parsed.plan.obat,
            instruksi: parsed.plan.instruksi,
            raw: parsed.plan.raw
        }
    };

    // Add obstetric-specific fields
    if (category === 'obstetri') {
        template.obstetri = {
            hpl: parsed.subjective.hpl,
            hpht: parsed.subjective.hpht,
            gravida: parsed.assessment.gravida,
            para: parsed.assessment.para,
            usia_kehamilan: `${parsed.assessment.usia_kehamilan_minggu || ''} minggu ${parsed.assessment.usia_kehamilan_hari || ''} hari`.trim(),
            presentasi: parsed.assessment.presentasi || parsed.objective.presentasi,
            berat_janin: parsed.objective.berat_janin,
            plasenta: parsed.objective.plasenta,
            ketuban: parsed.objective.ketuban,
            usg_findings: parsed.objective.usg
        };
    }

    return template;
}

/**
 * POST /api/medical-import/parse
 * Parse medical record text using AI and return structured data
 * Category is selected by user: obstetri, gyn_repro, gyn_special
 */
router.post('/api/medical-import/parse', verifyToken, async (req, res) => {
    try {
        const { text, category, use_ai = true } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Text content is required'
            });
        }

        if (!category || !['obstetri', 'gyn_repro', 'gyn_special'].includes(category)) {
            return res.status(400).json({
                success: false,
                message: 'Category is required. Choose: obstetri, gyn_repro, or gyn_special'
            });
        }

        let parsed;

        // Use AI parsing by default, fallback to regex if AI fails or disabled
        if (use_ai && OPENAI_API_KEY) {
            try {
                logger.info('Using AI parsing for medical record');
                parsed = await parseWithAI(text, category);
                parsed._parsed_by = 'ai';
            } catch (aiError) {
                logger.error('AI parsing failed, falling back to regex:', aiError.message);
                // Fallback to regex parsing
                parsed = {
                    identity: parseIdentity(text),
                    subjective: parseSubjective(text),
                    objective: parseObjective(text),
                    assessment: parseAssessment(text),
                    plan: parsePlan(text),
                    _parsed_by: 'regex',
                    _ai_error: aiError.message
                };
            }
        } else {
            // Use regex parsing
            parsed = {
                identity: parseIdentity(text),
                subjective: parseSubjective(text),
                objective: parseObjective(text),
                assessment: parseAssessment(text),
                plan: parsePlan(text),
                _parsed_by: 'regex'
            };
        }

        // Parse visit date and location (still use regex for these)
        const visit_date = parseVisitDate(text);
        const detected_location = detectLocation(text);

        // Map to template format with user-selected category
        const template = mapToTemplate(parsed, category);

        // Build response with optional warnings
        const responseData = {
            raw_parsed: parsed,
            template: template,
            category: category,
            confidence: calculateConfidence(parsed),
            visit_date: visit_date,
            visit_date_detected: !!visit_date,
            visit_location: detected_location,
            visit_location_detected: !!detected_location,
            parsed_by: parsed._parsed_by || 'regex'
        };

        // Include AI error message if fallback was used
        if (parsed._ai_error) {
            responseData.ai_error = parsed._ai_error;
            responseData.warning = 'AI parsing gagal, menggunakan regex parsing. Hasil mungkin kurang akurat.';
        }

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error parsing medical record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to parse medical record',
            error: error.message
        });
    }
});

/**
 * Calculate parsing confidence score
 */
function calculateConfidence(parsed) {
    let score = 0;
    let total = 0;

    // Check identity fields
    const identityFields = ['nama', 'jenis_kelamin', 'tanggal_lahir', 'no_hp'];
    identityFields.forEach(f => {
        total++;
        if (parsed.identity[f]) score++;
    });

    // Check subjective fields
    if (parsed.subjective.keluhan_utama) { total++; score++; }
    else { total++; }

    // Check objective fields
    const objectiveFields = ['tensi', 'nadi', 'suhu'];
    objectiveFields.forEach(f => {
        total++;
        if (parsed.objective[f]) score++;
    });

    // Check assessment
    if (parsed.assessment.diagnosis) { total++; score++; }
    else { total++; }

    // Check plan
    if (parsed.plan.raw) { total++; score++; }
    else { total++; }

    return {
        score: score,
        total: total,
        percentage: Math.round((score / total) * 100)
    };
}

/**
 * GET /api/medical-import/template/:category
 * Get empty template for a category
 */
router.get('/api/medical-import/template/:category', verifyToken, (req, res) => {
    const { category } = req.params;

    const templates = {
        obstetri: {
            sections: ['identitas', 'anamnesa', 'pemeriksaan_fisik', 'pemeriksaan_obstetri', 'usg', 'diagnosis', 'planning'],
            required_fields: ['nama', 'keluhan_utama', 'usia_kehamilan', 'diagnosis_utama']
        },
        gyn_repro: {
            sections: ['identitas', 'anamnesa', 'pemeriksaan_fisik', 'pemeriksaan_ginekologi', 'diagnosis', 'planning'],
            required_fields: ['nama', 'keluhan_utama', 'diagnosis_utama']
        },
        gyn_special: {
            sections: ['identitas', 'anamnesa', 'pemeriksaan_fisik', 'pemeriksaan_ginekologi', 'penunjang', 'diagnosis', 'planning'],
            required_fields: ['nama', 'keluhan_utama', 'diagnosis_utama']
        }
    };

    if (!templates[category]) {
        return res.status(400).json({
            success: false,
            message: 'Invalid category. Use: obstetri, gyn_repro, or gyn_special'
        });
    }

    res.json({
        success: true,
        data: templates[category]
    });
});

/**
 * POST /api/medical-import/bulk
 * Bulk import multiple medical records
 * Accepts an array of records with text and metadata
 */
router.post('/api/medical-import/bulk', verifyToken, async (req, res) => {
    try {
        const { records, default_location, default_category } = req.body;

        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Records array is required'
            });
        }

        if (records.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 records per bulk import'
            });
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            try {
                const text = record.text || record.content;
                const category = record.category || default_category || 'obstetri';

                if (!text) {
                    errors.push({ index: i, error: 'Missing text content' });
                    continue;
                }

                // Parse the record
                const parsed = {
                    identity: parseIdentity(text),
                    subjective: parseSubjective(text),
                    objective: parseObjective(text),
                    assessment: parseAssessment(text),
                    plan: parsePlan(text)
                };

                // Parse visit date and location
                const visit_date = record.visit_date || parseVisitDate(text);
                const visit_location = record.visit_location || detectLocation(text) || default_location;

                // Map to template
                const template = mapToTemplate(parsed, category);

                results.push({
                    index: i,
                    success: true,
                    template: template,
                    category: category,
                    visit_date: visit_date,
                    visit_date_detected: !!parseVisitDate(text),
                    visit_location: visit_location,
                    visit_location_detected: !!detectLocation(text),
                    confidence: calculateConfidence(parsed),
                    patient_name: parsed.identity.nama || 'Unknown'
                });

            } catch (err) {
                errors.push({ index: i, error: err.message });
            }
        }

        res.json({
            success: true,
            data: {
                total: records.length,
                successful: results.length,
                failed: errors.length,
                results: results,
                errors: errors
            }
        });

    } catch (error) {
        console.error('Error in bulk import:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process bulk import',
            error: error.message
        });
    }
});

/**
 * POST /api/medical-import/save
 * Save imported medical record to database
 */
router.post('/api/medical-import/save', verifyToken, async (req, res) => {
    try {
        const {
            patient_id,
            mr_id,
            category,
            visit_date,
            visit_location,
            record_data
        } = req.body;

        if (!patient_id || !mr_id) {
            return res.status(400).json({
                success: false,
                message: 'patient_id and mr_id are required'
            });
        }

        // Validate visit_location
        const validLocations = ['klinik_private', 'rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara'];
        if (visit_location && !validLocations.includes(visit_location)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid visit_location. Use: ' + validLocations.join(', ')
            });
        }

        const now = new Date();
        const visitDateTime = visit_date ? new Date(visit_date) : now;

        // Check if MR record exists
        const [existingMR] = await db.query(
            'SELECT id FROM sunday_clinic_records WHERE mr_id = ?',
            [mr_id]
        );

        if (existingMR.length === 0) {
            // Create new sunday_clinic_record
            await db.query(
                `INSERT INTO sunday_clinic_records (mr_id, patient_id, visit_location, created_at, last_activity_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [mr_id, patient_id, visit_location || 'klinik_private', visitDateTime, visitDateTime]
            );
        } else if (visit_location) {
            // Update existing record's location and activity time
            await db.query(
                `UPDATE sunday_clinic_records
                 SET visit_location = ?, last_activity_at = ?
                 WHERE mr_id = ?`,
                [visit_location, visitDateTime, mr_id]
            );
        }

        // Save medical record
        const recordType = category === 'obstetri' ? 'pemeriksaan_kehamilan' :
                          category === 'gyn_repro' ? 'pemeriksaan_ginekologi' :
                          'pemeriksaan_ginekologi';

        await db.query(
            `INSERT INTO medical_records (mr_id, record_type, record_data, created_at, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [mr_id, recordType, JSON.stringify(record_data), visitDateTime, req.user.id]
        );

        res.json({
            success: true,
            message: 'Medical record saved successfully',
            data: {
                mr_id: mr_id,
                patient_id: patient_id,
                visit_location: visit_location || 'klinik_private',
                visit_date: visitDateTime.toISOString()
            }
        });

    } catch (error) {
        console.error('Error saving imported record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save medical record',
            error: error.message
        });
    }
});

module.exports = router;
