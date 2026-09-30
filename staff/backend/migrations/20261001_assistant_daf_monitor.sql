-- Apply after 20260929_assistant_daf_phase1.sql. Keep the monitor disabled until
-- a signed Android companion is installed and a selected chat is verified.
ALTER TABLE assistant_daf_drafts
  ADD COLUMN ai_status VARCHAR(20) NULL,
  ADD COLUMN source_event_hash BINARY(32) NULL,
  ADD UNIQUE KEY uniq_assistant_source_event (source_event_hash);

CREATE TABLE assistant_daf_monitor_pairs (
  code_hash BINARY(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_monitor_devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  device_label VARCHAR(80) NOT NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_monitor_owner (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_monitor_chats (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  device_id CHAR(36) NOT NULL,
  chat_key_hash BINARY(32) NOT NULL,
  encrypted_label TEXT NOT NULL,
  label_iv VARCHAR(24) NOT NULL,
  label_tag VARCHAR(24) NOT NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_assistant_monitor_chat (device_id, chat_key_hash),
  INDEX idx_assistant_monitor_chats_owner (user_id, allowed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_review_jobs (
  draft_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  INDEX idx_assistant_review_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only structured, patient-free observations from the doctor's confirmations.
CREATE TABLE assistant_daf_memory (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  draft_id CHAR(36) NOT NULL,
  decision_kind VARCHAR(20) NOT NULL,
  action VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  location VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_assistant_memory_draft (draft_id),
  INDEX idx_assistant_memory_owner (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
