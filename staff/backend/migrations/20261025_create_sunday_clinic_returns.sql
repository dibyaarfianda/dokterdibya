CREATE TABLE IF NOT EXISTS sunday_clinic_billing_returns (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    billing_id INT NOT NULL,
    additional_billing_id INT NULL,
    mr_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    kind ENUM('obat', 'money') NOT NULL,
    source_item_id INT NULL,
    item_name VARCHAR(255) NULL,
    quantity INT NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    payment_method ENUM('cash', 'transfer') NOT NULL,
    accounting_date DATE NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_name VARCHAR(255) NOT NULL,
    request_key VARCHAR(80) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    stock_allocations JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sc_return_request (billing_id, request_key),
    KEY idx_sc_return_date (accounting_date),
    KEY idx_sc_return_mr (mr_id),
    CONSTRAINT fk_sc_return_billing FOREIGN KEY (billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sc_return_additional FOREIGN KEY (additional_billing_id) REFERENCES sunday_clinic_additional_billings(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE sunday_clinic_closing_entries MODIFY source_type ENUM('main', 'additional', 'return') NOT NULL;
