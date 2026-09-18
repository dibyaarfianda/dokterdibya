-- Additive, private monitor records only. No changes to clinical tables.
-- The singleton row serializes transactions across PM2 workers. Each durable
-- entity has a stable key and independent JSON payload; originals live in R2.
CREATE TABLE IF NOT EXISTS clinic_monitor_lock (
    id TINYINT UNSIGNED PRIMARY KEY
) ENGINE=InnoDB;
INSERT IGNORE INTO clinic_monitor_lock (id) VALUES (1);
CREATE TABLE IF NOT EXISTS clinic_monitor_records (
    record_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    kind VARCHAR(24) CHARACTER SET ascii NOT NULL,
    payload JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_clinic_monitor_kind (kind, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
