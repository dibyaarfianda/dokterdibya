/**
 * Obat Routes v1
 * API version 1 for medication operations
 */

const express = require('express');
const router = express.Router();
const ObatService = require('../../services/ObatService');
const { verifyToken, requireSuperadmin } = require('../../middleware/auth');
const { validateObat } = require('../../middleware/validation');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendSuccess, sendCreated } = require('../../utils/response');

// ==================== PUBLIC ENDPOINTS (READ) ====================

// GET ALL OBAT (Public - no auth required)
router.get('/obat', asyncHandler(async (req, res) => {
    const { category, active } = req.query;
    const obat = await ObatService.getAllObat(
        category, 
        active !== undefined ? active === 'true' : null
    );
    sendSuccess(res, obat, obat.length);
}));

// GET OBAT BY ID (Public)
router.get('/obat/:id', asyncHandler(async (req, res) => {
    const obat = await ObatService.getObatById(req.params.id);
    sendSuccess(res, obat);
}));

// GET LOW STOCK ITEMS (Public)
router.get('/obat/low-stock/list', asyncHandler(async (req, res) => {
    const lowStock = await ObatService.getLowStockItems();
    sendSuccess(res, lowStock, lowStock.length);
}));

// ==================== PROTECTED ENDPOINTS (WRITE) ====================

// ADD NEW OBAT
router.post('/obat', verifyToken, validateObat, asyncHandler(async (req, res) => {
    const result = await ObatService.createObat(req.body);
    sendCreated(res, result, 'Obat added successfully');
}));

// UPDATE OBAT
router.put('/obat/:id', verifyToken, validateObat, asyncHandler(async (req, res) => {
    await ObatService.updateObat(req.params.id, req.body);
    sendSuccess(res, null, 'Obat updated successfully');
}));

// UPDATE STOCK
router.patch('/obat/:id/stock', verifyToken, asyncHandler(async (req, res) => {
    const { quantity } = req.body;
    const result = await ObatService.updateStock(req.params.id, parseInt(quantity));
    sendSuccess(res, result, 'Stock updated successfully');
}));

// DELETE OBAT (superadmin/dokter only)
router.delete('/obat/:id', verifyToken, requireSuperadmin, asyncHandler(async (req, res) => {
    await ObatService.deleteObat(req.params.id);
    sendSuccess(res, null, 'Obat deleted successfully');
}));

module.exports = router;
