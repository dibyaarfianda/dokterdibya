'use strict';

const {
    db,
    logger,
    findRecordByMrId,
    ROLE_NAMES,
    isSuperadminRole,
    activityLogger,
    sundayClinicMedifySyncQueue,
    normalizeMrId,
    getActorFromRequest,
    getBillingSnapshot,
    getAdditionalBillingSnapshot,
    ADDITIONAL_BILLING_PAYMENT_METHODS,
    realtimeSync,
    parseJson,
    isPatientUser,
    writeBillingAudit,
    writeAdditionalBillingAudit,
    createAdditionalBillingError,
    parseAdditionalBillingId,
    normalizeAdditionalBillingText,
    normalizeAdditionalBillingItems,
    insertAdditionalBillingItems,
    getAdditionalBillingRecordForUpdate,
    loadAdditionalBillingDocument,
    parseAuditSnapshot
} = require('./shared');
const { updateQueueStatus } = require('./queue');

async function getBillingPending(req, res, next) {
    try {
        // Get recent billings that are either:
        // 1. Not yet confirmed (is_confirmed = 0)
        // 2. Confirmed but not paid (is_confirmed = 1 AND payment_status != 'paid')
        const [billings] = await db.query(
            `SELECT
                scb.id,
                scb.mr_id,
                scb.total_amount,
                scb.is_confirmed,
                scb.payment_status,
                scb.created_at,
                scr.patient_id,
                COALESCE(p.full_name, sa.patient_name, scr.mr_id) as patient_name,
                COALESCE(p.phone, sa.patient_phone) as patient_phone,
                sa.appointment_date
             FROM sunday_clinic_billings scb
             LEFT JOIN sunday_clinic_records scr ON scr.mr_id = scb.mr_id
             LEFT JOIN patients p ON p.id = scr.patient_id
             LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
             WHERE (scb.is_confirmed = 0 OR scb.payment_status != 'paid')
               AND scb.total_amount > 0
             ORDER BY scb.created_at DESC
             LIMIT 50`
        );

        res.json({
            success: true,
            billings: billings.map(b => ({
                id: b.id,
                mr_id: b.mr_id,
                patient_name: b.patient_name,
                patient_phone: b.patient_phone,
                total_amount: b.total_amount,
                is_confirmed: !!b.is_confirmed,
                payment_status: b.payment_status,
                appointment_date: b.appointment_date,
                created_at: b.created_at
            }))
        });

    } catch (error) {
        console.error('Error fetching pending billings:', error);
        next(error);
    }
}

async function getBillingByMrId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get billing record
        const [billingRows] = await db.query(
            `SELECT * FROM sunday_clinic_billings WHERE mr_id = ? ORDER BY created_at DESC LIMIT 1`,
            [normalizedMrId]
        );

        let billing = null;
        if (billingRows.length > 0) {
            const billingRow = billingRows[0];
            const [itemRows] = await db.query(
                `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ? ORDER BY id`,
                [billingRow.id]
            );
            const [[pendingPayment]] = await db.query(
                `SELECT id, payment_method, amount, expires_at
                 FROM tagihan_payments
                 WHERE billing_id = ? AND status = 'pending'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [billingRow.id]
            );

            billing = {
                ...billingRow,
                has_pending_payment: !!pendingPayment,
                pending_payment: pendingPayment || null,
                items: itemRows.map(item => ({
                    ...item,
                    item_data: parseJson(item.item_data, {})
                })),
                billing_data: parseJson(billingRow.billing_data, {}),
                change_requests: parseJson(billingRow.change_requests, [])
            };
        }

        res.json({
            success: true,
            data: billing
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        const { items = [], billingData = {} } = req.body;
        const requestedStatus = req.body.status || 'draft';
        const hasRequestedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if billing exists
            const [existingRows] = await connection.query(
                `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ?`,
                [normalizedMrId]
            );

            let billingId;
            let beforeSnapshot = null;
            let auditAction = 'billing_created';
            let statusToPersist = requestedStatus;

            if (existingRows.length > 0) {
                // Update existing billing
                const existingBilling = existingRows[0];
                billingId = existingBilling.id;
                beforeSnapshot = await getBillingSnapshot(connection, billingId);
                auditAction = 'billing_saved';
                statusToPersist = hasRequestedStatus ? requestedStatus : existingBilling.status;

                // Guard: paid billing cannot be edited
                if (existingBilling.status === 'paid') {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
                }

                // Guard: confirmed billing - block if pending payment
                if (existingBilling.status === 'confirmed') {
                    const [[pendingPay]] = await connection.query(
                        `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
                    );
                    if (pendingPay) {
                        await connection.rollback();
                        return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
                    }
                }

                // Delete existing items
                await connection.query(
                    `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ?`,
                    [billingId]
                );
            } else {
                // Create new billing (will update totals later)
                const [result] = await connection.query(
                    `INSERT INTO sunday_clinic_billings (mr_id, patient_id, subtotal, total, status, billing_data, created_at, updated_at)
                     VALUES (?, ?, 0, 0, ?, ?, NOW(), NOW())`,
                    [normalizedMrId, recordRow.patient_id, statusToPersist, JSON.stringify(billingData)]
                );
                billingId = result.insertId;
            }

            // Insert items with validated prices
            let subtotal = 0;
            for (const item of items) {
                const quantity = item.quantity || 1;
                const itemType = item.item_type || 'tindakan';
                const itemName = item.item_name || '';
                const itemCode = item.item_code || null;
                let validatedPrice = 0;

                // Validate price based on item type
                if (itemType === 'obat') {
                    // Look up obat price from database
                    let obatRow = null;

                    if (itemCode) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM obat WHERE code = ?`,
                            [itemCode]
                        );
                        if (rows.length > 0) {
                            obatRow = rows[0];
                        }
                    }

                    if (!obatRow && itemName) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                            [itemName.toLowerCase()]
                        );
                        if (rows.length > 0) {
                            obatRow = rows[0];
                        }
                    }

                    if (obatRow) {
                        validatedPrice = parseFloat(obatRow.price || 0);
                    } else {
                        logger.warn('Obat not found for billing item', { itemName, itemCode });
                    }
                } else if (itemType === 'tindakan') {
                    // Look up tindakan price from database
                    let tindakanRow = null;

                    if (itemCode) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan WHERE code = ?`,
                            [itemCode]
                        );
                        if (rows.length > 0) {
                            tindakanRow = rows[0];
                        }
                    }

                    if (!tindakanRow && itemName) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan WHERE LOWER(name) = ? LIMIT 1`,
                            [itemName.toLowerCase()]
                        );
                        if (rows.length > 0) {
                            tindakanRow = rows[0];
                        }
                    }

                    if (tindakanRow) {
                        validatedPrice = parseFloat(tindakanRow.price || 0);
                    } else {
                        logger.warn('Tindakan not found for billing item', { itemName, itemCode });
                    }
                } else if (itemType === 'admin') {
                    // Look up admin fee from tindakan table
                    const [adminRows] = await connection.query(
                        `SELECT id, code, name, price FROM tindakan
                         WHERE LOWER(category) = 'administratif'
                         OR LOWER(name) LIKE '%admin%'
                         ORDER BY id ASC LIMIT 1`,
                        []
                    );

                    if (adminRows.length > 0) {
                        validatedPrice = parseFloat(adminRows[0].price || 0);
                    } else {
                        // Fall back to default admin fee if not found in database
                        validatedPrice = 5000;
                        logger.warn('Admin fee not found in database, using default: 5000');
                    }
                }

                const itemTotal = quantity * validatedPrice;
                subtotal += itemTotal;

                await connection.query(
                    `INSERT INTO sunday_clinic_billing_items
                     (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        billingId,
                        itemType,
                        itemCode,
                        itemName,
                        quantity,
                        validatedPrice,
                        itemTotal,
                        JSON.stringify(item.item_data || {})
                    ]
                );
            }

            // Update billing totals
            const total = subtotal;
            const actorName = getActorFromRequest(req).actorName;
            await connection.query(
                `UPDATE sunday_clinic_billings
                 SET subtotal = ?, total = ?, status = ?, billing_data = ?,
                     pending_changes = FALSE,
                     last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [subtotal, total, statusToPersist, JSON.stringify(billingData), actorName, billingId]
            );

            const afterSnapshot = await getBillingSnapshot(connection, billingId);
            await writeBillingAudit(connection, req, {
                billingId,
                mrId: normalizedMrId,
                action: auditAction,
                summary: auditAction === 'billing_created'
                    ? 'Tagihan dibuat'
                    : 'Tagihan disimpan dan total diperbarui',
                beforeSnapshot,
                afterSnapshot
            });

            await connection.commit();

            res.json({
                success: true,
                message: 'Billing berhasil disimpan',
                data: {
                    billingId,
                    mrId: normalizedMrId
                }
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        logger.error('Failed to save Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrIdObat(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const items = Array.isArray(req.body.items) ? req.body.items : null;

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    if (!items) {
        return res.status(400).json({
            success: false,
            message: 'Payload items harus berupa array.'
        });
    }

    let connection;
    let medifySyncResult = null;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [billingRows] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        let billingId;
        let beforeSnapshot = null;

        if (billingRows.length === 0) {
            const [insertResult] = await connection.query(
                `INSERT INTO sunday_clinic_billings (mr_id, patient_id, subtotal, total, status, billing_data, created_at, updated_at)
                 VALUES (?, ?, 0, 0, 'draft', ?, NOW(), NOW())`,
                [normalizedMrId, recordRow.patient_id, JSON.stringify({ source: 'therapy-modal' })]
            );
            billingId = insertResult.insertId;
        } else {
            const existingBilling = billingRows[0];
            billingId = existingBilling.id;

            // Guard: paid billing cannot be edited
            if (existingBilling.status === 'paid') {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
            }

            // Guard: confirmed billing - block if pending payment
            if (existingBilling.status === 'confirmed') {
                const [[pendingPay]] = await connection.query(
                    `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
                );
                if (pendingPay) {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
                }
            }

            beforeSnapshot = await getBillingSnapshot(connection, billingId);
        }

        // NOTE: No longer deleting existing items - now APPENDING new items
        // This allows users to add medications incrementally without losing previous selections

        for (const rawItem of items) {
            const name = typeof rawItem.name === 'string' ? rawItem.name.trim() : '';
            const quantity = Number(rawItem.quantity) > 0 ? Number(rawItem.quantity) : 1;
            const unit = typeof rawItem.unit === 'string' && rawItem.unit.trim() ? rawItem.unit.trim() : 'tablet';
            const caraPakai = typeof rawItem.caraPakai === 'string' ? rawItem.caraPakai.trim() : '';
            const latinSig = typeof rawItem.latinSig === 'string' ? rawItem.latinSig.trim() : '';
            const obatId = rawItem.obatId || rawItem.id || null;

            let obatRow = null;

            if (obatId) {
                const [rows] = await connection.query(
                    `SELECT id, code, name, price FROM obat WHERE id = ?`,
                    [obatId]
                );
                if (rows.length > 0) {
                    obatRow = rows[0];
                }
            }

            if (!obatRow && name) {
                const [rows] = await connection.query(
                    `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                    [name.toLowerCase()]
                );
                if (rows.length > 0) {
                    obatRow = rows[0];
                }
            }

            if (!obatRow) {
                throw new Error(`Obat tidak ditemukan: ${name || obatId || 'tanpa nama'}`);
            }

            const price = parseFloat(obatRow.price || 0);
            const total = price * quantity;

            await connection.query(
                `INSERT INTO sunday_clinic_billing_items
                 (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                 VALUES (?, 'obat', ?, ?, ?, ?, ?, ?)` ,
                [
                    billingId,
                    obatRow.code || null,
                    obatRow.name,
                    quantity,
                    price,
                    total,
                    JSON.stringify({
                        caraPakai,
                        latinSig,
                        unit,
                        obatId: obatRow.id,
                        source: 'therapy-modal'
                    })
                ]
            );
        }

        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?, pending_changes = FALSE,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [
                totals.subtotal,
                totals.subtotal,
                req.user.name || req.user.id || 'Staff',
                billingId
            ]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_added',
            summary: `${items.length} item obat ditambahkan ke tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();

        if (recordRow.visit_location === 'rsia_melinda') {
            try {
                medifySyncResult = await sundayClinicMedifySyncQueue.enqueueTerapi({
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    visitLocation: recordRow.visit_location,
                    therapyItems: items,
                    eventAt: new Date().toISOString(),
                    createdBy: req.user?.name || req.user?.id || null
                });
            } catch (syncError) {
                logger.warn('Failed to enqueue terapi sync to Medify', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    error: syncError.message
                });
            }
        }

        const responsePayload = {
            success: true,
            message: 'Daftar obat berhasil diperbarui',
            data: {
                mrId: normalizedMrId,
                billingId,
                subtotal: totals.subtotal
            }
        };

        if (medifySyncResult) {
            responsePayload.sync = medifySyncResult;
        }

        res.json(responsePayload);
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback obat update', { error: rollbackError.message });
            }
        }

        logger.error('Failed to update obat items for Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function postBillingByMrIdConfirm(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let connection;

    try {
        // Block patient users from confirming
        if (isPatientUser(req)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing ID first
        const [[billing]] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (!billing) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Billing sudah dibayar'
            });
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billing.id);
        const staffName = getActorFromRequest(req).actorName;

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET status = 'confirmed',
                 confirmed_at = NOW(),
                 confirmed_by = ?,
                 pending_changes = FALSE,
                 last_modified_by = ?,
                 last_modified_at = NOW(),
                 updated_at = NOW()
             WHERE mr_id = ?`,
            [staffName, staffName, normalizedMrId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billing.id);
        await writeBillingAudit(connection, req, {
            billingId: billing.id,
            mrId: normalizedMrId,
            action: 'billing_confirmed',
            summary: 'Tagihan dikonfirmasi',
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();
        connection.release();
        connection = null;

        // NOTE: Stock deduction moved to payment completion endpoint
        // Stock will be deducted when billing is marked as 'paid'

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';

        // Broadcast notification to all connected clients
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'billing_confirmed',
                mrId: normalizedMrId,
                patientName,
                doctorName: staffName,
                timestamp: new Date().toISOString()
            });
        }

        // Log activity
        await activityLogger.logFromRequest(req, 'Confirm Billing',
            `Confirmed billing for ${patientName} (MR: ${normalizedMrId}) by ${staffName}`);

        res.json({
            success: true,
            message: 'Billing berhasil dikonfirmasi',
            patientName
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback billing confirmation', { error: rollbackError.message });
            }
        }
        logger.error('Failed to confirm billing', { error: error.message });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function postBillingByMrIdMarkPaid(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { payment_method, notes } = req.body;
    let lockName = null;
    let lockAcquired = false;

    try {
        // Get current billing
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        // Prevent concurrent duplicate processing for the same billing.
        lockName = `sunday_mark_paid_${billing.id}`;
        const [[lockRow]] = await db.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
        lockAcquired = Number(lockRow?.acquired || 0) === 1;
        if (!lockAcquired) {
            return res.status(409).json({
                success: false,
                message: 'Billing sedang diproses oleh request lain. Silakan coba lagi.'
            });
        }

        // Re-check billing after lock to avoid stale state race.
        const [[billingLocked]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billingLocked) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        if (billingLocked.status === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Billing sudah dibayar'
            });
        }

        if (billingLocked.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Billing harus dikonfirmasi terlebih dahulu sebelum pembayaran'
            });
        }

        const beforeSnapshot = await getBillingSnapshot(db, billingLocked.id);

        const InventoryService = require('../InventoryService');

        // Get all obat items from billing and validate mapping first.
        // If mapping or stock is invalid, do not allow billing to be marked paid.
        const [obatItemsRaw] = await db.query(
            `SELECT bi.item_code, bi.item_name, bi.quantity,
                    COALESCE(
                        NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(bi.item_data, '$.obatId')) AS UNSIGNED), 0),
                        (SELECT o.id FROM obat o WHERE bi.item_code IS NOT NULL AND o.code = bi.item_code LIMIT 1),
                        (SELECT o.id FROM obat o WHERE bi.item_code REGEXP '^[0-9]+$' AND o.id = CAST(bi.item_code AS UNSIGNED) LIMIT 1),
                        (SELECT o.id FROM obat o WHERE LOWER(TRIM(o.name)) = LOWER(TRIM(bi.item_name)) ORDER BY o.is_active DESC, o.id ASC LIMIT 1)
                    ) AS obat_id
             FROM sunday_clinic_billing_items bi
             WHERE bi.billing_id = ? AND bi.item_type = 'obat'`,
            [billingLocked.id]
        );

        const invalidObatItems = obatItemsRaw.filter(item => !item.obat_id);
        if (invalidObatItems.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Data obat tidak valid: ${invalidObatItems.map(i => i.item_name || i.item_code || 'tanpa nama').join(', ')}. Simpan ulang item obat sebelum menandai lunas.`
            });
        }

        // Aggregate required qty per obat and pre-check stock availability.
        const requiredByObatId = new Map();
        for (const item of obatItemsRaw) {
            const obatId = Number(item.obat_id);
            const qty = parseInt(item.quantity, 10) || 0;
            requiredByObatId.set(obatId, (requiredByObatId.get(obatId) || 0) + qty);
        }

        if (requiredByObatId.size > 0) {
            const obatIds = Array.from(requiredByObatId.keys());
            const placeholders = obatIds.map(() => '?').join(',');
            const [stocks] = await db.query(
                `SELECT id, name, stock FROM obat WHERE id IN (${placeholders})`,
                obatIds
            );

            const [existingDeductionRows] = await db.query(
                `SELECT obat_id, ABS(SUM(quantity)) AS deducted_qty
                 FROM stock_movements
                 WHERE reference_type = 'sunday_clinic_billing'
                   AND reference_id = ?
                   AND movement_type = 'sale'
                   AND obat_id IN (${placeholders})
                 GROUP BY obat_id`,
                [billingLocked.id, ...obatIds]
            );
            const deductedMap = new Map(existingDeductionRows.map(row => [Number(row.obat_id), Number(row.deducted_qty || 0)]));

            const stockMap = new Map(stocks.map(row => [Number(row.id), row]));
            const insufficient = [];

            for (const obatId of obatIds) {
                const requiredQty = requiredByObatId.get(obatId) || 0;
                const alreadyDeducted = deductedMap.get(obatId) || 0;
                const remainingRequired = Math.max(0, requiredQty - alreadyDeducted);
                const row = stockMap.get(obatId);
                const available = row ? Number(row.stock) : 0;
                if (!row || available < remainingRequired) {
                    insufficient.push({
                        obatId,
                        name: row?.name || `Obat ID ${obatId}`,
                        required: remainingRequired,
                        alreadyDeducted,
                        available
                    });
                }
            }

            if (insufficient.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Stok tidak cukup untuk: ${insufficient.map(i => `${i.name} (butuh ${i.required}, tersedia ${i.available})`).join('; ')}`,
                    insufficient
                });
            }
        }

        // Deduct stock for each obat using FIFO.
        // If any deduction fails, abort and keep billing in confirmed status.
        for (const item of obatItemsRaw) {
            try {
                const requiredQty = parseInt(item.quantity, 10) || 0;

                const [[existingDeduction]] = await db.query(
                    `SELECT ABS(COALESCE(SUM(quantity), 0)) AS deducted_qty
                     FROM stock_movements
                     WHERE reference_type = 'sunday_clinic_billing'
                       AND reference_id = ?
                       AND movement_type = 'sale'
                       AND obat_id = ?`,
                    [billingLocked.id, Number(item.obat_id)]
                );

                const alreadyDeducted = Number(existingDeduction?.deducted_qty || 0);
                const remainingQty = Math.max(0, requiredQty - alreadyDeducted);

                if (remainingQty <= 0) {
                    logger.info(`Skip stock deduction for ${item.item_name} because it is already fully deducted`, {
                        mrId: normalizedMrId,
                        billingId: billingLocked.id,
                        obatId: Number(item.obat_id),
                        requiredQty,
                        alreadyDeducted
                    });
                    continue;
                }

                await InventoryService.deductStockFIFO(
                    Number(item.obat_id),
                    remainingQty,
                    'sunday_clinic_billing',
                    billingLocked.id,
                    req.user?.name || 'system'
                );
                logger.info(`Stock deducted for ${item.item_name}: ${remainingQty} units`);
            } catch (stockError) {
                logger.error(`Stock deduction failed for obat ${item.obat_id} (${item.item_name})`, {
                    mrId: normalizedMrId,
                    billingId: billingLocked.id,
                    error: stockError.message
                });
                return res.status(500).json({
                    success: false,
                    message: `Gagal mengurangi stok untuk ${item.item_name}: ${stockError.message}`
                });
            }
        }

        // Update status to paid only after stock deduction succeeds.
        const paidBy = req.user.name || req.user.id || 'Staff';
        await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'paid',
                 paid_at = NOW(),
                 paid_by = ?,
                 last_modified_by = ?,
                 last_modified_at = NOW()
              WHERE mr_id = ?`,
            [paidBy, paidBy, normalizedMrId]
        );

        const afterSnapshot = await getBillingSnapshot(db, billingLocked.id);
        await writeBillingAudit(db, req, {
            billingId: billingLocked.id,
            mrId: normalizedMrId,
            action: 'billing_marked_paid',
            summary: `Tagihan ditandai lunas (${payment_method || 'metode tidak dicatat'})`,
            beforeSnapshot,
            afterSnapshot
        });

        // Auto-finalize the medical record when billing is paid
        try {
            const userId = req.user.new_id || req.user.id || null;
            await db.query(
                `UPDATE sunday_clinic_records
                 SET status = 'finalized',
                     finalized_at = NOW(),
                     finalized_by = ?
                 WHERE mr_id = ? AND status = 'draft'`,
                [userId, normalizedMrId]
            );
            logger.info(`Medical record ${normalizedMrId} auto-finalized after payment by user ${userId}`);
        } catch (finalizeError) {
            logger.error('Auto-finalize error:', finalizeError);
            // Don't fail the payment, just log the error
        }

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';

        // Broadcast notification
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'billing_paid',
                mrId: normalizedMrId,
                patientName,
                paidBy: req.user.name || req.user.id || 'Staff',
                timestamp: new Date().toISOString()
            });
        }

        // Update queue status to lunas (klinik_private only - billing only exists for klinik_private)
        await updateQueueStatus(normalizedMrId, 'lunas');

        // Log activity
        await activityLogger.logFromRequest(req, activityLogger.ACTIONS.FINALIZE_VISIT,
            `Marked billing paid for ${patientName} (MR: ${normalizedMrId}), Total: Rp ${billingLocked.total}`);

        res.json({
            success: true,
            message: 'Pembayaran berhasil dicatat.',
            patientName
        });
    } catch (error) {
        logger.error('Failed to mark billing as paid', { error: error.message });
        next(error);
    } finally {
        if (lockAcquired && lockName) {
            try {
                await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
            } catch (releaseError) {
                logger.error('Failed to release mark-paid lock', {
                    mrId: normalizedMrId,
                    lockName,
                    error: releaseError.message
                });
            }
        }
    }
}

async function postBillingByMrIdRequestRevision(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { message, requestedBy } = req.body;

    try {
        // Insert revision request
        const [result] = await db.query(
            `INSERT INTO sunday_clinic_billing_revisions (mr_id, message, requested_by, created_at)
             VALUES (?, ?, ?, NOW())`,
            [normalizedMrId, message, requestedBy || req.user.name]
        );

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';

        // Broadcast notification to dokter
        logger.info('About to broadcast revision_requested', {
            hasRealtimeSync: !!realtimeSync,
            hasBroadcast: !!(realtimeSync && realtimeSync.broadcast),
            mrId: normalizedMrId,
            revisionId: result.insertId
        });

        if (realtimeSync && realtimeSync.broadcast) {
            const broadcastResult = realtimeSync.broadcast({
                type: 'revision_requested',
                mrId: normalizedMrId,
                patientName,
                message,
                requestedBy: requestedBy || req.user.name,
                revisionId: result.insertId,
                timestamp: new Date().toISOString()
            });
            logger.info('Broadcast result:', { success: broadcastResult });
        } else {
            logger.warn('realtimeSync not available for broadcasting');
        }

        res.json({
            success: true,
            message: 'Usulan revisi berhasil dikirim',
            revisionId: result.insertId
        });
    } catch (error) {
        logger.error('Failed to request revision', { error: error.message });
        next(error);
    }
}

async function getBillingRevisionsPending(req, res, next) {
    try {
        const [revisions] = await db.query(
            `SELECT r.*, p.full_name as patient_name
             FROM sunday_clinic_billing_revisions r
             JOIN sunday_clinic_records rec ON r.mr_id = rec.mr_id
             JOIN patients p ON rec.patient_id = p.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC`
        );

        res.json({
            success: true,
            data: revisions
        });
    } catch (error) {
        logger.error('Failed to get revisions', { error: error.message });
        next(error);
    }
}

async function postBillingRevisionsByIdApprove(req, res, next) {
    const revisionId = req.params.id;

    try {
        const isDokter = req.user.role === ROLE_NAMES.DOKTER || req.user.is_superadmin || isSuperadminRole(req.user.role_id);

        if (!isDokter) {
            return res.status(403).json({
                success: false,
                message: 'Hanya dokter yang dapat menyetujui usulan'
            });
        }

        // Get revision details
        const [[revision]] = await db.query(
            'SELECT * FROM sunday_clinic_billing_revisions WHERE id = ?',
            [revisionId]
        );

        if (!revision) {
            return res.status(404).json({
                success: false,
                message: 'Usulan tidak ditemukan'
            });
        }

        // Update revision status and revert billing to draft
        await db.query(
            `UPDATE sunday_clinic_billing_revisions SET status = 'approved' WHERE id = ?`,
            [revisionId]
        );

        await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL
             WHERE mr_id = ?`,
            [revision.mr_id]
        );

        res.json({
            success: true,
            message: 'Usulan disetujui. Billing dikembalikan ke draft',
            mrId: revision.mr_id
        });
    } catch (error) {
        logger.error('Failed to approve revision', { error: error.message });
        next(error);
    }
}

async function postBillingByMrIdPrintEtiket(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const pdfGenerator = require('../../utils/pdf-generator');

        // Get billing data
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing || !['confirmed', 'paid'].includes(billing.status)) {
            return res.status(400).json({
                success: false,
                message: 'Billing belum dikonfirmasi atau dibayar'
            });
        }

        // Get billing items from sunday_clinic_billing_items
        const [items] = await db.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        // Parse item_data JSON for each item
        billing.items = items.map(item => ({
            ...item,
            item_data: typeof item.item_data === 'string' ? JSON.parse(item.item_data || '{}') : (item.item_data || {})
        }));

        // Get patient and record data
        const [[record]] = await db.query(
            `SELECT r.*, p.full_name, p.birth_date, p.phone
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const result = await pdfGenerator.generateEtiket(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            { mrId: normalizedMrId }
        );

        // Update printed status and store R2 key
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?, etiket_url = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id, result.r2Key, normalizedMrId]
        );

        // Get signed URL for download (valid for 1 hour)
        const r2Storage = require('../r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);

        // Return JSON with download URL (frontend will handle the download)
        res.json({
            success: true,
            downloadUrl: signedUrl,
            filename: result.filename
        });
    } catch (error) {
        logger.error('Failed to print etiket', { error: error.message });
        next(error);
    }
}

async function postBillingByMrIdPrintInvoice(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const pdfGenerator = require('../../utils/pdf-generator');

        // Get billing data
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing || !['confirmed', 'paid'].includes(billing.status)) {
            return res.status(400).json({
                success: false,
                message: 'Billing belum dikonfirmasi atau dibayar'
            });
        }

        // Get billing items from sunday_clinic_billing_items
        const [items] = await db.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        // Parse item_data JSON for each item
        billing.items = items.map(item => ({
            ...item,
            item_data: typeof item.item_data === 'string' ? JSON.parse(item.item_data || '{}') : (item.item_data || {})
        }));

        // Get patient and record data
        const [[record]] = await db.query(
            `SELECT r.*, p.full_name, p.birth_date, p.phone
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const result = await pdfGenerator.generateInvoice(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            { mrId: normalizedMrId }
        );

        // Update printed status and store R2 key
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?, invoice_url = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id, result.r2Key, normalizedMrId]
        );

        // Get signed URL for download (valid for 1 hour)
        const r2Storage = require('../r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);

        // Log activity
        await activityLogger.logFromRequest(req, 'Print Invoice',
            `Printed invoice for MR: ${normalizedMrId}`);

        // Return JSON with download URL (frontend will handle the download)
        res.json({
            success: true,
            downloadUrl: signedUrl,
            filename: result.filename
        });
    } catch (error) {
        logger.error('Failed to print invoice', { error: error.message });
        next(error);
    }
}

async function getBillingByMrIdAdditional(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat mengakses tagihan tambahan.' });
    }

    try {
        const [[parentBilling]] = await db.query(
            'SELECT id FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );
        if (!parentBilling) {
            return res.status(404).json({ success: false, message: 'Tagihan utama tidak ditemukan.' });
        }

        const [rows] = await db.query(
            `SELECT id
             FROM sunday_clinic_additional_billings
             WHERE parent_billing_id = ?
             ORDER BY sequence_number DESC, id DESC`,
            [parentBilling.id]
        );

        const snapshots = await Promise.all(
            rows.map(row => getAdditionalBillingSnapshot(db, row.id))
        );
        const additionalBillings = snapshots
            .filter(Boolean)
            .map(snapshot => ({ ...snapshot.billing, items: snapshot.items }));

        res.json({ success: true, data: additionalBillings });
    } catch (error) {
        logger.error('Failed to load Sunday Clinic additional billings', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrIdAdditional(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let connection;
    let transactionStarted = false;

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat membuat tagihan tambahan.' });
    }

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const [[parentBilling]] = await connection.query(
            `SELECT id, patient_id, status
             FROM sunday_clinic_billings
             WHERE mr_id = ?
             FOR UPDATE`,
            [normalizedMrId]
        );
        if (!parentBilling) {
            throw createAdditionalBillingError('Tagihan utama tidak ditemukan.', 404);
        }
        if (parentBilling.status !== 'paid') {
            throw createAdditionalBillingError('Tagihan tambahan hanya dapat dibuat setelah tagihan utama lunas.');
        }

        const items = await normalizeAdditionalBillingItems(connection, req.body.items);
        const [[sequenceRow]] = await connection.query(
            `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
             FROM sunday_clinic_additional_billings
             WHERE parent_billing_id = ?`,
            [parentBilling.id]
        );
        const sequenceNumber = Number(sequenceRow.next_sequence || 1);
        const referenceNumber = `${normalizedMrId}-T${String(sequenceNumber).padStart(2, '0')}`;
        const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
        const actor = getActorFromRequest(req);

        const [insertResult] = await connection.query(
            `INSERT INTO sunday_clinic_additional_billings
             (parent_billing_id, mr_id, patient_id, sequence_number, reference_number,
              subtotal, total, status, created_by, last_modified_by, last_modified_at, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NOW(), ?)`,
            [
                parentBilling.id,
                normalizedMrId,
                parentBilling.patient_id,
                sequenceNumber,
                referenceNumber,
                total,
                total,
                actor.actorName,
                actor.actorName,
                JSON.stringify({ source: 'staff-panel' })
            ]
        );

        await insertAdditionalBillingItems(connection, insertResult.insertId, items);
        const afterSnapshot = await getAdditionalBillingSnapshot(connection, insertResult.insertId);
        await writeAdditionalBillingAudit(connection, req, {
            additionalBillingId: insertResult.insertId,
            mrId: normalizedMrId,
            action: 'additional_billing_created',
            summary: `Tagihan tambahan ${referenceNumber} dibuat dengan ${items.length} item.`,
            beforeSnapshot: null,
            afterSnapshot
        });

        await connection.commit();
        transactionStarted = false;

        res.status(201).json({
            success: true,
            message: 'Tagihan tambahan berhasil dibuat sebagai draft.',
            data: { ...afterSnapshot.billing, items: afterSnapshot.items }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback additional billing creation', { error: rollbackError.message });
            }
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to create Sunday Clinic additional billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function putBillingByMrIdAdditionalByAdditionalBillingId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let connection;
    let transactionStarted = false;

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat mengubah tagihan tambahan.' });
    }

    try {
        const additionalBillingId = parseAdditionalBillingId(req.params.additionalBillingId);
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const additionalBilling = await getAdditionalBillingRecordForUpdate(
            connection,
            normalizedMrId,
            additionalBillingId
        );
        if (additionalBilling.status !== 'draft') {
            throw createAdditionalBillingError('Hanya tagihan tambahan draft yang dapat diubah.');
        }

        const beforeSnapshot = await getAdditionalBillingSnapshot(connection, additionalBillingId);
        const items = await normalizeAdditionalBillingItems(connection, req.body.items);
        const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

        await connection.query(
            'DELETE FROM sunday_clinic_additional_billing_items WHERE additional_billing_id = ?',
            [additionalBillingId]
        );
        await insertAdditionalBillingItems(connection, additionalBillingId, items);

        const actor = getActorFromRequest(req);
        await connection.query(
            `UPDATE sunday_clinic_additional_billings
             SET subtotal = ?, total = ?, last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [total, total, actor.actorName, additionalBillingId]
        );

        const afterSnapshot = await getAdditionalBillingSnapshot(connection, additionalBillingId);
        await writeAdditionalBillingAudit(connection, req, {
            additionalBillingId,
            mrId: normalizedMrId,
            action: 'additional_billing_updated',
            summary: `Tagihan tambahan ${additionalBilling.reference_number} diperbarui.`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();
        transactionStarted = false;

        res.json({
            success: true,
            message: 'Tagihan tambahan draft berhasil diperbarui.',
            data: { ...afterSnapshot.billing, items: afterSnapshot.items }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback additional billing update', { error: rollbackError.message });
            }
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to update Sunday Clinic additional billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function postBillingByMrIdAdditionalByAdditionalBillingIdConfirm(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let connection;
    let transactionStarted = false;

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat mengonfirmasi tagihan tambahan.' });
    }

    try {
        const additionalBillingId = parseAdditionalBillingId(req.params.additionalBillingId);
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const additionalBilling = await getAdditionalBillingRecordForUpdate(
            connection,
            normalizedMrId,
            additionalBillingId
        );
        if (additionalBilling.status !== 'draft') {
            throw createAdditionalBillingError('Tagihan tambahan ini bukan draft.');
        }

        const [[itemCount]] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM sunday_clinic_additional_billing_items
             WHERE additional_billing_id = ?`,
            [additionalBillingId]
        );
        if (!Number(itemCount.count || 0)) {
            throw createAdditionalBillingError('Tagihan tambahan harus berisi minimal satu item.');
        }

        const beforeSnapshot = await getAdditionalBillingSnapshot(connection, additionalBillingId);
        const actor = getActorFromRequest(req);
        await connection.query(
            `UPDATE sunday_clinic_additional_billings
             SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [actor.actorName, actor.actorName, additionalBillingId]
        );

        const afterSnapshot = await getAdditionalBillingSnapshot(connection, additionalBillingId);
        await writeAdditionalBillingAudit(connection, req, {
            additionalBillingId,
            mrId: normalizedMrId,
            action: 'additional_billing_confirmed',
            summary: `Tagihan tambahan ${additionalBilling.reference_number} dikonfirmasi.`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();
        transactionStarted = false;

        res.json({
            success: true,
            message: 'Tagihan tambahan berhasil dikonfirmasi.',
            data: { ...afterSnapshot.billing, items: afterSnapshot.items }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback additional billing confirmation', { error: rollbackError.message });
            }
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to confirm Sunday Clinic additional billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let lockName = null;
    let lockAcquired = false;

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat menandai tagihan tambahan lunas.' });
    }

    try {
        const additionalBillingId = parseAdditionalBillingId(req.params.additionalBillingId);
        const paymentMethod = typeof req.body.payment_method === 'string'
            ? req.body.payment_method.trim().toLowerCase()
            : '';
        if (!ADDITIONAL_BILLING_PAYMENT_METHODS.has(paymentMethod)) {
            throw createAdditionalBillingError('Metode pembayaran tagihan tambahan harus tunai, debit, atau transfer.');
        }
        const paymentNotes = normalizeAdditionalBillingText(req.body.notes, 'Catatan pembayaran', 2000);

        const [[existingBilling]] = await db.query(
            `SELECT id
             FROM sunday_clinic_additional_billings
             WHERE id = ? AND mr_id = ?`,
            [additionalBillingId, normalizedMrId]
        );
        if (!existingBilling) {
            throw createAdditionalBillingError('Tagihan tambahan tidak ditemukan.', 404);
        }

        lockName = `sunday_additional_mark_paid_${additionalBillingId}`;
        const [[lockRow]] = await db.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
        lockAcquired = Number(lockRow?.acquired || 0) === 1;
        if (!lockAcquired) {
            return res.status(409).json({
                success: false,
                message: 'Tagihan tambahan sedang diproses oleh request lain. Silakan coba lagi.'
            });
        }

        const [[additionalBilling]] = await db.query(
            `SELECT ab.*, parent.status AS parent_billing_status
             FROM sunday_clinic_additional_billings ab
             JOIN sunday_clinic_billings parent ON parent.id = ab.parent_billing_id
             WHERE ab.id = ? AND ab.mr_id = ?`,
            [additionalBillingId, normalizedMrId]
        );
        if (!additionalBilling) {
            throw createAdditionalBillingError('Tagihan tambahan tidak ditemukan.', 404);
        }
        if (additionalBilling.parent_billing_status !== 'paid') {
            throw createAdditionalBillingError('Tagihan utama harus lunas sebelum pembayaran tambahan dicatat.');
        }
        if (additionalBilling.status === 'paid') {
            throw createAdditionalBillingError('Tagihan tambahan sudah dibayar.');
        }
        if (additionalBilling.status !== 'confirmed') {
            throw createAdditionalBillingError('Tagihan tambahan harus dikonfirmasi sebelum pembayaran.');
        }

        const beforeSnapshot = await getAdditionalBillingSnapshot(db, additionalBillingId);
        const [obatItems] = await db.query(
            `SELECT abi.item_code, abi.item_name, abi.quantity,
                    COALESCE(
                        NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(abi.item_data, '$.obatId')) AS UNSIGNED), 0),
                        (SELECT o.id FROM obat o WHERE abi.item_code IS NOT NULL AND o.code = abi.item_code LIMIT 1),
                        (SELECT o.id FROM obat o WHERE LOWER(TRIM(o.name)) = LOWER(TRIM(abi.item_name)) ORDER BY o.is_active DESC, o.id ASC LIMIT 1)
                    ) AS obat_id
             FROM sunday_clinic_additional_billing_items abi
             WHERE abi.additional_billing_id = ? AND abi.item_type = 'obat'`,
            [additionalBillingId]
        );

        const invalidObatItems = obatItems.filter(item => !item.obat_id);
        if (invalidObatItems.length > 0) {
            throw createAdditionalBillingError(
                `Data obat tidak valid: ${invalidObatItems.map(item => item.item_name || item.item_code || 'tanpa nama').join(', ')}.`
            );
        }

        const requiredByObatId = new Map();
        for (const item of obatItems) {
            const obatId = Number(item.obat_id);
            const quantity = Number(item.quantity || 0);
            requiredByObatId.set(obatId, (requiredByObatId.get(obatId) || 0) + quantity);
        }

        if (requiredByObatId.size > 0) {
            const obatIds = Array.from(requiredByObatId.keys());
            const placeholders = obatIds.map(() => '?').join(',');
            const [stocks] = await db.query(
                `SELECT id, name, stock FROM obat WHERE id IN (${placeholders})`,
                obatIds
            );
            const [deductionRows] = await db.query(
                `SELECT obat_id, ABS(SUM(quantity)) AS deducted_qty
                 FROM stock_movements
                 WHERE reference_type = 'sunday_clinic_additional_billing'
                   AND reference_id = ?
                   AND movement_type = 'sale'
                   AND obat_id IN (${placeholders})
                 GROUP BY obat_id`,
                [additionalBillingId, ...obatIds]
            );
            const stockByObatId = new Map(stocks.map(row => [Number(row.id), row]));
            const deductedByObatId = new Map(
                deductionRows.map(row => [Number(row.obat_id), Number(row.deducted_qty || 0)])
            );
            const insufficient = [];

            for (const obatId of obatIds) {
                const row = stockByObatId.get(obatId);
                const requiredQuantity = requiredByObatId.get(obatId) || 0;
                const alreadyDeducted = deductedByObatId.get(obatId) || 0;
                const remainingQuantity = Math.max(0, requiredQuantity - alreadyDeducted);
                const available = Number(row?.stock || 0);
                if (!row || available < remainingQuantity) {
                    insufficient.push({
                        obatId,
                        name: row?.name || `Obat ID ${obatId}`,
                        required: remainingQuantity,
                        available
                    });
                }
            }

            if (insufficient.length > 0) {
                throw createAdditionalBillingError(
                    `Stok tidak cukup untuk: ${insufficient.map(item => `${item.name} (butuh ${item.required}, tersedia ${item.available})`).join('; ')}`
                );
            }

            const InventoryService = require('../InventoryService');
            for (const obatId of obatIds) {
                const requiredQuantity = requiredByObatId.get(obatId) || 0;
                const alreadyDeducted = deductedByObatId.get(obatId) || 0;
                const remainingQuantity = Math.max(0, requiredQuantity - alreadyDeducted);
                if (!remainingQuantity) {
                    continue;
                }

                await InventoryService.deductStockFIFO(
                    obatId,
                    remainingQuantity,
                    'sunday_clinic_additional_billing',
                    additionalBillingId,
                    req.user?.name || req.user?.id || 'system'
                );
            }
        }

        const actor = getActorFromRequest(req);
        const [updateResult] = await db.query(
            `UPDATE sunday_clinic_additional_billings
             SET status = 'paid', payment_method = ?, payment_notes = ?, paid_at = NOW(), paid_by = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ? AND status = 'confirmed'`,
            [paymentMethod, paymentNotes || null, actor.actorName, actor.actorName, additionalBillingId]
        );
        if (!updateResult.affectedRows) {
            throw createAdditionalBillingError('Status tagihan tambahan berubah. Muat ulang halaman dan coba lagi.', 409);
        }

        const afterSnapshot = await getAdditionalBillingSnapshot(db, additionalBillingId);
        await writeAdditionalBillingAudit(db, req, {
            additionalBillingId,
            mrId: normalizedMrId,
            action: 'additional_billing_marked_paid',
            summary: `Tagihan tambahan ${additionalBilling.reference_number} ditandai lunas (${paymentMethod}).`,
            beforeSnapshot,
            afterSnapshot
        });

        await activityLogger.logFromRequest(
            req,
            'Additional Billing Paid',
            `Marked additional billing ${additionalBilling.reference_number} paid for MR: ${normalizedMrId}`
        );

        res.json({
            success: true,
            message: 'Pembayaran tagihan tambahan berhasil dicatat.',
            data: { ...afterSnapshot.billing, items: afterSnapshot.items }
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to mark Sunday Clinic additional billing as paid', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (lockAcquired && lockName) {
            try {
                await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
            } catch (releaseError) {
                logger.error('Failed to release additional billing payment lock', {
                    mrId: normalizedMrId,
                    lockName,
                    error: releaseError.message
                });
            }
        }
    }
}

async function postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat mencetak tagihan tambahan.' });
    }

    try {
        const additionalBillingId = parseAdditionalBillingId(req.params.additionalBillingId);
        const { billing, record } = await loadAdditionalBillingDocument(normalizedMrId, additionalBillingId);
        const pdfGenerator = require('../../utils/pdf-generator');
        const result = await pdfGenerator.generateInvoice(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            {
                mrId: normalizedMrId,
                invoiceReference: billing.reference_number,
                invoiceTitle: 'Invoice Tagihan Tambahan'
            }
        );

        const actor = getActorFromRequest(req);
        await db.query(
            `UPDATE sunday_clinic_additional_billings
             SET invoice_printed_at = NOW(), invoice_printed_by = ?, invoice_url = ?
             WHERE id = ?`,
            [actor.actorName, result.r2Key, additionalBillingId]
        );

        const r2Storage = require('../r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);
        await activityLogger.logFromRequest(
            req,
            'Print Additional Billing Invoice',
            `Printed additional billing invoice ${billing.reference_number} for MR: ${normalizedMrId}`
        );

        res.json({ success: true, downloadUrl: signedUrl, filename: result.filename });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to print Sunday Clinic additional billing invoice', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid.' });
    }
    if (isPatientUser(req)) {
        return res.status(403).json({ success: false, message: 'Pasien tidak dapat mencetak etiket tagihan tambahan.' });
    }

    try {
        const additionalBillingId = parseAdditionalBillingId(req.params.additionalBillingId);
        const { billing, record } = await loadAdditionalBillingDocument(normalizedMrId, additionalBillingId);
        if (!billing.items.some(item => item.item_type === 'obat' && Number(item.quantity) > 0)) {
            throw createAdditionalBillingError('Tagihan tambahan ini tidak memiliki item obat untuk dicetak etikelnya.');
        }

        const pdfGenerator = require('../../utils/pdf-generator');
        const result = await pdfGenerator.generateEtiket(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            { mrId: normalizedMrId, invoiceReference: billing.reference_number }
        );

        const actor = getActorFromRequest(req);
        await db.query(
            `UPDATE sunday_clinic_additional_billings
             SET etiket_printed_at = NOW(), etiket_printed_by = ?, etiket_url = ?
             WHERE id = ?`,
            [actor.actorName, result.r2Key, additionalBillingId]
        );

        const r2Storage = require('../r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);
        await activityLogger.logFromRequest(
            req,
            'Print Additional Billing Etiket',
            `Printed additional billing etiket ${billing.reference_number} for MR: ${normalizedMrId}`
        );

        res.json({ success: true, downloadUrl: signedUrl, filename: result.filename });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('Failed to print Sunday Clinic additional billing etiket', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrIdPrint(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        res.json({
            success: true,
            message: 'Invoice berhasil dicetak',
            cashierName: req.user.name || req.user.id || 'Staff'
        });
    } catch (error) {
        logger.error('Failed to record print', { error: error.message });
        next(error);
    }
}

async function deleteBillingByMrIdItemsByItemType(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemType = req.params.itemType;

    // Validate item type
    if (!['tindakan', 'obat', 'admin'].includes(itemType)) {
        return res.status(400).json({
            success: false,
            message: 'Tipe item tidak valid. Gunakan: tindakan, obat, atau admin'
        });
    }

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record
        const [billingRows] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan. Tidak ada ${itemType} untuk dihapus.`
            });
        }

        const billing = billingRows[0];
        const billingId = billing.id;

        // Paid billing cannot be edited
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
        }

        // Block edit if pending payment exists
        if (billing.status === 'confirmed') {
            const [[pendingPay]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
            );
            if (pendingPay) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
            }
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billingId);

        // Delete items of specified type
        const [deleteResult] = await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_type = ?`,
            [billingId, itemType]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billingId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `${deleteResult.affectedRows || 0} item ${itemType} dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();

        res.json({
            success: true,
            message: `Semua ${itemType} berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId,
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing items by type', {
            mrId: normalizedMrId,
            itemType,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function deleteBillingByMrIdItemsCodeByCode(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemCode = req.params.code;

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record
        const [billingRows] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan.`
            });
        }

        const billing = billingRows[0];
        const billingId = billing.id;

        // Paid billing cannot be edited
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
        }

        // Block edit if pending payment exists
        if (billing.status === 'confirmed') {
            const [[pendingPay]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
            );
            if (pendingPay) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
            }
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billingId);

        // Delete item by code
        const [deleteResult] = await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_code = ?`,
            [billingId, itemCode]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billingId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `${deleteResult.affectedRows || 0} item kode ${itemCode} dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();

        res.json({
            success: true,
            message: `Item dengan kode ${itemCode} berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId,
                deletedCount: deleteResult.affectedRows,
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion by code', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing item by code', {
            mrId: normalizedMrId,
            itemCode,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function deleteBillingByMrIdItemsIdByItemId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemId = parseInt(req.params.itemId, 10);

    if (!itemId || isNaN(itemId)) {
        return res.status(400).json({
            success: false,
            message: 'Item ID tidak valid'
        });
    }

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record and check status
        const [billingRows] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan.'
            });
        }

        const billing = billingRows[0];

        // Paid billing cannot be edited by anyone
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Tagihan sudah dibayar, tidak dapat diubah.'
            });
        }

        // Block edit if there's a pending payment
        if (billing.status === 'confirmed') {
            const [[pendingPayment]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`,
                [billing.id]
            );
            if (pendingPayment) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.'
                });
            }
        }

        // Get item details before deletion (for response)
        const [itemRows] = await connection.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE id = ? AND billing_id = ?`,
            [itemId, billing.id]
        );

        if (itemRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Item tidak ditemukan.'
            });
        }

        const deletedItem = itemRows[0];
        const beforeSnapshot = await getBillingSnapshot(connection, billing.id);

        // Delete item by ID
        await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE id = ? AND billing_id = ?`,
            [itemId, billing.id]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billing.id]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billing.id);
        await writeBillingAudit(connection, req, {
            billingId: billing.id,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `Item "${deletedItem.item_name}" dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();

        res.json({
            success: true,
            message: `Item "${deletedItem.item_name}" berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId: billing.id,
                deletedItem: {
                    id: deletedItem.id,
                    item_name: deletedItem.item_name,
                    item_type: deletedItem.item_type,
                    quantity: deletedItem.quantity,
                    price: deletedItem.price
                },
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion by ID', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing item by ID', {
            mrId: normalizedMrId,
            itemId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function getBillingByMrIdAudit(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        if (isPatientUser(req)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        const [rows] = await db.query(
            `SELECT id, billing_id, mr_id, action, actor_user_id, actor_name,
                    actor_role, summary, before_snapshot, after_snapshot, created_at
             FROM sunday_clinic_billing_audit_logs
             WHERE mr_id = ?
             ORDER BY created_at DESC, id DESC`,
            [normalizedMrId]
        );

        res.json({
            success: true,
            data: rows.map(row => ({
                ...row,
                before_snapshot: parseAuditSnapshot(row.before_snapshot),
                after_snapshot: parseAuditSnapshot(row.after_snapshot)
            }))
        });
    } catch (error) {
        logger.error('Failed to get billing audit history', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postBillingByMrIdRequestChange(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { items, changeNote } = req.body;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get existing billing
        const [billingRows] = await db.query(
            `SELECT id, change_requests FROM sunday_clinic_billings WHERE mr_id = ?`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        const billing = billingRows[0];
        const changeRequests = billing.change_requests ? JSON.parse(billing.change_requests) : [];

        // Add new change request
        changeRequests.push({
            requestedBy: req.user.name || req.user.id || 'Staff',
            requestedAt: new Date().toISOString(),
            note: changeNote || 'Perubahan item tagihan',
            items: items
        });

        // Update billing with new items and set pending_changes flag
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Delete existing items
            await connection.query(
                `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ?`,
                [billing.id]
            );

            // Insert new items with validated prices
            if (items && items.length > 0) {
                let subtotal = 0;
                for (const item of items) {
                    const quantity = item.quantity || 1;
                    const itemType = item.item_type || 'admin';
                    const itemName = item.item_name || '';
                    const itemCode = item.item_code || null;
                    let validatedPrice = 0;

                    // If price is provided in the request, use it (for preserving existing prices)
                    if (item.price != null && item.price !== '') {
                        const parsedPrice = parseFloat(item.price);
                        if (!isNaN(parsedPrice) && parsedPrice > 0) {
                            validatedPrice = parsedPrice;
                        }
                    }
                    // Otherwise validate price based on item type
                    else if (itemType === 'obat') {
                        // Look up obat price from database
                        let obatRow = null;

                        if (itemCode) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM obat WHERE code = ?`,
                                [itemCode]
                            );
                            if (rows.length > 0) {
                                obatRow = rows[0];
                            }
                        }

                        if (!obatRow && itemName) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                                [itemName.toLowerCase()]
                            );
                            if (rows.length > 0) {
                                obatRow = rows[0];
                            }
                        }

                        if (obatRow) {
                            validatedPrice = parseFloat(obatRow.price || 0);
                        } else {
                            logger.warn('Obat not found for billing item', { itemName, itemCode });
                        }
                    } else if (itemType === 'tindakan') {
                        // Look up tindakan price from database
                        let tindakanRow = null;

                        if (itemCode) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM tindakan WHERE code = ?`,
                                [itemCode]
                            );
                            if (rows.length > 0) {
                                tindakanRow = rows[0];
                            }
                        }

                        if (!tindakanRow && itemName) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM tindakan WHERE LOWER(name) = ? LIMIT 1`,
                                [itemName.toLowerCase()]
                            );
                            if (rows.length > 0) {
                                tindakanRow = rows[0];
                            }
                        }

                        if (tindakanRow) {
                            validatedPrice = parseFloat(tindakanRow.price || 0);
                        } else {
                            logger.warn('Tindakan not found for billing item', { itemName, itemCode });
                        }
                    } else if (itemType === 'admin') {
                        // Look up admin fee from tindakan table
                        const [adminRows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan
                             WHERE LOWER(category) = 'administratif'
                             OR LOWER(name) LIKE '%admin%'
                             ORDER BY id ASC LIMIT 1`,
                            []
                        );

                        if (adminRows.length > 0) {
                            validatedPrice = parseFloat(adminRows[0].price || 0);
                        } else {
                            // Fall back to default admin fee if not found in database
                            validatedPrice = 5000;
                            logger.warn('Admin fee not found in database, using default: 5000');
                        }
                    }

                    const itemTotal = quantity * validatedPrice;
                    subtotal += itemTotal;

                    await connection.query(
                        `INSERT INTO sunday_clinic_billing_items
                         (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            billing.id,
                            itemType,
                            itemCode,
                            itemName,
                            quantity,
                            validatedPrice,
                            itemTotal,
                            JSON.stringify(item.item_data || {})
                        ]
                    );
                }

                // Update billing totals and set pending_changes flag
                await connection.query(
                    `UPDATE sunday_clinic_billings
                     SET subtotal = ?, total = ?, pending_changes = TRUE,
                         change_requests = ?, last_modified_by = ?, last_modified_at = NOW()
                     WHERE id = ?`,
                    [subtotal, subtotal, JSON.stringify(changeRequests), req.user.name || req.user.id || 'Staff', billing.id]
                );
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Perubahan berhasil diajukan. Menunggu konfirmasi dokter.'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        logger.error('Failed to request billing change', { error: error.message });
        next(error);
    }
}

async function postBillingByMrIdApproveChanges(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const [result] = await db.query(
            `UPDATE sunday_clinic_billings
             SET pending_changes = FALSE, status = 'confirmed',
                 confirmed_at = NOW(), confirmed_by = ?
             WHERE mr_id = ? AND pending_changes = TRUE`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ada perubahan yang perlu dikonfirmasi'
            });
        }

        res.json({
            success: true,
            message: 'Perubahan berhasil dikonfirmasi'
        });
    } catch (error) {
        logger.error('Failed to approve changes', { error: error.message });
        next(error);
    }
}

async function getBillingByMrIdChanges(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const [rows] = await db.query(
            `SELECT pending_changes, change_requests, last_modified_by, last_modified_at
             FROM sunday_clinic_billings
             WHERE mr_id = ?`,
            [normalizedMrId]
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    hasPendingChanges: false,
                    changeRequests: []
                }
            });
        }

        const billing = rows[0];
        res.json({
            success: true,
            data: {
                hasPendingChanges: billing.pending_changes || false,
                changeRequests: billing.change_requests ? JSON.parse(billing.change_requests) : [],
                lastModifiedBy: billing.last_modified_by,
                lastModifiedAt: billing.last_modified_at
            }
        });
    } catch (error) {
        logger.error('Failed to get change requests', { error: error.message });
        next(error);
    }
}
module.exports = {
    getBillingPending,
    getBillingByMrId,
    postBillingByMrId,
    postBillingByMrIdObat,
    postBillingByMrIdConfirm,
    postBillingByMrIdMarkPaid,
    postBillingByMrIdRequestRevision,
    getBillingRevisionsPending,
    postBillingRevisionsByIdApprove,
    postBillingByMrIdPrintEtiket,
    postBillingByMrIdPrintInvoice,
    getBillingByMrIdAdditional,
    postBillingByMrIdAdditional,
    putBillingByMrIdAdditionalByAdditionalBillingId,
    postBillingByMrIdAdditionalByAdditionalBillingIdConfirm,
    postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid,
    postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice,
    postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket,
    postBillingByMrIdPrint,
    deleteBillingByMrIdItemsByItemType,
    deleteBillingByMrIdItemsCodeByCode,
    deleteBillingByMrIdItemsIdByItemId,
    getBillingByMrIdAudit,
    postBillingByMrIdRequestChange,
    postBillingByMrIdApproveChanges,
    getBillingByMrIdChanges
};
