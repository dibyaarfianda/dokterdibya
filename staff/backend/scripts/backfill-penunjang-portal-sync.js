const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../db');
const PatientDocumentSyncService = require('../services/PatientDocumentSyncService');

function parseArgs(argv) {
    const args = {
        dryRun: false,
        limit: null,
        mrId: null
    };

    for (let i = 0; i < argv.length; i++) {
        const value = argv[i];
        if (value === '--dry-run') {
            args.dryRun = true;
        } else if (value === '--limit' && argv[i + 1]) {
            args.limit = Number.parseInt(argv[i + 1], 10) || null;
            i++;
        } else if (value === '--mr-id' && argv[i + 1]) {
            args.mrId = String(argv[i + 1]).trim().toUpperCase();
            i++;
        }
    }

    return args;
}

function normalizeFiles(recordData) {
    if (!recordData || typeof recordData !== 'object') {
        return [];
    }

    return Array.isArray(recordData.files)
        ? recordData.files.filter(file => file && file.url)
        : [];
}

async function loadLatestPenunjangRecords({ limit, mrId }) {
    let sql = `
        SELECT id, patient_id, mr_id, record_data, updated_at, created_at
        FROM medical_records
        WHERE record_type = 'penunjang'
          AND mr_id IS NOT NULL
    `;
    const params = [];

    if (mrId) {
        sql += ' AND UPPER(mr_id) = ?';
        params.push(mrId);
    }

    sql += ' ORDER BY updated_at DESC, id DESC';

    if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
    }

    const [rows] = await db.query(sql, params);
    const latestByVisit = new Map();

    for (const row of rows) {
        const key = `${row.patient_id}::${String(row.mr_id).toUpperCase()}`;
        if (!latestByVisit.has(key)) {
            latestByVisit.set(key, row);
        }
    }

    return Array.from(latestByVisit.values());
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    console.log('[PenunjangBackfill] Starting portal sync scan...');
    if (args.dryRun) {
        console.log('[PenunjangBackfill] Mode: dry-run');
    }
    if (args.mrId) {
        console.log(`[PenunjangBackfill] Filter MR: ${args.mrId}`);
    }
    if (args.limit) {
        console.log(`[PenunjangBackfill] Limit rows: ${args.limit}`);
    }

    try {
        const records = await loadLatestPenunjangRecords(args);
        console.log(`[PenunjangBackfill] Found ${records.length} penunjang visit records to scan`);

        let processed = 0;
        let added = 0;
        let removed = 0;
        let withFiles = 0;
        let withoutFiles = 0;
        let errors = 0;

        for (const record of records) {
            try {
                const recordData = typeof record.record_data === 'string'
                    ? JSON.parse(record.record_data)
                    : record.record_data;
                const files = normalizeFiles(recordData);

                if (files.length > 0) {
                    withFiles++;
                } else {
                    withoutFiles++;
                }

                processed++;
                console.log(`[PenunjangBackfill] ${processed}/${records.length} ${record.mr_id} (${record.patient_id}) files=${files.length}`);

                if (args.dryRun) {
                    continue;
                }

                const result = await PatientDocumentSyncService.syncPenunjangLabResults({
                    patientId: record.patient_id,
                    mrId: String(record.mr_id).toUpperCase(),
                    files,
                    actorUserId: null,
                    suppressNotification: true
                });

                added += result.added || 0;
                removed += result.removed || 0;
            } catch (error) {
                errors++;
                console.error(`[PenunjangBackfill] Failed ${record.mr_id} (${record.patient_id}): ${error.message}`);
            }
        }

        console.log('[PenunjangBackfill] Summary');
        console.log(`  records_scanned: ${records.length}`);
        console.log(`  processed: ${processed}`);
        console.log(`  with_files: ${withFiles}`);
        console.log(`  without_files: ${withoutFiles}`);
        console.log(`  added: ${added}`);
        console.log(`  removed: ${removed}`);
        console.log(`  errors: ${errors}`);
    } finally {
        await db.end();
    }
}

main().catch(error => {
    console.error('[PenunjangBackfill] Fatal error:', error);
    process.exitCode = 1;
});
