const express = require('express');
const MorbidCaseService = require('../services/MorbidCaseService');
const logger = require('../utils/logger');

const router = express.Router();
const service = new MorbidCaseService();

function statusFor(error, fallback = 500) {
  return Number(error.status) || fallback;
}

router.get('/', async (req, res) => {
  try {
    const result = await service.list(req.query || {});
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    logger.error('Morbid Case list error', { message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.get('/candidates', async (req, res) => {
  try {
    const rows = await service.listCandidates(req.query || {});
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Morbid Case candidate error', { message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const operationDataId = parseInt(req.body?.operation_data_id, 10);
    if (!Number.isInteger(operationDataId) || operationDataId < 1) {
      return res.status(400).json({ success: false, message: 'operation_data_id tidak valid' });
    }
    const result = await service.create(operationDataId, req.user?.id);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.already_exists ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    logger.error('Morbid Case create error', { message: error.message });
    res.status(statusFor(error, 502)).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await service.getDetail(req.params.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Morbid Case detail error', { message: error.message });
    res.status(statusFor(error)).json({ success: false, message: error.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const result = await service.refresh(req.params.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Morbid Case refresh error', { message: error.message });
    res.status(statusFor(error, 502)).json({ success: false, message: error.message });
  }
});

router.post('/:id/analyze', async (req, res) => {
  try {
    const result = await service.startAnalysis(req.params.id, req.user?.id);
    res.setHeader('Cache-Control', 'no-store');
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    logger.error('Morbid Case AI analysis error', { message: error.message, caseId: req.params.id });
    res.status(statusFor(error, 502)).json({ success: false, message: error.message });
  }
});

router.get('/:id/files/:fileId', async (req, res) => {
  try {
    const result = await service.fetchFile(req.params.id, req.params.fileId);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.buffer);
  } catch (error) {
    logger.error('Morbid Case file error', { message: error.message });
    res.status(statusFor(error, 502)).json({ success: false, message: error.message });
  }
});

module.exports = router;
