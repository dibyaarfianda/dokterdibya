-- Database Optimization - Add Indexes
-- Run this SQL to optimize query performance

-- Patients table indexes
CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_whatsapp ON patients(whatsapp);
CREATE INDEX IF NOT EXISTS idx_patients_last_visit ON patients(last_visit DESC);
CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON patients(birth_date);

-- Obat (medications) table indexes
CREATE INDEX IF NOT EXISTS idx_obat_code ON obat(code);
CREATE INDEX IF NOT EXISTS idx_obat_name ON obat(name);
CREATE INDEX IF NOT EXISTS idx_obat_category ON obat(category);
CREATE INDEX IF NOT EXISTS idx_obat_is_active ON obat(is_active);
CREATE INDEX IF NOT EXISTS idx_obat_stock ON obat(stock);

-- Visits table indexes
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_visit_date ON visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_doctor_name ON visits(doctor_name);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_visits_patient_date ON visits(patient_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_obat_category_active ON obat(category, is_active);

-- Appointments table indexes (if exists)
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Medical exams table indexes (if exists)
CREATE INDEX IF NOT EXISTS idx_medical_exams_patient_id ON medical_exams(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_exams_exam_date ON medical_exams(exam_date DESC);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Chat messages table indexes (if exists)
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);

-- Show created indexes
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('patients', 'obat', 'visits', 'appointments', 'medical_exams', 'users')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
