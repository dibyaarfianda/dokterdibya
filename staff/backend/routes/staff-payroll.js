const express = require('express');
const db = require('../db');
const { verifyToken, requireDoctorRole } = require('../middleware/auth');
const { ROLE_IDS } = require('../constants/roles');
const {
    PAYROLL_CONFIG,
    DRIVER_PAYROLL_CONFIG,
    calculatePayroll,
    calculateDriverPayroll,
    normalizePayrollMonth,
    sumPayrollItems
} = require('../services/StaffPayrollService');

const router = express.Router();

function todayLocalDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function normalizeDate(value, fieldName) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new Error(`${fieldName} harus format YYYY-MM-DD`);
    }
    const [year, month, day] = raw.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const valid = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    if (!valid) {
        throw new Error(`${fieldName} tidak valid`);
    }
    return raw;
}

function normalizePracticeDates(values) {
    if (!Array.isArray(values)) {
        throw new Error('practice_dates harus berupa array');
    }
    const unique = Array.from(new Set(values.map(v => normalizeDate(v, 'tanggal praktik'))));
    unique.sort();
    if (unique.length !== 4) {
        throw new Error('Siklus payroll harus berisi tepat 4 tanggal praktik');
    }
    return unique;
}

function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function normalizeAttendanceDates(values, practiceDates) {
    if (!Array.isArray(values)) {
        throw new Error('attendance_dates harus berupa array');
    }
    const allowed = new Set(practiceDates);
    const unique = Array.from(new Set(values.map(v => normalizeDate(v, 'tanggal hadir'))));
    unique.sort();
    for (const date of unique) {
        if (!allowed.has(date)) {
            throw new Error(`Tanggal hadir ${date} tidak termasuk siklus payroll`);
        }
    }
    return unique;
}

async function getLatestPracticeDates(limit = 12) {
    const safeLimit = Math.max(4, Math.min(24, Number.parseInt(limit, 10) || 12));
    const [rows] = await db.query(
        `SELECT DISTINCT duty_date
         FROM staff_duty_logs
         ORDER BY duty_date DESC
         LIMIT ?`,
        [safeLimit]
    );
    return rows.map(row => formatDateOnly(row.duty_date));
}

async function loadBatch(batchId, queryable = db) {
    const [batchRows] = await queryable.query(
        `SELECT id, cycle_label, cycle_start_date, cycle_end_date, payroll_date,
                practice_dates_json, status, total_amount, notes, created_by,
                finalized_by, finalized_at, created_at, updated_at
         FROM staff_payroll_batches
         WHERE id = ?`,
        [batchId]
    );

    if (batchRows.length === 0) return null;

    const batch = batchRows[0];
    batch.cycle_start_date = formatDateOnly(batch.cycle_start_date);
    batch.cycle_end_date = formatDateOnly(batch.cycle_end_date);
    batch.payroll_date = formatDateOnly(batch.payroll_date);
    batch.practice_dates = parseJsonArray(batch.practice_dates_json);
    delete batch.practice_dates_json;

    const [items] = await queryable.query(
        `SELECT id, batch_id, staff_id, staff_name, role_name, role_display,
                attendance_dates_json, attendance_count, base_amount,
                additional_count, additional_amount, adjustment_amount,
                total_amount, notes, created_at, updated_at
         FROM staff_payroll_items
         WHERE batch_id = ?
         ORDER BY staff_name ASC`,
        [batchId]
    );

    batch.items = items.map(item => ({
        ...item,
        attendance_dates: parseJsonArray(item.attendance_dates_json),
        attendance_dates_json: undefined
    }));

    return batch;
}

function normalizeDriverPayrollRow(row) {
    if (!row) return null;
    return {
        ...row,
        payroll_month: formatDateOnly(row.payroll_month)
    };
}

async function loadDriverPayroll(payrollMonth, queryable = db) {
    const [rows] = await queryable.query(
        `SELECT id, payroll_month, calendar_days, sunday_count, working_days,
                monthly_salary, absence_days, daily_deduction, deduction_amount,
                total_amount, status, created_by, finalized_by, finalized_at,
                created_at, updated_at
         FROM staff_driver_payrolls
         WHERE payroll_month = ?
         LIMIT 1`,
        [`${normalizePayrollMonth(payrollMonth)}-01`]
    );
    return normalizeDriverPayrollRow(rows[0]);
}

function badRequest(res, message) {
    return res.status(400).json({ success: false, message });
}

router.get('/practice-dates', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const practiceDates = await getLatestPracticeDates(req.query.limit);
        const latestCycle = practiceDates.slice(0, 4).sort();
        return res.json({
            success: true,
            data: {
                practice_dates: practiceDates,
                latest_cycle: latestCycle
            }
        });
    } catch (err) {
        console.error('[staff-payroll] practice dates error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat tanggal praktik' });
    }
});

router.get('/batches', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
        const [rows] = await db.query(
            `SELECT b.id, b.cycle_label, b.cycle_start_date, b.cycle_end_date,
                    b.payroll_date, b.practice_dates_json, b.status, b.total_amount,
                    b.notes, b.finalized_at, b.created_at, b.updated_at,
                    COUNT(i.id) AS item_count,
                    COALESCE(SUM(CASE WHEN i.total_amount > 0 THEN 1 ELSE 0 END), 0) AS paid_staff_count,
                    COALESCE(SUM(i.attendance_count), 0) AS total_attendance
             FROM staff_payroll_batches b
             LEFT JOIN staff_payroll_items i ON i.batch_id = b.id
             GROUP BY b.id
             ORDER BY b.payroll_date DESC, b.id DESC
             LIMIT ?`,
            [limit]
        );

        return res.json({
            success: true,
            data: rows.map(row => ({
                ...row,
                cycle_start_date: formatDateOnly(row.cycle_start_date),
                cycle_end_date: formatDateOnly(row.cycle_end_date),
                payroll_date: formatDateOnly(row.payroll_date),
                practice_dates: parseJsonArray(row.practice_dates_json),
                practice_dates_json: undefined
            }))
        });
    } catch (err) {
        console.error('[staff-payroll] list error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat daftar payroll' });
    }
});

router.get('/batches/:id', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const batch = await loadBatch(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch gaji tidak ditemukan' });
        }
        return res.json({ success: true, data: batch });
    } catch (err) {
        console.error('[staff-payroll] detail error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat detail payroll' });
    }
});

router.post('/batches', verifyToken, requireDoctorRole, async (req, res) => {
    let practiceDates;
    try {
        practiceDates = req.body && req.body.practice_dates
            ? normalizePracticeDates(req.body.practice_dates)
            : (await getLatestPracticeDates(4)).slice(0, 4).sort();
        practiceDates = normalizePracticeDates(practiceDates);
    } catch (err) {
        return badRequest(res, err.message);
    }

    let payrollDate;
    try {
        payrollDate = normalizeDate((req.body && req.body.payroll_date) || todayLocalDate(), 'tanggal gajian');
    } catch (err) {
        return badRequest(res, err.message);
    }

    const notes = String((req.body && req.body.notes) || '').trim() || null;
    const practiceDatesJson = JSON.stringify(practiceDates);
    const cycleStart = practiceDates[0];
    const cycleEnd = practiceDates[practiceDates.length - 1];
    const cycleLabel = `${cycleStart} s/d ${cycleEnd}`;
    const userId = String(req.user && (req.user.id || req.user.new_id || '') || '').trim() || null;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existing] = await connection.query(
            `SELECT id FROM staff_payroll_batches
             WHERE cycle_start_date = ? AND cycle_end_date = ? AND practice_dates_json = ?
             LIMIT 1`,
            [cycleStart, cycleEnd, practiceDatesJson]
        );
        if (existing.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
                success: false,
                message: 'Batch gaji untuk siklus ini sudah ada',
                data: { id: existing[0].id }
            });
        }

        const [staffRows] = await connection.query(
            `SELECT u.new_id AS staff_id, u.name, u.email, u.role,
                    r.name AS role_name, r.display_name AS role_display
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.user_type = 'staff'
               AND u.is_active = 1
               AND (u.role_id IS NULL OR u.role_id <> ?)
             ORDER BY u.name ASC`,
            [ROLE_IDS.DOKTER]
        );

        const [dutyRows] = await connection.query(
            `SELECT staff_id, duty_date
             FROM staff_duty_logs
             WHERE duty_date IN (?, ?, ?, ?)`,
            practiceDates
        );

        const attendanceMap = new Map();
        dutyRows.forEach(row => {
            const staffId = String(row.staff_id);
            if (!attendanceMap.has(staffId)) attendanceMap.set(staffId, new Set());
            attendanceMap.get(staffId).add(formatDateOnly(row.duty_date));
        });

        const [batchResult] = await connection.query(
            `INSERT INTO staff_payroll_batches
             (cycle_label, cycle_start_date, cycle_end_date, payroll_date,
              practice_dates_json, status, total_amount, notes, created_by)
             VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?)`,
            [cycleLabel, cycleStart, cycleEnd, payrollDate, practiceDatesJson, notes, userId]
        );

        const batchId = batchResult.insertId;
        const items = staffRows.map(staff => {
            const attendanceDates = Array.from(attendanceMap.get(String(staff.staff_id)) || []).sort();
            const payroll = calculatePayroll(attendanceDates.length, 0);
            return {
                staff_id: staff.staff_id,
                staff_name: staff.name,
                role_name: staff.role_name || staff.role || '',
                role_display: staff.role_display || staff.role_name || staff.role || '',
                attendance_dates: attendanceDates,
                ...payroll
            };
        });

        for (const item of items) {
            await connection.query(
                `INSERT INTO staff_payroll_items
                 (batch_id, staff_id, staff_name, role_name, role_display,
                  attendance_dates_json, attendance_count, base_amount,
                  additional_count, additional_amount, adjustment_amount,
                  total_amount, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                [
                    batchId,
                    item.staff_id,
                    item.staff_name,
                    item.role_name,
                    item.role_display,
                    JSON.stringify(item.attendance_dates),
                    item.attendance_count,
                    item.base_amount,
                    item.additional_count,
                    item.additional_amount,
                    item.adjustment_amount,
                    item.total_amount
                ]
            );
        }

        await connection.query(
            'UPDATE staff_payroll_batches SET total_amount = ? WHERE id = ?',
            [sumPayrollItems(items), batchId]
        );

        await connection.commit();
        const batch = await loadBatch(batchId, connection);
        connection.release();

        return res.status(201).json({ success: true, message: 'Draft gaji berhasil dibuat', data: batch });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[staff-payroll] create error:', err);
        return res.status(500).json({ success: false, message: 'Gagal membuat draft gaji' });
    }
});

router.put('/batches/:id', verifyToken, requireDoctorRole, async (req, res) => {
    const batchId = req.params.id;
    const updates = Array.isArray(req.body && req.body.items) ? req.body.items : null;
    if (!updates) {
        return badRequest(res, 'items harus berupa array');
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const batch = await loadBatch(batchId, connection);
        if (!batch) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Batch gaji tidak ditemukan' });
        }
        if (batch.status !== 'draft') {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ success: false, message: 'Batch finalized tidak bisa diubah' });
        }

        const existingByStaff = new Map(batch.items.map(item => [String(item.staff_id), item]));

        for (const update of updates) {
            const staffId = String(update.staff_id || '').trim();
            const existing = existingByStaff.get(staffId);
            if (!existing) {
                throw new Error(`Staff ${staffId} tidak ada dalam batch ini`);
            }

            const attendanceDates = normalizeAttendanceDates(
                update.attendance_dates !== undefined ? update.attendance_dates : existing.attendance_dates,
                batch.practice_dates
            );
            const adjustment = update.adjustment_amount !== undefined
                ? Number(update.adjustment_amount)
                : Number(existing.adjustment_amount || 0);
            const payroll = calculatePayroll(attendanceDates.length, adjustment);
            const notes = update.notes !== undefined ? String(update.notes || '').trim() || null : existing.notes || null;

            await connection.query(
                `UPDATE staff_payroll_items
                 SET attendance_dates_json = ?, attendance_count = ?, base_amount = ?,
                     additional_count = ?, additional_amount = ?, adjustment_amount = ?,
                     total_amount = ?, notes = ?
                 WHERE batch_id = ? AND staff_id = ?`,
                [
                    JSON.stringify(attendanceDates),
                    payroll.attendance_count,
                    payroll.base_amount,
                    payroll.additional_count,
                    payroll.additional_amount,
                    payroll.adjustment_amount,
                    payroll.total_amount,
                    notes,
                    batchId,
                    staffId
                ]
            );
        }

        const [totalRows] = await connection.query(
            'SELECT COALESCE(SUM(total_amount), 0) AS total_amount FROM staff_payroll_items WHERE batch_id = ?',
            [batchId]
        );
        await connection.query(
            'UPDATE staff_payroll_batches SET total_amount = ? WHERE id = ?',
            [Number(totalRows[0].total_amount) || 0, batchId]
        );

        await connection.commit();
        const updated = await loadBatch(batchId, connection);
        connection.release();
        return res.json({ success: true, message: 'Draft gaji berhasil disimpan', data: updated });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[staff-payroll] update error:', err);
        return badRequest(res, err.message || 'Gagal menyimpan draft gaji');
    }
});

router.post('/batches/:id/finalize', verifyToken, requireDoctorRole, async (req, res) => {
    let payrollDate = null;
    if (req.body && req.body.payroll_date) {
        try {
            payrollDate = normalizeDate(req.body.payroll_date, 'tanggal gajian');
        } catch (err) {
            return badRequest(res, err.message);
        }
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const batch = await loadBatch(req.params.id, connection);
        if (!batch) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Batch gaji tidak ditemukan' });
        }
        if (batch.status !== 'draft') {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ success: false, message: 'Batch sudah difinalkan' });
        }

        const finalizer = String(req.user && (req.user.id || req.user.new_id || '') || '').trim() || null;
        await connection.query(
            `UPDATE staff_payroll_batches
             SET status = 'finalized',
                 payroll_date = COALESCE(?, payroll_date),
                 finalized_by = ?,
                 finalized_at = NOW()
             WHERE id = ?`,
            [payrollDate, finalizer, req.params.id]
        );

        await connection.commit();
        const finalized = await loadBatch(req.params.id, connection);
        connection.release();
        return res.json({ success: true, message: 'Gaji berhasil difinalkan', data: finalized });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[staff-payroll] finalize error:', err);
        return res.status(500).json({ success: false, message: 'Gagal finalisasi gaji' });
    }
});

router.delete('/batches/:id', verifyToken, requireDoctorRole, async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const batch = await loadBatch(req.params.id, connection);
        if (!batch) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Batch gaji tidak ditemukan' });
        }
        if (batch.status !== 'draft') {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ success: false, message: 'Batch finalized tidak bisa dihapus' });
        }

        await connection.query('DELETE FROM staff_payroll_batches WHERE id = ?', [req.params.id]);
        await connection.commit();
        connection.release();
        return res.json({ success: true, message: 'Draft gaji berhasil dihapus' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[staff-payroll] delete error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menghapus draft gaji' });
    }
});

router.get('/driver-payrolls', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(60, Number.parseInt(req.query.limit, 10) || 24));
        const [rows] = await db.query(
            `SELECT id, payroll_month, calendar_days, sunday_count, working_days,
                    monthly_salary, absence_days, daily_deduction, deduction_amount,
                    total_amount, status, finalized_at, created_at, updated_at
             FROM staff_driver_payrolls
             ORDER BY payroll_month DESC
             LIMIT ?`,
            [limit]
        );
        return res.json({ success: true, data: rows.map(normalizeDriverPayrollRow) });
    } catch (err) {
        console.error('[staff-payroll] driver list error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat gaji supir' });
    }
});

router.put('/driver-payrolls/:month', verifyToken, requireDoctorRole, async (req, res) => {
    let payroll;
    try {
        payroll = calculateDriverPayroll(req.params.month, req.body && req.body.absence_days);
    } catch (err) {
        return badRequest(res, err.message);
    }

    const actorId = String(req.user && (req.user.id || req.user.new_id || '') || '').trim() || null;
    const connection = await db.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [existingRows] = await connection.query(
            'SELECT id, status FROM staff_driver_payrolls WHERE payroll_month = ? FOR UPDATE',
            [payroll.payroll_month]
        );
        const existing = existingRows[0];
        if (existing && existing.status === 'finalized') {
            await connection.rollback();
            transactionStarted = false;
            return res.status(409).json({
                success: false,
                message: 'Gaji supir bulan ini sudah difinalkan dan tidak bisa diubah'
            });
        }

        if (existing) {
            await connection.query(
                `UPDATE staff_driver_payrolls
                 SET calendar_days = ?, sunday_count = ?, working_days = ?, monthly_salary = ?,
                     absence_days = ?, daily_deduction = ?, deduction_amount = ?, total_amount = ?
                 WHERE id = ?`,
                [
                    payroll.calendar_days,
                    payroll.sunday_count,
                    payroll.working_days,
                    payroll.monthly_salary,
                    payroll.absence_days,
                    payroll.daily_deduction,
                    payroll.deduction_amount,
                    payroll.total_amount,
                    existing.id
                ]
            );
        } else {
            await connection.query(
                `INSERT INTO staff_driver_payrolls
                 (payroll_month, calendar_days, sunday_count, working_days, monthly_salary,
                  absence_days, daily_deduction, deduction_amount, total_amount, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
                [
                    payroll.payroll_month,
                    payroll.calendar_days,
                    payroll.sunday_count,
                    payroll.working_days,
                    payroll.monthly_salary,
                    payroll.absence_days,
                    payroll.daily_deduction,
                    payroll.deduction_amount,
                    payroll.total_amount,
                    actorId
                ]
            );
        }

        const saved = await loadDriverPayroll(req.params.month, connection);
        await connection.commit();
        transactionStarted = false;
        return res.json({ success: true, message: 'Draft gaji supir berhasil disimpan', data: saved });
    } catch (err) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (_rollbackError) {}
        }
        console.error('[staff-payroll] driver save error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan gaji supir' });
    } finally {
        connection.release();
    }
});

router.post('/driver-payrolls/:month/finalize', verifyToken, requireDoctorRole, async (req, res) => {
    let month;
    try {
        month = normalizePayrollMonth(req.params.month);
    } catch (err) {
        return badRequest(res, err.message);
    }

    const actorId = String(req.user && (req.user.id || req.user.new_id || '') || '').trim() || null;
    const connection = await db.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [rows] = await connection.query(
            'SELECT id, status FROM staff_driver_payrolls WHERE payroll_month = ? FOR UPDATE',
            [`${month}-01`]
        );
        if (!rows.length) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ success: false, message: 'Draft gaji supir belum dibuat' });
        }
        if (rows[0].status === 'finalized') {
            await connection.rollback();
            transactionStarted = false;
            return res.status(409).json({ success: false, message: 'Gaji supir bulan ini sudah difinalkan' });
        }

        await connection.query(
            `UPDATE staff_driver_payrolls
             SET status = 'finalized', finalized_by = ?, finalized_at = NOW()
             WHERE id = ?`,
            [actorId, rows[0].id]
        );
        const finalized = await loadDriverPayroll(month, connection);
        await connection.commit();
        transactionStarted = false;
        return res.json({ success: true, message: 'Gaji supir berhasil difinalkan', data: finalized });
    } catch (err) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (_rollbackError) {}
        }
        console.error('[staff-payroll] driver finalize error:', err);
        return res.status(500).json({ success: false, message: 'Gagal finalisasi gaji supir' });
    } finally {
        connection.release();
    }
});

router.delete('/driver-payrolls/:month', verifyToken, requireDoctorRole, async (req, res) => {
    let month;
    try {
        month = normalizePayrollMonth(req.params.month);
    } catch (err) {
        return badRequest(res, err.message);
    }

    try {
        const [result] = await db.query(
            `DELETE FROM staff_driver_payrolls
             WHERE payroll_month = ? AND status = 'draft'`,
            [`${month}-01`]
        );
        if (!result.affectedRows) {
            return res.status(409).json({
                success: false,
                message: 'Draft tidak ditemukan atau gaji supir sudah difinalkan'
            });
        }
        return res.json({ success: true, message: 'Draft gaji supir berhasil dihapus' });
    } catch (err) {
        console.error('[staff-payroll] driver delete error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menghapus draft gaji supir' });
    }
});

router.get('/config', verifyToken, requireDoctorRole, (req, res) => {
    return res.json({
        success: true,
        data: {
            staff: PAYROLL_CONFIG,
            driver: DRIVER_PAYROLL_CONFIG
        }
    });
});

module.exports = router;
