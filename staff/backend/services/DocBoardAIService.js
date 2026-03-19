/**
 * DocBoard AI Service
 * Provides AI-powered morning briefing for the doctor
 */

const OpenAI = require('openai');
const pool = require('../db');
const logger = require('../utils/logger');

const AI_MODEL = 'gpt-4o-mini';

// Initialize OpenAI client (lazy - only when needed)
let openaiClient = null;
function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

const LOCATION_LABELS = {
  klinik_private: 'Klinik Privat',
  rsia_melinda: 'RSIA Melinda',
  rsud_gambiran: 'RSUD Gambiran',
  rs_bhayangkara: 'RS Bhayangkara'
};

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

class DocBoardAIService {

  /**
   * Generate morning briefing for a given date
   * @param {string} date - YYYY-MM-DD format
   * @param {string} userId - User ID generating the briefing
   * @param {boolean} refresh - Force regeneration (bypass cache)
   * @returns {Promise<Object>} Briefing data
   */
  async generateBriefing(date, userId, refresh = false) {
    try {
      // Check cache first (unless refresh requested)
      if (!refresh) {
        const cached = await this.getCachedBriefing(date);
        if (cached) {
          return {
            success: true,
            data: cached,
            cached: true
          };
        }
      }

      // Gather data for the briefing (today + 2-day lookahead)
      const [patientData, surgeryData, scheduleData, lookaheadData, riskData] = await Promise.all([
        this.getPatientCounts(date),
        this.getSurgeries(date),
        this.getScheduleForDate(date),
        this.getLookahead(date, 2),
        this.getRiskCues(date)
      ]);

      // Try AI generation first, fall back to structured summary
      let briefingContent;
      const openai = getOpenAI();

      if (openai) {
        try {
          briefingContent = await this.generateAIBriefing(
            date, patientData, surgeryData, scheduleData, lookaheadData, riskData
          );
        } catch (aiError) {
          logger.warn('AI briefing generation failed, using fallback:', aiError.message);
          briefingContent = this.generateFallbackBriefing(
            date, patientData, surgeryData, scheduleData, lookaheadData, riskData
          );
        }
      } else {
        briefingContent = this.generateFallbackBriefing(
          date, patientData, surgeryData, scheduleData, lookaheadData, riskData
        );
      }

      // Save to cache
      await this.saveBriefing(date, briefingContent, userId);

      return {
        success: true,
        data: {
          briefing_date: date,
          content: briefingContent,
          generated_at: new Date().toISOString(),
          generated_by: userId
        },
        cached: false
      };

    } catch (error) {
      logger.error('DocBoard AI briefing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cached briefing for a date
   */
  async getCachedBriefing(date) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM docboard_briefings WHERE briefing_date = ?`,
        [date]
      );

      if (rows.length === 0) return null;

      const row = rows[0];

      // Check if generated today (cache valid for the day)
      const generatedAt = new Date(row.generated_at);
      const now = new Date();
      const sameDay = generatedAt.getFullYear() === now.getFullYear() &&
        generatedAt.getMonth() === now.getMonth() &&
        generatedAt.getDate() === now.getDate();

      if (!sameDay) return null; // Stale cache

      return {
        briefing_date: date,
        content: JSON.parse(row.content),
        generated_at: row.generated_at,
        generated_by: row.generated_by
      };
    } catch (error) {
      logger.error('Error checking briefing cache:', error);
      return null;
    }
  }

  /**
   * Save briefing to cache
   */
  async saveBriefing(date, content, userId) {
    try {
      await pool.query(
        `INSERT INTO docboard_briefings (briefing_date, content, generated_at, generated_by)
         VALUES (?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE content = VALUES(content), generated_at = NOW(), generated_by = VALUES(generated_by)`,
        [date, JSON.stringify(content), userId]
      );
    } catch (error) {
      logger.error('Error saving briefing cache:', error);
    }
  }

  /**
   * Get patient counts per location for a date
   */
  async getPatientCounts(date) {
    const [rows] = await pool.query(
      `SELECT location, patient_count, completed_count, sync_status
       FROM docboard_events
       WHERE event_date = ? AND is_disabled = 0
       ORDER BY location`,
      [date]
    );
    return rows;
  }

  /**
   * Get surgeries for a date
   */
  async getSurgeries(date) {
    const [rows] = await pool.query(
      `SELECT ss.patient_name, ss.diagnosis, ss.location, ss.surgery_time,
              ss.estimated_duration_min, ss.status, ss.special_notes,
              COALESCE(ot.name, ss.operation_type_other) as operation_name,
              COALESCE(ot.category, 'obstetri') as operation_category
       FROM surgery_schedules ss
       LEFT JOIN surgery_operation_types ot ON ss.operation_type_id = ot.id
       WHERE ss.surgery_date = ? AND ss.status NOT IN ('cancelled', 'postponed')
       ORDER BY ss.surgery_time`,
      [date]
    );
    return rows;
  }

  /**
   * Get practice schedules for the day of week matching the date
   */
  async getScheduleForDate(date) {
    const d = new Date(date + 'T00:00:00+07:00');
    const dayOfWeek = d.getDay();

    const [rows] = await pool.query(
      `SELECT location, start_time, end_time, notes
       FROM practice_schedules
       WHERE day_of_week = ? AND is_active = 1
       ORDER BY location`,
      [dayOfWeek]
    );
    return rows;
  }

  /**
   * Get surgery lookahead for next N days after date
   */
  async getLookahead(date, days) {
    const results = [];
    for (let i = 1; i <= days; i++) {
      const d = new Date(date + 'T00:00:00+07:00');
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayName = DAYS_ID[d.getDay()];
      const [rows] = await pool.query(
        `SELECT COUNT(*) as count FROM surgery_schedules
         WHERE surgery_date = ? AND status NOT IN ('cancelled', 'postponed')`,
        [dateStr]
      );
      results.push({ date: dateStr, dayName, surgeryCount: rows[0].count });
    }
    return results;
  }

  /**
   * Get risk cues from surgery data for a date
   */
  async getRiskCues(date) {
    const cues = [];
    const [surgeries] = await pool.query(
      `SELECT ss.patient_name, ss.asa_score, ss.anesthesia_type, ss.location,
              ss.estimated_duration_min, ot.name_id as op_name
       FROM surgery_schedules ss
       LEFT JOIN surgery_operation_types ot ON ss.operation_type_id = ot.id
       WHERE ss.surgery_date = ? AND ss.status NOT IN ('cancelled', 'postponed')`,
      [date]
    );

    for (const s of surgeries) {
      if (s.asa_score && s.asa_score >= 3) {
        cues.push(`ASA ${s.asa_score}: ${s.patient_name} (${s.op_name || 'operasi'}) - risiko anestesi tinggi`);
      }
      if (s.estimated_duration_min && s.estimated_duration_min >= 180) {
        cues.push(`Durasi panjang: ${s.patient_name} - estimasi ${s.estimated_duration_min} menit`);
      }
    }

    // Check if multiple surgeries at same location/time
    const byLocation = {};
    for (const s of surgeries) {
      if (!byLocation[s.location]) byLocation[s.location] = 0;
      byLocation[s.location]++;
    }
    for (const [loc, count] of Object.entries(byLocation)) {
      if (count >= 3) {
        cues.push(`${LOCATION_LABELS[loc] || loc}: ${count} operasi - jadwal padat`);
      }
    }

    return cues;
  }

  /**
   * Generate AI-powered briefing using OpenAI
   */
  async generateAIBriefing(date, patientData, surgeryData, scheduleData, lookaheadData, riskData) {
    const openai = getOpenAI();
    const dateObj = new Date(date + 'T00:00:00+07:00');
    const dayName = DAYS_ID[dateObj.getDay()];

    // Build context
    const totalPatients = patientData.reduce((sum, p) => sum + (p.patient_count || 0), 0);

    const locationSummary = patientData.map(p =>
      `- ${LOCATION_LABELS[p.location] || p.location}: ${p.patient_count} pasien (${p.completed_count} selesai)`
    ).join('\n');

    const surgerySummary = surgeryData.length > 0
      ? surgeryData.map(s =>
        `- ${s.operation_name} (${s.patient_name}) di ${LOCATION_LABELS[s.location] || s.location}, jam ${s.surgery_time || 'TBD'}, status: ${s.status}`
      ).join('\n')
      : 'Tidak ada jadwal operasi';

    const scheduleSummary = scheduleData.map(s => {
      const loc = s.location === 'klinik_privat' ? 'klinik_private' : s.location;
      return `- ${LOCATION_LABELS[loc] || s.location}: ${String(s.start_time).substring(0, 5)} - ${String(s.end_time).substring(0, 5)}`;
    }).join('\n');

    // Build lookahead summary
    const lookaheadSummary = (lookaheadData || []).map(d =>
      `- ${d.dayName} (${d.date}): ${d.surgeryCount} operasi`
    ).join('\n');

    // Risk cues
    const riskSummary = (riskData || []).length > 0
      ? riskData.join('\n')
      : 'Tidak ada peringatan risiko khusus';

    const prompt = `Hari: ${dayName}, ${date}

DATA PASIEN HARI INI:
Total pasien: ${totalPatients}
${locationSummary || 'Tidak ada data pasien'}

JADWAL OPERASI:
${surgerySummary}

JADWAL PRAKTEK:
${scheduleSummary || 'Tidak ada jadwal praktek'}

LOOKAHEAD (2 hari ke depan):
${lookaheadSummary || 'Tidak ada data'}

PERINGATAN RISIKO:
${riskSummary}

Buatkan morning briefing terstruktur dengan format JSON berikut:
{
  "summary": "Ringkasan 1-2 kalimat tentang hari ini",
  "patient_overview": [
    { "location": "nama lokasi", "location_key": "key lokasi", "count": 0, "completed": 0 }
  ],
  "total_patients": 0,
  "surgeries": [
    { "patient_name": "nama", "operation": "tipe operasi", "location": "lokasi", "time": "HH:MM", "status": "status" }
  ],
  "schedule_notes": ["catatan jadwal 1", "catatan 2"],
  "reminders": ["pengingat penting 1", "pengingat 2"],
  "risk_alerts": ["peringatan risiko 1"],
  "lookahead": [{ "date": "YYYY-MM-DD", "day": "Nama Hari", "surgery_count": 0 }]
}

Kriteria:
- Summary harus natural dan informatif dalam Bahasa Indonesia
- Jika ada operasi, sebutkan di summary
- Reminders bisa berisi tips seperti persiapan alat, check pasien priority, dll
- risk_alerts berisi peringatan ASA tinggi, durasi panjang, jadwal padat
- lookahead berisi ringkasan 2 hari ke depan
- Jika tidak ada pasien, berikan summary yang sesuai (hari libur/kosong)
- schedule_notes berisi catatan singkat tentang jadwal praktek hari ini`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Kamu adalah asisten medis untuk dokter Obgyn. Buat briefing harian singkat dalam Bahasa Indonesia. Selalu response dalam JSON yang valid.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 800
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Ensure required fields exist
    return {
      summary: result.summary || 'Briefing hari ini.',
      patient_overview: result.patient_overview || [],
      total_patients: result.total_patients || totalPatients,
      surgeries: result.surgeries || [],
      schedule_notes: result.schedule_notes || [],
      reminders: result.reminders || [],
      risk_alerts: result.risk_alerts || [],
      lookahead: result.lookahead || [],
      ai_generated: true,
      tokens_used: response.usage?.total_tokens || 0
    };
  }

  /**
   * Generate a structured briefing without AI (fallback)
   */
  generateFallbackBriefing(date, patientData, surgeryData, scheduleData, lookaheadData, riskData) {
    const dateObj = new Date(date + 'T00:00:00+07:00');
    const dayName = DAYS_ID[dateObj.getDay()];
    const totalPatients = patientData.reduce((sum, p) => sum + (p.patient_count || 0), 0);

    // Patient overview
    const patientOverview = patientData.map(p => ({
      location: LOCATION_LABELS[p.location] || p.location,
      location_key: p.location,
      count: p.patient_count || 0,
      completed: p.completed_count || 0
    }));

    // Surgeries
    const surgeries = surgeryData.map(s => ({
      patient_name: s.patient_name,
      operation: s.operation_name,
      location: LOCATION_LABELS[s.location] || s.location,
      time: s.surgery_time ? String(s.surgery_time).substring(0, 5) : 'TBD',
      status: s.status
    }));

    // Schedule notes
    const scheduleNotes = scheduleData.map(s => {
      const loc = s.location === 'klinik_privat' ? 'klinik_private' : s.location;
      const startTime = String(s.start_time).substring(0, 5);
      const endTime = String(s.end_time).substring(0, 5);
      return `${LOCATION_LABELS[loc] || s.location}: ${startTime} - ${endTime}`;
    });

    // Build summary
    let summary = `Hari ${dayName}, `;
    if (totalPatients > 0) {
      const locationCount = patientData.length;
      summary += `ada ${totalPatients} pasien di ${locationCount} lokasi.`;
    } else if (scheduleData.length > 0) {
      summary += `belum ada data pasien terdaftar.`;
    } else {
      summary += `tidak ada jadwal praktek.`;
    }

    if (surgeryData.length > 0) {
      summary += ` ${surgeryData.length} operasi terjadwal.`;
    }

    // Reminders
    const reminders = [];
    if (surgeryData.length > 0) {
      reminders.push('Periksa kesiapan pasien operasi dan kelengkapan dokumen');
    }
    if (totalPatients > 10) {
      reminders.push('Volume pasien tinggi, pastikan manajemen waktu');
    }

    // Add risk cues to reminders
    if (riskData && riskData.length > 0) {
      for (const cue of riskData) reminders.push(cue);
    }

    return {
      summary,
      patient_overview: patientOverview,
      total_patients: totalPatients,
      surgeries,
      schedule_notes: scheduleNotes,
      reminders,
      risk_alerts: riskData || [],
      lookahead: (lookaheadData || []).map(d => ({ date: d.date, day: d.dayName, surgery_count: d.surgeryCount })),
      ai_generated: false,
      tokens_used: 0
    };
  }
}

module.exports = new DocBoardAIService();
