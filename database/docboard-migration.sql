-- DocBoard Migration
-- Doctor Scheduler PWA - Unified schedule view across all locations

-- Cache jadwal terpadu dari semua sumber
CREATE TABLE IF NOT EXISTS docboard_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_date DATE NOT NULL,
    location ENUM('klinik_private','rsia_melinda','rsud_gambiran','rs_bhayangkara') NOT NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    patient_count INT NOT NULL DEFAULT 0,
    completed_count INT NOT NULL DEFAULT 0,
    source_type ENUM('internal','medify','evo_push','manual') NOT NULL DEFAULT 'internal',
    last_synced_at DATETIME NULL,
    sync_status ENUM('synced','pending','failed','stale') NOT NULL DEFAULT 'pending',
    sync_error TEXT NULL,
    is_disabled TINYINT(1) NOT NULL DEFAULT 0,
    disabled_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date_location (event_date, location),
    INDEX idx_event_date (event_date),
    INDEX idx_sync_status (sync_status)
);

-- Cache daftar pasien per event
CREATE TABLE IF NOT EXISTS docboard_patients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT UNSIGNED NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_id VARCHAR(20) NULL,
    slot_time TIME NULL,
    slot_number INT NULL,
    chief_complaint TEXT NULL,
    diagnosis_preview VARCHAR(500) NULL,
    visit_status ENUM('scheduled','waiting','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
    source_record_type VARCHAR(50) NULL,
    source_record_id VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES docboard_events(id) ON DELETE CASCADE,
    INDEX idx_event_id (event_id)
);

-- Token push notification per staff member
CREATE TABLE IF NOT EXISTS docboard_push_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    platform ENUM('web','android','ios') NOT NULL DEFAULT 'web',
    endpoint TEXT NOT NULL,
    p256dh TEXT NULL,
    auth_key TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
);
