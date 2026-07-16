const cron = require('node-cron');
const logger = require('../utils/logger');
const OperationDoctorJourneyService = require('./OperationDoctorJourneyService');

const CRON_EXPRESSION = process.env.OPERATION_DOCTOR_JOURNEY_CRON || '30 4 * * *';
const TIMEZONE = process.env.OPERATION_DOCTOR_JOURNEY_TZ || 'Asia/Jakarta';
let initialized = false;
let running = false;

async function runOnce() {
  if (running) return { skipped: true };
  running = true;
  try {
    const service = new OperationDoctorJourneyService();
    const result = await service.processPending({ limit: 50, concurrency: 2 });
    logger.info(`[DoctorJourneyCron] completed scanned=${result.scanned} completed=${result.completed} failed=${result.failed}`);
    return result;
  } finally {
    running = false;
  }
}

function initScheduler() {
  if (initialized) return;
  initialized = true;
  cron.schedule(CRON_EXPRESSION, () => {
    runOnce().catch(error => logger.error(`[DoctorJourneyCron] failed: ${error.message}`));
  }, { timezone: TIMEZONE });
  logger.info(`[DoctorJourneyCron] scheduled ${CRON_EXPRESSION} (${TIMEZONE})`);
}

module.exports = { CRON_EXPRESSION, TIMEZONE, initScheduler, runOnce };
