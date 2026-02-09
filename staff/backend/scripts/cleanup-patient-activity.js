#!/usr/bin/env node
'use strict';

/**
 * Cleanup patient_activity_log entries older than 6 months.
 * Intended to run via cron (weekly).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

(async function() {
    try {
        const [result] = await db.query(
            'DELETE FROM patient_activity_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)'
        );
        console.log(new Date().toISOString(), '- Cleaned up', result.affectedRows, 'patient activity log rows');
        process.exit(0);
    } catch (err) {
        console.error(new Date().toISOString(), '- Cleanup error:', err.message);
        process.exit(1);
    }
})();
