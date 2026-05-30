const express = require('express');
const router = express.Router();
const operationData = require('../services/OperationDataService');
const logger = require('../utils/logger');

router.get('/', async (req, res) => {
  try {
    const result = await operationData.list(req.query || {});
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    logger.error('DocBoard operation data list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await operationData.detail(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Data operasi tidak ditemukan' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('DocBoard operation data detail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
