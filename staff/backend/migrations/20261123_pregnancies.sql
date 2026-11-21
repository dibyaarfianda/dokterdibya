-- Pregnancy episodes (stage 1): one record per pregnancy per patient.
-- Additive and re-runnable: table is CREATE IF NOT EXISTS, ALTERs are guarded by information_schema checks.

CREATE TABLE IF NOT EXISTS pregnancies (
    id INT NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    sequence INT NOT NULL DEFAULT 1,
    source ENUM('clinic','external') NOT NULL DEFAULT 'clinic',
    hpht DATE NULL,
    hpl DATE NULL,
    year SMALLINT NULL,
    status ENUM('ongoing','ended') NOT NULL DEFAULT 'ongoing',
    outcome ENUM('lahir_hidup','lahir_mati','abortus','ektopik','unknown') NULL,
    ended_on DATE NULL,
    ga_weeks_at_end TINYINT NULL,
    delivery_method VARCHAR(40) NULL,
    delivery_indication VARCHAR(255) NULL,
    complications JSON NULL,
    complication_notes VARCHAR(500) NULL,
    babies JSON NULL,
    kuretase ENUM('Ya','Tidak') NULL,
    term ENUM('aterm','preterm','postterm') NULL,
    needs_review TINYINT(1) NOT NULL DEFAULT 0,
    review_reason VARCHAR(255) NULL,
    fingerprint VARCHAR(64) NULL,
    created_by VARCHAR(64) NULL,
    updated_by VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_pregnancies_patient_fingerprint (patient_id, fingerprint),
    KEY idx_pregnancies_patient_status (patient_id, status),
    KEY idx_pregnancies_patient_hpht (patient_id, hpht)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS pregnancies_add_column_if_missing$$
CREATE PROCEDURE pregnancies_add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND COLUMN_NAME = target_column
    ) THEN
        SET @pregnancies_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
        PREPARE pregnancies_statement FROM @pregnancies_sql;
        EXECUTE pregnancies_statement;
        DEALLOCATE PREPARE pregnancies_statement;
    END IF;
END$$

DROP PROCEDURE IF EXISTS pregnancies_add_index_if_missing$$
CREATE PROCEDURE pregnancies_add_index_if_missing(
    IN target_table VARCHAR(64),
    IN target_index VARCHAR(64),
    IN index_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND INDEX_NAME = target_index
    ) THEN
        SET @pregnancies_sql = CONCAT('ALTER TABLE `', target_table, '` ADD ', index_definition);
        PREPARE pregnancies_statement FROM @pregnancies_sql;
        EXECUTE pregnancies_statement;
        DEALLOCATE PREPARE pregnancies_statement;
    END IF;
END$$

CALL pregnancies_add_column_if_missing('pregnancies', 'review_reason', 'review_reason VARCHAR(255) NULL AFTER needs_review')$$
CALL pregnancies_add_column_if_missing('sunday_clinic_records', 'pregnancy_id', 'pregnancy_id INT NULL')$$
CALL pregnancies_add_index_if_missing('sunday_clinic_records', 'idx_sunday_clinic_records_pregnancy_id', 'INDEX idx_sunday_clinic_records_pregnancy_id (pregnancy_id)')$$
CALL pregnancies_add_column_if_missing('pregnancy_outcomes', 'pregnancy_id', 'pregnancy_id INT NULL')$$
CALL pregnancies_add_index_if_missing('pregnancy_outcomes', 'idx_pregnancy_outcomes_pregnancy_id', 'INDEX idx_pregnancy_outcomes_pregnancy_id (pregnancy_id)')$$
CALL pregnancies_add_column_if_missing('birth_congratulations', 'pregnancy_id', 'pregnancy_id INT NULL')$$
CALL pregnancies_add_index_if_missing('birth_congratulations', 'idx_birth_congratulations_pregnancy_id', 'INDEX idx_birth_congratulations_pregnancy_id (pregnancy_id)')$$

DROP PROCEDURE IF EXISTS pregnancies_add_column_if_missing$$
DROP PROCEDURE IF EXISTS pregnancies_add_index_if_missing$$

DELIMITER ;
