-- DocBoard x Community Chat Surgery Source Link Migration
-- Track origin of surgery schedule entries that originated from community chat.

CREATE TABLE IF NOT EXISTS surgery_source_links (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    surgery_id BIGINT UNSIGNED NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_ref VARCHAR(255) NULL,
    source_payload JSON NULL,
    idempotency_key VARCHAR(80) NULL,
    created_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_surgery_source_idempotent (idempotency_key),
    INDEX idx_surgery_source_surgery (surgery_id),
    INDEX idx_surgery_source_ref (source_type, source_ref),
    CONSTRAINT fk_surgery_source_surgery
        FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

