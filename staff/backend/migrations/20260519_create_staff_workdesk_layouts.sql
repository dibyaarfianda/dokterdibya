-- Create per-staff workdesk layouts (Kantor Saya)
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

-- Add role visibility for Kantor Saya menu
INSERT INTO role_visibility (role_name, menu_key, is_visible) VALUES
    ('dokter', 'kantor_saya', 1),
    ('admin', 'kantor_saya', 1),
    ('managerial', 'kantor_saya', 1),
    ('bidan', 'kantor_saya', 1),
    ('front_office', 'kantor_saya', 1)
ON DUPLICATE KEY UPDATE is_visible = VALUES(is_visible);
