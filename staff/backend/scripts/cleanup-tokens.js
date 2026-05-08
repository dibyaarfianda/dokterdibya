#!/usr/bin/env node
'use strict';

/**
 * Cleanup expired authentication tokens and stale log records.
 * Intended to run via cron (daily).
 *
 * Tables cleaned:
 *   - email_verifications: rows where expires_at < NOW()
 *   - patient_password_reset_tokens: rows where expires_at < NOW() OR used = 1
 *   - activity_logs: rows where timestamp < NOW() - 6 months
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

(async function () {
    let totalCleaned = 0;

    try {
        const [ev] = await db.query(
            'DELETE FROM email_verifications WHERE expires_at < NOW()'
        );
        console.log(new Date().toISOString(), '- email_verifications cleaned:', ev.affectedRows);
        totalCleaned += ev.affectedRows;
    } catch (err) {
        console.error(new Date().toISOString(), '- email_verifications cleanup error:', err.message);
    }

    try {
        const [prt] = await db.query(
            'DELETE FROM patient_password_reset_tokens WHERE expires_at < NOW() OR used = 1'
        );
        console.log(new Date().toISOString(), '- patient_password_reset_tokens cleaned:', prt.affectedRows);
        totalCleaned += prt.affectedRows;
    } catch (err) {
        console.error(new Date().toISOString(), '- patient_password_reset_tokens cleanup error:', err.message);
    }

    try {
        const [al] = await db.query(
            'DELETE FROM activity_logs WHERE timestamp < DATE_SUB(NOW(), INTERVAL 6 MONTH)'
        );
        console.log(new Date().toISOString(), '- activity_logs cleaned:', al.affectedRows);
        totalCleaned += al.affectedRows;
    } catch (err) {
        console.error(new Date().toISOString(), '- activity_logs cleanup error:', err.message);
    }

    console.log(new Date().toISOString(), '- Total rows cleaned:', totalCleaned);
    process.exit(0);
})();
