CREATE TABLE IF NOT EXISTS wa_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    direction ENUM('outbound','inbound') NOT NULL,
    purpose VARCHAR(40) NULL,            -- janji_h1 | janji_belum_konfirmasi | kontrol_h3 (outbound); NULL untuk inbound
    ref_type VARCHAR(40) NULL,           -- sunday_appointment | medical_record
    ref_id VARCHAR(40) NULL,             -- id appointment / id medical_records
    patient_id VARCHAR(50) NULL,
    phone VARCHAR(20) NOT NULL,          -- format 62xxxxxxxx
    template_name VARCHAR(80) NULL,
    wa_message_id VARCHAR(128) NULL,
    status ENUM('claimed','sent','delivered','read','failed','skipped','received') NOT NULL,
    error_message VARCHAR(500) NULL,
    body_text TEXT NULL,                 -- hanya untuk inbound
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wa_outbound_purpose_ref (purpose, ref_id),
    UNIQUE KEY uq_wa_message_id (wa_message_id),
    KEY idx_wa_phone (phone),
    KEY idx_wa_created (created_at)
);

CREATE TABLE IF NOT EXISTS wa_opt_outs (
    phone VARCHAR(20) PRIMARY KEY,       -- format 62xxxxxxxx
    opted_out_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(40) NOT NULL          -- inbound_stop | staff
);
