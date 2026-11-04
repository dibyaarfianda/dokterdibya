const express = require('express');
const db = require('../db');
const { verifyToken, requireDoctorRoleOrAccountPermission } = require('../middleware/auth');
const { ROLE_IDS } = require('../constants/roles');
const {
    PAYROLL_CONFIG,
    DRIVER_PAYROLL_CONFIG,
    calculatePayroll,
    calculateDriverPayroll,
    calculateDoctorPaidAmount,
    normalizePayrollMonth,
    normalizePayrollRates,
    normalizeAllowanceAmount,
    sumPayrollItems
} = require('../services/StaffPayrollService');
const { getSessionSettings, getDayName } = require('../services/booking-session-settings');

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

const CYCLE_WEEKS = 4;
const MAX_CYCLE_DATES = 60;

function normalizePracticeDates(values) {
    if (!Array.isArray(values)) {
        throw new Error('practice_dates harus berupa array');
    }
    const unique = Array.from(new Set(values.map(v => normalizeDate(v, 'tanggal praktik'))));
    unique.sort();
    if (unique.length === 0) {
        throw new Error('Siklus payroll minimal berisi 1 tanggal praktik');
    }
    if (unique.length > MAX_CYCLE_DATES) {
        throw new Error(`Siklus payroll maksimal ${MAX_CYCLE_DATES} tanggal praktik`);
    }
    return unique;
}

/**
 * Siklus gaji = 4 minggu praktik. Jumlah tanggal mengikuti hari praktik aktif
 * di Pengaturan Booking (booking_settings), mis. Minggu + Sabtu -> 8 tanggal.
 */
async function getCycleInfo() {
    const settings = await getSessionSettings();
    const days = Array.from(new Set((settings || []).map(s => Number(s.dayOfWeek) || 0)));
    // Urutkan Senin..Minggu agar label terbaca natural (Sabtu, Minggu).
    days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const practiceDays = days.length ? days : [0];
    return {
        cycle_weeks: CYCLE_WEEKS,
        cycle_size: CYCLE_WEEKS * practiceDays.length,
        practice_day_numbers: practiceDays,
        practice_days: practiceDays.map(getDayName)
    };
}

// Status booking yang menandakan praktik benar-benar berjalan di tanggal itu.
const HELD_APPOINTMENT_STATUSES = ['confirmed', 'completed', 'no_show'];

/**
 * Tanggal praktik diambil dari booking (sunday_appointments), bukan dari absensi
 * Briefing yang sering tidak tercatat. Default siklus = tanggal praktik berikutnya
 * setelah batch gaji terakhir, sampai hari ini, maksimal cycle_size tanggal.
 */
async function getBookingPracticeDates(cycle, queryable = db) {
    const dayPlaceholders = cycle.practice_day_numbers.map(() => '?').join(', ');
    const statusPlaceholders = HELD_APPOINTMENT_STATUSES.map(() => '?').join(', ');
    const [lastRows] = await queryable.query(
        'SELECT MAX(cycle_end_date) AS last_end FROM staff_payroll_batches'
    );
    const lastEnd = lastRows[0] && lastRows[0].last_end ? formatDateOnly(lastRows[0].last_end) : null;
    const baseParams = [todayLocalDate(), ...HELD_APPOINTMENT_STATUSES, ...cycle.practice_day_numbers];
    const baseWhere = `appointment_date <= ?
           AND status IN (${statusPlaceholders})
           AND (DAYOFWEEK(appointment_date) - 1) IN (${dayPlaceholders})`;

    const [recentRows] = await queryable.query(
        `SELECT DISTINCT appointment_date FROM sunday_appointments
         WHERE ${baseWhere}
         ORDER BY appointment_date DESC
         LIMIT ?`,
        [...baseParams, cycle.cycle_size * 2]
    );
    const recent = recentRows.map(row => formatDateOnly(row.appointment_date));

    let next;
    if (lastEnd) {
        const [nextRows] = await queryable.query(
            `SELECT DISTINCT appointment_date FROM sunday_appointments
             WHERE ${baseWhere} AND appointment_date > ?
             ORDER BY appointment_date ASC
             LIMIT ?`,
            [...baseParams, lastEnd, cycle.cycle_size]
        );
        next = nextRows.map(row => formatDateOnly(row.appointment_date));
    } else {
        next = recent.slice(0, cycle.cycle_size).sort();
    }

    return { last_cycle_end: lastEnd, practice_dates: recent, next_cycle: next };
}

function actorIdFrom(req) {
    return String(req.user && (req.user.id || req.user.new_id || '') || '').trim() || null;
}

async function loadPayrollStaff(queryable = db) {
    const [rows] = await queryable.query(
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
    return rows;
}

async function loadPayrollSettings(queryable = db) {
    const [rows] = await queryable.query(
        'SELECT base_amount, additional_rate, updated_at FROM staff_payroll_settings WHERE id = 1'
    );
    const rates = normalizePayrollRates(rows[0] || {});
    return { ...rates, updated_at: rows[0] ? rows[0].updated_at : null };
}

async function loadAllowances(queryable = db, { activeOnly = false } = {}) {
    const [rows] = await queryable.query(
        `SELECT a.staff_id, a.label, a.amount, a.is_active, u.name AS staff_name
         FROM staff_payroll_allowances a
         LEFT JOIN users u ON u.new_id = a.staff_id
         ${activeOnly ? 'WHERE a.is_active = 1 AND a.amount > 0' : ''}
         ORDER BY u.name ASC, a.staff_id ASC`
    );
    return rows.map(row => ({
        staff_id: String(row.staff_id),
        staff_name: row.staff_name || '',
        label: row.label,
        amount: Number(row.amount) || 0,
        is_active: Number(row.is_active) === 1
    }));
}

function normalizeAllowanceInput(values) {
    if (!Array.isArray(values)) {
        throw new Error('allowances harus berupa array');
    }
    const seen = new Set();
    return values.map(value => {
        const staffId = String(value && value.staff_id || '').trim();
        if (!staffId) throw new Error('Staff tunjangan wajib dipilih');
        if (seen.has(staffId)) throw new Error('Satu staff hanya boleh punya satu tunjangan');
        seen.add(staffId);
        const label = String(value.label || '').replace(/\s+/g, ' ').trim();
        if (!label) throw new Error('Keterangan tunjangan wajib diisi');
        if (label.length > 100) throw new Error('Keterangan tunjangan maksimal 100 karakter');
        return {
            staff_id: staffId,
            label,
            amount: normalizeAllowanceAmount(value.amount),
            is_active: value.is_active === undefined ? true : Boolean(value.is_active)
        };
    });
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

async function loadBatch(batchId, queryable = db) {
    const [batchRows] = await queryable.query(
        `SELECT id, cycle_label, cycle_start_date, cycle_end_date, payroll_date,
                practice_dates_json, base_rate, additional_rate,
                status, total_amount, notes, created_by,
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
    const rates = normalizePayrollRates({ base_amount: batch.base_rate, additional_rate: batch.additional_rate });
    batch.base_rate = rates.base_amount;
    batch.additional_rate = rates.additional_rate;

    const [items] = await queryable.query(
        `SELECT id, batch_id, staff_id, staff_name, role_name, role_display,
                attendance_dates_json, attendance_count, base_amount,
                additional_count, additional_amount, allowance_label, allowance_amount,
                adjustment_amount, total_amount, notes, created_at, updated_at
         FROM staff_payroll_items
         WHERE batch_id = ?
         ORDER BY staff_name ASC`,
        [batchId]
    );

    let currentAllowances = null;
    if (batch.status === 'draft') {
        currentAllowances = new Map(
            (await loadAllowances(queryable, { activeOnly: true })).map(a => [a.staff_id, a])
        );
    }
    batch.allowances_changed = false;

    batch.items = items.map(item => {
        if (!currentAllowances) return item;
        const current = currentAllowances.get(String(item.staff_id)) || null;
        const label = current ? current.label : null;
        const amount = current ? current.amount : 0;
        if ((Number(item.allowance_amount) || 0) !== amount || (item.allowance_label || null) !== label) {
            batch.allowances_changed = true;
        }
        return { ...item, allowance_label: label, allowance_amount: amount };
    }).map(item => ({
        ...item,
        allowance_amount: Number(item.allowance_amount) || 0,
        // Tunjangan hanya dibayar jika hadir >= 1; allowance_amount = nominal snapshot.
        allowance_paid: Number(item.attendance_count) > 0 ? (Number(item.allowance_amount) || 0) : 0,
        attendance_dates: parseJsonArray(item.attendance_dates_json),
        attendance_dates_json: undefined
    }));

    return batch;
}

function normalizeDriverName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) {
        throw new Error('Nama driver wajib diisi');
    }
    if (name.length > 120) {
        throw new Error('Nama driver maksimal 120 karakter');
    }
    return name;
}

function normalizeDriverPayrollRow(row) {
    if (!row) return null;
    return {
        ...row,
        payroll_month: formatDateOnly(row.payroll_month),
        doctor_paid_amount: calculateDoctorPaidAmount(row.total_amount, row.fixed_salary)
    };
}

async function loadDriverPayroll(payrollMonth, queryable = db) {
    const [rows] = await queryable.query(
        `SELECT id, driver_name, payroll_month, calendar_days, sunday_count, working_days,
                fixed_salary, doctor_bonus, monthly_salary, absence_days, daily_deduction, deduction_amount,
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

router.get('/practice-dates', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), async (req, res) => {
    try {
        const cycle = await getCycleInfo();
        const booking = await getBookingPracticeDates(cycle);
        return res.json({
            success: true,
            data: {
                cycle_weeks: cycle.cycle_weeks,
                cycle_size: cycle.cycle_size,
                practice_days: cycle.practice_days,
                last_cycle_end: booking.last_cycle_end,
                practice_dates: booking.practice_dates,
                latest_cycle: booking.next_cycle,
                cycle_complete: booking.next_cycle.length >= cycle.cycle_size
            }
        });
    } catch (err) {
        console.error('[staff-payroll] practice dates error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat tanggal praktik' });
    }
});

router.get('/batches', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), async (req, res) => {
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

router.get('/batches/:id', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), async (req, res) => {
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

router.post('/batches', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.write'), async (req, res) => {
    let practiceDates;
    try {
        if (req.body && req.body.practice_dates) {
            practiceDates = normalizePracticeDates(req.body.practice_dates);
        } else {
            const cycle = await getCycleInfo();
            practiceDates = normalizePracticeDates((await getBookingPracticeDates(cycle)).next_cycle);
        }
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
    const userId = actorIdFrom(req);

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

        const staffRows = await loadPayrollStaff(connection);

        const [dutyRows] = await connection.query(
            `SELECT staff_id, duty_date
             FROM staff_duty_logs
             WHERE duty_date IN (${practiceDates.map(() => '?').join(', ')})`,
            practiceDates
        );

        const rates = await loadPayrollSettings(connection);
        const allowanceByStaff = new Map(
            (await loadAllowances(connection, { activeOnly: true })).map(a => [a.staff_id, a])
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
              practice_dates_json, base_rate, additional_rate,
              status, total_amount, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)`,
            [
                cycleLabel, cycleStart, cycleEnd, payrollDate, practiceDatesJson,
                rates.base_amount, rates.additional_rate, notes, userId
            ]
        );

        const batchId = batchResult.insertId;
        const items = staffRows.map(staff => {
            const attendanceDates = Array.from(attendanceMap.get(String(staff.staff_id)) || []).sort();
            const allowance = allowanceByStaff.get(String(staff.staff_id));
            const allowanceAmount = allowance ? allowance.amount : 0;
            const payroll = calculatePayroll(attendanceDates.length, 0, {
                ...rates,
                allowance_amount: allowanceAmount
            });
            return {
                staff_id: staff.staff_id,
                staff_name: staff.name,
                role_name: staff.role_name || staff.role || '',
                role_display: staff.role_display || staff.role_name || staff.role || '',
                attendance_dates: attendanceDates,
                ...payroll,
                allowance_label: allowance ? allowance.label : null,
                // Simpan nominal snapshot; dibayar hanya jika hadir >= 1 (lihat calculatePayroll).
                allowance_amount: allowanceAmount
            };
        });

        for (const item of items) {
            await connection.query(
                `INSERT INTO staff_payroll_items
                 (batch_id, staff_id, staff_name, role_name, role_display,
                  attendance_dates_json, attendance_count, base_amount,
                  additional_count, additional_amount, allowance_label, allowance_amount,
                  adjustment_amount, total_amount, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
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
                    item.allowance_label,
                    item.allowance_amount,
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

router.put('/batches/:id', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.write'), async (req, res) => {
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
        // Draft selalu memakai tunjangan aktif terbaru (tarif tetap snapshot batch).
        const allowanceByStaff = new Map(
            (await loadAllowances(connection, { activeOnly: true })).map(a => [a.staff_id, a])
        );

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
            const allowance = allowanceByStaff.get(staffId) || null;
            const allowanceAmount = allowance ? allowance.amount : 0;
            const payroll = calculatePayroll(attendanceDates.length, adjustment, {
                base_amount: batch.base_rate,
                additional_rate: batch.additional_rate,
                allowance_amount: allowanceAmount
            });
            const notes = update.notes !== undefined ? String(update.notes || '').trim() || null : existing.notes || null;

            await connection.query(
                `UPDATE staff_payroll_items
                 SET attendance_dates_json = ?, attendance_count = ?, base_amount = ?,
                     additional_count = ?, additional_amount = ?,
                     allowance_label = ?, allowance_amount = ?, adjustment_amount = ?,
                     total_amount = ?, notes = ?
                 WHERE batch_id = ? AND staff_id = ?`,
                [
                    JSON.stringify(attendanceDates),
                    payroll.attendance_count,
                    payroll.base_amount,
                    payroll.additional_count,
                    payroll.additional_amount,
                    allowance ? allowance.label : null,
                    allowanceAmount,
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

router.post('/batches/:id/finalize', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.finalize'), async (req, res) => {
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

        const finalizer = actorIdFrom(req);
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

router.delete('/batches/:id', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.delete'), async (req, res) => {
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

router.get('/driver-payrolls', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(60, Number.parseInt(req.query.limit, 10) || 24));
        const [rows] = await db.query(
            `SELECT id, driver_name, payroll_month, calendar_days, sunday_count, working_days,
                    fixed_salary, doctor_bonus, monthly_salary, absence_days, daily_deduction, deduction_amount,
                    total_amount, status, finalized_at, created_at, updated_at
             FROM staff_driver_payrolls
             ORDER BY payroll_month DESC
             LIMIT ?`,
            [limit]
        );
        return res.json({ success: true, data: rows.map(normalizeDriverPayrollRow) });
    } catch (err) {
        console.error('[staff-payroll] driver list error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat gaji driver' });
    }
});

router.put('/driver-payrolls/:month', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.write'), async (req, res) => {
    let payroll;
    let driverName;
    try {
        payroll = calculateDriverPayroll(
            req.params.month,
            req.body && req.body.absence_days,
            req.body && req.body.doctor_bonus
        );
        driverName = normalizeDriverName(req.body && req.body.driver_name);
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
                message: 'Gaji driver bulan ini sudah difinalkan dan tidak bisa diubah'
            });
        }

        if (existing) {
            await connection.query(
                `UPDATE staff_driver_payrolls
                 SET driver_name = ?, calendar_days = ?, sunday_count = ?, working_days = ?,
                     fixed_salary = ?, doctor_bonus = ?, monthly_salary = ?,
                     absence_days = ?, daily_deduction = ?, deduction_amount = ?, total_amount = ?
                 WHERE id = ?`,
                [
                    driverName,
                    payroll.calendar_days,
                    payroll.sunday_count,
                    payroll.working_days,
                    payroll.fixed_salary,
                    payroll.doctor_bonus,
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
                 (driver_name, payroll_month, calendar_days, sunday_count, working_days,
                  fixed_salary, doctor_bonus, monthly_salary,
                  absence_days, daily_deduction, deduction_amount, total_amount, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
                [
                    driverName,
                    payroll.payroll_month,
                    payroll.calendar_days,
                    payroll.sunday_count,
                    payroll.working_days,
                    payroll.fixed_salary,
                    payroll.doctor_bonus,
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
        return res.json({ success: true, message: 'Draft gaji driver berhasil disimpan', data: saved });
    } catch (err) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (_rollbackError) {}
        }
        console.error('[staff-payroll] driver save error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan gaji driver' });
    } finally {
        connection.release();
    }
});

router.patch('/driver-payrolls/:month/name', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.write'), async (req, res) => {
    let month;
    let driverName;
    try {
        month = normalizePayrollMonth(req.params.month);
        driverName = normalizeDriverName(req.body && req.body.driver_name);
    } catch (err) {
        return badRequest(res, err.message);
    }

    try {
        const [result] = await db.query(
            'UPDATE staff_driver_payrolls SET driver_name = ? WHERE payroll_month = ?',
            [driverName, `${month}-01`]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Gaji driver bulan ini belum dibuat' });
        }
        const updated = await loadDriverPayroll(month);
        return res.json({ success: true, message: 'Nama driver berhasil disimpan', data: updated });
    } catch (err) {
        console.error('[staff-payroll] driver name update error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan nama driver' });
    }
});

router.post('/driver-payrolls/:month/finalize', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.finalize'), async (req, res) => {
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
            'SELECT id, driver_name, status FROM staff_driver_payrolls WHERE payroll_month = ? FOR UPDATE',
            [`${month}-01`]
        );
        if (!rows.length) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ success: false, message: 'Draft gaji driver belum dibuat' });
        }
        if (rows[0].status === 'finalized') {
            await connection.rollback();
            transactionStarted = false;
            return res.status(409).json({ success: false, message: 'Gaji driver bulan ini sudah difinalkan' });
        }
        if (!String(rows[0].driver_name || '').trim()) {
            await connection.rollback();
            transactionStarted = false;
            return badRequest(res, 'Nama driver wajib diisi sebelum finalisasi');
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
        return res.json({ success: true, message: 'Gaji driver berhasil difinalkan', data: finalized });
    } catch (err) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (_rollbackError) {}
        }
        console.error('[staff-payroll] driver finalize error:', err);
        return res.status(500).json({ success: false, message: 'Gagal finalisasi gaji driver' });
    } finally {
        connection.release();
    }
});

router.delete('/driver-payrolls/:month', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.delete'), async (req, res) => {
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
                message: 'Draft tidak ditemukan atau gaji driver sudah difinalkan'
            });
        }
        return res.json({ success: true, message: 'Draft gaji driver berhasil dihapus' });
    } catch (err) {
        console.error('[staff-payroll] driver delete error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menghapus draft gaji driver' });
    }
});

router.get('/settings', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), async (req, res) => {
    try {
        const [rates, allowances, cycle, staffRows] = await Promise.all([
            loadPayrollSettings(),
            loadAllowances(),
            getCycleInfo(),
            loadPayrollStaff()
        ]);
        const staff = staffRows.map(row => ({
            staff_id: String(row.staff_id),
            name: row.name,
            role_display: row.role_display || row.role_name || row.role || ''
        }));
        return res.json({ success: true, data: { rates, allowances, cycle, staff } });
    } catch (err) {
        console.error('[staff-payroll] settings load error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memuat pengaturan gaji' });
    }
});

router.put('/settings', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.write'), async (req, res) => {
    let rates;
    let allowances;
    try {
        rates = normalizePayrollRates(req.body && req.body.rates);
        allowances = normalizeAllowanceInput((req.body && req.body.allowances) || []);
    } catch (err) {
        return badRequest(res, err.message);
    }

    const actorId = actorIdFrom(req);
    const connection = await db.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        await connection.query(
            `INSERT INTO staff_payroll_settings (id, base_amount, additional_rate, updated_by)
             VALUES (1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE base_amount = VALUES(base_amount),
                 additional_rate = VALUES(additional_rate), updated_by = VALUES(updated_by)`,
            [rates.base_amount, rates.additional_rate, actorId]
        );

        const staffIds = allowances.map(a => a.staff_id);
        if (staffIds.length) {
            await connection.query(
                `DELETE FROM staff_payroll_allowances WHERE staff_id NOT IN (${staffIds.map(() => '?').join(', ')})`,
                staffIds
            );
        } else {
            await connection.query('DELETE FROM staff_payroll_allowances');
        }
        for (const allowance of allowances) {
            await connection.query(
                `INSERT INTO staff_payroll_allowances (staff_id, label, amount, is_active, updated_by)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE label = VALUES(label), amount = VALUES(amount),
                     is_active = VALUES(is_active), updated_by = VALUES(updated_by)`,
                [allowance.staff_id, allowance.label, allowance.amount, allowance.is_active ? 1 : 0, actorId]
            );
        }

        await connection.commit();
        transactionStarted = false;
        const [savedRates, savedAllowances] = await Promise.all([
            loadPayrollSettings(connection),
            loadAllowances(connection)
        ]);
        return res.json({
            success: true,
            message: 'Pengaturan gaji disimpan. Berlaku untuk draft gaji berikutnya.',
            data: { rates: savedRates, allowances: savedAllowances }
        });
    } catch (err) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (_rollbackError) {}
        }
        console.error('[staff-payroll] settings save error:', err);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan gaji' });
    } finally {
        connection.release();
    }
});

router.get('/config', verifyToken, requireDoctorRoleOrAccountPermission('staff_payroll.view'), (req, res) => {
    return res.json({
        success: true,
        data: {
            staff: PAYROLL_CONFIG,
            driver: DRIVER_PAYROLL_CONFIG
        }
    });
});

module.exports = router;
