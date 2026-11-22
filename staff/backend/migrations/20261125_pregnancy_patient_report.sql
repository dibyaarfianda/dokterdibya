-- Patient-reported end of pregnancy: snooze date, delivery place, and a flag for rows closed by the patient.
-- Additive and re-runnable: ALTERs are guarded by information_schema checks.

DELIMITER $$

DROP PROCEDURE IF EXISTS pregnancy_report_add_column_if_missing$$
CREATE PROCEDURE pregnancy_report_add_column_if_missing(
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
        SET @pregnancy_report_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
        PREPARE pregnancy_report_statement FROM @pregnancy_report_sql;
        EXECUTE pregnancy_report_statement;
        DEALLOCATE PREPARE pregnancy_report_statement;
    END IF;
END$$

CALL pregnancy_report_add_column_if_missing('pregnancies', 'report_snoozed_until', 'report_snoozed_until DATE NULL')$$
CALL pregnancy_report_add_column_if_missing('pregnancies', 'delivery_place', 'delivery_place VARCHAR(120) NULL')$$
CALL pregnancy_report_add_column_if_missing('pregnancies', 'ended_by_patient', 'ended_by_patient TINYINT(1) NOT NULL DEFAULT 0')$$

DROP PROCEDURE IF EXISTS pregnancy_report_add_column_if_missing$$

DELIMITER ;
