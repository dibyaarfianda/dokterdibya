/**
 * Medical Record Import Parser
 * Parses text files from external systems and maps to our medical record template
 * Categories: obstetri, gyn_repro, gyn_special
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

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

    // Helper to extract value after label
    const extract = (label) => {
        const regex = new RegExp(`${label}[:\\s]*([^\\n]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    };

    identity.nama = extract('NAMA PASIEN');
    identity.jenis_kelamin = extract('JENIS KELAMIN');
    identity.usia = extract('USIA');
    identity.tempat_tanggal_lahir = extract('TEMPAT, TANGGAL LAHIR');
    identity.alamat = extract('ALAMAT');
    identity.status_pernikahan = extract('STATUS PERNIKAHAN');
    identity.no_identitas = extract('NO IDENTITAS');
    identity.pekerjaan = extract('PEKERJAAN');
    identity.no_hp = extract('NO HP');
    identity.asal_rujukan = extract('ASAL RUJUKAN');
    identity.tinggi_badan = extract('TINGGI BADAN');
    identity.berat_badan = extract('BERAT BADAN');

    // Parse birth date from tempat_tanggal_lahir
    if (identity.tempat_tanggal_lahir) {
        const parts = identity.tempat_tanggal_lahir.split(',');
        if (parts.length >= 2) {
            identity.tempat_lahir = parts[0].trim();
            identity.tanggal_lahir = parts[1].trim();
        }
    }

    // Parse height and weight numbers
    if (identity.tinggi_badan) {
        const tbMatch = identity.tinggi_badan.match(/(\d+(?:\.\d+)?)/);
        identity.tinggi_badan_cm = tbMatch ? parseFloat(tbMatch[1]) : null;
    }
    if (identity.berat_badan) {
        const bbMatch = identity.berat_badan.match(/(\d+(?:\.\d+)?)/);
        identity.berat_badan_kg = bbMatch ? parseFloat(bbMatch[1]) : null;
    }

    return identity;
}

/**
 * Parse SUBJECTIVE section (Anamnesis)
 */
function parseSubjective(text) {
    const subjective = {};

    // Extract SUBJECTIVE section
    const subjectiveMatch = text.match(/SUBJECTIVE\s*([\s\S]*?)(?=OBJECTIVE|$)/i);
    if (!subjectiveMatch) return subjective;

    const subText = subjectiveMatch[1];

    // Parse individual fields
    const keluhanMatch = subText.match(/Keluhan Utama\s*:\s*([^\n]+)/i);
    subjective.keluhan_utama = keluhanMatch ? keluhanMatch[1].trim() : null;

    const rpsMatch = subText.match(/Riwayat Penyakit Sekarang\s*\(RPS\)\s*:\s*([^\n]+)/i);
    subjective.rps = rpsMatch ? rpsMatch[1].trim() : null;

    const rpdMatch = subText.match(/Riwayat Penyakit Dahulu\s*\(RPD\)\s*:\s*([^\n]+)/i);
    subjective.rpd = rpdMatch ? rpdMatch[1].trim() : null;

    const rpkMatch = subText.match(/Riwayat Penyakit Keluarga\s*:\s*([^\n]*)/i);
    subjective.rpk = rpkMatch ? rpkMatch[1].trim() : null;

    // HPL (Hari Perkiraan Lahir) - indicates obstetrics
    const hplMatch = subText.match(/HPL\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    subjective.hpl = hplMatch ? hplMatch[1].trim() : null;

    // HPHT (Hari Pertama Haid Terakhir)
    const hphtMatch = subText.match(/HPHT\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    subjective.hpht = hphtMatch ? hphtMatch[1].trim() : null;

    return subjective;
}

/**
 * Parse OBJECTIVE section (Physical Examination)
 */
function parseObjective(text) {
    const objective = {};

    // Extract OBJECTIVE section
    const objectiveMatch = text.match(/OBJECTIVE\s*([\s\S]*?)(?=ASSESSMENT|$)/i);
    if (!objectiveMatch) return objective;

    const objText = objectiveMatch[1];

    // General condition
    const kuMatch = objText.match(/k\/u\s+(\w+)/i);
    objective.keadaan_umum = kuMatch ? kuMatch[1].trim() : null;

    // USG findings
    const usgMatch = objText.match(/USG\s*:\s*([^\n]+)/i);
    objective.usg = usgMatch ? usgMatch[1].trim() : null;

    // Parse USG details if present
    if (objective.usg) {
        // Extract fetal weight
        const weightMatch = objective.usg.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
        objective.berat_janin = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : null;

        // Extract presentation
        if (/kepala/i.test(objective.usg)) objective.presentasi = 'Kepala';
        else if (/bokong|sungsang/i.test(objective.usg)) objective.presentasi = 'Sungsang';
        else if (/lintang/i.test(objective.usg)) objective.presentasi = 'Lintang';

        // Placenta position
        const plasentaMatch = objective.usg.match(/plasenta\s+(\w+)/i);
        objective.plasenta = plasentaMatch ? plasentaMatch[1] : null;

        // Amniotic fluid
        if (/ketuban\s+cukup/i.test(objective.usg)) objective.ketuban = 'Cukup';
        else if (/ketuban\s+sedikit|oligohidramnion/i.test(objective.usg)) objective.ketuban = 'Sedikit';
        else if (/ketuban\s+banyak|polihidramnion/i.test(objective.usg)) objective.ketuban = 'Banyak';
    }

    // Vital signs
    const tensiMatch = objText.match(/Tensi\s*:\s*(\d+\/\d+)/i);
    objective.tensi = tensiMatch ? tensiMatch[1] : null;

    const nadiMatch = objText.match(/Nadi\s*:\s*(\d+)/i);
    objective.nadi = nadiMatch ? parseInt(nadiMatch[1]) : null;

    const suhuMatch = objText.match(/Suhu\s*:\s*(\d+(?:\.\d+)?)/i);
    objective.suhu = suhuMatch ? parseFloat(suhuMatch[1]) : null;

    const spo2Match = objText.match(/SpO2\s*:\s*(\d+)/i);
    objective.spo2 = spo2Match ? parseInt(spo2Match[1]) : null;

    const gcsMatch = objText.match(/GCS\s*:\s*([\d\-]+)/i);
    objective.gcs = gcsMatch ? gcsMatch[1] : null;

    const rrMatch = objText.match(/RR\s*:\s*(\d+)/i);
    objective.rr = rrMatch ? parseInt(rrMatch[1]) : null;

    const bbMatch = objText.match(/BB\s*:\s*(\d+(?:\.\d+)?)/i);
    objective.berat_badan = bbMatch ? parseFloat(bbMatch[1]) : null;

    return objective;
}

/**
 * Parse ASSESSMENT section (Diagnosis)
 */
function parseAssessment(text) {
    const assessment = {};

    // Extract ASSESSMENT section
    const assessmentMatch = text.match(/ASSESSMENT\s*([\s\S]*?)(?=PLAN|$)/i);
    if (!assessmentMatch) return assessment;

    const assText = assessmentMatch[1].trim();
    assessment.diagnosis = assText;

    // Parse obstetric formula (G P A)
    const obstetricMatch = assText.match(/G\s*(\d+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s*P\s*([\d\-]+)\s*/i);
    if (obstetricMatch) {
        // Convert Roman numerals
        const romanToNum = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };
        let gravida = obstetricMatch[1];
        assessment.gravida = romanToNum[gravida.toUpperCase()] || parseInt(gravida);
        assessment.para = obstetricMatch[2];
        assessment.is_obstetric = true;
    }

    // UK (Usia Kehamilan / Gestational Age)
    const ukMatch = assText.match(/uk\s*(\d+)\s*(?:(\d+)\/7)?\s*(?:mgg|minggu)/i);
    if (ukMatch) {
        assessment.usia_kehamilan_minggu = parseInt(ukMatch[1]);
        assessment.usia_kehamilan_hari = ukMatch[2] ? parseInt(ukMatch[2]) : 0;
        assessment.is_obstetric = true;
    }

    // Presentation
    if (/\+\s*Kepala/i.test(assText)) assessment.presentasi = 'Kepala';
    else if (/\+\s*Bokong|Sungsang/i.test(assText)) assessment.presentasi = 'Sungsang';

    return assessment;
}

/**
 * Parse PLAN section (Treatment Plan)
 */
function parsePlan(text) {
    const plan = {};

    // Extract PLAN section
    const planMatch = text.match(/PLAN\s*([\s\S]*?)(?=INSTRUKSI DOKTER|Dibuat Oleh|$)/i);
    if (!planMatch) return plan;

    const planText = planMatch[1].trim();
    const lines = planText.split('\n').filter(l => l.trim());

    plan.tindakan = [];
    plan.obat = [];
    plan.instruksi = [];

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        // Detect medications (usually contains dosage or common drug patterns)
        if (/\d+\s*(tab|kap|botol|strip|box|sachet|mg|ml)/i.test(line) ||
            /folamil|asam folat|vitamin|kalk|fe|tablet|kapsul/i.test(line)) {
            plan.obat.push(line);
        }
        // Detect procedures
        else if (/USG|sweep|CTG|NST|pemeriksaan|injeksi|infus/i.test(line)) {
            plan.tindakan.push(line);
        }
        // Rest is instructions
        else if (/kontrol|kembali|datang|minggu|hari|jika|bila/i.test(line)) {
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
 * Map parsed data to our medical record template format
 */
function mapToTemplate(parsed, category) {
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
            tinggi_badan: parsed.identity.tinggi_badan_cm,
            berat_badan: parsed.identity.berat_badan_kg || parsed.objective.berat_badan
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
            diagnosis_utama: parsed.assessment.diagnosis,
            gravida: parsed.assessment.gravida,
            para: parsed.assessment.para,
            usia_kehamilan_minggu: parsed.assessment.usia_kehamilan_minggu,
            usia_kehamilan_hari: parsed.assessment.usia_kehamilan_hari,
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
 * Parse medical record text and return structured data
 * Category is selected by user: obstetri, gyn_repro, gyn_special
 */
router.post('/api/medical-import/parse', verifyToken, (req, res) => {
    try {
        const { text, category } = req.body;

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

        // Parse each section
        const parsed = {
            identity: parseIdentity(text),
            subjective: parseSubjective(text),
            objective: parseObjective(text),
            assessment: parseAssessment(text),
            plan: parsePlan(text)
        };

        // Parse visit date and location
        const visit_date = parseVisitDate(text);
        const detected_location = detectLocation(text);

        // Map to template format with user-selected category
        const template = mapToTemplate(parsed, category);

        res.json({
            success: true,
            data: {
                raw_parsed: parsed,
                template: template,
                category: category,
                confidence: calculateConfidence(parsed),
                visit_date: visit_date,
                visit_date_detected: !!visit_date,
                visit_location: detected_location,
                visit_location_detected: !!detected_location
            }
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
