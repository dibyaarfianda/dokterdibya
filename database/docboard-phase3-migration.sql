-- DocBoard Phase 3 Migration
-- OR Board (no schema needed - uses existing surgery_schedules)
-- Role-based views (no schema needed - uses existing role system)
-- Post-op Outcomes tracking

CREATE TABLE IF NOT EXISTS surgery_outcomes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    surgery_id BIGINT UNSIGNED NOT NULL,
    complication_grade ENUM('none','grade_1','grade_2','grade_3a','grade_3b','grade_4a','grade_4b','grade_5') NOT NULL DEFAULT 'none' COMMENT 'Clavien-Dindo Classification',
    wound_class ENUM('clean','clean_contaminated','contaminated','dirty') NULL COMMENT 'CDC Wound Classification',
    estimated_blood_loss INT NULL COMMENT 'ml',
    actual_duration_min INT NULL COMMENT 'Actual surgery duration in minutes',
    disposition VARCHAR(100) NULL COMMENT 'ICU, ward, discharge, etc',
    readmission TINYINT(1) NOT NULL DEFAULT 0,
    readmission_reason TEXT NULL,
    follow_up_date DATE NULL,
    follow_up_notes TEXT NULL,
    notes TEXT NULL,
    recorded_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_surgery (surgery_id),
    FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
