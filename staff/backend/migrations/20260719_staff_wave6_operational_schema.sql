-- Staff Wave 6 operational schema migration

-- Additive only: creates missing tables/columns/indexes and preserves existing data.



CREATE TABLE IF NOT EXISTS birth_class_sessions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            class_title VARCHAR(150) NOT NULL,
            session_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NULL,
            location VARCHAR(150) NOT NULL,
            instructor_name VARCHAR(120) NULL,
            quota INT NOT NULL DEFAULT 20,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            notes TEXT NULL,
            created_by VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_birth_class_sessions_date_active (session_date, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS birth_class_registrations (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            session_id BIGINT UNSIGNED NOT NULL,
            patient_id VARCHAR(50) NULL,
            patient_name VARCHAR(150) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            email VARCHAR(150) NULL,
            due_date DATE NULL,
            gestational_weeks INT NULL,
            notes TEXT NULL,
            admin_notes TEXT NULL,
            status ENUM('registered','confirmed','attended','cancelled') NOT NULL DEFAULT 'registered',
            payment_status ENUM('pending','paid','waived') NOT NULL DEFAULT 'pending',
            payment_method VARCHAR(50) NULL,
            payment_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            paid_at TIMESTAMP NULL,
            registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_by VARCHAR(120) NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_birth_class_session_phone (session_id, phone),
            KEY idx_birth_class_reg_status (status),
            KEY idx_birth_class_reg_registered_at (registered_at),
            CONSTRAINT fk_birth_class_session
                FOREIGN KEY (session_id) REFERENCES birth_class_sessions(id)
                ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_chat_rooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
                created_by VARCHAR(64) NULL,
                created_by_type ENUM('patient', 'staff') NULL,
                is_direct TINYINT(1) NOT NULL DEFAULT 0,
                direct_patient_id VARCHAR(64) NULL,
                direct_staff_id VARCHAR(64) NULL,
                is_system TINYINT(1) NOT NULL DEFAULT 0,
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_archived, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_chat_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(64) NOT NULL,
                user_type ENUM('patient', 'staff') NOT NULL,
                nickname VARCHAR(40) NULL,
                bio VARCHAR(255) NULL,
                avatar_url TEXT NULL,
                profile_visible TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_user (user_id, user_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                sender_id VARCHAR(64) NOT NULL,
                sender_type ENUM('patient', 'staff') NOT NULL,
                sender_name VARCHAR(255) NOT NULL,
                sender_nickname VARCHAR(40) NULL,
                sender_avatar TEXT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_room_time (room_id, created_at),
                CONSTRAINT fk_community_chat_messages_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_chat_room_moderators (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                staff_user_id VARCHAR(64) NOT NULL,
                assigned_by VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_room_staff (room_id, staff_user_id),
                INDEX idx_staff (staff_user_id),
                CONSTRAINT fk_community_chat_room_mod_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_chat_room_members (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                user_type ENUM('patient', 'staff') NOT NULL,
                display_name VARCHAR(255) NOT NULL,
                avatar_url TEXT NULL,
                first_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_room_user (room_id, user_id, user_type),
                INDEX idx_room_seen (room_id, last_seen_at),
                CONSTRAINT fk_community_chat_room_members_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contraction_sessions (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                patient_id VARCHAR(50) NOT NULL,
                session_date DATE NOT NULL,
                gestational_age_weeks INT NULL,
                gestational_age_days INT NULL,
                source VARCHAR(30) NULL,
                status ENUM('active','completed') NOT NULL DEFAULT 'active',
                started_at DATETIME NOT NULL,
                ended_at DATETIME NULL,
                contraction_count INT NOT NULL DEFAULT 0,
                rest_hydration_result VARCHAR(30) NOT NULL DEFAULT 'unknown',
                red_flags_json JSON NULL,
                assessment_final VARCHAR(40) NOT NULL DEFAULT 'inconclusive',
                assessment_reason JSON NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_contraction_sessions_patient_date (patient_id, session_date),
                KEY idx_contraction_sessions_patient_status (patient_id, status),
                KEY idx_contraction_sessions_started_at (started_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contraction_events (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                session_id INT UNSIGNED NOT NULL,
                started_at_client DATETIME NOT NULL,
                ended_at_client DATETIME NOT NULL,
                duration_seconds INT NOT NULL,
                interval_from_previous_seconds INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_contraction_events_session (session_id),
                KEY idx_contraction_events_started_at (started_at_client)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS docboard_space_schedules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  space VARCHAR(20) NOT NULL,
  agenda VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL,
  schedule_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  location VARCHAR(255) NULL,
  participants VARCHAR(255) NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_space_user_date (user_id, space, schedule_date, start_time),
  INDEX idx_space_date (schedule_date, space),
  INDEX idx_space_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS guest_activity_log (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            event_type VARCHAR(40) NOT NULL,
            page_path VARCHAR(255) NULL,
            page_title VARCHAR(120) NULL,
            details VARCHAR(500) NULL,
            referrer VARCHAR(255) NULL,
            ip_address VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_guest_activity_created (created_at),
            INDEX idx_guest_activity_session (session_id, created_at),
            INDEX idx_guest_activity_event (event_type, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kick_counter_sessions (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                patient_id VARCHAR(50) NOT NULL,
                session_date DATE NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME NULL,
                kick_count INT NOT NULL DEFAULT 0,
                duration_minutes INT NULL,
                status ENUM('active','completed') NOT NULL DEFAULT 'active',
                notes TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_kick_sessions_patient_date (patient_id, session_date),
                KEY idx_kick_sessions_patient_status (patient_id, status),
                KEY idx_kick_sessions_start_time (start_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kick_counter_kicks (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                session_id INT UNSIGNED NOT NULL,
                kick_time DATETIME NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_kicks_session (session_id),
                KEY idx_kicks_time (kick_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medical_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(10) NOT NULL,
            visit_id INT NULL,
            doctor_id INT,
            doctor_name VARCHAR(255),
            record_type ENUM(
                'identitas', 'anamnesa', 'physical_exam', 'pemeriksaan_obstetri',
                'pemeriksaan_ginekologi', 'usg', 'lab', 'penunjang', 'diagnosis',
                'planning', 'resume_medis', 'complete'
            ) NOT NULL,
            record_data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_patient_id (patient_id),
            INDEX idx_visit_id (visit_id),
            INDEX idx_record_type (record_type),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patient_access_blocklist (
            id INT AUTO_INCREMENT PRIMARY KEY,
            block_type ENUM('name', 'ip') NOT NULL,
            value VARCHAR(255) NOT NULL,
            normalized_value VARCHAR(255) NOT NULL,
            reason VARCHAR(500) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_by VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_patient_access_block (block_type, normalized_value),
            KEY idx_patient_access_active_type (is_active, block_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_queue_reminder_settings (
            patient_id VARCHAR(32) NOT NULL PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            threshold_ahead INT NOT NULL DEFAULT 2,
            background_push_enabled TINYINT(1) NOT NULL DEFAULT 1,
            last_notified_signature VARCHAR(160) NULL,
            last_notified_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_queue_reminder_active (enabled, background_push_enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patient_workdesk_layouts (
                patient_id VARCHAR(10) NOT NULL,
                layout_json JSON NOT NULL,
                theme_json JSON NULL,
                public_enabled TINYINT(1) NOT NULL DEFAULT 0,
                share_code VARCHAR(32) NULL,
                public_profile_json JSON NULL,
                public_widgets_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (patient_id),
                UNIQUE KEY uniq_patient_workdesk_share_code (share_code),
                INDEX idx_patient_workdesk_public (public_enabled, share_code),
                CONSTRAINT fk_patient_workdesk_patient
                    FOREIGN KEY (patient_id) REFERENCES patients(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS polls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(180) NOT NULL,
                description TEXT NULL,
                status ENUM('active','closed') NOT NULL DEFAULT 'active',
                show_on_open TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(120) NULL,
                created_by_name VARCHAR(190) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME NULL,
                INDEX idx_polls_status_created (status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_options (
                id INT AUTO_INCREMENT PRIMARY KEY,
                poll_id INT NOT NULL,
                option_text VARCHAR(255) NOT NULL,
                option_order INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_poll_options_poll (poll_id),
                CONSTRAINT fk_poll_options_poll
                    FOREIGN KEY (poll_id) REFERENCES polls(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_votes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                poll_id INT NOT NULL,
                option_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_poll_patient (poll_id, patient_id),
                INDEX idx_poll_votes_poll (poll_id),
                INDEX idx_poll_votes_option (option_id),
                CONSTRAINT fk_poll_votes_poll
                    FOREIGN KEY (poll_id) REFERENCES polls(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_poll_votes_option
                    FOREIGN KEY (option_id) REFERENCES poll_options(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                poll_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                comment_text TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_poll_comments_poll (poll_id),
                CONSTRAINT fk_poll_comments_poll
                    FOREIGN KEY (poll_id) REFERENCES polls(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_comment_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                comment_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_comment_patient (comment_id, patient_id),
                INDEX idx_poll_comment_likes_comment (comment_id),
                CONSTRAINT fk_poll_comment_likes_comment
                    FOREIGN KEY (comment_id) REFERENCES poll_comments(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_workdesk_layouts (
                user_id VARCHAR(64) NOT NULL,
                layout_json JSON NOT NULL,
                theme_json JSON NULL,
                wallpaper_url VARCHAR(1024) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id),
                INDEX idx_staff_workdesk_updated_at (updated_at),
                CONSTRAINT fk_staff_workdesk_user
                    FOREIGN KEY (user_id) REFERENCES users(new_id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_faq (
                id INT AUTO_INCREMENT PRIMARY KEY,
                keywords JSON NOT NULL,
                answer TEXT NOT NULL,
                category VARCHAR(60) NOT NULL DEFAULT 'umum',
                priority INT NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active, priority)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_chat_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id VARCHAR(64) NOT NULL,
                patient_name VARCHAR(255) NOT NULL DEFAULT '',
                status ENUM('bot','escalated','resolved') NOT NULL DEFAULT 'bot',
                assigned_staff_id VARCHAR(64) NULL,
                assigned_staff_name VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_patient (patient_id, status),
                INDEX idx_status (status, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                sender_type ENUM('patient','bot','staff') NOT NULL,
                sender_name VARCHAR(255) NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session (session_id, created_at),
                CONSTRAINT fk_support_messages_session
                    FOREIGN KEY (session_id) REFERENCES support_chat_sessions(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_chat_ratings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                owner_staff_id VARCHAR(64) NULL,
                rating TINYINT NOT NULL,
                comment VARCHAR(1000) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_session (session_id),
                INDEX idx_patient_created (patient_id, created_at),
                INDEX idx_owner_created (owner_staff_id, created_at),
                CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5),
                CONSTRAINT fk_support_rating_session
                    FOREIGN KEY (session_id) REFERENCES support_chat_sessions(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_daily_briefings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                staff_id VARCHAR(64) NOT NULL,
                briefing_date DATE NOT NULL,
                checklist_json JSON NULL,
                started_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_staff_date (staff_id, briefing_date),
                INDEX idx_date (briefing_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_duty_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                staff_id VARCHAR(64) NOT NULL,
                duty_date DATE NOT NULL,
                source ENUM('briefing','manual') NOT NULL DEFAULT 'briefing',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_staff_duty_date (staff_id, duty_date),
                INDEX idx_date (duty_date),
                INDEX idx_staff_date (staff_id, duty_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS wave6_add_column_if_missing$$
CREATE PROCEDURE wave6_add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND COLUMN_NAME = target_column
    ) THEN
        SET @wave6_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
        PREPARE wave6_statement FROM @wave6_sql;
        EXECUTE wave6_statement;
        DEALLOCATE PREPARE wave6_statement;
    END IF;
END$$

DROP PROCEDURE IF EXISTS wave6_add_index_if_missing$$
CREATE PROCEDURE wave6_add_index_if_missing(
    IN target_table VARCHAR(64),
    IN target_index VARCHAR(64),
    IN index_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND INDEX_NAME = target_index
    ) THEN
        SET @wave6_sql = CONCAT('ALTER TABLE `', target_table, '` ADD ', index_definition);
        PREPARE wave6_statement FROM @wave6_sql;
        EXECUTE wave6_statement;
        DEALLOCATE PREPARE wave6_statement;
    END IF;
END$$

CALL wave6_add_column_if_missing('medical_records', 'visit_id', 'visit_id INT NULL AFTER patient_id')$$
CALL wave6_add_column_if_missing('medical_records', 'mr_id', 'mr_id VARCHAR(20) NULL AFTER visit_id')$$
CALL wave6_add_index_if_missing('medical_records', 'idx_visit_id', 'INDEX idx_visit_id (visit_id)')$$
CALL wave6_add_index_if_missing('medical_records', 'idx_mr_id', 'INDEX idx_mr_id (mr_id)')$$

CALL wave6_add_column_if_missing('birth_class_sessions', 'learning_points', 'learning_points TEXT NULL AFTER quota')$$
CALL wave6_add_column_if_missing('birth_class_sessions', 'items_to_bring', 'items_to_bring TEXT NULL AFTER learning_points')$$
CALL wave6_add_column_if_missing('birth_class_sessions', 'price', 'price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER items_to_bring')$$
CALL wave6_add_column_if_missing('birth_class_sessions', 'benefits', 'benefits TEXT NULL AFTER price')$$
CALL wave6_add_column_if_missing('birth_class_registrations', 'payment_status', 'payment_status ENUM(''pending'',''paid'',''waived'') NOT NULL DEFAULT ''pending'' AFTER status')$$
CALL wave6_add_column_if_missing('birth_class_registrations', 'payment_method', 'payment_method VARCHAR(50) NULL AFTER payment_status')$$
CALL wave6_add_column_if_missing('birth_class_registrations', 'payment_amount', 'payment_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER payment_method')$$
CALL wave6_add_column_if_missing('birth_class_registrations', 'paid_at', 'paid_at TIMESTAMP NULL AFTER payment_amount')$$

CALL wave6_add_column_if_missing('community_chat_rooms', 'is_direct', 'is_direct TINYINT(1) NOT NULL DEFAULT 0 AFTER created_by_type')$$
CALL wave6_add_column_if_missing('community_chat_rooms', 'direct_patient_id', 'direct_patient_id VARCHAR(64) NULL AFTER is_direct')$$
CALL wave6_add_column_if_missing('community_chat_rooms', 'direct_staff_id', 'direct_staff_id VARCHAR(64) NULL AFTER direct_patient_id')$$
CALL wave6_add_index_if_missing('community_chat_rooms', 'idx_direct_patient', 'INDEX idx_direct_patient (direct_patient_id, is_archived)')$$
CALL wave6_add_index_if_missing('community_chat_rooms', 'idx_direct_staff', 'INDEX idx_direct_staff (direct_staff_id, is_archived)')$$

CALL wave6_add_column_if_missing('support_chat_sessions', 'owner_staff_id', 'owner_staff_id VARCHAR(64) NULL AFTER assigned_staff_name')$$
CALL wave6_add_column_if_missing('support_chat_sessions', 'owner_staff_name', 'owner_staff_name VARCHAR(255) NULL AFTER owner_staff_id')$$
CALL wave6_add_column_if_missing('support_chat_sessions', 'owner_locked_at', 'owner_locked_at DATETIME NULL AFTER owner_staff_name')$$
CALL wave6_add_column_if_missing('support_chat_sessions', 'resolved_at', 'resolved_at DATETIME NULL AFTER owner_locked_at')$$
CALL wave6_add_column_if_missing('support_chat_sessions', 'resolved_by_staff_id', 'resolved_by_staff_id VARCHAR(64) NULL AFTER resolved_at')$$
CALL wave6_add_column_if_missing('support_chat_sessions', 'resolved_by_staff_name', 'resolved_by_staff_name VARCHAR(255) NULL AFTER resolved_by_staff_id')$$
CALL wave6_add_index_if_missing('support_chat_sessions', 'idx_owner', 'INDEX idx_owner (owner_staff_id, status)')$$
CALL wave6_add_index_if_missing('support_chat_sessions', 'idx_resolved_at', 'INDEX idx_resolved_at (resolved_at)')$$

CALL wave6_add_column_if_missing('birth_congratulations', 'patient_testimonial', 'patient_testimonial TEXT NULL AFTER message')$$
CALL wave6_add_column_if_missing('birth_congratulations', 'patient_testimonial_submitted_at', 'patient_testimonial_submitted_at DATETIME NULL AFTER patient_testimonial')$$

ALTER TABLE medical_records
    MODIFY COLUMN record_type ENUM(
        'identitas', 'anamnesa', 'physical_exam', 'pemeriksaan_obstetri',
        'pemeriksaan_ginekologi', 'usg', 'lab', 'penunjang', 'diagnosis',
        'planning', 'resume_medis', 'complete'
    ) NOT NULL$$

DROP PROCEDURE IF EXISTS wave6_add_column_if_missing$$
DROP PROCEDURE IF EXISTS wave6_add_index_if_missing$$

DELIMITER ;

INSERT INTO patient_access_blocklist
    (block_type, value, normalized_value, reason, created_by)
VALUES
    ('name', 'anisa suryaningsari', 'anisa suryaningsari', 'Seeded patient blocklist entry', 'system')
ON DUPLICATE KEY UPDATE value = VALUES(value);
