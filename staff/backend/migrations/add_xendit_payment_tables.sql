-- Xendit Payment Integration Tables
-- Created: 2026-02-05

-- Table 1: Payment requests tracking
CREATE TABLE IF NOT EXISTS `tagihan_payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `billing_id` INT NOT NULL COMMENT 'FK to sunday_clinic_billings.id',
    `mr_id` VARCHAR(50) NOT NULL COMMENT 'Medical record ID (DRD0001)',
    `patient_id` VARCHAR(10) NOT NULL COMMENT 'Patient ID (P2025001)',

    -- Xendit identifiers
    `xendit_id` VARCHAR(100) NULL COMMENT 'Xendit payment/QR/VA ID',
    `xendit_reference_id` VARCHAR(100) NULL COMMENT 'Our reference ID sent to Xendit',

    -- Payment method details
    `payment_method` ENUM('qris', 'va_bca', 'va_bni', 'va_bri', 'va_mandiri') NOT NULL,

    -- For QRIS
    `qris_string` TEXT NULL COMMENT 'Raw QRIS string for generating QR locally',
    `qris_url` VARCHAR(500) NULL COMMENT 'Xendit-hosted QR image URL',

    -- For Virtual Account
    `va_number` VARCHAR(50) NULL COMMENT 'Virtual account number',
    `va_bank_code` VARCHAR(20) NULL COMMENT 'Bank code (BCA, BNI, BRI, MANDIRI)',

    -- Amount and status
    `amount` DECIMAL(12,2) NOT NULL COMMENT 'Payment amount in IDR',
    `status` ENUM('pending', 'paid', 'expired', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',

    -- Timestamps
    `expires_at` TIMESTAMP NULL COMMENT 'Payment expiration time',
    `paid_at` TIMESTAMP NULL COMMENT 'When payment was received',

    -- Xendit response storage
    `xendit_response` JSON NULL COMMENT 'Full Xendit API response on creation',
    `webhook_data` JSON NULL COMMENT 'Webhook payload when payment received',

    -- Audit
    `created_by` VARCHAR(255) NULL COMMENT 'Staff who initiated payment',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes
    INDEX `idx_billing_id` (`billing_id`),
    INDEX `idx_mr_id` (`mr_id`),
    INDEX `idx_patient_id` (`patient_id`),
    INDEX `idx_xendit_id` (`xendit_id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_expires_at` (`expires_at`),

    -- Foreign key
    FOREIGN KEY (`billing_id`) REFERENCES `sunday_clinic_billings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Xendit payment requests for billing';

-- Table 2: Payment event logs (webhooks, status changes)
CREATE TABLE IF NOT EXISTS `tagihan_payment_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `payment_id` INT NULL COMMENT 'FK to tagihan_payments.id',
    `billing_id` INT NULL COMMENT 'Billing ID for reference',
    `mr_id` VARCHAR(50) NULL COMMENT 'Medical record ID for reference',

    -- Event details
    `event_type` VARCHAR(50) NOT NULL COMMENT 'e.g., payment.created, payment.paid, webhook.received',
    `event_source` ENUM('api', 'webhook', 'manual', 'system') NOT NULL DEFAULT 'api',

    -- Status tracking
    `status_before` VARCHAR(20) NULL,
    `status_after` VARCHAR(20) NULL,

    -- Request/Response data
    `request_data` JSON NULL COMMENT 'API request payload',
    `response_data` JSON NULL COMMENT 'API response or webhook payload',

    -- Request metadata
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX `idx_payment_id` (`payment_id`),
    INDEX `idx_billing_id` (`billing_id`),
    INDEX `idx_mr_id` (`mr_id`),
    INDEX `idx_event_type` (`event_type`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Xendit payment event logs';
