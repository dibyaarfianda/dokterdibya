const express = require('express');
const GambiranResumeService = require('../services/GambiranResumeService');
const logger = require('../utils/logger');

const router = express.Router();
const service = new GambiranResumeService();

function statusFor(error, fallback = 500) {
  return Number(error.status) || fallback;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

router.use((req, res, next) => {
  noStore(res);
  next();
});

router.get('/', async (req, res) => {
  try {
    const result = await service.list(req.query || {});
    noStore(res);
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    logger.error('Gambiran resume list error', { message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await service.create(req.body?.medical_record_number, req.user?.id);
    service.start(created.record.id, created.medicalRecord);
    noStore(res);
    res.status(202).json({ success: true, id: created.record.id, status: created.record.status, resume: created.record });
  } catch (error) {
    logger.error('Gambiran resume create error', { message: error.message });
    const body = { success: false, message: error.message };
    if (error.archive_id) body.archive_id = error.archive_id;
    res.status(statusFor(error, 502)).json(body);
  }
});

router.get('/:id/files', async (req, res) => {
  try {
    const result = await service.listFiles(req.params.id, req.query || {});
    noStore(res);
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    logger.error('Gambiran resume files error', { archiveId: req.params.id, message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.get('/:id/files/:fileId/download-url', async (req, res) => {
  try {
    const result = await service.getFileDownload(req.params.id, req.params.fileId, req.query.variant, req.query.page);
    noStore(res);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Gambiran resume file URL error', { archiveId: req.params.id, fileId: req.params.fileId, message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.get('/:id/artifacts/:kind/download-url', async (req, res) => {
  try {
    const result = await service.getArtifactDownload(req.params.id, req.params.kind);
    noStore(res);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Gambiran resume artifact URL error', { archiveId: req.params.id, kind: req.params.kind, message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await service.getDetail(req.params.id);
    noStore(res);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Gambiran resume detail error', { archiveId: req.params.id, message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

module.exports = router;
