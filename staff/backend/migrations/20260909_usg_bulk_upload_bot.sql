CREATE TABLE IF NOT EXISTS usg_bulk_upload_bot_config (
    id TINYINT PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    sources_json LONGTEXT,
    updated_by VARCHAR(255) DEFAULT NULL,
    updated_at DATETIME NOT NULL
);

INSERT IGNORE INTO usg_bulk_upload_bot_config (id, enabled, sources_json, updated_at)
VALUES (1, 0, '[]', NOW());

CREATE TABLE IF NOT EXISTS usg_bulk_upload_jobs (
    id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(32) NOT NULL,
    hospital VARCHAR(64) NOT NULL,
    upload_date DATE NOT NULL,
    zip_url TEXT NOT NULL,
    zip_filename VARCHAR(255) DEFAULT NULL,
    dry_run TINYINT(1) NOT NULL DEFAULT 0,
    force_rerun TINYINT(1) NOT NULL DEFAULT 0,
    preview_json LONGTEXT,
    result_json LONGTEXT,
    error_message TEXT,
    requested_by VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
