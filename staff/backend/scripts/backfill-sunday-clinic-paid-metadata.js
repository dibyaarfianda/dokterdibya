'use strict';

const db = require('../db');

function parseArguments(args) {
    const unsupported = args.filter(argument => argument !== '--apply');
    if (unsupported.length > 0) {
        throw new Error(`Argumen tidak dikenal: ${unsupported.join(', ')}`);
    }

    return { apply: args.includes('--apply') };
}

function hasText(value) {
    return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function deriveBackfillDecision(row) {
    const existingPaidAt = row.paid_at || null;
    const existingPaidBy = hasText(row.paid_by) ? String(row.paid_by).trim() : null;
    const paymentCount = Number(row.payment_count || 0);
    const auditCount = Number(row.audit_count || 0);

    if (existingPaidAt && existingPaidBy) {
        return {
            canApply: false,
            reason: 'already_complete',
            source: null,
            paidAt: existingPaidAt,
            paidBy: existingPaidBy
        };
    }

    if (paymentCount > 0 && auditCount > 0) {
        return {
            canApply: false,
            reason: 'conflicting_evidence_sources',
            source: null,
            paidAt: existingPaidAt,
            paidBy: existingPaidBy
        };
    }

    if (paymentCount > 1) {
        return {
            canApply: false,
            reason: 'multiple_online_payments',
            source: null,
            paidAt: existingPaidAt,
            paidBy: existingPaidBy
        };
    }

    if (paymentCount === 1) {
        const paidAt = existingPaidAt || row.payment_paid_at || null;
        if (!paidAt) {
            return {
                canApply: false,
                reason: 'online_payment_missing_timestamp',
                source: 'online_payment',
                paidAt: null,
                paidBy: existingPaidBy || 'Xendit'
            };
        }

        return {
            canApply: true,
            reason: null,
            source: 'online_payment',
            paidAt,
            paidBy: existingPaidBy || 'Xendit'
        };
    }

    if (auditCount > 1) {
        return {
            canApply: false,
            reason: 'multiple_manual_audits',
            source: null,
            paidAt: existingPaidAt,
            paidBy: existingPaidBy
        };
    }

    if (auditCount === 1) {
        const paidAt = existingPaidAt || row.audit_created_at || null;
        const paidBy = existingPaidBy || (hasText(row.audit_actor_name)
            ? String(row.audit_actor_name).trim()
            : null);

        if (!paidAt || !paidBy) {
            return {
                canApply: false,
                reason: 'manual_audit_incomplete',
                source: 'billing_audit',
                paidAt,
                paidBy
            };
        }

        return {
            canApply: true,
            reason: null,
            source: 'billing_audit',
            paidAt,
            paidBy
        };
    }

    return {
        canApply: false,
        reason: 'no_unambiguous_evidence',
        source: null,
        paidAt: existingPaidAt,
        paidBy: existingPaidBy
    };
}

async function loadCandidates(client) {
    const [rows] = await client.query(`
        SELECT b.id, b.mr_id, b.paid_at, b.paid_by,
               (
                   SELECT COUNT(*)
                   FROM tagihan_payments tp
                   WHERE tp.billing_id = b.id
                     AND tp.status = 'paid'
               ) AS payment_count,
               (
                   SELECT tp.paid_at
                   FROM tagihan_payments tp
                   WHERE tp.billing_id = b.id
                     AND tp.status = 'paid'
                   ORDER BY tp.id DESC
                   LIMIT 1
               ) AS payment_paid_at,
               (
                   SELECT tp.payment_method
                   FROM tagihan_payments tp
                   WHERE tp.billing_id = b.id
                     AND tp.status = 'paid'
                   ORDER BY tp.id DESC
                   LIMIT 1
               ) AS payment_method,
               (
                   SELECT COUNT(*)
                   FROM sunday_clinic_billing_audit_logs bal
                   WHERE bal.billing_id = b.id
                     AND bal.action = 'billing_marked_paid'
               ) AS audit_count,
               (
                   SELECT bal.created_at
                   FROM sunday_clinic_billing_audit_logs bal
                   WHERE bal.billing_id = b.id
                     AND bal.action = 'billing_marked_paid'
                   ORDER BY bal.id DESC
                   LIMIT 1
               ) AS audit_created_at,
               (
                   SELECT bal.actor_name
                   FROM sunday_clinic_billing_audit_logs bal
                   WHERE bal.billing_id = b.id
                     AND bal.action = 'billing_marked_paid'
                   ORDER BY bal.id DESC
                   LIMIT 1
               ) AS audit_actor_name
        FROM sunday_clinic_billings b
        WHERE b.status = 'paid'
          AND (b.paid_at IS NULL OR b.paid_by IS NULL OR TRIM(b.paid_by) = '')
        ORDER BY b.id ASC
    `);

    return rows;
}

async function runBackfill({ client = db, apply = false } = {}) {
    const candidates = await loadCandidates(client);
    const results = candidates.map(row => {
        const decision = deriveBackfillDecision(row);
        return {
            billingId: row.id,
            mrId: row.mr_id,
            previousPaidAt: row.paid_at || null,
            previousPaidBy: hasText(row.paid_by) ? String(row.paid_by).trim() : null,
            ...decision
        };
    });
    const applicable = results.filter(result => result.canApply);
    let appliedCount = 0;

    if (apply && applicable.length > 0) {
        const connection = typeof client.getConnection === 'function'
            ? await client.getConnection()
            : client;
        const ownsConnection = connection !== client;

        try {
            if (typeof connection.beginTransaction === 'function') {
                await connection.beginTransaction();
            }

            for (const result of applicable) {
                const [updateResult] = await connection.query(`
                    UPDATE sunday_clinic_billings
                    SET paid_at = COALESCE(paid_at, ?),
                        paid_by = COALESCE(NULLIF(TRIM(paid_by), ''), ?)
                    WHERE id = ?
                      AND status = 'paid'
                      AND (paid_at IS NULL OR paid_by IS NULL OR TRIM(paid_by) = '')
                `, [result.paidAt, result.paidBy, result.billingId]);

                if (!updateResult?.affectedRows) {
                    continue;
                }

                await connection.query(`
                    INSERT INTO sunday_clinic_billing_audit_logs
                    (billing_id, mr_id, action, actor_user_id, actor_name, actor_role,
                     summary, before_snapshot, after_snapshot)
                    VALUES (?, ?, 'billing_paid_metadata_backfilled', NULL,
                            'System Backfill', 'system', ?, ?, ?)
                `, [
                    result.billingId,
                    result.mrId,
                    `Metadata pembayaran dilengkapi dari ${result.source}`,
                    JSON.stringify({
                        paid_at: result.previousPaidAt,
                        paid_by: result.previousPaidBy
                    }),
                    JSON.stringify({
                        paid_at: result.paidAt,
                        paid_by: result.paidBy,
                        source: result.source
                    })
                ]);
                appliedCount += 1;
            }

            if (typeof connection.commit === 'function') {
                await connection.commit();
            }
        } catch (error) {
            if (typeof connection.rollback === 'function') {
                await connection.rollback();
            }
            throw error;
        } finally {
            if (ownsConnection && typeof connection.release === 'function') {
                connection.release();
            }
        }
    }

    return {
        mode: apply ? 'apply' : 'dry-run',
        candidateCount: candidates.length,
        applicableCount: applicable.length,
        appliedCount,
        skippedCount: results.length - applicable.length,
        results
    };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const summary = await runBackfill({ apply: options.apply });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
    main()
        .catch(error => {
            process.stderr.write(`${error.stack || error.message}\n`);
            process.exitCode = 1;
        })
        .finally(async () => {
            if (typeof db.end === 'function') {
                await db.end();
            }
        });
}

module.exports = {
    parseArguments,
    deriveBackfillDecision,
    loadCandidates,
    runBackfill
};
