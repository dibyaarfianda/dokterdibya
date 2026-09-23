-- MariaDB 10.11. Apply explicitly during the Wave 2 maintenance window after
-- backup/restore verification, together with the Task 4 caller cutover.
-- Additive only: preserve nullable MR, existing unique indexes, VARCHAR(50)
-- patient identity and every legacy logical row. No clinical data reconciliation.
ALTER TABLE medical_records
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Reset tombstones share this append-only store (event_type='reset', after=NULL).
-- No foreign keys: history must survive the separately authorized full-visit
-- deletion path, and legacy identities must never be narrowed or rewritten.
CREATE TABLE IF NOT EXISTS medical_record_revisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    medical_record_id INT NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    mr_id VARCHAR(20) NULL,
    record_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    from_version INT NOT NULL,
    to_version INT NOT NULL,
    before_snapshot JSON NULL,
    after_snapshot JSON NULL,
    changed_paths JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reconciliation_manifest_sha256 CHAR(64) NULL,
    source_row_sha256 CHAR(64) NULL,
    metadata JSON NULL,
    KEY idx_medical_revision_version (medical_record_id, to_version),
    KEY idx_medical_revision_scope (mr_id, record_type, to_version),
    UNIQUE KEY uq_medical_reconciliation (reconciliation_manifest_sha256, medical_record_id, event_type),
    CONSTRAINT chk_medical_revision_versions CHECK (from_version >= 0 AND to_version >= from_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-statement triggers need no client DELIMITER handling; IF NOT EXISTS
-- keeps reruns additive without temporarily removing immutability protection.
CREATE TRIGGER IF NOT EXISTS medical_record_revisions_no_update
    BEFORE UPDATE ON medical_record_revisions
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Medical revisions are immutable';

CREATE TRIGGER IF NOT EXISTS medical_record_revisions_no_delete
    BEFORE DELETE ON medical_record_revisions
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Medical revisions are immutable';

INSERT IGNORE INTO permissions (name, display_name, category, description)
VALUES ('medical_records.reset_section', 'Reset bagian rekam medis', 'medical_records', 'Reset USG atau resume pada satu kunjungan dengan versi yang cocok');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('dokter', 'bidan')
  AND p.name = 'medical_records.reset_section';
