/**
 * OpenAI Service for Sunday Clinic
 * Handles GPT-4o-mini integration for anamnesa generation
 */

const logger = require('../utils/logger');

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini'; // Using GPT-4o-mini as requested

/**
 * Generate anamnesa summary from patient intake data
 * @param {Object} intakeData - Patient intake form data
 * @param {string} category - Patient category (obstetri, gyn_repro, gyn_special)
 * @returns {Promise<string>} - Generated anamnesa summary
 */
async function generateAnamnesaSummary(intakeData, category) {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
    }

    try {
        const prompt = buildPromptForCategory(intakeData, category);

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: getSystemPrompt(category)
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const summary = data.choices[0]?.message?.content || '';

        logger.info('Generated anamnesa summary', {
            category,
            tokens: data.usage?.total_tokens
        });

        return summary.trim();

    } catch (error) {
        logger.error('Failed to generate anamnesa summary', {
            error: error.message,
            category
        });
        throw error;
    }
}

/**
 * Build system prompt based on patient category
 */
function getSystemPrompt(category) {
    const basePrompt = `Anda adalah asisten medis yang membantu dokter kandungan membuat ringkasan anamnesa dari data intake pasien.
Tugas Anda adalah membuat ringkasan anamnesa yang:
- Ringkas dan jelas dalam bahasa Indonesia medis
- Terstruktur sesuai kategori pasien
- Mencakup informasi penting untuk diagnosis
- Menggunakan terminologi medis yang tepat
- Profesional dan objektif`;

    const categorySpecific = {
        obstetri: `\nKategori: OBSTETRI (Kehamilan)
Fokus pada: status kehamilan, HPHT, usia gestasi, keluhan kehamilan, riwayat obstetri (G P A), risiko kehamilan, ANC sebelumnya.`,

        gyn_repro: `\nKategori: GINEKOLOGI REPRODUKSI
Fokus pada: tujuan reproduksi (promil/KB), riwayat menstruasi, siklus haid, riwayat kontrasepsi, assessment kesuburan, riwayat kehamilan jika ada.`,

        gyn_special: `\nKategori: GINEKOLOGI KHUSUS
Fokus pada: keluhan utama ginekologi, gejala (keputihan/perdarahan/nyeri), riwayat menstruasi, riwayat ginekologi (PAP smear, operasi), dyspareunia.`
    };

    return basePrompt + (categorySpecific[category] || '');
}

/**
 * Build user prompt from intake data based on category
 */
function buildPromptForCategory(intake, category) {
    const payload = intake.payload || intake;

    if (category === 'obstetri') {
        return buildObstetriPrompt(payload);
    } else if (category === 'gyn_repro') {
        return buildGynReproPrompt(payload);
    } else if (category === 'gyn_special') {
        return buildGynSpecialPrompt(payload);
    }

    return 'Data intake tidak lengkap.';
}

/**
 * Build prompt for obstetri patients
 */
function buildObstetriPrompt(payload) {
    return `Buat ringkasan anamnesa dari data intake pasien berikut:

Status Kehamilan: ${payload.pregnant_status || '-'}
HPHT: ${payload.lmp_date || payload.lmp || '-'}
Usia Kehamilan: ${payload.gestational_weeks || '-'} minggu ${payload.gestational_days || ''} hari
Keluhan Kehamilan: ${Array.isArray(payload.pregnancy_complaints) ? payload.pregnancy_complaints.join(', ') : payload.pregnancy_complaints || 'Tidak ada keluhan'}
Detail Keluhan: ${payload.complaint_detail || '-'}

Riwayat Obstetri:
- Gravida: ${payload.gravida || '0'}
- Para: ${payload.para || '0'}
- Abortus: ${payload.abortus || '0'}
- Anak Hidup: ${payload.living || payload.living_children || '0'}

Riwayat ANC: ${payload.previous_anc || 'Belum pernah ANC'}
Riwayat Medis: ${payload.past_conditions_detail || payload.medical_history || 'Tidak ada'}
Alergi: ${payload.allergy_drugs || payload.allergy_food || payload.allergy_env || 'Tidak ada'}
Obat yang sedang dikonsumsi: ${Array.isArray(payload.medications) && payload.medications.length > 0 ? payload.medications.map(m => m.name).join(', ') : 'Tidak ada'}

Buat ringkasan anamnesa yang mencakup poin-poin penting di atas dengan format yang terstruktur.`;
}

/**
 * Build prompt for gyn repro patients
 */
function buildGynReproPrompt(payload) {
    const reproGoals = Array.isArray(payload.repro_goals) ? payload.repro_goals : [];

    return `Buat ringkasan anamnesa dari data intake pasien berikut:

Tujuan Konsultasi: ${reproGoals.join(', ') || '-'}
Detail Kebutuhan: ${payload.repro_goal_detail || payload.goalDetail || '-'}

Riwayat Menstruasi:
- Menarche: ${payload.menarche_age || payload.menarcheAge || '-'} tahun
- Siklus: ${payload.cycle_length || payload.cycleLength || '-'} hari (${payload.cycle_regular || payload.cycleRegular || '-'})
- Lama haid: ${payload.menstruation_duration || payload.menstruationDuration || '-'} hari
- HPHT: ${payload.lmp || payload.lmp_date || '-'}
- Jumlah perdarahan: ${payload.menstruation_flow || payload.menstruationFlow || '-'}
- Nyeri haid: ${payload.dysmenorrhea_level || payload.dysmenorrheaLevel || '-'}

Program Hamil (jika ada):
- Lama mencoba hamil: ${payload.repro_trying_duration || payload.tryingDuration || '-'}
- Program hamil: ${payload.fertility_program_interest || payload.programInterest || '-'}
- Pemeriksaan sebelumnya: ${payload.repro_previous_evaluations || payload.previousEvaluations || '-'}

Riwayat Kontrasepsi: ${payload.repro_last_contraception || payload.lastContraception || 'Tidak pernah KB'}
${payload.contraception_notes ? `Catatan KB: ${payload.contraception_notes}` : ''}

Riwayat Kehamilan:
- G: ${payload.gravida || '0'}, P: ${payload.para || '0'}, A: ${payload.abortus || '0'}

Riwayat Medis: ${payload.past_conditions_detail || 'Tidak ada'}
Alergi: ${payload.allergy_drugs || payload.allergy_food || 'Tidak ada'}

Buat ringkasan anamnesa yang mencakup poin-poin penting di atas dengan format yang terstruktur untuk assessment kesuburan.`;
}

/**
 * Build prompt for gyn special patients
 */
function buildGynSpecialPrompt(payload) {
    const complaints = Array.isArray(payload.chiefComplaints) ? payload.chiefComplaints : [];
    const gynSymptoms = Array.isArray(payload.gyn_symptoms) ? payload.gyn_symptoms : [];

    return `Buat ringkasan anamnesa dari data intake pasien berikut:

Keluhan Utama: ${complaints.join(', ') || '-'}
Detail Keluhan: ${payload.chiefComplaintDetails || payload.chief_complaint_details || '-'}

Gejala Ginekologi:
${gynSymptoms.length > 0 ? gynSymptoms.join(', ') : 'Tidak ada gejala spesifik'}

${payload.discharge_details ? `Detail Keputihan: ${payload.discharge_details}` : ''}
${payload.bleeding_details ? `Detail Perdarahan: ${payload.bleeding_details}` : ''}
${payload.pain_details ? `Detail Nyeri: ${payload.pain_details}` : ''}

Riwayat Menstruasi:
- Menarche: ${payload.menarche_age || '-'} tahun
- Siklus: ${payload.cycle_length || '-'} hari
- HPHT: ${payload.lmp || payload.lmp_date || '-'}
- Nyeri haid: ${payload.dysmenorrhea_level || '-'}

Riwayat Ginekologi:
- PAP Smear: ${payload.pap_smear_history || 'Belum pernah'}
- Dyspareunia: ${payload.dyspareunia ? 'Ya' : 'Tidak'}
- Operasi ginekologi: ${payload.gyn_surgery_history || 'Tidak ada'}

Riwayat Medis: ${payload.past_conditions_detail || 'Tidak ada'}
Alergi: ${payload.allergy_drugs || payload.allergy_food || 'Tidak ada'}
Obat yang sedang dikonsumsi: ${Array.isArray(payload.medications) && payload.medications.length > 0 ? payload.medications.map(m => m.name).join(', ') : 'Tidak ada'}

Buat ringkasan anamnesa yang mencakup poin-poin penting di atas dengan format yang terstruktur untuk evaluasi ginekologi.`;
}

module.exports = {
    generateAnamnesaSummary
};
