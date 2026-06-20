CREATE TABLE IF NOT EXISTS patient_stories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(10) NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    category ENUM('kehamilan', 'persalinan', 'program_hamil', 'pemulihan', 'lainnya') NOT NULL DEFAULT 'lainnya',
    author_mode ENUM('nickname', 'anonim') NOT NULL DEFAULT 'nickname',
    status ENUM('pending', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'pending',
    moderation_note VARCHAR(500) NULL,
    moderated_by VARCHAR(10) NULL,
    moderated_at DATETIME NULL,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    like_count INT UNSIGNED NOT NULL DEFAULT 0,
    report_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_patient_stories_status_created (status, created_at),
    KEY idx_patient_stories_category_status (category, status),
    KEY idx_patient_stories_patient_created (patient_id, created_at),
    CONSTRAINT fk_patient_stories_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_story_reactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    story_id BIGINT UNSIGNED NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_story_reaction (story_id, patient_id),
    KEY idx_patient_story_reactions_patient (patient_id),
    CONSTRAINT fk_patient_story_reactions_story
        FOREIGN KEY (story_id) REFERENCES patient_stories(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_patient_story_reactions_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_story_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    story_id BIGINT UNSIGNED NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    reason VARCHAR(300) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_story_report (story_id, patient_id),
    KEY idx_patient_story_reports_patient (patient_id),
    CONSTRAINT fk_patient_story_reports_story
        FOREIGN KEY (story_id) REFERENCES patient_stories(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_patient_story_reports_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
