-- Billing system tables for patient invoicing
-- Created: 2025-01-13

-- Main billing/invoice table
CREATE TABLE IF NOT EXISTS billings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  billing_number VARCHAR(50) UNIQUE NOT NULL COMMENT 'Format: INV-YYYYMMDD-XXXX',
  patient_id VARCHAR(10) NOT NULL,
  patient_record_id INT NULL COMMENT 'Link to patient_records.id for medical exam',
  submission_id VARCHAR(50) NULL COMMENT 'Link to intake submission',
  
  -- Billing details
  billing_date DATE NOT NULL,
  due_date DATE NULL,
  
  -- Amounts
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  
  -- Payment info
  payment_status ENUM('unpaid', 'partial', 'paid', 'cancelled') NOT NULL DEFAULT 'unpaid',
  payment_method VARCHAR(50) NULL COMMENT 'cash, credit_card, debit_card, transfer, insurance',
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_date DATETIME NULL,
  
  -- Additional info
  notes TEXT NULL,
  created_by VARCHAR(50) NULL COMMENT 'Staff/doctor ID who created billing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_patient_id (patient_id),
  INDEX idx_patient_record_id (patient_record_id),
  INDEX idx_submission_id (submission_id),
  INDEX idx_billing_date (billing_date),
  INDEX idx_payment_status (payment_status),
  INDEX idx_billing_number (billing_number),
  
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  FOREIGN KEY (patient_record_id) REFERENCES patient_records(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Billing line items (services, medications, procedures)
CREATE TABLE IF NOT EXISTS billing_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  billing_id INT NOT NULL,
  
  -- Item details
  item_type ENUM('service', 'medication', 'procedure', 'consultation', 'lab', 'other') NOT NULL,
  item_code VARCHAR(50) NULL COMMENT 'Reference to obat.id, tindakan.id, services.id',
  item_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  
  -- Pricing
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_billing_id (billing_id),
  INDEX idx_item_type (item_type),
  
  FOREIGN KEY (billing_id) REFERENCES billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment transactions (for tracking partial payments)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  billing_id INT NOT NULL,
  
  -- Transaction details
  transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL COMMENT 'cash, credit_card, debit_card, transfer, insurance',
  
  -- Reference info
  reference_number VARCHAR(100) NULL COMMENT 'Bank ref, card transaction ID, etc',
  notes TEXT NULL,
  
  -- Metadata
  created_by VARCHAR(50) NULL COMMENT 'Staff ID who processed payment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_billing_id (billing_id),
  INDEX idx_transaction_date (transaction_date),
  
  FOREIGN KEY (billing_id) REFERENCES billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auto-increment sequence for billing numbers
CREATE TABLE IF NOT EXISTS billing_sequences (
  billing_date DATE PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
