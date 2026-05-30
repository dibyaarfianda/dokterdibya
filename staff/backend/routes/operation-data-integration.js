const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const operationData = require('../services/OperationDataService');
const logger = require('../utils/logger');

router.use(apiKeyAuth);

router.post('/index', async (req, res) => {
  try {
    const result = await operationData.upsertIndex(req.body?.items || []);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Operation data index error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/archive', async (req, res) => {
  try {
    const result = await operationData.archiveRecords(req.body?.records || req.body?.items || []);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Operation data archive error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/backfill/start', async (req, res) => {
  try {
    const result = await operationData.createBackfillRun({
      startDate: req.body?.start_date || req.body?.startDate || '2020-01-01',
      endDate: req.body?.end_date || req.body?.endDate,
      facilities: req.body?.facilities,
      createdBy: req.serviceClient || 'operation-data-fetcher',
    });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    logger.error('Operation data backfill start error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/backfill/claim', async (req, res) => {
  try {
    const jobs = await operationData.claimBackfillJobs(req.body?.limit || 1);
    res.json({ success: true, jobs });
  } catch (error) {
    logger.error('Operation data backfill claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/backfill/jobs/:id/complete', async (req, res) => {
  try {
    await operationData.completeBackfillJob(req.params.id, req.body?.summary || {});
    res.json({ success: true });
  } catch (error) {
    logger.error('Operation data backfill complete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/backfill/jobs/:id/fail', async (req, res) => {
  try {
    await operationData.failBackfillJob(req.params.id, req.body?.message || 'Unknown error', req.body?.summary || {});
    res.json({ success: true });
  } catch (error) {
    logger.error('Operation data backfill fail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/backfill/status', async (req, res) => {
  try {
    const runs = await operationData.backfillStatus(req.query.limit);
    res.json({ success: true, runs });
  } catch (error) {
    logger.error('Operation data backfill status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
