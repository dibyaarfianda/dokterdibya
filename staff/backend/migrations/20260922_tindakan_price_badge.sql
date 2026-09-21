-- MariaDB: additive and safe to re-run. Existing prices are not backdated.
ALTER TABLE tindakan
    ADD COLUMN IF NOT EXISTS previous_price DECIMAL(10,2) NULL,
    ADD COLUMN IF NOT EXISTS price_changed_at DATETIME(3) NULL;
