// SQL-only benchmark for patient list/search query patterns
// Tests all major query paths used by GET /api/patients
require('dotenv').config();
const db = require('./db');

async function run() {
    await db.query('SELECT 1'); // warm pool
    const RUNS = 20;

    const queries = {
        // === MAIN LIST (default path, most common) ===
        'Q1 Main list default (limit 10)': `SELECT p.*,
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
            LIMIT 10 OFFSET 0`,

        // === SEARCH ===
        'Q2 Search by name (limit 10)': `SELECT p.*,
            (SELECT scr.mr_id FROM sunday_clinic_records scr
             WHERE scr.patient_id = p.id
             ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id
            FROM patients p
            WHERE (p.full_name LIKE '%intan%' OR p.id LIKE '%intan%' OR p.whatsapp LIKE '%intan%')
            ORDER BY p.last_visit DESC, p.created_at DESC
            LIMIT 10 OFFSET 0`,

        // === LOCATION FILTER ===
        'Q3 Location filter (klinik_private)': `SELECT p.*,
            latest.visit_location as last_visit_loc,
            latest.mr_id as mr_id,
            latest.mr_category as last_visit_type,
            COALESCE(resume.resume_date, latest.last_activity_at) as last_visit_date
        FROM patients p
        INNER JOIN (
            SELECT scr.patient_id, scr.visit_location, scr.mr_id, scr.mr_category, scr.last_activity_at
            FROM sunday_clinic_records scr
            INNER JOIN (
                SELECT patient_id, MAX(last_activity_at) as max_activity
                FROM sunday_clinic_records
                GROUP BY patient_id
            ) latest_visit ON scr.patient_id = latest_visit.patient_id
                AND scr.last_activity_at = latest_visit.max_activity
        ) latest ON p.id = latest.patient_id
        LEFT JOIN (
            SELECT mr_id, MAX(created_at) as resume_date
            FROM medical_records
            WHERE record_type = 'resume_medis'
            GROUP BY mr_id
        ) resume ON latest.mr_id = resume.mr_id
        WHERE latest.visit_location = 'klinik_private'
        ORDER BY p.last_visit DESC, p.created_at DESC
        LIMIT 10 OFFSET 0`,

        // === NO-VISIT FILTER ===
        'Q4 No-visit count': `SELECT COUNT(*) as total FROM patients p
            WHERE NOT EXISTS (
                SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id
            )`,

        // === ENRICHMENT QUERIES (per-patient) ===
        'Q5a Resume record check': "SELECT 1 FROM medical_records WHERE mr_id = 'DRD0100' AND record_type = 'resume_medis' LIMIT 1",
        'Q5b Resume doc check': "SELECT 1 FROM patient_documents WHERE mr_id = 'DRD0100' AND document_type = 'resume_medis' AND status = 'published' LIMIT 1",
        'Q5c USG doc check': "SELECT 1 FROM patient_documents WHERE mr_id = 'DRD0100' AND document_type IN ('usg_2d','usg_4d','patient_usg') AND status = 'published' LIMIT 1",

        // === OBSTETRI JOIN ===
        'Q6 Obstetri HPL join': `SELECT scr.mr_id, scr.mr_category,
            JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
        FROM sunday_clinic_records scr
        JOIN medical_records mr ON mr.mr_id = scr.mr_id
            AND mr.record_type = 'anamnesa'
        WHERE scr.patient_id = 'P2024002'
            AND scr.mr_category = 'obstetri'
            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
        ORDER BY scr.last_activity_at DESC
        LIMIT 1`,

        // === LOCATION COUNT (GROUP BY subquery) ===
        'Q7 Location count': `SELECT COUNT(*) as total FROM patients p
            INNER JOIN (
                SELECT scr.patient_id, scr.visit_location
                FROM sunday_clinic_records scr
                INNER JOIN (
                    SELECT patient_id, MAX(last_activity_at) as max_activity
                    FROM sunday_clinic_records GROUP BY patient_id
                ) latest_visit ON scr.patient_id = latest_visit.patient_id
                    AND scr.last_activity_at = latest_visit.max_activity
            ) latest ON p.id = latest.patient_id
            WHERE latest.visit_location = 'klinik_private'`,

        // === BIRTH CHECK ===
        'Q8 Birth check': "SELECT 1 FROM birth_congratulations WHERE patient_id = 'P2024002' LIMIT 1",

        // === FULL ENRICHMENT (10 patients, sequential) ===
    };

    // Run each query
    for (const [name, sql] of Object.entries(queries)) {
        const t = Date.now();
        for (let i = 0; i < RUNS; i++) {
            await db.query(sql);
        }
        const avg = ((Date.now() - t) / RUNS).toFixed(2);
        console.log(`${name}: ${avg}ms (avg ${RUNS} runs)`);
    }

    // Full enrichment test (10 patients, sequential — simulates actual endpoint)
    const [rows] = await db.query(`SELECT p.id,
        (SELECT scr.mr_id FROM sunday_clinic_records scr
         WHERE scr.patient_id = p.id ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id
        FROM patients p ORDER BY p.last_visit DESC LIMIT 10`);

    let t = Date.now();
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
                JOIN medical_records mr ON mr.mr_id = scr.mr_id AND mr.record_type = 'anamnesa'
                WHERE scr.patient_id = ? AND scr.mr_category = 'obstetri'
                ORDER BY scr.last_activity_at DESC LIMIT 1`, [p.id]);
        }
    }
    console.log(`Q9 Full enrich 10pts sequential: ${((Date.now()-t)/RUNS).toFixed(2)}ms (avg ${RUNS} runs)`);

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
