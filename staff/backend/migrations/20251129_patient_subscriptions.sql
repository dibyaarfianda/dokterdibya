-- Migration: Patient Subscriptions for Gallery Kenangan
-- Payment Gateway: Midtrans (GoPay, OVO)
-- Date: 2025-11-29

USE dibyaklinik;

-- Patient subscriptions table
CREATE TABLE IF NOT EXISTS patient_subscriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(10) NOT NULL,

    -- Subscription details
    plan_type ENUM('monthly', 'yearly', 'lifetime') NOT NULL DEFAULT 'monthly',
    feature VARCHAR(50) NOT NULL DEFAULT 'gallery_kenangan',

    -- Status
    status ENUM('pending', 'active', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',

    -- Dates
    start_date DATETIME NULL,
    end_date DATETIME NULL,

    -- Payment info
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'IDR',

    -- Midtrans transaction
    order_id VARCHAR(100) UNIQUE,
    transaction_id VARCHAR(100),
    payment_type VARCHAR(50),
    transaction_status VARCHAR(50),
    transaction_time DATETIME,

    -- Metadata
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_patient_sub (patient_id),
    INDEX idx_sub_status (status),
    INDEX idx_order_id (order_id),
    INDEX idx_feature (feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment history/logs table
CREATE TABLE IF NOT EXISTS payment_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    subscription_id BIGINT UNSIGNED,
    order_id VARCHAR(100),

    -- Midtrans notification data
    transaction_id VARCHAR(100),
    transaction_status VARCHAR(50),
    payment_type VARCHAR(50),
    gross_amount DECIMAL(12,2),

    -- Raw notification
    raw_notification JSON,

    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_subscription (subscription_id),
    INDEX idx_order (order_id),
    FOREIGN KEY (subscription_id) REFERENCES patient_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add gallery_access column to patients table if not exists
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS gallery_access TINYINT(1) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_expires_at DATETIME NULL;

-- Create index for gallery access
ALTER TABLE patients
ADD INDEX IF NOT EXISTS idx_gallery_access (gallery_access);
