'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.resolve(
    __dirname,
    '../../migrations/20260720_create_sunday_clinic_closings.sql'
), 'utf8');

describe('Sunday Clinic closing migration contract', () => {
    test('creates immutable closing header and entry tables additively', () => {
        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_closings/i);
        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_closing_entries/i);
        expect(migration).toMatch(/UNIQUE KEY[^\n]+clinic_date/i);
        expect(migration).toMatch(/UNIQUE KEY[^\n]+closing_id[^\n]+source_type[^\n]+source_id/i);
        expect(migration).toMatch(/summary_json\s+JSON\s+NOT NULL/i);
        expect(migration).toMatch(/breakdown_json\s+JSON\s+NOT NULL/i);
        expect(migration).toMatch(/item_snapshot\s+JSON\s+NOT NULL/i);
        expect(migration).toMatch(/FOREIGN KEY \(closing_id\) REFERENCES sunday_clinic_closings/i);
        expect(migration).toMatch(/status, paid_at/i);
        expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    });
});
