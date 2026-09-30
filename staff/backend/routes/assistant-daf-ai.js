'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

module.exports = function createAiRouter(client) {
  const router = express.Router();
  router.use(rateLimit({ windowMs: 60 * 1000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.post('/discuss', async (req, res) => {
    if (!client.isReady()) return res.status(503).json({ success: false, message: 'AI RunPod belum aktif' });
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
      return res.status(400).json({ success: false, message: 'Pertanyaan harus berisi 1–2000 karakter' });
    }
    try {
      const answer = await client.discuss(text);
      return res.json({ success: true, answer });
    } catch (error) {
      return res.status(error.statusCode || 502).json({
        success: false,
        message: error.statusCode ? error.message : 'Layanan AI tidak tersedia'
      });
    }
  });
  return router;
};
