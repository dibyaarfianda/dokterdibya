-- Public anonymous polls for sisiwanita.id (QR access, no login).
-- Free-text answers are classified by AI into admin-defined myth categories.
-- One response per IP (or per device when one_per_ip = 0) is enforced by
-- UNIQUE(poll_id, dedupe_key).

CREATE TABLE IF NOT EXISTS public_polls (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(64) NOT NULL,
    title VARCHAR(200) NOT NULL,
    question TEXT NOT NULL,
    description TEXT NULL,
    answer_type ENUM('text', 'single', 'multiple') NOT NULL DEFAULT 'text',
    options_json LONGTEXT NULL,
    placeholder VARCHAR(255) NULL,
    thank_you_message TEXT NULL,
    ai_instructions TEXT NULL,
    header_image MEDIUMBLOB NULL,
    header_image_mime VARCHAR(50) NULL,
    header_image_updated_at DATETIME NULL,
    status ENUM('draft', 'active', 'closed') NOT NULL DEFAULT 'draft',
    one_per_ip TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_public_polls_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_poll_categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    poll_id INT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_public_poll_categories_poll (poll_id),
    CONSTRAINT fk_public_poll_categories_poll
        FOREIGN KEY (poll_id) REFERENCES public_polls (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_poll_responses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    poll_id INT UNSIGNED NOT NULL,
    answer_text TEXT NULL,
    selected_options LONGTEXT NULL,
    ip_address VARCHAR(64) NOT NULL,
    dedupe_key VARCHAR(100) NOT NULL,
    user_agent VARCHAR(255) NULL,
    category_ids LONGTEXT NULL,
    ai_status ENUM('pending', 'done', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
    ai_confidence VARCHAR(10) NULL,
    ai_reason VARCHAR(500) NULL,
    ai_model VARCHAR(64) NULL,
    manual_override TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    classified_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_public_poll_responses_dedupe (poll_id, dedupe_key),
    KEY idx_public_poll_responses_poll_status (poll_id, ai_status),
    CONSTRAINT fk_public_poll_responses_poll
        FOREIGN KEY (poll_id) REFERENCES public_polls (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
