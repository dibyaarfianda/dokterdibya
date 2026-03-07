-- ==========================================================================
-- Performance Index Cleanup & Gap Fill — UP Migration
-- Date: 2026-03-07
-- MariaDB: 10.11.13
--
-- Two categories of changes:
--   A) Drop redundant indexes (reduce write amplification, same read perf)
--   B) Add missing indexes for uncovered query patterns
-- ==========================================================================

-- =========================================
-- A. DROP REDUNDANT INDEXES
-- =========================================

-- A1. patients: idx_email duplicates UNIQUE email
--     Both are single-column on `email`. The UNIQUE constraint already
--     provides a B-tree index. Dropping saves one index update per write.
ALTER TABLE patients DROP INDEX idx_email;

-- A2. patients: idx_google_id duplicates UNIQUE google_id
ALTER TABLE patients DROP INDEX idx_google_id;

-- A3. patients: idx_patients_new_id duplicates UNIQUE new_id
ALTER TABLE patients DROP INDEX idx_patients_new_id;

-- A4. sunday_clinic_records: idx_sunday_clinic_patient (patient_id)
--     Is a strict prefix of idx_scr_patient_activity (patient_id, last_activity_at DESC).
--     Any query that only needs patient_id lookup can use idx_scr_patient_activity
--     or idx_patient_category (patient_id, mr_category).
ALTER TABLE sunday_clinic_records DROP INDEX idx_sunday_clinic_patient;

-- A5. medical_records: idx_patient_id (patient_id)
--     Is a strict prefix of idx_mr_patient_type_created (patient_id, record_type, created_at DESC).
--     Any query filtering only by patient_id can use the composite.
ALTER TABLE medical_records DROP INDEX idx_patient_id;

-- A6. medical_records: idx_mr_id (mr_id)
--     Is a strict prefix of UNIQUE idx_mr_record_type (mr_id, record_type).
--     Any query filtering only by mr_id can use the UNIQUE composite.
ALTER TABLE medical_records DROP INDEX idx_mr_id;

-- A7. patient_documents: idx_patient_documents_mr (mr_id)
--     Is a strict prefix of idx_pd_mr_type_status (mr_id, document_type, status).
ALTER TABLE patient_documents DROP INDEX idx_patient_documents_mr;

-- A8. patient_documents: idx_patient_documents_patient (patient_id)
--     Is a strict prefix of both idx_patient_docs_patient_type (patient_id, document_type)
--     and idx_patient_docs_patient_status (patient_id, status).
ALTER TABLE patient_documents DROP INDEX idx_patient_documents_patient;

-- A9. patient_documents: idx_patient_documents_type (document_type) — cardinality 8
--     Very low selectivity (8 distinct values across ~760 rows).
--     Never chosen by optimizer when better composite indexes exist.
--     All queries that filter by document_type also filter by mr_id or patient_id,
--     which are covered by idx_pd_mr_type_status and idx_patient_docs_patient_type.
ALTER TABLE patient_documents DROP INDEX idx_patient_documents_type;

-- A10. patient_documents: idx_patient_documents_status (status) — cardinality 4
--      Same reasoning: only 4 distinct values, never used alone.
--      Always combined with mr_id (covered by idx_pd_mr_type_status)
--      or patient_id (covered by idx_patient_docs_patient_status).
ALTER TABLE patient_documents DROP INDEX idx_patient_documents_status;

-- A11. sunday_appointments: idx_patient (patient_id)
--      Is a strict prefix of idx_sa_patient_status_date (patient_id, status, appointment_date).
ALTER TABLE sunday_appointments DROP INDEX idx_patient;

-- A12. sunday_appointments: idx_status (status) — cardinality 8
--      Low selectivity. Status is always filtered together with patient_id
--      (covered by idx_sa_patient_status_date) or date (covered by unique_slot).
ALTER TABLE sunday_appointments DROP INDEX idx_status;

-- A13. medical_records: idx_record_type (record_type) — cardinality 20
--      Low selectivity single-column index. All queries filtering by record_type
--      also filter by mr_id (covered by UNIQUE idx_mr_record_type) or
--      patient_id (covered by idx_mr_patient_type_created).
ALTER TABLE medical_records DROP INDEX idx_record_type;

-- =========================================
-- B. ADD MISSING INDEXES
-- =========================================

-- B1. sunday_clinic_records: visit_location for location filter
--     The location-filter query path does:
--       WHERE scr.visit_location = 'klinik_private'
--     Currently full-table-scans (type=ALL, 361 rows). Adding an index
--     allows ref lookup. Cardinality ~4 (klinik_private, rsia_melinda,
--     rsud_gambiran, rs_bhayangkara) is low, but the filter typically
--     selects <30% of rows and avoids a derived-table full scan.
ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_visit_location (visit_location);

-- B2. appointments: hospital_location for hospital filter
--     The hospital-filter query path does:
--       INNER JOIN appointments a ON p.id = a.patient_id WHERE a.hospital_location = ?
--     Currently full-table-scans (type=ALL, 13 rows). Small table now but
--     will grow. Composite (hospital_location, patient_id) serves both the
--     filter and the join in one index seek.
ALTER TABLE appointments ADD INDEX idx_appt_hospital_patient (hospital_location, patient_id);
