/**
 * Suppliers Routes
 * CRUD operations for medicine/obat suppliers
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, requireMenuAccess } = require('../middleware/auth');

/**
 * Generate unique supplier code
 */
async function generateSupplierCode() {
    const [result] = await db.query(
        `SELECT code FROM suppliers ORDER BY id DESC LIMIT 1`
    );

    if (result.length === 0) {
        return 'SUP001';
    }

    const lastCode = result[0].code;
    const num = parseInt(lastCode.replace('SUP', '')) + 1;
    return `SUP${String(num).padStart(3, '0')}`;
}

/**
 * GET /api/suppliers
 * List all suppliers
 */
router.get('/', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { active } = req.query;

        let query = `SELECT * FROM suppliers`;
        const params = [];

        if (active === 'true') {
            query += ` WHERE is_active = 1`;
        }

        query += ` ORDER BY name ASC`;

        const [suppliers] = await db.query(query, params);

        res.json({
            success: true,
            data: suppliers
        });
    } catch (error) {
        logger.error('Get suppliers error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data supplier'
        });
    }
});

/**
 * GET /api/suppliers/:id
 * Get single supplier
 */
router.get('/:id', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const [suppliers] = await db.query(
            `SELECT * FROM suppliers WHERE id = ?`,
            [req.params.id]
        );

        if (suppliers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Supplier tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: suppliers[0]
        });
    } catch (error) {
        logger.error('Get supplier error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data supplier'
        });
    }
});

/**
 * POST /api/suppliers
 * Create new supplier
 */
router.post('/', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { name, phone, address, notes } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Nama supplier harus diisi'
            });
        }

        const code = await generateSupplierCode();

        const [result] = await db.query(
            `INSERT INTO suppliers (code, name, phone, address, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [code, name.trim(), phone || null, address || null, notes || null]
        );

        const [newSupplier] = await db.query(
            `SELECT * FROM suppliers WHERE id = ?`,
            [result.insertId]
        );

        logger.info(`Supplier created: ${code} - ${name}`);

        res.status(201).json({
            success: true,
            message: 'Supplier berhasil ditambahkan',
            data: newSupplier[0]
        });
    } catch (error) {
        logger.error('Create supplier error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menambah supplier'
        });
    }
});

/**
 * PUT /api/suppliers/:id
 * Update supplier
 */
router.put('/:id', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { name, phone, address, notes, is_active } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Nama supplier harus diisi'
            });
        }

        const [existing] = await db.query(
            `SELECT id FROM suppliers WHERE id = ?`,
            [req.params.id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Supplier tidak ditemukan'
            });
        }

        await db.query(
            `UPDATE suppliers
             SET name = ?, phone = ?, address = ?, notes = ?, is_active = ?
             WHERE id = ?`,
            [name.trim(), phone || null, address || null, notes || null,
             is_active !== undefined ? is_active : 1, req.params.id]
        );

        const [updated] = await db.query(
            `SELECT * FROM suppliers WHERE id = ?`,
            [req.params.id]
        );

        logger.info(`Supplier updated: ${req.params.id}`);

        res.json({
            success: true,
            message: 'Supplier berhasil diupdate',
            data: updated[0]
        });
    } catch (error) {
        logger.error('Update supplier error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate supplier'
        });
    }
});

/**
 * DELETE /api/suppliers/:id
 * Soft delete supplier
 */
router.delete('/:id', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const [existing] = await db.query(
            `SELECT id, name FROM suppliers WHERE id = ?`,
            [req.params.id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Supplier tidak ditemukan'
            });
        }

        // Soft delete
        await db.query(
            `UPDATE suppliers SET is_active = 0 WHERE id = ?`,
            [req.params.id]
        );

        logger.info(`Supplier deleted (soft): ${req.params.id} - ${existing[0].name}`);

        res.json({
            success: true,
            message: 'Supplier berhasil dihapus'
        });
    } catch (error) {
        logger.error('Delete supplier error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus supplier'
        });
    }
});

module.exports = router;
