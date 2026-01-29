/**
 * Doctors API Routes
 * Handles listing available doctors for Q&A
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');

/**
 * GET /api/doctors/available
 * Get list of doctors available for Q&A
 * Accessible by patients and staff
 */
router.get('/available', async (req, res) => {
    try {
        const [doctors] = await db.query(`
            SELECT
                new_id as id,
                name,
                specialty,
                specialty_label as label,
                is_available_for_qa as is_available
            FROM users
            WHERE role = 'dokter'
            AND is_available_for_qa = 1
            ORDER BY name ASC
        `);

        res.json({
            success: true,
            doctors: doctors
        });
    } catch (error) {
        console.error('Error fetching available doctors:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat daftar dokter'
        });
    }
});

/**
 * GET /api/doctors/:id
 * Get doctor detail by ID
 * Accessible by patients and staff
 */
router.get('/:id', async (req, res) => {
    try {
        const [doctors] = await db.query(`
            SELECT
                new_id as id,
                name,
                specialty,
                specialty_label as label,
                is_available_for_qa as is_available
            FROM users
            WHERE new_id = ? AND role = 'dokter'
        `, [req.params.id]);

        if (doctors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dokter tidak ditemukan'
            });
        }

        res.json({
            success: true,
            doctor: doctors[0]
        });
    } catch (error) {
        console.error('Error fetching doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data dokter'
        });
    }
});

module.exports = router;
