/**
 * AI Service Module
 * Provides AI-powered features using OpenAI GPT-4o-mini
 */

const OpenAI = require('openai');
const db = require('../db');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

const AI_MODEL = 'gpt-4o-mini';

/**
 * Smart Triage - Detect visit category from complaint
 * @param {Object} params - Detection parameters
 * @param {string} params.patientId - Patient ID
 * @param {string} params.complaint - Patient complaint/keluhan
 * @param {Object} params.intakeData - Patient intake data (optional)
 * @returns {Promise<Object>} Detection result
 */
async function detectVisitCategory({ patientId, complaint, intakeData = {} }) {
    try {
        // Get patient history
        const patientHistory = await getPatientHistory(patientId);

        // Build prompt
        const prompt = `Anda adalah asisten medis spesialis ginekologi dan obstetri.
Tugas Anda: Analisis keluhan pasien dan tentukan kategori kunjungan yang tepat.

KELUHAN PASIEN: "${complaint}"

RIWAYAT PASIEN:
${JSON.stringify(patientHistory, null, 2)}

DATA INTAKE (jika ada):
${JSON.stringify(intakeData, null, 2)}

KATEGORI YANG TERSEDIA:
1. obstetri - Kehamilan, ANC (Antenatal Care), persalinan, post-partum
   Contoh: hamil, USG, kontrol kandungan, mual muntah kehamilan, cek janin

2. gyn_repro - Kesehatan reproduksi, KB, menstruasi, fertilitas
   Contoh: KB, kontrasepsi, haid tidak teratur, program hamil, nifas

3. gyn_special - Penyakit ginekologi, infeksi, tumor
   Contoh: keputihan, gatal, nyeri panggul, kista, miom, perdarahan abnormal

CONFIDENCE LEVEL:
- high: 90%+ yakin, tidak perlu konfirmasi
- medium: 70-90% yakin, perlu konfirmasi staff
- low: 50-70% yakin, staff harus pilih manual

RESPONSE FORMAT (JSON):
{
  "category": "obstetri|gyn_repro|gyn_special",
  "confidence": "high|medium|low",
  "reasoning": "Penjelasan singkat 1-2 kalimat kenapa kategori ini dipilih",
  "keywords_matched": ["keyword1", "keyword2"],
  "suggested_questions": ["Pertanyaan follow-up 1?", "Pertanyaan 2?"]
}

Berikan response dalam format JSON yang valid.`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical assistant specializing in gynecology and obstetrics. Always respond in valid JSON format.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3, // Lower temperature for more consistent results
            max_tokens: 500
        });

        const result = JSON.parse(response.choices[0].message.content);

        // Log detection for monitoring
        await logAiDetection({
            patient_id: patientId,
            complaint,
            detection_result: result,
            tokens_used: response.usage.total_tokens
        });

        return {
            success: true,
            data: result,
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('AI Detection Error:', error);
        return {
            success: false,
            error: error.message,
            fallback: await fallbackKeywordDetection(complaint)
        };
    }
}

/**
 * Generate medical record summary
 * @param {string} patientId - Patient ID
 * @returns {Promise<Object>} Summary result
 */
async function generateMedicalSummary(patientId) {
    try {
        // Get all medical records for patient
        const [records] = await db.query(`
            SELECT
                mr.record_id,
                mr.record_category,
                mr.record_data,
                mr.created_at,
                a.appointment_date,
                a.complaint
            FROM medical_records mr
            LEFT JOIN appointments a ON mr.appointment_id = a.id
            WHERE mr.patient_id = ?
            ORDER BY mr.created_at DESC
            LIMIT 20
        `, [patientId]);

        // Get patient info
        const [patient] = await db.query(`
            SELECT p.*, u.email
            FROM patients p
            LEFT JOIN users u ON p.id = u.new_id
            WHERE p.id = ?
        `, [patientId]);

        if (patient.length === 0) {
            throw new Error('Patient not found');
        }

        const patientInfo = patient[0];

        const prompt = `Anda adalah dokter spesialis kandungan yang membuat ringkasan rekam medis.

INFORMASI PASIEN:
Nama: ${patientInfo.full_name}
ID: ${patientId}
Usia: ${patientInfo.age} tahun
Status: ${patientInfo.marital_status}

RIWAYAT REKAM MEDIS:
${JSON.stringify(records, null, 2)}

Buatlah ringkasan medis yang komprehensif namun ringkas untuk dokter, dengan format:

{
  "patient_summary": "Ringkasan identitas dan kondisi pasien saat ini",
  "current_condition": "Kondisi terkini atau kehamilan aktif (jika ada)",
  "high_risk_factors": ["Faktor risiko 1", "Faktor risiko 2"],
  "recent_visits": [
    {
      "date": "YYYY-MM-DD",
      "category": "obstetri|gyn_repro|gyn_special",
      "summary": "Ringkasan kunjungan"
    }
  ],
  "action_needed": "Tindakan atau monitoring yang diperlukan",
  "notes": "Catatan penting lainnya"
}

Response harus dalam format JSON yang valid.`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an experienced obstetrician-gynecologist creating medical summaries. Always respond in valid JSON format in Indonesian language.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
            max_tokens: 1000
        });

        const summary = JSON.parse(response.choices[0].message.content);

        // Log summary generation
        await logAiSummary({
            patient_id: patientId,
            summary,
            tokens_used: response.usage.total_tokens
        });

        return {
            success: true,
            data: summary,
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('AI Summary Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Validate anamnesa data consistency
 * @param {Object} anamnesaData - Anamnesa form data
 * @param {string} category - Visit category
 * @returns {Promise<Object>} Validation result
 */
async function validateAnamnesa(anamnesaData, category) {
    try {
        const prompt = `Anda adalah validator data medis.
Periksa konsistensi data anamnesa ${category} berikut:

${JSON.stringify(anamnesaData, null, 2)}

Periksa:
1. Konsistensi data obstetri (G, P, A harus match dengan riwayat kehamilan)
2. Logical errors (tanggal, usia kehamilan, dll)
3. Missing critical information
4. Data yang tidak masuk akal

Response format:
{
  "is_valid": true/false,
  "errors": ["Error 1", "Error 2"],
  "warnings": ["Warning 1", "Warning 2"],
  "suggestions": ["Saran perbaikan 1", "Saran 2"],
  "missing_info": ["Info yang perlu ditanyakan 1", "Info 2"]
}`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical data validator. Always respond in valid JSON format in Indonesian language.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 500
        });

        return {
            success: true,
            data: JSON.parse(response.choices[0].message.content),
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('AI Validation Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Patient chatbot for common questions
 * @param {string} question - Patient question
 * @param {string} patientId - Patient ID (optional, for context)
 * @returns {Promise<Object>} Chatbot response
 */
async function chatbotResponse(question, patientId = null) {
    try {
        let contextInfo = '';

        if (patientId) {
            const [patient] = await db.query(`
                SELECT p.full_name, p.age, p.marital_status
                FROM patients p
                WHERE p.id = ?
            `, [patientId]);

            if (patient.length > 0) {
                contextInfo = `\nKONTEKS PASIEN:\n${JSON.stringify(patient[0])}`;
            }
        }

        const prompt = `Anda adalah asisten virtual klinik kandungan yang ramah dan membantu.
${contextInfo}

PERTANYAAN PASIEN: "${question}"

Jawab dengan:
1. Ramah dan profesional
2. Informasi medis umum (bukan diagnosis)
3. Sarankan booking appointment jika perlu
4. Jika emergency, sarankan segera ke IGD

Response format:
{
  "response": "Jawaban untuk pasien",
  "is_emergency": true/false,
  "suggested_action": "book_appointment|call_clinic|go_to_er|none",
  "related_topics": ["Topik terkait 1", "Topik 2"]
}`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a friendly medical assistant for a gynecology clinic. Always respond in valid JSON format in Indonesian language. Be helpful but always recommend seeing a doctor for specific medical advice.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 400
        });

        return {
            success: true,
            data: JSON.parse(response.choices[0].message.content),
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('Chatbot Error:', error);
        return {
            success: false,
            error: error.message,
            fallback: {
                response: 'Maaf, saya sedang mengalami gangguan. Silakan hubungi klinik langsung atau coba lagi nanti.',
                is_emergency: false,
                suggested_action: 'call_clinic'
            }
        };
    }
}

// ============ HELPER FUNCTIONS ============

/**
 * Get patient visit history
 */
async function getPatientHistory(patientId) {
    try {
        const [appointments] = await db.query(`
            SELECT
                a.appointment_date,
                a.appointment_time,
                a.complaint,
                a.status,
                mr.record_category
            FROM appointments a
            LEFT JOIN medical_records mr ON a.id = mr.appointment_id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC
            LIMIT 5
        `, [patientId]);

        const [intakes] = await db.query(`
            SELECT pregnant_status, birth_date, age
            FROM patient_intake_submissions
            WHERE patient_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        `, [patientId]);

        return {
            recent_appointments: appointments,
            latest_intake: intakes[0] || null
        };
    } catch (error) {
        console.error('Error getting patient history:', error);
        return { recent_appointments: [], latest_intake: null };
    }
}

/**
 * Fallback keyword-based detection (when AI fails)
 */
function fallbackKeywordDetection(complaint) {
    const lowerComplaint = complaint.toLowerCase();

    const obstetriKeywords = ['hamil', 'kehamilan', 'usg', 'janin', 'kontrol kandungan', 'mual muntah', 'anc', 'prenatal', 'trimester'];
    const gynReproKeywords = ['kb', 'kontrasepsi', 'haid', 'menstruasi', 'program hamil', 'nifas', 'post partum', 'telat haid'];
    const gynSpecialKeywords = ['keputihan', 'gatal', 'nyeri panggul', 'perdarahan', 'kista', 'miom', 'endometriosis', 'tumor'];

    let obsScore = 0, reproScore = 0, specialScore = 0;

    obstetriKeywords.forEach(kw => { if (lowerComplaint.includes(kw)) obsScore++; });
    gynReproKeywords.forEach(kw => { if (lowerComplaint.includes(kw)) reproScore++; });
    gynSpecialKeywords.forEach(kw => { if (lowerComplaint.includes(kw)) specialScore++; });

    let category = 'gyn_special';
    let confidence = 'low';

    if (obsScore > reproScore && obsScore > specialScore) {
        category = 'obstetri';
        confidence = obsScore >= 2 ? 'high' : 'medium';
    } else if (reproScore > obsScore && reproScore > specialScore) {
        category = 'gyn_repro';
        confidence = reproScore >= 2 ? 'high' : 'medium';
    } else if (specialScore > 0) {
        category = 'gyn_special';
        confidence = specialScore >= 2 ? 'high' : 'medium';
    }

    return {
        category,
        confidence,
        reasoning: 'Deteksi fallback berdasarkan keyword matching',
        keywords_matched: [],
        suggested_questions: []
    };
}

/**
 * Log AI detection to database
 */
async function logAiDetection(data) {
    try {
        await db.query(`
            INSERT INTO ai_detection_logs
            (patient_id, complaint, detection_result, tokens_used, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [
            data.patient_id,
            data.complaint,
            JSON.stringify(data.detection_result),
            data.tokens_used
        ]);
    } catch (error) {
        // Table might not exist yet, just log to console
        console.log('AI Detection Log:', data);
    }
}

/**
 * Log AI summary generation
 */
async function logAiSummary(data) {
    try {
        await db.query(`
            INSERT INTO ai_summary_logs
            (patient_id, summary, tokens_used, created_at)
            VALUES (?, ?, ?, NOW())
        `, [
            data.patient_id,
            JSON.stringify(data.summary),
            data.tokens_used
        ]);
    } catch (error) {
        console.log('AI Summary Log:', data);
    }
}

/**
 * Generate smart interview questions based on category
 * @param {string} category - Visit category (obstetri, gyn_repro, gyn_special)
 * @param {string} complaint - Patient complaint
 * @param {Object} patientData - Patient basic data
 * @returns {Promise<Object>} Interview questions
 */
async function generateInterviewQuestions(category, complaint, patientData = {}) {
    try {
        const categoryPrompts = {
            obstetri: `Pasien hamil atau terkait kehamilan`,
            gyn_repro: `Pasien terkait kesehatan reproduksi, KB, atau menstruasi`,
            gyn_special: `Pasien dengan keluhan ginekologi (infeksi, tumor, dll)`
        };

        const prompt = `Anda adalah dokter kandungan yang melakukan anamnesa awal.

KATEGORI: ${categoryPrompts[category]}
KELUHAN: "${complaint}"
DATA PASIEN: ${JSON.stringify(patientData)}

Buatlah 5 pertanyaan penting untuk anamnesa awal yang:
1. Relevan dengan keluhan
2. Terstruktur dari umum ke spesifik
3. Membantu diagnosis awal
4. Singkat dan mudah dipahami pasien
5. Dalam bahasa Indonesia yang ramah

Response format:
{
  "questions": [
    {
      "id": 1,
      "question": "Pertanyaan 1?",
      "type": "text|date|number|choice",
      "choices": ["pilihan1", "pilihan2"],
      "why_important": "Penjelasan kenapa pertanyaan ini penting"
    }
  ],
  "category_confirmed": "obstetri|gyn_repro|gyn_special",
  "interview_goal": "Tujuan interview ini untuk mengetahui..."
}`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an experienced obstetrician-gynecologist conducting initial patient interviews. Always respond in valid JSON format in Indonesian language.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.5,
            max_tokens: 800
        });

        return {
            success: true,
            data: JSON.parse(response.choices[0].message.content),
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('AI Interview Questions Error:', error);
        // Fallback to basic questions
        return {
            success: false,
            error: error.message,
            fallback: getFallbackQuestions(category)
        };
    }
}

/**
 * Process interview answers and generate pre-anamnesa
 * @param {string} category - Visit category
 * @param {string} complaint - Patient complaint
 * @param {Array} answers - Array of {question, answer} pairs
 * @returns {Promise<Object>} Pre-anamnesa data
 */
async function processInterviewAnswers(category, complaint, answers) {
    try {
        const prompt = `Anda adalah dokter yang menyusun hasil anamnesa.

KATEGORI: ${category}
KELUHAN: "${complaint}"

JAWABAN PASIEN:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n\n')}

Buatlah pre-anamnesa terstruktur yang siap diinput ke rekam medis:

Response format untuk ${category}:
${getAnamnesaStructure(category)}

PENTING:
- Ekstrak informasi medis yang relevan
- Format sesuai struktur anamnesa ${category}
- Tandai data yang masih perlu konfirmasi dokter
- Gunakan istilah medis yang tepat`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an experienced doctor structuring medical history (anamnesa). Always respond in valid JSON format in Indonesian language.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 1200
        });

        const preAnamnesa = JSON.parse(response.choices[0].message.content);

        // Log interview completion
        await logInterviewCompletion({
            category,
            complaint,
            answers,
            pre_anamnesa: preAnamnesa,
            tokens_used: response.usage.total_tokens
        });

        return {
            success: true,
            data: {
                ...preAnamnesa,
                metadata: {
                    ai_generated: true,
                    generated_at: new Date().toISOString(),
                    requires_doctor_review: true
                }
            },
            tokensUsed: response.usage.total_tokens
        };

    } catch (error) {
        console.error('AI Process Answers Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============ HELPER FUNCTIONS FOR INTERVIEW ============

/**
 * Get anamnesa structure template based on category
 */
function getAnamnesaStructure(category) {
    const structures = {
        obstetri: `{
  "keluhan_utama": "string",
  "riwayat_kehamilan_sekarang": {
    "usia_kehamilan": "number (minggu)",
    "hpht": "date (YYYY-MM-DD)",
    "keluhan": "string"
  },
  "riwayat_obstetri": {
    "gravida": "number",
    "para": "number",
    "abortus": "number"
  },
  "riwayat_penyakit": "string",
  "catatan_tambahan": "string"
}`,
        gyn_repro: `{
  "keluhan_utama": "string",
  "riwayat_menstruasi": {
    "hpht": "date",
    "siklus": "string (teratur/tidak)",
    "durasi": "string"
  },
  "riwayat_kb": "string",
  "riwayat_penyakit": "string",
  "catatan_tambahan": "string"
}`,
        gyn_special: `{
  "keluhan_utama": "string",
  "onset": "string (kapan mulai)",
  "karakteristik": "string",
  "faktor_pemicu": "string",
  "riwayat_penyakit": "string",
  "catatan_tambahan": "string"
}`
    };

    return structures[category] || structures.gyn_special;
}

/**
 * Fallback questions when AI fails
 */
function getFallbackQuestions(category) {
    const fallbackQuestions = {
        obstetri: {
            questions: [
                { id: 1, question: "Berapa usia kehamilan Anda saat ini?", type: "text" },
                { id: 2, question: "Kapan hari pertama haid terakhir (HPHT)?", type: "date" },
                { id: 3, question: "Apakah ada keluhan selama kehamilan?", type: "text" },
                { id: 4, question: "Berapa kali hamil, melahirkan, dan keguguran? (G_P_A_)", type: "text" },
                { id: 5, question: "Apakah ada riwayat penyakit?", type: "text" }
            ]
        },
        gyn_repro: {
            questions: [
                { id: 1, question: "Kapan haid terakhir Anda?", type: "date" },
                { id: 2, question: "Apakah siklus haid teratur?", type: "choice", choices: ["Teratur", "Tidak teratur"] },
                { id: 3, question: "Apakah sedang menggunakan KB? Jenis apa?", type: "text" },
                { id: 4, question: "Apa keluhan yang Anda rasakan?", type: "text" },
                { id: 5, question: "Apakah ada riwayat penyakit?", type: "text" }
            ]
        },
        gyn_special: {
            questions: [
                { id: 1, question: "Sejak kapan keluhan mulai dirasakan?", type: "text" },
                { id: 2, question: "Bagaimana karakteristik keluhan? (nyeri/gatal/perdarahan/dll)", type: "text" },
                { id: 3, question: "Apa yang memicu atau memperburuk keluhan?", type: "text" },
                { id: 4, question: "Sudah pernah berobat sebelumnya? Dengan apa?", type: "text" },
                { id: 5, question: "Apakah ada riwayat penyakit?", type: "text" }
            ]
        }
    };

    return fallbackQuestions[category] || fallbackQuestions.gyn_special;
}

/**
 * Log interview completion
 */
async function logInterviewCompletion(data) {
    try {
        await db.query(`
            INSERT INTO ai_interview_logs
            (category, complaint, answers, pre_anamnesa, tokens_used, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [
            data.category,
            data.complaint,
            JSON.stringify(data.answers),
            JSON.stringify(data.pre_anamnesa),
            data.tokens_used
        ]);
    } catch (error) {
        console.log('AI Interview Log:', data);
    }
}

module.exports = {
    detectVisitCategory,
    generateMedicalSummary,
    validateAnamnesa,
    chatbotResponse,
    generateInterviewQuestions,
    processInterviewAnswers
};
