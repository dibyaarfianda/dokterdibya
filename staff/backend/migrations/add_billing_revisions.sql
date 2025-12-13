-- Migration: Add billing revision system
-- Date: 2025-11-24

-- Table untuk menyimpan request revisi dari staff ke dokter
CREATE TABLE IF NOT EXISTS sunday_clinic_billing_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    approved_at DATETIME DEFAULT NULL,
    approved_by VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_status (status),
    FOREIGN KEY (mr_id) REFERENCES sunday_clinic_billings(mr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add printed_at and printed_by columns to billings table
ALTER TABLE sunday_clinic_billings 
ADD COLUMN IF NOT EXISTS printed_at DATETIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS printed_by VARCHAR(255) DEFAULT NULL;

-- Create invoices directory (done in code)
-- Path: /var/www/dokterdibya/database/invoices/
