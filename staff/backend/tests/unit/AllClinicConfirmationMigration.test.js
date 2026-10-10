const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
    __dirname,
    '..',
    '..',
    'migrations',
    '20261010_all_clinics_require_confirmation.sql'
);

test('migration moves only upcoming confirmed Weekend Clinic bookings back to confirmation', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/START TRANSACTION/i);
    expect(sql).toMatch(/JOIN booking_settings/i);
    expect(sql).toMatch(/LOWER\(TRIM\(bs\.session_name\)\)\s*=\s*'weekend clinic'/i);
    expect(sql).toMatch(/sa\.appointment_date\s*>\s*CURDATE\(\)/i);
    expect(sql).toMatch(/sa\.status\s*=\s*'confirmed'/i);
    expect(sql).toMatch(/SET\s+sa\.status\s*=\s*'pending_confirmation'/i);
    expect(sql).toMatch(/sa\.confirmed_at\s*=\s*NULL/i);
    expect(sql).toMatch(/sa\.confirmation_popup_enabled_at\s*=\s*NULL/i);
    expect(sql).toMatch(/COMMIT/i);
});
