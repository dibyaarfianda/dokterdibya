require('dotenv').config();
const db = require('./db');

async function bench() {
    for (const limit of [10, 50, 267]) {
        console.log(`\n========== ${limit} patients ==========`);
        const start = Date.now();
        const [rows] = await db.query(`SELECT p.*,
            (SELECT scr.mr_id FROM sunday_clinic_records scr
             WHERE scr.patient_id = p.id
             ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id
            FROM patients p
            ORDER BY p.last_visit DESC, p.created_at DESC
            LIMIT ? OFFSET 0`, [limit]);
        const queryTime = Date.now() - start;

        // ── APPROACH 1: sequential N+1 (old way) ─────────────────────────────
        const enrichStart = Date.now();
        let queryCount = 0;
        for (const p of rows) {
            if (p.mr_id) {
                await db.query("SELECT 1 FROM medical_records WHERE mr_id = ? AND record_type = 'resume_medis' LIMIT 1", [p.mr_id]);
                queryCount++;
                await db.query("SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type = 'resume_medis' AND status = 'published' LIMIT 1", [p.mr_id]);
                queryCount++;
                await db.query("SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type IN ('usg_2d', 'usg_4d', 'patient_usg') AND status = 'published' LIMIT 1", [p.mr_id]);
                queryCount++;
            }
            await db.query(`SELECT scr.mr_id, scr.mr_category,
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
                FROM sunday_clinic_records scr
                JOIN medical_records mr ON mr.mr_id COLLATE utf8mb4_general_ci = scr.mr_id COLLATE utf8mb4_general_ci AND mr.record_type = 'anamnesa'
                WHERE scr.patient_id = ? AND scr.mr_category = 'obstetri'
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                ORDER BY scr.last_activity_at DESC LIMIT 1`, [p.id]);
            queryCount++;
        }
        const enrichOld = Date.now() - enrichStart;
        console.log(`1. SEQUENTIAL:    main=${queryTime}ms enrich=${enrichOld}ms queries=${queryCount} total=${queryTime+enrichOld}ms`);

        // ── APPROACH 2: Promise.all per-patient (parallel N+1) ────────────────
        const parallelStart = Date.now();
        await Promise.all(rows.map(async (patient) => {
            const promises = [];
            if (patient.mr_id) {
                promises.push(
                    Promise.all([
                        db.query(`SELECT 1 FROM medical_records WHERE mr_id = ? AND record_type = 'resume_medis' LIMIT 1`, [patient.mr_id]),
                        db.query(`SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type = 'resume_medis' AND status = 'published' LIMIT 1`, [patient.mr_id]),
                        db.query(`SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type IN ('usg_2d', 'usg_4d', 'patient_usg') AND status = 'published' LIMIT 1`, [patient.mr_id])
                    ])
                );
            }
            promises.push(
                db.query(`SELECT scr.mr_id, scr.mr_category,
                    JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
                    FROM sunday_clinic_records scr
                    JOIN medical_records mr ON mr.mr_id COLLATE utf8mb4_general_ci = scr.mr_id COLLATE utf8mb4_general_ci
                        AND mr.record_type = 'anamnesa'
                    WHERE scr.patient_id = ?
                        AND scr.mr_category = 'obstetri'
                        AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
                        AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                    ORDER BY scr.last_activity_at DESC
                    LIMIT 1`, [patient.id]).then(async ([obstetriRecord]) => {
                    if (obstetriRecord.length > 0 && obstetriRecord[0].hpht) {
                        const hpht = new Date(obstetriRecord[0].hpht);
                        if (!isNaN(hpht.getTime())) {
                            await db.query(`SELECT 1 FROM birth_congratulations WHERE patient_id = ? LIMIT 1`, [patient.id]);
                        }
                    }
                })
            );
            await Promise.all(promises);
        }));
        const parallelTime = Date.now() - parallelStart;
        console.log(`2. PARALLEL N+1:  main=${queryTime}ms enrich=${parallelTime}ms total=${queryTime+parallelTime}ms`);

        // ── APPROACH 3: batch IN queries (current patients.js) ────────────────
        const batchStart = Date.now();
        const mrIds = rows.map(p => p.mr_id).filter(Boolean);
        const patientIds = rows.map(p => p.id);
        const batchPromises = [];

        if (mrIds.length > 0) {
            const ph = mrIds.map(() => '?').join(',');
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM medical_records WHERE mr_id IN (${ph}) AND record_type = 'resume_medis'`, mrIds).catch(() => {})
            );
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM patient_documents WHERE mr_id IN (${ph}) AND document_type = 'resume_medis' AND status = 'published'`, mrIds).catch(() => {})
            );
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM patient_documents WHERE mr_id IN (${ph}) AND document_type IN ('usg_2d', 'usg_4d', 'patient_usg') AND status = 'published'`, mrIds).catch(() => {})
            );
        }

        if (patientIds.length > 0) {
            const pph = patientIds.map(() => '?').join(',');
            const obsMap = {};
            await Promise.all([
                ...batchPromises,
                db.query(`
                    SELECT t.patient_id, t.hpht FROM (
                        SELECT scr.patient_id,
                            JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht,
                            ROW_NUMBER() OVER (PARTITION BY scr.patient_id ORDER BY scr.last_activity_at DESC) as rn
                        FROM sunday_clinic_records scr
                        JOIN medical_records mr
                            ON mr.mr_id COLLATE utf8mb4_general_ci = scr.mr_id COLLATE utf8mb4_general_ci
                            AND mr.record_type = 'anamnesa'
                        WHERE scr.patient_id IN (${pph})
                            AND scr.mr_category = 'obstetri'
                            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
                            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                    ) t WHERE t.rn = 1
                `, patientIds)
                    .then(([obsRows]) => obsRows.forEach(r => { obsMap[r.patient_id] = r.hpht; }))
                    .catch(() => {})
            ]);
            if (Object.keys(obsMap).length > 0) {
                const bph = Object.keys(obsMap).map(() => '?').join(',');
                await db.query(`SELECT DISTINCT patient_id FROM birth_congratulations WHERE patient_id IN (${bph})`, Object.keys(obsMap)).catch(() => {});
            }
        } else {
            await Promise.all(batchPromises);
        }
        const batchTime = Date.now() - batchStart;
        console.log(`3. BATCH IN:      main=${queryTime}ms enrich=${batchTime}ms total=${queryTime+batchTime}ms`);

        console.log(`Speedup 2vs1: ${(enrichOld / Math.max(parallelTime, 1)).toFixed(1)}x  3vs1: ${(enrichOld / Math.max(batchTime, 1)).toFixed(1)}x`);
    }

    process.exit(0);
}
bench().catch(e => { console.error(e); process.exit(1); });
