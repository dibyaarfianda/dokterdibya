/**
 * Import Field Configuration Routes
 * Manage field mappings and keywords for medical record import
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/import-config/fields
 * Get all field configurations
 */
router.get('/fields', verifyToken, async (req, res) => {
    try {
        const [fields] = await db.query(`
            SELECT * FROM import_field_config
            WHERE is_active = 1
            ORDER BY section, sort_order
        `);

        // Group by section
        const grouped = {
            identity: [],
            subjective: [],
            objective: [],
            assessment: [],
            plan: []
        };

        fields.forEach(field => {
            if (grouped[field.section]) {
                grouped[field.section].push({
                    ...field,
                    keywords: field.keywords.split(',').map(k => k.trim())
                });
            }
        });

        res.json({
            success: true,
            fields: grouped,
            total: fields.length
        });

    } catch (error) {
        logger.error('Get import field config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil konfigurasi field'
        });
    }
});

/**
 * GET /api/import-config/fields/all
 * Get all fields including inactive (for admin)
 */
router.get('/fields/all', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const [fields] = await db.query(`
            SELECT * FROM import_field_config
            ORDER BY section, sort_order
        `);

        res.json({
            success: true,
            fields: fields.map(f => ({
                ...f,
                keywords: f.keywords.split(',').map(k => k.trim())
            }))
        });

    } catch (error) {
        logger.error('Get all import field config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil konfigurasi field'
        });
    }
});

/**
 * POST /api/import-config/fields
 * Add new field configuration
 */
router.post('/fields', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { field_name, section, display_name, keywords, data_type, validation_rule } = req.body;

        if (!field_name || !section || !display_name || !keywords) {
            return res.status(400).json({
                success: false,
                message: 'Field name, section, display name, dan keywords wajib diisi'
            });
        }

        const keywordsStr = Array.isArray(keywords) ? keywords.join(',') : keywords;

        // Get max sort order for section
        const [maxOrder] = await db.query(
            'SELECT MAX(sort_order) as max_order FROM import_field_config WHERE section = ?',
            [section]
        );
        const sortOrder = (maxOrder[0]?.max_order || 0) + 1;

        await db.query(`
            INSERT INTO import_field_config
            (field_name, section, display_name, keywords, data_type, validation_rule, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [field_name, section, display_name, keywordsStr, data_type || 'text', validation_rule, sortOrder]);

        logger.info('Import field config added:', { field_name, section });

        res.json({
            success: true,
            message: 'Field berhasil ditambahkan'
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Field dengan nama ini sudah ada di section tersebut'
            });
        }
        logger.error('Add import field config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menambah field'
        });
    }
});

/**
 * PUT /api/import-config/fields/:id
 * Update field configuration
 */
router.put('/fields/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { display_name, keywords, data_type, validation_rule, is_active, sort_order } = req.body;

        const updates = [];
        const values = [];

        if (display_name !== undefined) {
            updates.push('display_name = ?');
            values.push(display_name);
        }
        if (keywords !== undefined) {
            updates.push('keywords = ?');
            values.push(Array.isArray(keywords) ? keywords.join(',') : keywords);
        }
        if (data_type !== undefined) {
            updates.push('data_type = ?');
            values.push(data_type);
        }
        if (validation_rule !== undefined) {
            updates.push('validation_rule = ?');
            values.push(validation_rule);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            values.push(sort_order);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada data untuk diupdate'
            });
        }

        values.push(id);
        await db.query(
            `UPDATE import_field_config SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        logger.info('Import field config updated:', { id });

        res.json({
            success: true,
            message: 'Field berhasil diupdate'
        });

    } catch (error) {
        logger.error('Update import field config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate field'
        });
    }
});

/**
 * DELETE /api/import-config/fields/:id
 * Delete field configuration
 */
router.delete('/fields/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM import_field_config WHERE id = ?', [id]);

        logger.info('Import field config deleted:', { id });

        res.json({
            success: true,
            message: 'Field berhasil dihapus'
        });

    } catch (error) {
        logger.error('Delete import field config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus field'
        });
    }
});

/**
 * POST /api/import-config/fields/:id/keywords
 * Add keyword to a field
 */
router.post('/fields/:id/keywords', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { keyword } = req.body;

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: 'Keyword wajib diisi'
            });
        }

        // Get current keywords
        const [fields] = await db.query('SELECT keywords FROM import_field_config WHERE id = ?', [id]);
        if (fields.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Field tidak ditemukan'
            });
        }

        const currentKeywords = fields[0].keywords.split(',').map(k => k.trim());
        if (!currentKeywords.includes(keyword.trim())) {
            currentKeywords.push(keyword.trim());
            await db.query(
                'UPDATE import_field_config SET keywords = ? WHERE id = ?',
                [currentKeywords.join(','), id]
            );
        }

        res.json({
            success: true,
            message: 'Keyword berhasil ditambahkan',
            keywords: currentKeywords
        });

    } catch (error) {
        logger.error('Add keyword error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menambah keyword'
        });
    }
});

/**
 * DELETE /api/import-config/fields/:id/keywords/:keyword
 * Remove keyword from a field
 */
router.delete('/fields/:id/keywords/:keyword', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id, keyword } = req.params;

        // Get current keywords
        const [fields] = await db.query('SELECT keywords FROM import_field_config WHERE id = ?', [id]);
        if (fields.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Field tidak ditemukan'
            });
        }

        const currentKeywords = fields[0].keywords.split(',').map(k => k.trim());
        const filtered = currentKeywords.filter(k => k !== decodeURIComponent(keyword));

        if (filtered.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimal harus ada 1 keyword'
            });
        }

        await db.query(
            'UPDATE import_field_config SET keywords = ? WHERE id = ?',
            [filtered.join(','), id]
        );

        res.json({
            success: true,
            message: 'Keyword berhasil dihapus',
            keywords: filtered
        });

    } catch (error) {
        logger.error('Remove keyword error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus keyword'
        });
    }
});

module.exports = router;
