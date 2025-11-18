-- Email settings and template storage

CREATE TABLE IF NOT EXISTS email_settings (
    id TINYINT UNSIGNED NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_email_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO email_settings (id, sender_name)
VALUES (1, 'Klinik Dr. Dibya')
ON DUPLICATE KEY UPDATE sender_name = VALUES(sender_name);

CREATE TABLE IF NOT EXISTS email_templates (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    template_key VARCHAR(64) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_templates_key (template_key),
    CONSTRAINT fk_email_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO email_templates (template_key, subject, body)
VALUES
    ('verification', 'Verifikasi Email Anda', 'Halo {user_name},\n\nTerima kasih telah mendaftar di {clinic_name}.\nKode verifikasi Anda: {verification_code}\n\nAnda juga bisa mengklik tautan berikut untuk verifikasi:\n{verification_link}\n\nKode berlaku selama 24 jam.\n\nTerima kasih,\nTim {clinic_name}'),
    ('password_reset', 'Permintaan Reset Password', 'Halo {user_name},\n\nKami menerima permintaan untuk mereset password akun Anda.\nKode reset Anda: {reset_code}\n\nKlik tautan berikut untuk mengatur ulang password:\n{reset_link}\n\nKode berlaku selama 24 jam. Jika Anda tidak meminta reset password, abaikan email ini.\n\nTerima kasih,\nTim {clinic_name}'),
    ('announcement', 'Pengumuman dari {clinic_name}', 'Halo {user_name},\n\n{announcement_content}\n\nTerima kasih,\nTim {clinic_name}');