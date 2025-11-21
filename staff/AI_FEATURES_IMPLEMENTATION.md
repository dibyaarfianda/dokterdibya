# AI Features Implementation

**Date:** 2025-11-21
**Version:** 1.0.0
**Status:** ✅ READY FOR TESTING
**Model:** GPT-4o-mini (OpenAI)

---

## Overview

AI-powered features using OpenAI GPT-4o-mini untuk meningkatkan efisiensi dan akurasi sistem klinik:

1. **Smart Triage** - Auto-detect kategori kunjungan dari keluhan pasien
2. **Medical Summary** - Generate ringkasan rekam medis otomatis
3. **Anamnesa Validation** - Validasi konsistensi data anamnesa
4. **Patient Chatbot** - Asisten virtual untuk pasien

---

## 1. Smart Triage Detection

### Purpose
Otomatis mendeteksi kategori kunjungan (Obstetri, Gyn Repro, Gyn Special) berdasarkan keluhan pasien saat booking appointment.

### API Endpoint
```
POST /api/ai/detect-category
```

### Request Body
```json
{
  "patientId": "DRD0001",
  "complaint": "USG kehamilan 20 minggu",
  "intakeData": {
    "pregnant_status": "yes",
    "age": 28
  }
}
```

### Response
```json
{
  "success": true,
  "data": {
    "category": "obstetri",
    "confidence": "high",
    "reasoning": "Keluhan menyebutkan USG kehamilan yang jelas merupakan layanan obstetri",
    "keywords_matched": ["usg", "kehamilan"],
    "suggested_questions": [
      "Apakah ini kunjungan ANC rutin?",
      "Apakah ada keluhan khusus selama kehamilan?"
    ]
  },
  "tokensUsed": 245
}
```

### Confidence Levels
- **high** (90%+): Auto-detect, tidak perlu konfirmasi staff
- **medium** (70-90%): Perlu konfirmasi staff dengan 1 klik
- **low** (50-70%): Staff harus pilih manual

### Integration Example (Frontend)
```javascript
// When patient fills complaint field
const detectCategory = async (complaint) => {
    const response = await apiService.post('/ai/detect-category', {
        patientId: currentPatient.id,
        complaint: complaint,
        intakeData: {} // optional
    });

    if (response.success && response.data.confidence === 'high') {
        // Auto-fill category
        document.getElementById('category').value = response.data.category;
        showNotification(`✓ Kategori terdeteksi: ${response.data.category}`);
    } else if (response.data.confidence === 'medium') {
        // Ask for confirmation
        showConfirmDialog(
            `Kategori yang disarankan: ${response.data.category}`,
            response.data.reasoning
        );
    }
};
```

---

## 2. Medical Record Summary

### Purpose
Generate ringkasan komprehensif dari semua rekam medis pasien untuk membantu dokter memahami riwayat pasien dengan cepat.

### API Endpoint
```
GET /api/ai/summary/:patientId
```

### Response
```json
{
  "success": true,
  "data": {
    "patient_summary": "Ibu Siti, 32 tahun, G2P1A0, hamil 32 minggu",
    "current_condition": "Kehamilan trimester 3 dengan hipertensi gestasional",
    "high_risk_factors": [
      "Hipertensi sejak usia kehamilan 28 minggu",
      "Tekanan darah tertinggi 140/90"
    ],
    "recent_visits": [
      {
        "date": "2025-11-15",
        "category": "obstetri",
        "summary": "Kontrol ANC rutin, TD 135/85, janin aktif"
      }
    ],
    "action_needed": "Monitor tekanan darah ketat, pertimbangkan induksi persalinan jika TD meningkat",
    "notes": "Pasien pernah kunjungan Gyn Repro 2 tahun lalu untuk pemasangan KB IUD"
  },
  "tokensUsed": 680
}
```

### Integration Example
```javascript
// In Sunday Clinic page, when opening patient record
const loadPatientSummary = async (patientId) => {
    const response = await apiService.get(`/ai/summary/${patientId}`);

    if (response.success) {
        displaySummaryCard(response.data);
    }
};

function displaySummaryCard(summary) {
    const html = `
        <div class="ai-summary-card">
            <h4>📋 Ringkasan AI</h4>
            <p><strong>Kondisi:</strong> ${summary.current_condition}</p>
            ${summary.high_risk_factors.length > 0 ? `
                <div class="alert alert-warning">
                    <strong>⚠️ Faktor Risiko:</strong>
                    <ul>${summary.high_risk_factors.map(f => `<li>${f}</li>`).join('')}</ul>
                </div>
            ` : ''}
            <p><strong>Tindakan:</strong> ${summary.action_needed}</p>
        </div>
    `;
    document.getElementById('ai-summary').innerHTML = html;
}
```

---

## 3. Anamnesa Validation

### Purpose
Validasi konsistensi data anamnesa secara otomatis untuk mendeteksi kesalahan input atau data yang tidak masuk akal.

### API Endpoint
```
POST /api/ai/validate-anamnesa
```

### Request Body
```json
{
  "category": "obstetri",
  "anamnesaData": {
    "gravida": 3,
    "para": 2,
    "abortus": 1,
    "usia_kehamilan": 32,
    "hpht": "2025-03-01",
    "riwayat_kehamilan": [
      "2020 - Melahirkan normal, laki-laki, 3.2kg",
      "2022 - Keguguran usia 8 minggu"
    ]
  }
}
```

### Response
```json
{
  "success": true,
  "data": {
    "is_valid": true,
    "errors": [],
    "warnings": [
      "HPHT 1 Maret 2025 menghasilkan usia kehamilan ~37 minggu (bukan 32 minggu)"
    ],
    "suggestions": [
      "Periksa kembali HPHT atau usia kehamilan berdasarkan USG"
    ],
    "missing_info": [
      "Berat badan pre-pregnancy tidak tercatat",
      "Riwayat persalinan pertama (tahun 2020) belum lengkap"
    ]
  }
}
```

---

## 4. Patient Chatbot

### Purpose
Asisten virtual untuk menjawab pertanyaan umum pasien dan memberikan saran kapan harus booking appointment.

### API Endpoint
```
POST /api/ai/chatbot
```

### Request Body
```json
{
  "question": "Apakah normal kalau hamil 20 minggu sering pusing?",
  "patientId": "DRD0001"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "response": "Pusing pada kehamilan 20 minggu bisa normal karena perubahan tekanan darah dan volume darah yang meningkat. Namun, sebaiknya dikonsultasikan ke dokter untuk memastikan tidak ada masalah serius seperti anemia atau tekanan darah rendah/tinggi.",
    "is_emergency": false,
    "suggested_action": "book_appointment",
    "related_topics": [
      "Anemia dalam kehamilan",
      "Tekanan darah rendah saat hamil",
      "Kapan harus ke dokter saat hamil"
    ]
  }
}
```

### Integration Example (Patient Dashboard)
```javascript
// Chatbot widget
const sendMessage = async (message) => {
    const response = await apiService.post('/ai/chatbot', {
        question: message,
        patientId: currentUser.id
    });

    if (response.success) {
        displayChatMessage(response.data.response, 'ai');

        if (response.data.suggested_action === 'book_appointment') {
            showBookingButton();
        } else if (response.data.is_emergency) {
            showEmergencyAlert();
        }
    }
};
```

---

## Configuration

### Environment Variables

Add to `/var/www/dokterdibya/staff/backend/.env`:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=1000
AI_TEMPERATURE=0.3
```

### Cost Monitoring

AI usage tracked in `ai_usage_stats` table:

```sql
SELECT
    date,
    feature,
    total_requests,
    total_tokens,
    avg_tokens_per_request
FROM ai_usage_stats
WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
ORDER BY date DESC, feature;
```

---

## Testing

### 1. Test Smart Triage Detection

```bash
curl -X POST http://localhost:3000/api/ai/detect-category \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "DRD0001",
    "complaint": "USG kehamilan 24 minggu"
  }'
```

### 2. Test Medical Summary

```bash
curl -X GET http://localhost:3000/api/ai/summary/DRD0001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test Chatbot

```bash
curl -X POST http://localhost:3000/api/ai/chatbot \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Kapan saya harus kontrol kehamilan?",
    "patientId": "DRD0001"
  }'
```

---

## Fallback Mechanism

Jika OpenAI API gagal atau down, sistem akan fallback ke keyword-based detection:

```javascript
// Automatic fallback in aiService.js
if (AI API fails) {
    return fallbackKeywordDetection(complaint);
}
```

Fallback menggunakan keyword matching sederhana:
- **Obstetri**: hamil, usg, janin, kontrol kandungan, dll
- **Gyn Repro**: kb, haid, menstruasi, program hamil, dll
- **Gyn Special**: keputihan, gatal, nyeri panggul, kista, dll

---

## Database Schema

### ai_detection_logs
```sql
- id: BIGINT AUTO_INCREMENT
- patient_id: VARCHAR(10)
- complaint: TEXT
- detection_result: JSON
- tokens_used: INT
- created_at: DATETIME
```

### ai_summary_logs
```sql
- id: BIGINT AUTO_INCREMENT
- patient_id: VARCHAR(10)
- summary: JSON
- tokens_used: INT
- created_at: DATETIME
```

### ai_usage_stats
```sql
- id: BIGINT AUTO_INCREMENT
- date: DATE
- feature: VARCHAR(50) -- 'detection', 'summary', 'chatbot', 'validation'
- total_requests: INT
- total_tokens: INT
- avg_tokens_per_request: DECIMAL
```

---

## Files Created

✅ `/var/www/dokterdibya/staff/backend/services/aiService.js`
✅ `/var/www/dokterdibya/staff/backend/routes/ai.js`
✅ `/var/www/dokterdibya/staff/backend/migrations/20251121_create_ai_logs_tables.sql`
✅ `/var/www/dokterdibya/staff/backend/server.js` (updated)
✅ Package: `openai@latest` installed

---

## Next Steps

1. **Add OpenAI API Key** to `.env` file
2. **Update Appointment Booking UI** to use smart triage
3. **Add AI Summary Card** to Sunday Clinic page
4. **Add Chatbot Widget** to patient dashboard
5. **Monitor token usage** and costs

---

## Support

For issues or questions:
1. Check logs: `pm2 logs sunday-clinic`
2. Check AI detection logs: `SELECT * FROM ai_detection_logs ORDER BY created_at DESC LIMIT 10;`
3. Verify OpenAI API key is valid
4. Check fallback is working if AI fails

---

**Status:** ✅ Backend complete, ready for frontend integration and testing
