CREATE TABLE IF NOT EXISTS order_supplier_settings (
 supplier_id INT NOT NULL PRIMARY KEY, lead_days INT NOT NULL DEFAULT 7, safety_days INT NOT NULL DEFAULT 7,
 version INT NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_drafts (
 id CHAR(36) NOT NULL PRIMARY KEY, supplier_id INT NOT NULL, supplier_name VARCHAR(255) NOT NULL,
 status ENUM('draft','archived') NOT NULL DEFAULT 'draft', version INT NOT NULL DEFAULT 1,
 notes VARCHAR(2000) NOT NULL DEFAULT '', created_by VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_order_status(status,supplier_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_draft_items (
 draft_id CHAR(36) NOT NULL, obat_id INT NOT NULL, item_json JSON NOT NULL,
 PRIMARY KEY(draft_id,obat_id), INDEX idx_order_obat(obat_id),
 CONSTRAINT fk_order_item_draft FOREIGN KEY(draft_id) REFERENCES order_drafts(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_draft_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, draft_id CHAR(36) NULL, action VARCHAR(40) NOT NULL,
 actor VARCHAR(64) NOT NULL, snapshot_json JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_order_audit(draft_id,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_draft_requests (
 actor VARCHAR(64) NOT NULL, request_key CHAR(36) NOT NULL, payload_hash CHAR(64) NOT NULL,
 result_json JSON NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor,request_key)
) ENGINE=InnoDB;
