'use strict';

const fs = require('fs');
const path = require('path');
const migration = path.join(__dirname, '../../migrations/20260924_medical_record_versions.sql');

test('additive MariaDB migration exists and protects immutable revisions without rewriting legacy rows', () => {
    expect(fs.existsSync(migration)).toBe(true);
    const sql = fs.readFileSync(migration, 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).toMatch(/ALTER TABLE medical_records\s+ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1/i);
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM|INSERT INTO|REPLACE INTO)\s+(?:medical_records|patient_documents)\b/i);
    expect(sql).not.toMatch(/(?:DROP TABLE|DROP COLUMN|MODIFY|CHANGE COLUMN|ADD.*FOREIGN KEY)/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS medical_record_revisions/i);
    expect(sql).toMatch(/patient_id VARCHAR\(50\)/i);
    for (const operation of ['UPDATE', 'DELETE']) {
        expect(sql).toMatch(new RegExp(`CREATE TRIGGER IF NOT EXISTS \\w+\\s+BEFORE ${operation} ON medical_record_revisions\\s+FOR EACH ROW\\s+SIGNAL SQLSTATE '45000'`, 'i'));
    }
    expect(sql).toMatch(/UNIQUE KEY\s+\w+\s*\(reconciliation_manifest_sha256, medical_record_id, event_type\)/i);
    expect(sql).toMatch(/event_type VARCHAR/i);
    expect(sql).toMatch(/source_row_sha256 CHAR\(64\)/i);
    expect(sql).toMatch(/INSERT IGNORE INTO permissions/i);
    expect(sql).toMatch(/INSERT IGNORE INTO role_permissions/i);
    expect(sql).toMatch(/r.name IN \('dokter', 'bidan'\)/);
    expect(sql).toContain('medical_records.reset_section');
    // Static syntax framing only. Executable MariaDB syntax, rerun and trigger
    // UPDATE/DELETE rejection are mandatory staging checks before Wave 2 deploy.
    expect((sql.match(/CREATE TRIGGER/gi) || []).length).toBe(2);
    expect(sql.trim().endsWith(';')).toBe(true);
    expect(sql).not.toMatch(/DELIMITER|CREATE OR REPLACE/i);
});
