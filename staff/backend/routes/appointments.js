// routes/appointments.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, requireSuperadmin, requirePermission } = require('../middleware/auth');
const { createSession, countMatchingFactors, pLimit } = require('../services/medifyHttpService');

const MELINDA_LIVE_QUEUE_CACHE_TTL_MS = 30000;
const melindaLiveQueueCache = {
    payload: null,
    expiresAt: 0
};

function normalizePatientName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .replace(/^(ny\.?|tn\.?|sdr\.?|sdri\.?|dr\.?|drg\.?)\s*/i, '')
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeNik(nik) {
    return String(nik || '').replace(/\D/g, '').trim();
}

function formatUtcYmd(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getGmt7DayWindow(baseDate = new Date()) {
    const gmt7OffsetMs = 7 * 60 * 60 * 1000;
    const gmt7Now = new Date(baseDate.getTime() + gmt7OffsetMs);

    const year = gmt7Now.getUTCFullYear();
    const monthIndex = gmt7Now.getUTCMonth();
    const day = gmt7Now.getUTCDate();

    const dayStartUtc = new Date(Date.UTC(year, monthIndex, day));
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const dateStr = formatUtcYmd(dayStartUtc);
    const nextDateStr = formatUtcYmd(dayEndUtc);

    return {
        startDateTime: `${dateStr} 00:00:00`,
        endDateTime: `${nextDateStr} 00:00:00`
    };
}

function resolveLocalPatient(queueItem, patients) {
    const queueName = normalizePatientName(queueItem.patientName);
    if (!queueName) {
        return null;
    }

    const candidatePatients = patients.filter((patient) => {
        const patientName = normalizePatientName(patient.full_name);
        if (!patientName) {
            return false;
        }

        return patientName === queueName
            || patientName.includes(queueName)
            || queueName.includes(patientName);
    });

    if (!candidatePatients.length) {
        return null;
    }

    const scoredPatients = candidatePatients.map((patient) => ({
        patient,
        score: countMatchingFactors({
            name: queueItem.patientName,
            usia: queueItem.age
        }, patient).matchCount
    }));

    const bestScore = Math.max(...scoredPatients.map((item) => item.score));
    if (bestScore < 2) {
        return null;
    }

    const bestMatches = scoredPatients.filter((item) => item.score === bestScore);
    if (bestMatches.length !== 1) {
        return null;
    }

    return bestMatches[0].patient;
}

function buildPatientByNikMap(patients) {
    const patientByNik = new Map();

    for (const patient of patients) {
        const normalizedNik = normalizeNik(patient.nik);
        if (!normalizedNik) {
            continue;
        }

        if (!patientByNik.has(normalizedNik)) {
            patientByNik.set(normalizedNik, patient);
            continue;
        }

        patientByNik.set(normalizedNik, null);
    }

    return patientByNik;
}

async function enrichMelindaQueueItems(items, location, session) {
    if (!Array.isArray(items) || !items.length) {
        return [];
    }

    const [patients] = await pool.query(`
        SELECT id, full_name, birth_date, age, whatsapp, phone, nik
        FROM patients
        WHERE full_name IS NOT NULL
    `);

    const patientByNik = buildPatientByNikMap(patients);
    const limit = pLimit(4);
    const itemsWithIdentity = await Promise.all(items.map((item) => limit(async () => {
        if (!item.medId) {
            return {
                ...item,
                identityNik: null,
                matchedBy: null
            };
        }

        try {
            const identity = await session.extractPatientIdentity(item.medId);
            return {
                ...item,
                identityNik: normalizeNik(identity.no_identitas),
                matchedBy: null
            };
        } catch (error) {
            return {
                ...item,
                identityNik: null,
                matchedBy: null
            };
        }
    })));

    const matchedPatientIds = new Set();
    const matchedItems = itemsWithIdentity.map((item) => {
        let patient = null;
        let matchedBy = null;

        if (item.identityNik) {
            patient = patientByNik.get(item.identityNik) || null;
            matchedBy = patient ? 'nik' : null;
        } else {
            patient = resolveLocalPatient(item, patients);
            matchedBy = patient ? 'name_age' : null;
        }

        if (patient?.id) {
            matchedPatientIds.add(patient.id);
        }

        return {
            ...item,
            patientId: patient?.id || null,
            matchedBy,
            existingMrId: null,
            existingRecordStatus: null,
            canStartExam: Boolean(patient?.id)
        };
    });

    if (!matchedPatientIds.size) {
        return matchedItems;
    }

    const { startDateTime, endDateTime } = getGmt7DayWindow();
    const placeholders = Array.from(matchedPatientIds).map(() => '?').join(', ');
    const [recordRows] = await pool.query(
        `SELECT patient_id, mr_id, status
         FROM sunday_clinic_records
         WHERE patient_id IN (${placeholders})
           AND visit_location = ?
           AND created_at >= ?
           AND created_at < ?
         ORDER BY created_at DESC, id DESC`,
        [...matchedPatientIds, location, startDateTime, endDateTime]
    );

    const recordByPatientId = new Map();
    for (const row of recordRows) {
        if (!recordByPatientId.has(row.patient_id)) {
            recordByPatientId.set(row.patient_id, row);
        }
    }

    return matchedItems.map((item) => {
        if (!item.patientId) {
            return item;
        }

        const existingRecord = recordByPatientId.get(item.patientId);
        return {
            ...item,
            existingMrId: existingRecord?.mr_id || null,
            existingRecordStatus: existingRecord?.status || null
        };
    });
}

// ==================== PUBLIC ROUTES ====================

// GET all appointments (with optional filters)
router.get('/', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { patient_id, start_date, end_date, status, today_only } = req.query;
        
        let query = 'SELECT * FROM appointments WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND appointment_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND appointment_date <= ?';
            params.push(end_date);
        }
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (today_only === 'true') {
            query += ' AND appointment_date = CURDATE()';
        }
        
        query += ' ORDER BY appointment_date ASC, appointment_time ASC';
        
        const [rows] = await pool.query(query, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message
        });
    }
});

// GET appointments by hospital location
router.get('/hospital/:location', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;

        // Get appointments for this hospital with patient age, upcoming first
        const [rows] = await pool.query(`
            SELECT
                a.id, a.patient_id, a.patient_name, a.hospital_location, a.appointment_date,
                a.appointment_time, a.appointment_type, a.location, a.notes, a.complaint,
                a.detected_category, a.status, a.created_at,
                p.age as patient_age,
                p.birth_date as patient_birth_date
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
            WHERE a.hospital_location = ?
            AND a.appointment_date >= CURDATE()
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
        `, [location]);

        // Calculate age from birth_date if age is not available
        const appointmentsWithAge = rows.map(apt => {
            if (!apt.patient_age && apt.patient_birth_date) {
                const today = new Date();
                const birthDate = new Date(apt.patient_birth_date);
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                apt.patient_age = age >= 0 ? age : null;
            }
            return apt;
        });

        res.json({
            success: true,
            appointments: appointmentsWithAge
        });
    } catch (error) {
        console.error('Error fetching hospital appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch hospital appointments',
            error: error.message
        });
    }
});

router.get('/hospital/:location/live-queue', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;

        if (location !== 'rsia_melinda') {
            return res.status(400).json({
                success: false,
                message: 'Live queue hanya tersedia untuk RSIA Melinda'
            });
        }

        if (melindaLiveQueueCache.payload && melindaLiveQueueCache.expiresAt > Date.now()) {
            return res.json(melindaLiveQueueCache.payload);
        }

        const session = createSession('rsia_melinda');
        try {
            await session.login();
            const queueData = await session.getPolyclinicQueue({
                poliId: '1',
                groupId: '0',
                showId: '0',
                byDokter: '0',
                clinicLabel: 'Poli Obgyn',
                doctorFilter: 'Semua Dokter'
            });

            const enrichedItems = await enrichMelindaQueueItems(queueData.items, location, session);

            const payload = {
                success: true,
                source: 'medify_live',
                location,
                queue: {
                    ...queueData,
                    items: enrichedItems
                }
            };

            melindaLiveQueueCache.payload = payload;
            melindaLiveQueueCache.expiresAt = Date.now() + MELINDA_LIVE_QUEUE_CACHE_TTL_MS;

            res.json(payload);
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('Error fetching RSIA Melinda live queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch RSIA Melinda live queue',
            error: error.message
        });
    }
});

// GET single appointment by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message
        });
    }
});

// GET latest appointment for a specific patient
router.get('/patient/:patient_id/latest', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM appointments 
             WHERE patient_id = ? 
             ORDER BY appointment_date DESC, appointment_time DESC 
             LIMIT 1`,
            [req.params.patient_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No appointments found for this patient'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching latest appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch latest appointment',
            error: error.message
        });
    }
});

// ==================== PROTECTED ROUTES (require auth) ====================

// POST new appointment
router.post('/', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const {
            patient_id,
            patient_name,
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            whatsapp_reminder,
            reminder_time,
            created_by
        } = req.body;
        
        // Validation
        if (!patient_id || !patient_name || !appointment_date || !appointment_time) {
            return res.status(400).json({
                success: false,
                message: 'patient_id, patient_name, appointment_date, and appointment_time are required'
            });
        }
        
        // Check for existing appointment at same time
        const [existing] = await pool.query(
            'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN (?, ?)',
            [appointment_date, appointment_time, 'scheduled', 'confirmed']
        );
        
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Appointment slot already booked'
            });
        }
        
        // Insert appointment
        const [result] = await pool.query(
            `INSERT INTO appointments (
                patient_id, patient_name, appointment_date, appointment_time, 
                appointment_type, location, notes, whatsapp_reminder, 
                reminder_time, created_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                patient_name,
                appointment_date,
                appointment_time,
                appointment_type || 'Konsultasi',
                location || 'Klinik',
                notes || null,
                whatsapp_reminder || false,
                reminder_time || 60,
                created_by || 'System',
                'scheduled'
            ]
        );
        
        // Get created appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create appointment',
            error: error.message
        });
    }
});

// PATCH update appointment status only
router.patch('/:id/status', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment tidak ditemukan'
            });
        }

        // Update status
        await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({
            success: true,
            message: 'Status appointment berhasil diupdate'
        });
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate status appointment',
            error: error.message
        });
    }
});

// PUT update appointment
router.put('/:id', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            status,
            whatsapp_reminder,
            reminder_time
        } = req.body;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Check for slot conflict if date/time changed
        if (appointment_date || appointment_time) {
            const checkDate = appointment_date || existing[0].appointment_date;
            const checkTime = appointment_time || existing[0].appointment_time;
            
            const [conflicts] = await pool.query(
                'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status IN (?, ?)',
                [checkDate, checkTime, id, 'scheduled', 'confirmed']
            );
            
            if (conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Appointment slot already booked'
                });
            }
        }
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (appointment_date) { updates.push('appointment_date = ?'); values.push(appointment_date); }
        if (appointment_time) { updates.push('appointment_time = ?'); values.push(appointment_time); }
        if (appointment_type) { updates.push('appointment_type = ?'); values.push(appointment_type); }
        if (location !== undefined) { updates.push('location = ?'); values.push(location); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }
        if (status) { updates.push('status = ?'); values.push(status); }
        if (whatsapp_reminder !== undefined) { updates.push('whatsapp_reminder = ?'); values.push(whatsapp_reminder); }
        if (reminder_time !== undefined) { updates.push('reminder_time = ?'); values.push(reminder_time); }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        values.push(id);
        
        await pool.query(
            `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        // Get updated appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Appointment updated successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update appointment',
            error: error.message
        });
    }
});

// DELETE appointment (Superadmin/Dokter only)
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Soft delete by setting status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );
        
        res.json({
            success: true,
            message: 'Appointment cancelled successfully'
        });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete appointment',
            error: error.message
        });
    }
});

// HARD DELETE - Permanently remove appointment from database (Superadmin/Dokter only)
router.delete('/:id/permanent', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Permanently delete from database
        await pool.query('DELETE FROM appointments WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Appointment permanently deleted'
        });
    } catch (error) {
        console.error('Error permanently deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to permanently delete appointment',
            error: error.message
        });
    }
});

module.exports = router;

