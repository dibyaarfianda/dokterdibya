-- Pengeluaran Obat RS: monthly drug usage copied from the Medify Melinda report.
-- Per drug, depot and month only. No patient data. Additive and re-runnable.

CREATE TABLE IF NOT EXISTS melinda_drug_usage (
    period CHAR(7) NOT NULL,
    depot VARCHAR(40) NOT NULL,
    item_key VARCHAR(191) NOT NULL,
    item_code VARCHAR(40) NULL,
    item_name VARCHAR(191) NOT NULL,
    item_type ENUM('obat', 'alkes') NOT NULL,
    qty DECIMAL(14,2) NOT NULL DEFAULT 0,
    value_idr DECIMAL(16,2) NOT NULL DEFAULT 0,
    inacbg_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
    inacbg_value_idr DECIMAL(16,2) NOT NULL DEFAULT 0,
    hari23_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
    hari23_value_idr DECIMAL(16,2) NOT NULL DEFAULT 0,
    duk_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
    duk_value_idr DECIMAL(16,2) NOT NULL DEFAULT 0,
    synced_at DATETIME NOT NULL,
    PRIMARY KEY (period, depot, item_key),
    KEY idx_melinda_drug_usage_period_type (period, item_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS melinda_drug_usage_reports (
    period CHAR(7) NOT NULL,
    depot VARCHAR(40) NOT NULL,
    item_count INT UNSIGNED NOT NULL DEFAULT 0,
    total_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_value_idr DECIMAL(16,2) NOT NULL DEFAULT 0,
    synced_at DATETIME NOT NULL,
    PRIMARY KEY (period, depot),
    KEY idx_melinda_drug_usage_reports_synced (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS melinda_drug_usage_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    status ENUM('running', 'success', 'failed', 'stopped') NOT NULL DEFAULT 'running',
    periods VARCHAR(255) NOT NULL,
    reports_saved INT UNSIGNED NOT NULL DEFAULT 0,
    message VARCHAR(255) NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_melinda_drug_usage_runs_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
