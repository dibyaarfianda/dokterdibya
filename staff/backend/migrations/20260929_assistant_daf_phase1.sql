-- Apply once after a database backup, before enabling /api/assistant-daf.
ALTER TABLE docboard_space_schedules
  ADD COLUMN patient_ref_type VARCHAR(20) NULL,
  ADD COLUMN patient_ref_value VARCHAR(64) NULL,
  ADD COLUMN patient_facility VARCHAR(32) NULL,
  ADD COLUMN patient_name VARCHAR(255) NULL,
  ADD COLUMN assistant_active TINYINT GENERATED ALWAYS AS (IF(status <> 'cancelled', 1, NULL)) VIRTUAL,
  ADD UNIQUE KEY uniq_assistant_patient_procedure_day
    (space, patient_ref_type, patient_ref_value, patient_facility, category, schedule_date, assistant_active);

CREATE TABLE assistant_daf_owner_state (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO assistant_daf_owner_state (user_id) VALUES ('UDZAQUCQWZ');

CREATE TABLE assistant_daf_drafts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  source_kind VARCHAR(20) NOT NULL,
  encrypted_payload LONGTEXT NULL,
  payload_iv VARCHAR(24) NULL,
  payload_tag VARCHAR(24) NULL,
  source_expires_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  schedule_id BIGINT NULL,
  decision_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_owner_status (user_id, status, created_at),
  INDEX idx_assistant_expiry (source_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  draft_id CHAR(36) NULL,
  schedule_id BIGINT NULL,
  event_type VARCHAR(32) NOT NULL,
  encrypted_payload LONGTEXT NULL,
  payload_iv VARCHAR(24) NULL,
  payload_tag VARCHAR(24) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_audit_owner (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_passkeys (
  credential_id VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  public_key BLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_passkey_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_challenges (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  challenge VARCHAR(512) NOT NULL,
  authority_hash BINARY(32) NULL,
  expires_at DATETIME NOT NULL,
  INDEX idx_assistant_challenge_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_sessions (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_calendar_tokens (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  INDEX idx_assistant_calendar_owner (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  endpoint_hash BINARY(32) NOT NULL UNIQUE,
  encrypted_payload LONGTEXT NOT NULL,
  payload_iv VARCHAR(24) NOT NULL,
  payload_tag VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistant_push_owner (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistant_daf_reminders (
  schedule_id BIGINT NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  schedule_version CHAR(64) CHARACTER SET ascii NOT NULL,
  reminder_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  attempts TINYINT NOT NULL DEFAULT 0,
  claimed_at DATETIME NULL,
  sent_at DATETIME NULL,
  INDEX idx_assistant_reminder_due (status, reminder_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
