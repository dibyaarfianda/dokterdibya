/**
 * Health Articles API
 * CRUD operations for health articles from dokterDIBYA
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireRoles } = require('../middleware/auth');
const { ROLE_NAMES } = require('../constants/roles');
const logger = require('../utils/logger');

function normalizeArticleCategoryName(category) {
    const raw = String(category || '').trim();
    if (!raw) return 'Kehamilan';

    const lowered = raw.toLowerCase();
    if (lowered === 'gangguan_kandungan' || lowered === 'gangguan kandungan' || lowered === 'ginekologi') {
        return 'Ginekologi';
    }

    if (lowered === 'program_hamil') {
        return 'Program Hamil';
    }
    if (lowered === 'kehamilan') {
        return 'Kehamilan';
    }

    return raw;
}

function getCategoryFilterValues(category) {
    const lowered = String(category || '').trim().toLowerCase();
    if (!lowered || lowered === 'all') return [];

    if (lowered === 'ginekologi' || lowered === 'gangguan_kandungan' || lowered === 'gangguan kandungan') {
        return ['Ginekologi', 'Gangguan Kandungan', 'gangguan_kandungan'];
    }
    if (lowered === 'program_hamil' || lowered === 'program hamil') {
        return ['Program Hamil', 'program_hamil'];
    }
    if (lowered === 'kehamilan') {
        return ['Kehamilan', 'kehamilan'];
    }

    return [category];
}

/**
 * GET /api/articles - Get all published articles (public)
 */
router.get('/', async (req, res) => {
    try {
        const { category, limit = 20, offset = 0 } = req.query;

        let query = `
            SELECT id, title, summary, category, icon, color, source,
                   view_count, like_count, created_at, updated_at
            FROM health_articles
            WHERE is_published = 1
        `;
        const params = [];

        const categoryFilterValues = getCategoryFilterValues(category);
        if (categoryFilterValues.length) {
            query += ` AND category IN (?)`;
            params.push(categoryFilterValues);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [articlesRaw] = await db.query(query, params);
        const articles = articlesRaw.map((article) => ({
            ...article,
            category: normalizeArticleCategoryName(article.category)
        }));

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM health_articles WHERE is_published = 1`;
        if (categoryFilterValues.length) {
            countQuery += ` AND category IN (?)`;
        }
        const [countResult] = await db.query(countQuery, categoryFilterValues.length ? [categoryFilterValues] : []);

        res.json({
            success: true,
            data: articles,
            total: countResult[0].total
        });
    } catch (error) {
        logger.error('Error fetching articles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch articles' });
    }
});

/**
 * GET /api/articles/categories - Get available categories
 */
router.get('/categories', async (req, res) => {
    try {
        const [categoriesRaw] = await db.query(`
            SELECT category, COUNT(*) as count
            FROM health_articles
            WHERE is_published = 1
            GROUP BY category
            ORDER BY count DESC
        `);

        const categoryMap = new Map();
        categoriesRaw.forEach((item) => {
            const normalized = normalizeArticleCategoryName(item.category);
            const prev = Number(categoryMap.get(normalized) || 0);
            categoryMap.set(normalized, prev + Number(item.count || 0));
        });

        const categories = Array.from(categoryMap.entries()).map(([categoryName, count]) => ({
            category: categoryName,
            count
        }));

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        logger.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
});

/**
 * GET /api/articles/:id - Get single article
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [articles] = await db.query(`
            SELECT * FROM health_articles WHERE id = ?
        `, [id]);

        if (articles.length === 0) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        // Increment view count
        await db.query(`UPDATE health_articles SET view_count = view_count + 1 WHERE id = ?`, [id]);

        res.json({
            success: true,
            article: articles[0],
            data: {
                ...articles[0],
                category: normalizeArticleCategoryName(articles[0].category)
            }  // Keep for backwards compatibility
        });
    } catch (error) {
        logger.error('Error fetching article:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch article' });
    }
});

// ============ ADMIN ROUTES (require authentication) ============

/**
 * GET /api/articles/admin/all - Get all articles including unpublished (admin only)
 */
router.get('/admin/all', verifyToken, requireRoles(ROLE_NAMES.DOKTER), async (req, res) => {
    try {
        const { category, status, limit = 50, offset = 0 } = req.query;

        let query = `SELECT * FROM health_articles WHERE 1=1`;
        const params = [];

        const categoryFilterValues = getCategoryFilterValues(category);
        if (categoryFilterValues.length) {
            query += ` AND category IN (?)`;
            params.push(categoryFilterValues);
        }

        if (status === 'published') {
            query += ` AND is_published = 1`;
        } else if (status === 'draft') {
            query += ` AND is_published = 0`;
        }

        query += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [articlesRaw] = await db.query(query, params);
        const articles = articlesRaw.map((article) => ({
            ...article,
            category: normalizeArticleCategoryName(article.category)
        }));

        res.json({
            success: true,
            data: articles
        });
    } catch (error) {
        logger.error('Error fetching admin articles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch articles' });
    }
});

/**
 * POST /api/articles - Create new article
 */
router.post('/', verifyToken, requireRoles(ROLE_NAMES.DOKTER), async (req, res) => {
    try {
        const { title, summary, content, category, icon, color, source, is_published } = req.body;
        const normalizedIcon = typeof icon === 'string' ? icon.trim() : null;
        const iconToSave = normalizedIcon === null ? 'fa-heartbeat' : normalizedIcon;
        const normalizedCategory = normalizeArticleCategoryName(category || 'Kehamilan');

        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        const [result] = await db.query(`
            INSERT INTO health_articles (title, summary, content, category, icon, color, source, is_published, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title,
            summary || null,
            content || null,
            normalizedCategory,
            iconToSave,
            color || '#28a7e9',
            source || null,
            is_published ? 1 : 0,
            null  // Set to null instead of req.user.id to avoid type mismatch
        ]);

        logger.info(`Article created: id=${result.insertId}, title="${title}", by user ${req.user.id}`);

        res.json({
            success: true,
            message: 'Article created successfully',
            id: result.insertId
        });
    } catch (error) {
        logger.error('Error creating article:', error);
        res.status(500).json({ success: false, message: 'Failed to create article' });
    }
});

/**
 * PUT /api/articles/:id - Update article
 */
router.put('/:id', verifyToken, requireRoles(ROLE_NAMES.DOKTER), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, summary, content, category, icon, color, source, is_published } = req.body;
        const normalizedIcon = typeof icon === 'string' ? icon.trim() : null;
        const iconToSave = normalizedIcon === null ? 'fa-heartbeat' : normalizedIcon;
        const normalizedCategory = normalizeArticleCategoryName(category || 'Kehamilan');

        // Check if article exists
        const [existing] = await db.query(`SELECT id FROM health_articles WHERE id = ?`, [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        await db.query(`
            UPDATE health_articles
            SET title = ?, summary = ?, content = ?, category = ?,
                icon = ?, color = ?, source = ?, is_published = ?
            WHERE id = ?
        `, [
            title,
            summary || null,
            content || null,
            normalizedCategory,
            iconToSave,
            color || '#28a7e9',
            source || null,
            is_published ? 1 : 0,
            id
        ]);

        logger.info(`Article updated: id=${id}, by user ${req.user.id}`);

        res.json({
            success: true,
            message: 'Article updated successfully'
        });
    } catch (error) {
        logger.error('Error updating article:', error);
        res.status(500).json({ success: false, message: 'Failed to update article' });
    }
});

/**
 * DELETE /api/articles/:id - Delete article
 */
router.delete('/:id', verifyToken, requireRoles(ROLE_NAMES.DOKTER), async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(`DELETE FROM health_articles WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        logger.info(`Article deleted: id=${id}, by user ${req.user.id}`);

        res.json({
            success: true,
            message: 'Article deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting article:', error);
        res.status(500).json({ success: false, message: 'Failed to delete article' });
    }
});

/**
 * PATCH /api/articles/:id/publish - Toggle publish status
 */
router.patch('/:id/publish', verifyToken, requireRoles(ROLE_NAMES.DOKTER), async (req, res) => {
    try {
        const { id } = req.params;
        const { is_published } = req.body;

        await db.query(`UPDATE health_articles SET is_published = ? WHERE id = ?`, [
            is_published ? 1 : 0,
            id
        ]);

        logger.info(`Article ${is_published ? 'published' : 'unpublished'}: id=${id}`);

        res.json({
            success: true,
            message: `Article ${is_published ? 'published' : 'unpublished'} successfully`
        });
    } catch (error) {
        logger.error('Error toggling publish status:', error);
        res.status(500).json({ success: false, message: 'Failed to update article' });
    }
});

// ============ LIKE FUNCTIONALITY ============

/**
 * POST /api/articles/:id/like - Like an article (requires authentication)
 */
router.post('/:id/like', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const patientId = req.user.id; // Firebase UID

        // Check if article exists
        const [articles] = await db.query(`SELECT id FROM health_articles WHERE id = ?`, [id]);
        if (articles.length === 0) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        // Check if already liked
        const [existing] = await db.query(`
            SELECT id FROM article_likes WHERE article_id = ? AND patient_id = ?
        `, [id, patientId]);

        if (existing.length > 0) {
            // Already liked - toggle unlike
            await db.query(`DELETE FROM article_likes WHERE article_id = ? AND patient_id = ?`, [id, patientId]);
            await db.query(`UPDATE health_articles SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?`, [id]);

            logger.info(`Article unliked: article_id=${id}, patient_id=${patientId}`);

            return res.json({
                success: true,
                message: 'Article unliked',
                liked: false
            });
        } else {
            // Add new like
            await db.query(`INSERT INTO article_likes (article_id, patient_id) VALUES (?, ?)`, [id, patientId]);
            await db.query(`UPDATE health_articles SET like_count = like_count + 1 WHERE id = ?`, [id]);

            logger.info(`Article liked: article_id=${id}, patient_id=${patientId}`);

            return res.json({
                success: true,
                message: 'Article liked',
                liked: true
            });
        }
    } catch (error) {
        logger.error('Error liking article:', error);
        res.status(500).json({ success: false, message: 'Failed to like article' });
    }
});

/**
 * GET /api/articles/:id/liked - Check if user has liked an article
 */
router.get('/:id/liked', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const patientId = req.user.id;

        const [likes] = await db.query(`
            SELECT id FROM article_likes WHERE article_id = ? AND patient_id = ?
        `, [id, patientId]);

        res.json({
            success: true,
            liked: likes.length > 0
        });
    } catch (error) {
        logger.error('Error checking like status:', error);
        res.status(500).json({ success: false, message: 'Failed to check like status' });
    }
});

module.exports = router;
