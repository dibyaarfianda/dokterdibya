-- Private drafts and delivery receipts are deliberately separate from moderation.
CREATE TABLE IF NOT EXISTS patient_story_drafts (
    owner_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    state ENUM('empty', 'active', 'deleted', 'submitted') NOT NULL DEFAULT 'empty',
    draft_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    content_json JSON NULL,
    mutation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_story_submissions (
    owner_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    draft_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    story_id VARCHAR(64) NOT NULL,
    content_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (owner_key, draft_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
