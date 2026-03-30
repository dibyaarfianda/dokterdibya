/**
 * Greeting Cards Routes
 * Reusable special occasion greeting cards for patient portal
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

/**
 * GET /api/greeting-cards/active
 * Get currently active greeting card (public, for patient portal)
 */
router.get('/active', async (req, res) => {
    try {
        const [cards] = await db.query(
            `SELECT id, title, subtitle, subtitle2, message, sender, theme, icon_type, dismiss_hours
             FROM greeting_cards
             WHERE is_active = 1
             AND CURDATE() BETWEEN start_date AND end_date
             ORDER BY created_at DESC LIMIT 1`
        );

        if (cards.length === 0) {
            return res.json({ success: true, card: null });
        }

        res.json({ success: true, card: cards[0] });
    } catch (error) {
        console.error('Error fetching active greeting card:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/greeting-cards
 * List all greeting cards (staff only)
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const [cards] = await db.query(
            `SELECT * FROM greeting_cards ORDER BY created_at DESC`
        );
        res.json({ success: true, cards });
    } catch (error) {
        console.error('Error listing greeting cards:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/greeting-cards
 * Create new greeting card (staff only)
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const { title, subtitle, subtitle2, message, sender, theme, icon_type, start_date, end_date, dismiss_hours } = req.body;

        if (!title || !message || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Title, message, start_date, and end_date are required' });
        }

        const [result] = await db.query(
            `INSERT INTO greeting_cards (title, subtitle, subtitle2, message, sender, theme, icon_type, start_date, end_date, dismiss_hours)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, subtitle || null, subtitle2 || null, message, sender || 'dr. Dibya & Tim',
             theme || 'gold', icon_type || 'star', start_date, end_date, dismiss_hours || 24]
        );

        res.json({ success: true, id: result.insertId, message: 'Greeting card created' });
    } catch (error) {
        console.error('Error creating greeting card:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * PUT /api/greeting-cards/:id
 * Update greeting card (staff only)
 */
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { title, subtitle, subtitle2, message, sender, theme, icon_type, start_date, end_date, is_active, dismiss_hours } = req.body;

        await db.query(
            `UPDATE greeting_cards SET
                title = COALESCE(?, title),
                subtitle = ?,
                subtitle2 = ?,
                message = COALESCE(?, message),
                sender = COALESCE(?, sender),
                theme = COALESCE(?, theme),
                icon_type = COALESCE(?, icon_type),
                start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                is_active = COALESCE(?, is_active),
                dismiss_hours = COALESCE(?, dismiss_hours)
             WHERE id = ?`,
            [title, subtitle, subtitle2, message, sender, theme, icon_type, start_date, end_date, is_active, dismiss_hours, req.params.id]
        );

        res.json({ success: true, message: 'Greeting card updated' });
    } catch (error) {
        console.error('Error updating greeting card:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * DELETE /api/greeting-cards/:id
 * Delete greeting card (staff only)
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await db.query('DELETE FROM greeting_cards WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Greeting card deleted' });
    } catch (error) {
        console.error('Error deleting greeting card:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
