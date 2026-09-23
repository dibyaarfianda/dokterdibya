'use strict';

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
    return value instanceof Date ? value.toISOString() : value;
}

async function buildAuditReport(auditDb, now = new Date()) {
    const [[shareSummary = {}]] = await auditDb.query(`
        SELECT
            COUNT(*) AS total_shares,
            SUM(CASE
                WHEN (s.expires_at IS NULL OR s.expires_at >= NOW())
                 AND s.status NOT IN ('failed', 'expired') THEN 1 ELSE 0
            END) AS active_unexpired_shares,
            SUM(CASE
                WHEN s.expires_at < NOW()
                 AND s.status NOT IN ('failed', 'expired') THEN 1 ELSE 0
            END) AS expired_not_closed,
            SUM(CASE WHEN s.shared_by IS NULL THEN 1 ELSE 0 END) AS missing_actor_shares,
            SUM(CASE
                WHEN u.user_type = 'patient' OR u.role = 'patient' THEN 1 ELSE 0
            END) AS patient_actor_shares,
            SUM(CASE
                WHEN s.shared_by IS NOT NULL AND u.new_id IS NULL THEN 1 ELSE 0
            END) AS unknown_actor_shares
        FROM patient_document_shares s
        LEFT JOIN users u ON CAST(u.new_id AS CHAR) = CAST(s.shared_by AS CHAR)
    `);

    const [shareGroups] = await auditDb.query(`
        SELECT
            COALESCE(channel, 'unknown') AS channel,
            COALESCE(status, 'unknown') AS status,
            COUNT(*) AS share_count
        FROM patient_document_shares
        GROUP BY COALESCE(channel, 'unknown'), COALESCE(status, 'unknown')
        ORDER BY channel, status
    `);

    const [accessGroups] = await auditDb.query(`
        SELECT
            COALESCE(action, 'unknown') AS action,
            COUNT(*) AS event_count,
            COUNT(DISTINCT document_id) AS document_count,
            MIN(accessed_at) AS first_seen_at,
            MAX(accessed_at) AS last_seen_at
        FROM patient_document_access_logs
        WHERE accessed_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY COALESCE(action, 'unknown')
        ORDER BY action
    `);

    const report = {
        as_of: now.toISOString(),
        shares: {
            total: number(shareSummary.total_shares),
            active_unexpired: number(shareSummary.active_unexpired_shares),
            expired_not_closed: number(shareSummary.expired_not_closed),
            missing_actor: number(shareSummary.missing_actor_shares),
            patient_actor: number(shareSummary.patient_actor_shares),
            unknown_actor: number(shareSummary.unknown_actor_shares),
            by_channel_status: shareGroups.map(row => ({
                channel: row.channel,
                status: row.status,
                count: number(row.share_count)
            }))
        },
        access_last_90_days: accessGroups.map(row => ({
            action: row.action,
            events: number(row.event_count),
            documents: number(row.document_count),
            first_seen_at: timestamp(row.first_seen_at),
            last_seen_at: timestamp(row.last_seen_at)
        })),
        requires_quarantine_review: number(shareSummary.missing_actor_shares) > 0
            || number(shareSummary.patient_actor_shares) > 0
            || number(shareSummary.unknown_actor_shares) > 0
    };

    return report;
}

async function main() {
    const db = require('../db');
    try {
        const report = await buildAuditReport(db);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
        await db.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`Patient document security audit failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { buildAuditReport };
