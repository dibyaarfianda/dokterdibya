#!/usr/bin/env node
/**
 * Cron script to run appointment reminders
 * Run via: node scripts/run-reminders.js
 * Or via cron: 0 * * * * cd /var/www/dokterdibya/staff/backend && node scripts/run-reminders.js >> /var/log/appointment-reminders.log 2>&1
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const reminderService = require('../services/appointmentReminder');

async function main() {
    console.log(`[${new Date().toISOString()}] Starting appointment reminders...`);

    try {
        const results = await reminderService.runAllReminders();
        console.log(`[${new Date().toISOString()}] Results:`, JSON.stringify(results, null, 2));

        // Exit with success
        process.exit(0);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error);
        process.exit(1);
    }
}

main();
