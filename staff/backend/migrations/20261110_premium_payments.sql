-- Premium patient packages paid through Duitku (QRIS + virtual account).
-- Tables are created here ONLY, never at runtime (see StaffPanelWave6StartupSchema.test.js).
-- Safe to run more than once. Run on deploy: mysql -u root dibyaklinik < this file.

CREATE TABLE IF NOT EXISTS premium_plans (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,                 -- kehamilan | tahunan | ...
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    price_idr INT UNSIGNED NOT NULL,           -- Duitku minimum is 10000
    duration_days SMALLINT UNSIGNED NOT NULL,  -- active period granted per purchase
    features TEXT NULL,                        -- JSON array of non-clinical feature keys
    is_active TINYINT(1) NOT NULL DEFAULT 0,   -- plans are sold only after Boss switches them on
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_premium_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_ref VARCHAR(50) NOT NULL,            -- PRM-<uuid>, sent to Duitku as merchantOrderId (max 50)
    patient_id VARCHAR(50) NOT NULL,
    plan_id INT UNSIGNED NOT NULL,
    plan_code VARCHAR(40) NOT NULL,            -- snapshot, plans can be renamed later
    amount_idr INT UNSIGNED NOT NULL,          -- always copied from premium_plans, never from the request
    duration_days SMALLINT UNSIGNED NOT NULL,  -- snapshot: the period promised when the order was created
    payment_method VARCHAR(20) NOT NULL,       -- qris | va_bni | va_bri | va_mandiri | va_bca
    status ENUM('pending','paid','expired','failed') NOT NULL DEFAULT 'pending',
    gateway_reference VARCHAR(100) NULL,       -- Duitku "reference"
    va_number VARCHAR(40) NULL,
    qr_string TEXT NULL,
    payment_url VARCHAR(500) NULL,
    fee_idr INT UNSIGNED NULL,
    expires_at DATETIME NOT NULL,
    paid_at DATETIME NULL,
    last_status_check_at DATETIME NULL,        -- throttles Check Transaction (Duitku blocks pollers)
    gateway_payload TEXT NULL,                 -- last callback / check payload, for audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payment_orders_ref (order_ref),
    KEY idx_payment_orders_patient (patient_id, created_at),
    KEY idx_payment_orders_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_entitlements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    plan_id INT UNSIGNED NOT NULL,
    plan_code VARCHAR(40) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    source ENUM('payment','manual') NOT NULL DEFAULT 'payment',
    source_order_id BIGINT UNSIGNED NULL,      -- payment_orders.id; UNIQUE so one order grants one period only
    granted_by VARCHAR(50) NULL,               -- staff id for manual grants
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_entitlement_source_order (source_order_id),
    KEY idx_entitlement_patient_end (patient_id, ends_at),
    KEY idx_entitlement_end (ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS premium_payment_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_ref VARCHAR(50) NULL,
    patient_id VARCHAR(50) NULL,
    event_type VARCHAR(40) NOT NULL,           -- order_created | callback_received | callback_rejected | status_checked | paid | paid_after_expiry | expired | order_failed | manual_grant
    detail TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_premium_events_order (order_ref),
    KEY idx_premium_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One plan, inactive. Price and duration are placeholders until Boss decides; the plan
-- cannot be bought until is_active is set to 1.
INSERT IGNORE INTO premium_plans (code, name, description, price_idr, duration_days, features, is_active, sort_order)
VALUES ('kehamilan', 'Paket Kehamilan', 'Satu paket untuk satu kehamilan', 99000, 365, '[]', 0, 10);
