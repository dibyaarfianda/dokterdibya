/**
 * Fertility Calendar API Routes
 * Tracks menstrual cycles and calculates fertile periods
 *
 * Formula berdasarkan metode kalender:
 * 1. Regular cycles: Ovulasi = siklus - 14, fertile window 5 hari sebelum s/d 1 hari setelah ovulasi
 * 2. Irregular cycles (variasi > 7 hari): First fertile = shortest - 18, Last fertile = longest - 11
 * 3. Standard Days Method (siklus 26-32 hari): Hari ke-8 s/d ke-19
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

/**
 * Format date to YYYY-MM-DD without timezone conversion (GMT+7 safe)
 */
function formatDateLocal(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Analyze cycle data to determine regularity and calculate stats
 * @param {Array} cycles - Array of cycle records sorted by date DESC
 * @returns {Object} Cycle analysis results
 */
function analyzeCycles(cycles) {
    if (cycles.length < 2) {
        return {
            avgCycleLength: 28,
            shortestCycle: 28,
            longestCycle: 28,
            cycleVariation: 0,
            isIrregular: false,
            cycleType: 'insufficient_data',
            method: 'Default 28 hari (data belum cukup)'
        };
    }

    // Calculate cycle lengths between consecutive periods
    const cycleLengths = [];
    for (let i = 0; i < cycles.length - 1; i++) {
        const current = new Date(cycles[i].period_start_date);
        const previous = new Date(cycles[i + 1].period_start_date);
        const days = Math.floor((current - previous) / (1000 * 60 * 60 * 24));
        if (days > 0 && days < 60) { // Filter unrealistic values
            cycleLengths.push(days);
        }
    }

    if (cycleLengths.length === 0) {
        return {
            avgCycleLength: 28,
            shortestCycle: 28,
            longestCycle: 28,
            cycleVariation: 0,
            isIrregular: false,
            cycleType: 'insufficient_data',
            method: 'Default 28 hari (data tidak valid)'
        };
    }

    const shortestCycle = Math.min(...cycleLengths);
    const longestCycle = Math.max(...cycleLengths);
    const avgCycleLength = Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length);
    const cycleVariation = longestCycle - shortestCycle;

    // Determine if cycle is irregular (variation > 7 days)
    const isIrregular = cycleVariation > 7;

    // Determine calculation method
    let cycleType, method;
    if (isIrregular) {
        cycleType = 'irregular';
        method = `Metode Siklus Tidak Teratur (variasi ${cycleVariation} hari)`;
    } else if (avgCycleLength >= 26 && avgCycleLength <= 32) {
        cycleType = 'standard_days';
        method = 'Standard Days Method (siklus 26-32 hari)';
    } else {
        cycleType = 'regular';
        method = `Metode Kalender Standar (siklus ${avgCycleLength} hari)`;
    }

    return {
        avgCycleLength,
        shortestCycle,
        longestCycle,
        cycleVariation,
        isIrregular,
        cycleType,
        method,
        dataPoints: cycleLengths.length
    };
}

/**
 * Calculate fertility data with advanced formula
 * @param {Date} periodStart - First day of last period
 * @param {Object} cycleAnalysis - Results from analyzeCycles()
 * @returns {Object} Fertility calculations
 */
function calculateFertility(periodStart, cycleAnalysis) {
    const start = new Date(periodStart);
    const { avgCycleLength, shortestCycle, longestCycle, isIrregular, cycleType } = cycleAnalysis;

    let firstFertileDay, lastFertileDay, ovulationDay;

    if (isIrregular) {
        // Irregular cycle method: shortest - 18 to longest - 11
        firstFertileDay = shortestCycle - 18;
        lastFertileDay = longestCycle - 11;
        ovulationDay = avgCycleLength - 14; // Estimated
    } else if (cycleType === 'standard_days') {
        // Standard Days Method: days 8-19
        firstFertileDay = 8;
        lastFertileDay = 19;
        ovulationDay = 14; // Day 14 for standard
    } else {
        // Regular cycle: standard calculation
        ovulationDay = avgCycleLength - 14;
        firstFertileDay = ovulationDay - 5;
        lastFertileDay = ovulationDay + 1;
    }

    // Ensure minimum values
    firstFertileDay = Math.max(1, firstFertileDay);
    lastFertileDay = Math.max(firstFertileDay + 1, lastFertileDay);

    // Calculate dates
    const fertileStart = new Date(start);
    fertileStart.setDate(start.getDate() + firstFertileDay - 1);

    const fertileEnd = new Date(start);
    fertileEnd.setDate(start.getDate() + lastFertileDay - 1);

    const ovulationDate = new Date(start);
    ovulationDate.setDate(start.getDate() + ovulationDay);

    // Next period prediction
    const nextPeriod = new Date(start);
    nextPeriod.setDate(start.getDate() + avgCycleLength);

    // Peak fertile: 2 days before ovulation to day of ovulation
    const peakStart = new Date(ovulationDate);
    peakStart.setDate(ovulationDate.getDate() - 2);

    return {
        ovulationDate: formatDateLocal(ovulationDate),
        ovulationDay,
        fertileWindowStart: formatDateLocal(fertileStart),
        fertileWindowEnd: formatDateLocal(fertileEnd),
        firstFertileDay,
        lastFertileDay,
        peakFertileStart: formatDateLocal(peakStart),
        peakFertileEnd: formatDateLocal(ovulationDate),
        nextPeriodDate: formatDateLocal(nextPeriod),
        cycleDay: Math.floor((new Date() - start) / (1000 * 60 * 60 * 24)) + 1,
        method: cycleAnalysis.method,
        cycleType: cycleAnalysis.cycleType
    };
}

/**
 * GET /api/fertility-calendar
 * Get all cycles for the patient with fertility calculations
 */
router.get('/', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;

        // Get all cycles ordered by date
        const [cycles] = await db.query(
            `SELECT * FROM fertility_cycles
             WHERE patient_id = ?
             ORDER BY period_start_date DESC`,
            [patientId]
        );

        // Analyze cycle patterns
        const cycleAnalysis = analyzeCycles(cycles);

        // Add fertility calculations to each cycle
        const cyclesWithFertility = cycles.map(cycle => ({
            ...cycle,
            fertility: calculateFertility(cycle.period_start_date, cycleAnalysis)
        }));

        // Get current/upcoming fertility info based on last period
        let currentFertility = null;
        if (cycles.length > 0) {
            const lastCycle = cycles[0];
            currentFertility = calculateFertility(lastCycle.period_start_date, cycleAnalysis);
        }

        res.json({
            success: true,
            cycles: cyclesWithFertility,
            cycleAnalysis: {
                averageCycleLength: cycleAnalysis.avgCycleLength,
                shortestCycle: cycleAnalysis.shortestCycle,
                longestCycle: cycleAnalysis.longestCycle,
                cycleVariation: cycleAnalysis.cycleVariation,
                isIrregular: cycleAnalysis.isIrregular,
                cycleType: cycleAnalysis.cycleType,
                method: cycleAnalysis.method,
                dataPoints: cycleAnalysis.dataPoints
            },
            averageCycleLength: cycleAnalysis.avgCycleLength, // backward compatibility
            currentFertility,
            totalCycles: cycles.length
        });
    } catch (error) {
        console.error('Error fetching fertility cycles:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data siklus' });
    }
});

/**
 * GET /api/fertility-calendar/calendar-data
 * Get calendar-formatted data for a specific month
 */
router.get('/calendar-data', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const { year, month } = req.query;

        const targetYear = parseInt(year) || new Date().getFullYear();
        const targetMonth = parseInt(month) || new Date().getMonth() + 1;

        // Get ALL cycles for better analysis (not just last 3 months)
        const [allCycles] = await db.query(
            `SELECT * FROM fertility_cycles
             WHERE patient_id = ?
             ORDER BY period_start_date DESC`,
            [patientId]
        );

        // Analyze cycle patterns from all data
        const cycleAnalysis = analyzeCycles(allCycles);

        // Get cycles that might affect this month (last 3 months of data for display)
        const startDate = new Date(targetYear, targetMonth - 3, 1);

        const [cycles] = await db.query(
            `SELECT * FROM fertility_cycles
             WHERE patient_id = ?
             AND period_start_date >= DATE_SUB(?, INTERVAL 3 MONTH)
             ORDER BY period_start_date DESC`,
            [patientId, formatDateLocal(startDate)]
        );

        // Build calendar events
        const events = [];

        cycles.forEach(cycle => {
            const fertility = calculateFertility(cycle.period_start_date, cycleAnalysis);

            // Period days with day number (use local date formatting)
            const periodStart = new Date(cycle.period_start_date);
            const periodEnd = cycle.period_end_date
                ? new Date(cycle.period_end_date)
                : new Date(periodStart.getTime() + 5 * 24 * 60 * 60 * 1000); // Default 5 days

            let periodDayNum = 1;
            for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
                events.push({
                    date: formatDateLocal(d),
                    type: 'period',
                    label: 'Menstruasi',
                    intensity: cycle.flow_intensity,
                    periodDay: periodDayNum,
                    cycleStartDate: formatDateLocal(cycle.period_start_date)
                });
                periodDayNum++;
            }

            // Fertile window
            const fertileStart = new Date(fertility.fertileWindowStart);
            const fertileEnd = new Date(fertility.fertileWindowEnd);
            for (let d = new Date(fertileStart); d <= fertileEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = formatDateLocal(d);
                // Check if it's peak fertile
                const isPeak = dateStr >= fertility.peakFertileStart && dateStr <= fertility.peakFertileEnd;
                events.push({
                    date: dateStr,
                    type: isPeak ? 'peak_fertile' : 'fertile',
                    label: isPeak ? 'Sangat Subur' : 'Masa Subur'
                });
            }

            // Ovulation day
            events.push({
                date: fertility.ovulationDate,
                type: 'ovulation',
                label: 'Ovulasi'
            });

            // Predicted next period
            events.push({
                date: fertility.nextPeriodDate,
                type: 'predicted_period',
                label: 'Prediksi Menstruasi'
            });
        });

        // Fetch intercourse records for this month
        const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${new Date(targetYear, targetMonth, 0).getDate()}`;

        const [intercourseRecords] = await db.query(
            `SELECT intercourse_date, notes FROM fertility_intercourse
             WHERE patient_id = ? AND intercourse_date BETWEEN ? AND ?`,
            [patientId, monthStart, monthEnd]
        );

        // Add intercourse events (use local date to avoid UTC timezone shift)
        intercourseRecords.forEach(record => {
            const d = new Date(record.intercourse_date);
            const dateStr = formatDateLocal(d);
            events.push({
                date: dateStr,
                type: 'intercourse',
                label: 'Hubungan Intim',
                notes: record.notes
            });
        });

        res.json({
            success: true,
            year: targetYear,
            month: targetMonth,
            events,
            cycleAnalysis: {
                averageCycleLength: cycleAnalysis.avgCycleLength,
                shortestCycle: cycleAnalysis.shortestCycle,
                longestCycle: cycleAnalysis.longestCycle,
                cycleVariation: cycleAnalysis.cycleVariation,
                isIrregular: cycleAnalysis.isIrregular,
                cycleType: cycleAnalysis.cycleType,
                method: cycleAnalysis.method
            },
            averageCycleLength: cycleAnalysis.avgCycleLength, // backward compatibility
            intercourseCount: intercourseRecords.length
        });
    } catch (error) {
        console.error('Error fetching calendar data:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data kalender' });
    }
});

/**
 * POST /api/fertility-calendar
 * Add a new cycle record
 */
router.post('/', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const {
            period_start_date,
            period_end_date,
            notes,
            symptoms,
            flow_intensity,
            pain_intensity
        } = req.body;

        if (!period_start_date) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal mulai menstruasi wajib diisi'
            });
        }

        // Check for duplicate entry
        const [existing] = await db.query(
            `SELECT id FROM fertility_cycles
             WHERE patient_id = ? AND period_start_date = ?`,
            [patientId, period_start_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Data untuk tanggal ini sudah ada'
            });
        }

        // Calculate cycle_length from previous cycle
        let cycleLength = 28; // default
        const [prevCycles] = await db.query(
            `SELECT period_start_date FROM fertility_cycles
             WHERE patient_id = ? AND period_start_date < ?
             ORDER BY period_start_date DESC LIMIT 1`,
            [patientId, period_start_date]
        );
        if (prevCycles.length > 0) {
            const prevDate = new Date(prevCycles[0].period_start_date);
            const currentDate = new Date(period_start_date);
            cycleLength = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));
        }

        // Insert new cycle
        const [result] = await db.query(
            `INSERT INTO fertility_cycles
             (patient_id, period_start_date, period_end_date, cycle_length, notes, symptoms, flow_intensity, pain_intensity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patientId,
                period_start_date,
                period_end_date || null,
                cycleLength,
                notes || null,
                symptoms ? JSON.stringify(symptoms) : null,
                flow_intensity || 'medium',
                pain_intensity || 'none'
            ]
        );

        // Get all cycles including the new one for analysis
        const [allCycles] = await db.query(
            `SELECT * FROM fertility_cycles
             WHERE patient_id = ?
             ORDER BY period_start_date DESC`,
            [patientId]
        );

        // Calculate fertility using analyzed cycle data
        const cycleAnalysis = analyzeCycles(allCycles);
        const fertility = calculateFertility(period_start_date, cycleAnalysis);

        res.status(201).json({
            success: true,
            message: 'Data siklus berhasil disimpan',
            cycleId: result.insertId,
            fertility,
            cycleAnalysis: {
                method: cycleAnalysis.method,
                cycleType: cycleAnalysis.cycleType
            }
        });
    } catch (error) {
        console.error('Error adding cycle:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data siklus' });
    }
});

/**
 * PUT /api/fertility-calendar/:id
 * Update a cycle record
 */
router.put('/:id', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const cycleId = req.params.id;
        const {
            period_start_date,
            period_end_date,
            cycle_length,
            notes,
            symptoms,
            flow_intensity
        } = req.body;

        // Verify ownership
        const [existing] = await db.query(
            `SELECT * FROM fertility_cycles WHERE id = ? AND patient_id = ?`,
            [cycleId, patientId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data siklus tidak ditemukan'
            });
        }

        // Update cycle
        await db.query(
            `UPDATE fertility_cycles SET
             period_start_date = COALESCE(?, period_start_date),
             period_end_date = ?,
             cycle_length = COALESCE(?, cycle_length),
             notes = ?,
             symptoms = ?,
             flow_intensity = COALESCE(?, flow_intensity)
             WHERE id = ? AND patient_id = ?`,
            [
                period_start_date,
                period_end_date || null,
                cycle_length,
                notes || null,
                symptoms ? JSON.stringify(symptoms) : null,
                flow_intensity,
                cycleId,
                patientId
            ]
        );

        res.json({
            success: true,
            message: 'Data siklus berhasil diperbarui'
        });
    } catch (error) {
        console.error('Error updating cycle:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui data siklus' });
    }
});

/**
 * DELETE /api/fertility-calendar/:id
 * Delete a cycle record
 */
router.delete('/:id', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const cycleId = req.params.id;

        const [result] = await db.query(
            `DELETE FROM fertility_cycles WHERE id = ? AND patient_id = ?`,
            [cycleId, patientId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data siklus tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Data siklus berhasil dihapus'
        });
    } catch (error) {
        console.error('Error deleting cycle:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus data siklus' });
    }
});

/**
 * GET /api/fertility-calendar/intercourse
 * Get all intercourse records for the patient
 */
router.get('/intercourse', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const { start_date, end_date } = req.query;

        let query = `SELECT * FROM fertility_intercourse WHERE patient_id = ?`;
        const params = [patientId];

        if (start_date) {
            query += ` AND intercourse_date >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND intercourse_date <= ?`;
            params.push(end_date);
        }

        query += ` ORDER BY intercourse_date DESC`;

        const [records] = await db.query(query, params);

        res.json({
            success: true,
            records,
            total: records.length
        });
    } catch (error) {
        console.error('Error fetching intercourse records:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data' });
    }
});

/**
 * POST /api/fertility-calendar/intercourse
 * Add or toggle intercourse record for a specific date
 */
router.post('/intercourse', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const { date, notes } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal wajib diisi'
            });
        }

        // Check if record already exists for this date
        const [existing] = await db.query(
            `SELECT id FROM fertility_intercourse WHERE patient_id = ? AND intercourse_date = ?`,
            [patientId, date]
        );

        if (existing.length > 0) {
            // Toggle off - delete the record
            await db.query(
                `DELETE FROM fertility_intercourse WHERE patient_id = ? AND intercourse_date = ?`,
                [patientId, date]
            );
            return res.json({
                success: true,
                action: 'removed',
                message: 'Data dihapus'
            });
        }

        // Add new record
        const [result] = await db.query(
            `INSERT INTO fertility_intercourse (patient_id, intercourse_date, notes) VALUES (?, ?, ?)`,
            [patientId, date, notes || null]
        );

        res.status(201).json({
            success: true,
            action: 'added',
            message: 'Data berhasil disimpan',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error saving intercourse record:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data' });
    }
});

/**
 * DELETE /api/fertility-calendar/intercourse/:date
 * Delete intercourse record for a specific date
 */
router.delete('/intercourse/:date', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const date = req.params.date;

        const [result] = await db.query(
            `DELETE FROM fertility_intercourse WHERE patient_id = ? AND intercourse_date = ?`,
            [patientId, date]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Data berhasil dihapus'
        });
    } catch (error) {
        console.error('Error deleting intercourse record:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus data' });
    }
});

/**
 * GET /api/fertility-calendar/predictions
 * Get fertility predictions for upcoming months
 */
router.get('/predictions', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const months = parseInt(req.query.months) || 3;

        // Get all cycles for analysis
        const [cycles] = await db.query(
            `SELECT * FROM fertility_cycles
             WHERE patient_id = ?
             ORDER BY period_start_date DESC`,
            [patientId]
        );

        if (cycles.length === 0) {
            return res.json({
                success: true,
                message: 'Belum ada data siklus',
                predictions: []
            });
        }

        // Analyze cycle patterns
        const cycleAnalysis = analyzeCycles(cycles);

        // Generate predictions
        const predictions = [];
        let lastPeriod = new Date(cycles[0].period_start_date);

        for (let i = 0; i < months; i++) {
            const nextPeriod = new Date(lastPeriod);
            nextPeriod.setDate(lastPeriod.getDate() + cycleAnalysis.avgCycleLength);

            const fertility = calculateFertility(nextPeriod, cycleAnalysis);

            predictions.push({
                cycleNumber: i + 1,
                periodStart: formatDateLocal(nextPeriod),
                ...fertility
            });

            lastPeriod = nextPeriod;
        }

        res.json({
            success: true,
            cycleAnalysis: {
                averageCycleLength: cycleAnalysis.avgCycleLength,
                shortestCycle: cycleAnalysis.shortestCycle,
                longestCycle: cycleAnalysis.longestCycle,
                cycleVariation: cycleAnalysis.cycleVariation,
                isIrregular: cycleAnalysis.isIrregular,
                cycleType: cycleAnalysis.cycleType,
                method: cycleAnalysis.method
            },
            averageCycleLength: cycleAnalysis.avgCycleLength, // backward compatibility
            basedOnCycles: cycles.length,
            predictions
        });
    } catch (error) {
        console.error('Error generating predictions:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat prediksi' });
    }
});

module.exports = router;
