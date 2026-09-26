ALTER TABLE patient_notifications
    ADD COLUMN IF NOT EXISTS popup_on_open TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS popup_dismissed_at DATETIME NULL;
