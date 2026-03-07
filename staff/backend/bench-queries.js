require('dotenv').config();
const db = require('./db');

async function run() {
    // Warm up connection
    await db.query('SELECT 1');

    const RUNS = 10;

    // Q1: Main patient list query (default sort, limit 10) - NO COLLATE casts
    let t = Date.now();
    for (let i = 0; i < RUNS; i++) {
        await db.query(`SELECT p.*,
            (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
             WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit,
            (SELECT scr.mr_id FROM sunday_clinic_records scr
             WHERE scr.patient_id = p.id
             ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id,
            (SELECT scr.visit_location FROM sunday_clinic_records scr
             WHERE scr.patient_id = p.id
             ORDER BY scr.last_activity_at DESC LIMIT 1) as visit_location,
            (SELECT scr.mr_category FROM sunday_clinic_records scr
             WHERE scr.patient_id = p.id
             ORDER BY scr.last_activity_at DESC LIMIT 1) as last_visit_type,
            (SELECT JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.record_datetime'))
             FROM medical_records mr
             WHERE mr.patient_id = p.id
             AND mr.record_type = 'anamnesa'
             AND JSON_EXTRACT(mr.record_data, '$.record_datetime') IS NOT NULL
             ORDER BY mr.created_at DESC LIMIT 1) as anamnesa_datetime
            FROM patients p
            ORDER BY p.last_visit DESC, p.created_at DESC
            LIMIT 10 OFFSET 0`);
    }
    console.log(`Q1 Main list (10 rows, avg ${RUNS}): ${((Date.now()-t)/RUNS).toFixed(1)}ms`);

    // Q2: Resume check queries (per-patient enrichment)
    t = Date.now();
    for (let i = 0; i < RUNS; i++) {
        await db.query("SELECT 1 FROM medical_records WHERE mr_id = 'DRD0100' AND record_type = 'resume_medis' LIMIT 1");
        await db.query("SELECT 1 FROM patient_documents WHERE mr_id = 'DRD0100' AND document_type = 'resume_medis' AND status = 'published' LIMIT 1");
        await db.query("SELECT 1 FROM patient_documents WHERE mr_id = 'DRD0100' AND document_type IN ('usg_2d','usg_4d','patient_usg') AND status = 'published' LIMIT 1");
    }
    console.log(`Q2 Resume 3-query set (avg ${RUNS}): ${((Date.now()-t)/RUNS).toFixed(1)}ms`);

    // Q3: Obstetri JOIN query - NO COLLATE casts
    t = Date.now();
    for (let i = 0; i < RUNS; i++) {
        await db.query(`SELECT scr.mr_id, scr.mr_category,
            JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
            FROM sunday_clinic_records scr
            JOIN medical_records mr ON mr.mr_id = scr.mr_id
                AND mr.record_type = 'anamnesa'
            WHERE scr.patient_id = 'P2024002'
                AND scr.mr_category = 'obstetri'
            ORDER BY scr.last_activity_at DESC
            LIMIT 1`);
    }
    console.log(`Q3 Obstetri JOIN (avg ${RUNS}): ${((Date.now()-t)/RUNS).toFixed(1)}ms`);

    // Q4: Full enrichment for 10 patients (sequential)
    const [rows] = await db.query(`SELECT p.id,
        (SELECT scr.mr_id FROM sunday_clinic_records scr
         WHERE scr.patient_id = p.id ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id
        FROM patients p ORDER BY p.last_visit DESC LIMIT 10`);

    t = Date.now();
    for (let i = 0; i < RUNS; i++) {
        for (const p of rows) {
            if (p.mr_id) {
                await db.query("SELECT 1 FROM medical_records WHERE mr_id = ? AND record_type = 'resume_medis' LIMIT 1", [p.mr_id]);
                await db.query("SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type = 'resume_medis' AND status = 'published' LIMIT 1", [p.mr_id]);
                await db.query("SELECT 1 FROM patient_documents WHERE mr_id = ? AND document_type IN ('usg_2d','usg_4d','patient_usg') AND status = 'published' LIMIT 1", [p.mr_id]);
            }
            await db.query(`SELECT scr.mr_id, scr.mr_category,
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
                FROM sunday_clinic_records scr
                JOIN medical_records mr ON mr.mr_id = scr.mr_id
                    AND mr.record_type = 'anamnesa'
                WHERE scr.patient_id = ? AND scr.mr_category = 'obstetri'
                ORDER BY scr.last_activity_at DESC LIMIT 1`, [p.id]);
        }
    }
    console.log(`Q4 Full enrich 10 patients sequential (avg ${RUNS}): ${((Date.now()-t)/RUNS).toFixed(1)}ms`);

    // Q5: Location filter query
    t = Date.now();
    for (let i = 0; i < RUNS; i++) {
        await db.query(`SELECT COUNT(*) as total FROM patients p
            INNER JOIN (
                SELECT scr.patient_id, scr.visit_location
                FROM sunday_clinic_records scr
                INNER JOIN (
                    SELECT patient_id, MAX(last_activity_at) as max_activity
                    FROM sunday_clinic_records GROUP BY patient_id
                ) latest_visit ON scr.patient_id = latest_visit.patient_id
                    AND scr.last_activity_at = latest_visit.max_activity
            ) latest ON p.id = latest.patient_id
            WHERE latest.visit_location = 'klinik_private'`);
    }
    console.log(`Q5 Location filter count (avg ${RUNS}): ${((Date.now()-t)/RUNS).toFixed(1)}ms`);

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
