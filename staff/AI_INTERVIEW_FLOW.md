# AI Conversational Interview Flow

**Date:** 2025-11-21
**Version:** 1.0.0
**Status:** ✅ READY FOR IMPLEMENTATION

---

## Overview

Sistem AI Interview menggunakan GPT-4o-mini untuk melakukan **anamnesa conversational** sebelum kunjungan pasien. AI akan menanyakan 5 pertanyaan smart, kemudian compile jawaban menjadi pre-anamnesa yang siap digunakan dokter.

---

## Complete Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. PATIENT BOOKS APPOINTMENT                                   │
│    - Input keluhan: "USG kehamilan 24 minggu"                 │
│    - Pilih tanggal & jam                                       │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. AI DETECTS CATEGORY                                         │
│    POST /api/ai/detect-category                                │
│    Response: {category: "obstetri", confidence: "high"}        │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. AI GENERATES 5 SMART QUESTIONS                              │
│    POST /api/ai/interview/questions                            │
│    Response: {questions: [...]}                                │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. PATIENT ANSWERS QUESTIONS (Conversational UI)               │
│    Q1: Berapa usia kehamilan Anda saat ini?                    │
│    A1: 24 minggu                                               │
│    Q2: Kapan HPHT Anda?                                        │
│    A2: 1 Mei 2025                                              │
│    ... (5 questions total)                                     │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. AI PROCESSES ANSWERS → PRE-ANAMNESA                         │
│    POST /api/ai/interview/process                              │
│    Response: {pre_anamnesa: {...}}                             │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 6. SAVE APPOINTMENT WITH PRE-ANAMNESA                          │
│    POST /api/appointments                                      │
│    Body: {                                                     │
│      patient_id, date, time,                                   │
│      complaint: "USG kehamilan 24 minggu",                     │
│      detected_category: "obstetri",                            │
│      pre_anamnesa: {...AI-generated data...}                   │
│    }                                                            │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 7. DOCTOR OPENS SUNDAY CLINIC                                  │
│    - Pre-anamnesa sudah ter-fill otomatis                      │
│    - Dokter tinggal review & lengkapi                          │
│    - Faster consultation                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### 1. Detect Category

```bash
POST /api/ai/detect-category
```

**Request:**
```json
{
  "patientId": "DRD0001",
  "complaint": "USG kehamilan 24 minggu"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "category": "obstetri",
    "confidence": "high",
    "reasoning": "USG kehamilan jelas merupakan layanan obstetri"
  }
}
```

---

### 2. Generate Interview Questions

```bash
POST /api/ai/interview/questions
```

**Request:**
```json
{
  "category": "obstetri",
  "complaint": "USG kehamilan 24 minggu",
  "patientData": {
    "name": "Ibu Siti",
    "age": 28
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "id": 1,
        "question": "Berapa usia kehamilan Anda saat ini?",
        "type": "text",
        "why_important": "Untuk memastikan usia kehamilan akurat"
      },
      {
        "id": 2,
        "question": "Kapan hari pertama haid terakhir (HPHT) Anda?",
        "type": "date",
        "why_important": "Untuk menghitung usia kehamilan dan HPL"
      },
      {
        "id": 3,
        "question": "Apakah ada keluhan selama kehamilan ini?",
        "type": "text",
        "why_important": "Untuk deteksi dini komplikasi"
      },
      {
        "id": 4,
        "question": "Berapa kali Anda hamil, melahirkan, dan keguguran? (contoh: G2P1A0)",
        "type": "text",
        "why_important": "Untuk mengetahui riwayat obstetri"
      },
      {
        "id": 5,
        "question": "Apakah Anda memiliki riwayat penyakit seperti hipertensi, diabetes, atau asma?",
        "type": "text",
        "why_important": "Untuk identifikasi risiko kehamilan"
      }
    ],
    "category_confirmed": "obstetri",
    "interview_goal": "Tujuan interview ini untuk mengetahui kondisi kehamilan dan riwayat kesehatan pasien"
  }
}
```

---

### 3. Process Interview Answers

```bash
POST /api/ai/interview/process
```

**Request:**
```json
{
  "category": "obstetri",
  "complaint": "USG kehamilan 24 minggu",
  "answers": [
    {"question": "Berapa usia kehamilan Anda saat ini?", "answer": "24 minggu"},
    {"question": "Kapan HPHT Anda?", "answer": "1 Mei 2025"},
    {"question": "Apakah ada keluhan?", "answer": "Tidak ada keluhan, hanya kontrol rutin"},
    {"question": "G P A?", "answer": "G2P1A0"},
    {"question": "Riwayat penyakit?", "answer": "Tidak ada"}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keluhan_utama": "Kontrol kehamilan rutin, permintaan USG",
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
    "riwayat_penyakit": "Tidak ada riwayat penyakit sistemik",
    "catatan_tambahan": "Pasien kooperatif, kehamilan fisiologis",
    "metadata": {
      "ai_generated": true,
      "generated_at": "2025-11-21T10:30:00.000Z",
      "requires_doctor_review": true
    }
  },
  "tokensUsed": 420
}
```

---

## Frontend Integration Example

### Step 1: Detect Category when Complaint is Entered

```javascript
// In appointment booking form
const complaintInput = document.getElementById('complaint');

complaintInput.addEventListener('blur', async () => {
    const complaint = complaintInput.value.trim();
    if (!complaint) return;

    const detection = await apiService.post('/ai/detect-category', {
        patientId: currentPatient.id,
        complaint: complaint
    });

    if (detection.success) {
        selectedCategory = detection.data.category;

        if (detection.data.confidence === 'high') {
            showNotification(`✓ Kategori terdeteksi: ${detection.data.category.toUpperCase()}`);
            // Auto-start interview
            startAIInterview(detection.data.category, complaint);
        }
    }
});
```

### Step 2: Start AI Interview

```javascript
async function startAIInterview(category, complaint) {
    // Get questions
    const result = await apiService.post('/ai/interview/questions', {
        category,
        complaint,
        patientData: {
            name: currentPatient.name,
            age: currentPatient.age
        }
    });

    if (result.success) {
        // Show interview modal
        showInterviewModal(result.data.questions);
    } else {
        // Fallback to basic questions
        showInterviewModal(result.fallback.questions);
    }
}
```

### Step 3: Conversational Interview UI

```javascript
function showInterviewModal(questions) {
    const modal = document.getElementById('aiInterviewModal');
    const container = document.getElementById('questionsContainer');

    let currentQuestion = 0;
    const answers = [];

    function displayQuestion(index) {
        const q = questions[index];
        container.innerHTML = `
            <div class="ai-question" data-question-id="${index}">
                <div class="ai-avatar">🤖</div>
                <div class="question-bubble">
                    <p class="question-text">${q.question}</p>
                    ${q.type === 'choice' ? renderChoices(q.choices) : renderTextInput(q.type)}
                </div>
            </div>
        `;

        // Focus input
        setTimeout(() => {
            const input = container.querySelector('input, textarea');
            if (input) input.focus();
        }, 300);
    }

    function handleAnswer(answer) {
        answers.push({
            question: questions[currentQuestion].question,
            answer: answer
        });

        // Show answer in chat
        showAnswerBubble(answer);

        currentQuestion++;

        if (currentQuestion < questions.length) {
            setTimeout(() => displayQuestion(currentQuestion), 500);
        } else {
            // All questions answered
            processInterviewAnswers(answers);
        }
    }

    displayQuestion(0);
}

function renderTextInput(type) {
    if (type === 'date') {
        return `<input type="date" class="ai-input" id="answerInput">`;
    } else if (type === 'number') {
        return `<input type="number" class="ai-input" id="answerInput">`;
    } else {
        return `<textarea class="ai-input" id="answerInput" rows="2"></textarea>`;
    }
}

function renderChoices(choices) {
    return `
        <div class="choice-buttons">
            ${choices.map(c => `<button class="choice-btn" data-value="${c}">${c}</button>`).join('')}
        </div>
    `;
}
```

### Step 4: Process Answers

```javascript
async function processInterviewAnswers(answers) {
    // Show loading
    showLoadingSpinner('AI sedang menyusun data anamnesa...');

    const result = await apiService.post('/ai/interview/process', {
        category: selectedCategory,
        complaint: complaintInput.value,
        answers: answers
    });

    hideLoadingSpinner();

    if (result.success) {
        // Store pre-anamnesa
        preAnamnesaData = result.data;

        // Show summary
        showPreAnamnesaSummary(result.data);

        // Continue with appointment booking
        enableBookingButton();
    }
}
```

### Step 5: Save Appointment with Pre-Anamnesa

```javascript
async function saveAppointment() {
    const appointmentData = {
        patient_id: currentPatient.id,
        patient_name: currentPatient.name,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        appointment_type: 'Konsultasi',
        notes: notesInput.value,
        complaint: complaintInput.value,
        detected_category: selectedCategory,
        pre_anamnesa: preAnamnesaData // AI-generated data
    };

    const result = await apiService.post('/appointments', appointmentData);

    if (result.success) {
        showSuccess('Appointment berhasil dibuat! Data anamnesa sudah disiapkan oleh AI.');
    }
}
```

---

## UI/UX Design Suggestions

### Interview Modal Design

```html
<div id="aiInterviewModal" class="modal">
    <div class="modal-header">
        <h3>📋 Pertanyaan Pra-Kunjungan</h3>
        <p class="subtitle">Jawab 5 pertanyaan singkat untuk mempersiapkan kunjungan Anda</p>
        <div class="progress-bar">
            <div class="progress-fill" style="width: 20%"></div>
            <span class="progress-text">Pertanyaan 1 dari 5</span>
        </div>
    </div>

    <div class="modal-body">
        <div id="questionsContainer" class="chat-container">
            <!-- Questions will be displayed here conversationally -->
        </div>
    </div>
</div>
```

### CSS for Conversational Style

```css
.ai-question {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    animation: slideIn 0.3s ease;
}

.ai-avatar {
    width: 40px;
    height: 40px;
    font-size: 24px;
    flex-shrink: 0;
}

.question-bubble {
    background: #f0f0f0;
    padding: 15px;
    border-radius: 12px;
    max-width: 80%;
}

.question-text {
    font-weight: 500;
    margin-bottom: 12px;
}

.ai-input {
    width: 100%;
    padding: 10px;
    border: 2px solid #6366f1;
    border-radius: 8px;
    font-size: 16px;
}

.choice-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.choice-btn {
    padding: 10px 20px;
    background: white;
    border: 2px solid #6366f1;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
}

.choice-btn:hover {
    background: #6366f1;
    color: white;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

---

## Database Schema

### appointments table (updated)

```sql
ALTER TABLE appointments ADD COLUMN:
- complaint TEXT
- detected_category VARCHAR(50)
- pre_anamnesa JSON
```

### ai_interview_logs table

```sql
CREATE TABLE ai_interview_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    complaint TEXT NOT NULL,
    answers JSON NOT NULL,
    pre_anamnesa JSON NOT NULL,
    tokens_used INT UNSIGNED DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

---

## Benefits

### For Patients ✅
- **Less time** filling forms saat kunjungan
- **Conversational** - seperti chat biasa, tidak intimidating
- **Smart questions** - hanya 5 pertanyaan yang relevan
- **Faster** - appointment booking + anamnesa dalam 1 flow

### For Staff ✅
- **Automatic triage** - langsung tahu kategori pasien
- **Less manual work** - tidak perlu input anamnesa manual
- **Better scheduling** - bisa alokasi waktu berdasarkan kategori

### For Doctors ✅
- **Pre-filled anamnesa** - save 5-10 menit per pasien
- **Structured data** - format sudah sesuai kategori
- **Better preparation** - dokter bisa baca summary sebelum konsultasi
- **Focus on diagnosis** - less time on data collection

---

## Cost Estimation

**Per Interview:**
- Category detection: ~300 tokens = Rp 3
- Generate questions: ~600 tokens = Rp 5
- Process answers: ~800 tokens = Rp 7
- **Total: ~Rp 15 per appointment**

**Per Month (100 appointments):**
- 100 appointments × Rp 15 = **Rp 1,500**

**ROI:**
- Save 5-10 menit per patient
- 100 patients × 7.5 menit = 750 menit = 12.5 jam
- **Time saved:** 12.5 jam dokter per bulan
- **Cost:** Rp 1,500 per bulan

**Conclusion:** SANGAT WORTH IT!

---

## Next Steps for Frontend

1. **Create Appointment Booking Modal** with AI interview
2. **Add Conversational UI** for questions
3. **Show Pre-Anamnesa Summary** before saving
4. **Integrate with Sunday Clinic** to auto-fill anamnesa

---

**Status:** ✅ Backend complete, ready for frontend integration
