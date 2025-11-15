CREATE TABLE IF NOT EXISTS visit_invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id VARCHAR(32) NOT NULL,
  visit_reference VARCHAR(128) DEFAULT NULL,
  visit_type VARCHAR(128) DEFAULT NULL,
  visit_date DATE DEFAULT NULL,
  invoice_number VARCHAR(64) NOT NULL,
  invoice_url TEXT NOT NULL,
  etiket_url TEXT DEFAULT NULL,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  invoice_status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_patient_id (patient_id),
  INDEX idx_invoice_number (invoice_number),
  INDEX idx_visit_date (visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
