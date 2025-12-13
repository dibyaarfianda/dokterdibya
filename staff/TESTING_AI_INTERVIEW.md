# Testing AI Interview Flow

## Setup

### 1. Add Your OpenAI API Key

Edit `/var/www/dokterdibya/staff/backend/.env`:

```env
OPENAI_API_KEY=sk-proj-YOUR-REAL-API-KEY-HERE
```

Replace `sk-proj-your-api-key-here` with your actual OpenAI API key.

Then restart backend:
```bash
pm2 restart sunday-clinic --update-env
```

---

## Test Frontend (Browser)

### Access Demo Page:
```
https://dokterdibya.com/book-appointment-ai.html
```

### Test Steps:

1. **Fill Form:**
   - Nama: "Test Patient"
   - Tanggal: Tomorrow
   - Jam: 09:00
   - Keluhan: "USG kehamilan 24 minggu"

2. **Wait for AI Detection:**
   - Sistem akan auto-detect kategori (Obstetri)
   - Badge hijau muncul: "✓ Terdeteksi: OBSTETRI (high)"

3. **Click "Lanjutkan ke AI Interview":**
   - Modal AI Interview akan muncul
   - AI generate 5 pertanyaan smart

4. **Answer Questions:**
   - Jawab 5 pertanyaan satu per satu
   - Bisa text, date, atau multiple choice
   - Progress bar akan update

5. **View Summary:**
   - AI compile jawaban jadi pre-anamnesa
   - Review data
   - Click "Konfirmasi & Simpan Appointment"

---

## Test Backend (API) - Without OpenAI Key

Jika belum punya API key, sistem akan fallback ke questions yang sudah di-hardcode.

### Test Detection Fallback:

```bash
curl -X POST http://localhost:3000/api/ai/detect-category \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "DRD0001",
    "complaint": "USG kehamilan 24 minggu"
  }'
```

**Expected Response (with fallback):**
```json
{
  "success": false,
  "error": "OpenAI API error",
  "fallback": {
    "category": "obstetri",
    "confidence": "high",
    "reasoning": "Deteksi fallback berdasarkan keyword matching"
  }
}
```

### Test Interview Questions (Fallback):

```bash
curl -X POST http://localhost:3000/api/ai/interview/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category": "obstetri",
    "complaint": "USG kehamilan 24 minggu"
  }'
```

**Expected Response (with fallback):**
```json
{
  "success": false,
  "error": "OpenAI API error",
  "fallback": {
    "questions": [
      {
        "id": 1,
        "question": "Berapa usia kehamilan Anda saat ini?",
        "type": "text"
      },
      {
        "id": 2,
        "question": "Kapan hari pertama haid terakhir (HPHT)?",
        "type": "date"
      },
      ...
    ]
  }
}
```

---

## Test Backend (API) - WITH OpenAI Key

### 1. Test Smart Detection:

```bash
curl -X POST http://localhost:3000/api/ai/detect-category \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "DRD0001",
    "complaint": "Mau pasang KB spiral"
  }'
```

**Expected (with AI):**
```json
{
  "success": true,
  "data": {
    "category": "gyn_repro",
    "confidence": "high",
    "reasoning": "KB spiral adalah metode kontrasepsi yang masuk kategori gyn_repro",
    "keywords_matched": ["kb", "spiral"],
    "suggested_questions": [
      "Apakah sudah pernah pakai KB sebelumnya?",
      "Kapan terakhir haid?"
    ]
  },
  "tokensUsed": 245
}
```

### 2. Test Smart Questions Generation:

```bash
curl -X POST http://localhost:3000/api/ai/interview/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category": "gyn_repro",
    "complaint": "Mau pasang KB spiral",
    "patientData": {
      "name": "Ibu Siti",
      "age": 32
    }
  }'
```

**Expected (with AI):**
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "id": 1,
        "question": "Apakah Ibu sudah pernah menggunakan KB sebelumnya? Jenis apa?",
        "type": "text",
        "why_important": "Untuk mengetahui riwayat kontrasepsi dan kemungkinan kontraindikasi"
      },
      ...
    ],
    "category_confirmed": "gyn_repro",
    "interview_goal": "Untuk mengetahui riwayat kontrasepsi dan kesesuaian KB spiral"
  },
  "tokensUsed": 580
}
```

### 3. Test Process Answers:

```bash
curl -X POST http://localhost:3000/api/ai/interview/process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category": "obstetri",
    "complaint": "USG kehamilan 24 minggu",
    "answers": [
      {"question": "Berapa usia kehamilan?", "answer": "24 minggu"},
      {"question": "Kapan HPHT?", "answer": "1 Mei 2025"},
      {"question": "Ada keluhan?", "answer": "Tidak ada"},
      {"question": "G P A?", "answer": "G2P1A0"},
      {"question": "Riwayat penyakit?", "answer": "Tidak ada"}
    ]
  }'
```

**Expected (with AI):**
```json
{
  "success": true,
  "data": {
    "keluhan_utama": "Kontrol kehamilan rutin dengan USG",
    "riwayat_kehamilan_sekarang": {
      "usia_kehamilan": 24,
      "hpht": "2025-05-01",
      "keluhan": "Tidak ada keluhan, kondisi baik"
    },
    "riwayat_obstetri": {
      "gravida": 2,
      "para": 1,
      "abortus": 0
    },
    "riwayat_penyakit": "Tidak ada riwayat penyakit",
    "catatan_tambahan": "Kehamilan berjalan normal, pasien kooperatif",
    "metadata": {
      "ai_generated": true,
      "generated_at": "2025-11-21T...",
      "requires_doctor_review": true
    }
  },
  "tokensUsed": 720
}
```

---

## Check Logs

### AI Detection Logs:
```sql
SELECT * FROM ai_detection_logs ORDER BY created_at DESC LIMIT 5;
```

### AI Interview Logs:
```sql
SELECT * FROM ai_interview_logs ORDER BY created_at DESC LIMIT 5;
```

### AI Usage Stats:
```sql
SELECT * FROM ai_usage_stats ORDER BY date DESC;
```

---

## Troubleshooting

### Error: "OPENAI_API_KEY is not defined"
**Solution:** Add API key to `.env` and restart:
```bash
pm2 restart sunday-clinic --update-env
```

### Error: "Invalid API key"
**Solution:** Check API key is correct and has billing enabled on OpenAI platform.

### Fallback is working but AI is not
**Solution:** System uses fallback when AI fails. Check logs:
```bash
pm2 logs sunday-clinic --lines 50
```

---

## Cost Monitoring

Check token usage:
```sql
SELECT
    DATE(created_at) as date,
    COUNT(*) as interviews,
    SUM(tokens_used) as total_tokens,
    AVG(tokens_used) as avg_tokens
FROM ai_interview_logs
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Estimated Cost:**
- Average interview: ~1500 tokens total
- Cost: ~Rp 15 per interview
- 100 interviews/month = Rp 1,500

---

## Success Criteria

✅ AI detection works and returns correct category
✅ AI generates relevant 5 questions based on category
✅ AI processes answers into structured pre-anamnesa
✅ Pre-anamnesa data is ready for doctor review
✅ Fallback works when AI fails
✅ Logs are recorded in database

---

**Next:** Integrate this flow into actual appointment booking page!
