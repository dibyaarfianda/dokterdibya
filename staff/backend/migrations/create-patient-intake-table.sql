-- Migration: Create patient_intake_submissions table
-- Purpose: Store patient intake form submissions in database for better reliability and query performance
-- Date: 2025-11-15

CREATE TABLE IF NOT EXISTS patient_intake_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    submission_id VARCHAR(50) UNIQUE NOT NULL,
    patient_id VARCHAR(10) NULL,
    
    -- Basic patient information (for quick lookup)
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    birth_date DATE NULL,
    nik VARCHAR(20) NULL,
    
    -- Form payload (encrypted or plain JSON)
    payload JSON NOT NULL,
    
    -- Status and workflow
    status ENUM('patient_reported', 'pending_review', 'verified', 'rejected', 'archived') DEFAULT 'verified',
    high_risk BOOLEAN DEFAULT FALSE,
    
    -- Review information
    reviewed_by VARCHAR(100) NULL,
    reviewed_at DATETIME NULL,
    review_notes TEXT NULL,
    
    -- Integration tracking
    integrated_at DATETIME NULL,
    integration_status ENUM('pending', 'success', 'failed', 'skipped') DEFAULT 'pending',
    integration_result JSON NULL,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for common queries
    INDEX idx_patient_id (patient_id),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_high_risk (high_risk),
    INDEX idx_created_at (created_at),
    
    -- Foreign key (optional, can be NULL for new patients)
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment to table
ALTER TABLE patient_intake_submissions 
COMMENT = 'Stores patient intake form submissions with full payload for medical history tracking';
