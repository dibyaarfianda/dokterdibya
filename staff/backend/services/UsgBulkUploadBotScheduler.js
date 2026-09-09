'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');
const usgBulkUpload = require('./UsgBulkUploadService');

const CRON_EXPRESSION = process.env.USG_BOT_CRON || '0 21 * * 0';
const TIMEZONE = process.env.USG_BOT_TZ || 'Asia/Jakarta';

let initialized = false;
let running = false;

async function runOnce(options = {}) {
    if (running) return { skipped: true, reason: 'already_running' };
    running = true;
    try {
        const result = await usgBulkUpload.runConfiguredSources({
            force: Boolean(options.force),
            dryRun: Boolean(options.dryRun),
            user: { name: 'Grok Bot Scheduler' },
            date: options.date
        });
        logger.info('[UsgBotCron] completed', {
            skipped: result.skipped,
            reason: result.reason || null,
            date: result.date || null,
            jobs: Array.isArray(result.jobs) ? result.jobs.length : 0
        });
        return result;
    } catch (error) {
        logger.error(`[UsgBotCron] failed: ${error.message}`);
        throw error;
    } finally {
        running = false;
    }
}

function initScheduler() {
    if (initialized) return;
    initialized = true;
    cron.schedule(CRON_EXPRESSION, () => {
        runOnce().catch((error) => logger.error(`[UsgBotCron] failed: ${error.message}`));
    }, { timezone: TIMEZONE });
    logger.info(`[UsgBotCron] scheduled ${CRON_EXPRESSION} (${TIMEZONE})`);
}

module.exports = {
    CRON_EXPRESSION,
    TIMEZONE,
    initScheduler,
    runOnce
};
