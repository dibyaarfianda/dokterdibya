-- Migration: Create patient_documents table
-- Purpose: Store documents sent to patients (Resume Medis, USG Photos, Lab Results)
-- Date: 2025-11-27
-- Author: Claude AI Assistant

USE dibyaklinik;

-- =====================================================
-- TABLE: patient_documents
-- Stores metadata for documents shared with patients
-- =====================================================
CREATE TABLE IF NOT EXISTS patient_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Patient reference
    patient_id VARCHAR(10) NOT NULL,

    -- Medical record reference (optional, for visit-specific documents)
    mr_id VARCHAR(20) NULL,

    -- Document identification
    document_type ENUM(
        'resume_medis',      -- AI-generated medical summary PDF
        'usg_2d',            -- 2D ultrasound image
        'usg_4d',            -- 4D ultrasound image/video
        'lab_result',        -- Laboratory result (from penunjang)
        'lab_interpretation', -- AI interpretation of lab results
        'prescription',      -- Resep obat
        'referral',          -- Surat rujukan
        'certificate',       -- Surat keterangan (sehat, sakit, etc.)
        'other'              -- Other documents
    ) NOT NULL,

    -- Document details
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,

    -- File information (NULL for text-based documents like resume_medis)
    file_path VARCHAR(500) NULL,               -- Server path to file
    file_url VARCHAR(500) NULL,                -- Public accessible URL
    file_name VARCHAR(255) NULL,               -- Original filename
    file_type VARCHAR(50) NOT NULL,            -- MIME type (image/jpeg, application/pdf, etc.)
    file_size INT UNSIGNED NULL,               -- File size in bytes

    -- For generated documents (Resume Medis PDF)
    source_data JSON NULL,                     -- Source data used to generate the document

    -- Publishing status
    status ENUM(
        'draft',             -- Document created but not yet published
        'published',         -- Published to patient portal
        'archived',          -- Archived/hidden from patient
        'deleted'            -- Soft deleted
    ) NOT NULL DEFAULT 'draft',

    -- Publishing details
    published_at DATETIME NULL,
    published_by VARCHAR(10) NULL,             -- Staff user who published (users.new_id)

    -- Notification tracking
    notification_channels JSON NULL,           -- {"whatsapp": true, "email": false, "portal": true}
    whatsapp_sent_at DATETIME NULL,
    whatsapp_status ENUM('pending', 'sent', 'delivered', 'failed') NULL,
    email_sent_at DATETIME NULL,
    email_status ENUM('pending', 'sent', 'delivered', 'failed') NULL,

    -- Patient access tracking
    first_viewed_at DATETIME NULL,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_viewed_at DATETIME NULL,
    download_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_downloaded_at DATETIME NULL,

    -- Audit fields
    created_by VARCHAR(10) NULL,               -- Staff user (users.new_id)
    updated_by VARCHAR(10) NULL,               -- Staff user (users.new_id)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Primary key
    PRIMARY KEY (id),

    -- Indexes for common queries
    INDEX idx_patient_documents_patient (patient_id),
    INDEX idx_patient_documents_mr (mr_id),
    INDEX idx_patient_documents_type (document_type),
    INDEX idx_patient_documents_status (status),
    INDEX idx_patient_documents_published (published_at),
    INDEX idx_patient_documents_created (created_at),

    -- Composite indexes
    INDEX idx_patient_docs_patient_type (patient_id, document_type),
    INDEX idx_patient_docs_patient_status (patient_id, status),

    -- Foreign keys
    CONSTRAINT fk_patient_docs_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_docs_mr
        FOREIGN KEY (mr_id) REFERENCES sunday_clinic_records(mr_id) ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Documents shared with patients via portal/WhatsApp/email';


-- =====================================================
-- TABLE: patient_document_access_logs
-- Tracks patient access to documents (for audit/analytics)
-- =====================================================
CREATE TABLE IF NOT EXISTS patient_document_access_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    document_id BIGINT UNSIGNED NOT NULL,
    patient_id VARCHAR(10) NOT NULL,

    -- Access details
    action ENUM('view', 'download', 'print', 'share') NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    device_type ENUM('mobile', 'tablet', 'desktop', 'unknown') NULL,

    -- Timestamp
    accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_doc_access_document (document_id),
    INDEX idx_doc_access_patient (patient_id),
    INDEX idx_doc_access_action (action),
    INDEX idx_doc_access_time (accessed_at),

    CONSTRAINT fk_doc_access_document
        FOREIGN KEY (document_id) REFERENCES patient_documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_access_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit log for patient document access';


-- =====================================================
-- TABLE: patient_document_shares
-- Tracks document sharing via different channels
-- =====================================================
CREATE TABLE IF NOT EXISTS patient_document_shares (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    document_id BIGINT UNSIGNED NOT NULL,

    -- Share channel
    channel ENUM('whatsapp', 'email', 'sms', 'link') NOT NULL,

    -- Recipient info
    recipient_phone VARCHAR(20) NULL,
    recipient_email VARCHAR(255) NULL,

    -- Share link (for link-based sharing)
    share_token VARCHAR(64) NULL,
    share_url VARCHAR(500) NULL,
    expires_at DATETIME NULL,

    -- Status tracking
    status ENUM('pending', 'sent', 'delivered', 'opened', 'failed') NOT NULL DEFAULT 'pending',
    sent_at DATETIME NULL,
    delivered_at DATETIME NULL,
    opened_at DATETIME NULL,
    error_message TEXT NULL,

    -- Who initiated the share
    shared_by VARCHAR(10) NULL,                -- Staff user (users.new_id)

    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE INDEX idx_share_token (share_token),
    INDEX idx_share_document (document_id),
    INDEX idx_share_channel (channel),
    INDEX idx_share_status (status),
    INDEX idx_share_expires (expires_at),

    CONSTRAINT fk_share_document
        FOREIGN KEY (document_id) REFERENCES patient_documents(id) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracking document shares via WhatsApp, Email, SMS, or direct link';


-- =====================================================
-- Add helpful comments
-- =====================================================
ALTER TABLE patient_documents
COMMENT = 'Main table for documents shared with patients including resume medis, USG photos, and lab results';

ALTER TABLE patient_document_access_logs
COMMENT = 'Audit log tracking when patients view/download their documents';

ALTER TABLE patient_document_shares
COMMENT = 'Tracks document sharing via WhatsApp, email, or shareable links';


-- =====================================================
-- Sample query: Get all published documents for a patient
-- =====================================================
-- SELECT
--     pd.*,
--     CASE
--         WHEN pd.first_viewed_at IS NOT NULL THEN 'Sudah dilihat'
--         ELSE 'Belum dilihat'
--     END as read_status
-- FROM patient_documents pd
-- WHERE pd.patient_id = 'P001'
--   AND pd.status = 'published'
-- ORDER BY pd.published_at DESC;


-- =====================================================
-- Sample query: Get document statistics for a patient
-- =====================================================
-- SELECT
--     document_type,
--     COUNT(*) as total_documents,
--     SUM(CASE WHEN first_viewed_at IS NOT NULL THEN 1 ELSE 0 END) as viewed_count,
--     SUM(download_count) as total_downloads
-- FROM patient_documents
-- WHERE patient_id = 'P001' AND status = 'published'
-- GROUP BY document_type;
