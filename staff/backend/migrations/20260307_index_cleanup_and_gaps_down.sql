-- ==========================================================================
-- Performance Index Cleanup & Gap Fill — DOWN (Rollback) Migration
-- Date: 2026-03-07
-- Reverses all changes from the UP migration.
-- ==========================================================================

-- Restore dropped redundant indexes
ALTER TABLE patients ADD INDEX idx_email (email);
ALTER TABLE patients ADD INDEX idx_google_id (google_id);
ALTER TABLE patients ADD INDEX idx_patients_new_id (new_id);
ALTER TABLE sunday_clinic_records ADD INDEX idx_sunday_clinic_patient (patient_id);
ALTER TABLE medical_records ADD INDEX idx_patient_id (patient_id);
ALTER TABLE medical_records ADD INDEX idx_mr_id (mr_id);
ALTER TABLE medical_records ADD INDEX idx_record_type (record_type);
ALTER TABLE patient_documents ADD INDEX idx_patient_documents_mr (mr_id);
ALTER TABLE patient_documents ADD INDEX idx_patient_documents_patient (patient_id);
ALTER TABLE patient_documents ADD INDEX idx_patient_documents_type (document_type);
ALTER TABLE patient_documents ADD INDEX idx_patient_documents_status (status);
ALTER TABLE sunday_appointments ADD INDEX idx_patient (patient_id);
ALTER TABLE sunday_appointments ADD INDEX idx_status (status);

-- Drop added indexes
ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_visit_location;
ALTER TABLE appointments DROP INDEX idx_appt_hospital_patient;
