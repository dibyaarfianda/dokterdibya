'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');

// Every 30 minutes. Duitku blocks callers that poll Check Transaction, so the service itself
// also limits each order to one check per 30 minutes and a handful of orders per run.
const CRON_EXPRESSION = process.env.PREMIUM_RECONCILE_CRON || '*/30 * * * *';
const TIMEZONE = process.env.PREMIUM_RECONCILE_TZ || 'Asia/Jakarta';
let initialized = false;
let running = false;

async function runOnce({ service } = {}) {
    if (running) return { skipped: true };
    running = true;
    try {
        const premium = service || require('./PremiumPaymentService').getPremiumPaymentService();
        const result = await premium.reconcilePendingOrders();
        if (result.checked || result.errors) {
            logger.info(`[PremiumReconcile] checked=${result.checked} activated=${result.activated} expired=${result.expired} errors=${result.errors}`);
        }
        return result;
    } finally {
        running = false;
    }
}

function initScheduler() {
    if (initialized) return;
    initialized = true;
    cron.schedule(CRON_EXPRESSION, () => {
        runOnce().catch(error => logger.error(`[PremiumReconcile] failed: ${error.message}`));
    }, { timezone: TIMEZONE });
    logger.info(`[PremiumReconcile] scheduled ${CRON_EXPRESSION} (${TIMEZONE})`);
}

module.exports = { CRON_EXPRESSION, TIMEZONE, initScheduler, runOnce };
