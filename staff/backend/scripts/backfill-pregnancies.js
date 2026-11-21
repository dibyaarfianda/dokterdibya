'use strict';

/**
 * One-time, re-runnable backfill of pregnancy episodes.
 *   node scripts/backfill-pregnancies.js            dry run (prints counts only)
 *   node scripts/backfill-pregnancies.js --apply    writes, one transaction per patient
 * Prints ids, counts and reasons only (no names or clinical text).
 * Idempotent: a planned pregnancy whose (patient_id, fingerprint) exists is skipped, and
 * links are written only for pregnancies inserted in this run, and only where the target
 * pregnancy_id IS NULL. Review reasons are stored in pregnancies.review_reason ('; '-joined).
 * A patient that already has a pregnancies row without a fingerprint (written by the live
 * app code) is skipped entirely and counted as skipped_live; no merging with live rows.
 *
 * Required order: migration (20261123_pregnancies.sql) -> dry run -> --apply -> deploy the
 * live pregnancy code. Running --apply after the live code is in use skips touched patients.
 */

const { planBackfill } = require('../services/PregnancyBackfill');

const BATCH_SIZE = 200;
const MAX_SAMPLES = 10;
const LIVE_REASON = 'Sudah ada data kehamilan dari aplikasi';
const REVIEW_REASON_MAX = 255;

function parseArguments(args) {
    const unsupported = args.filter(argument => argument !== '--apply');
    if (unsupported.length > 0) {
        throw new Error(`Argumen tidak dikenal: ${unsupported.join(', ')}`);
    }
    return { apply: args.includes('--apply') };
}

function placeholders(list) {
    return list.map(() => '?').join(',');
}

function parseJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (e) { return null; }
}

async function listPatientIds(db) {
    const [rows] = await db.query(
        `SELECT patient_id FROM (
            SELECT patient_id FROM sunday_clinic_records WHERE mr_category = 'obstetri' AND patient_id IS NOT NULL
            UNION SELECT patient_id FROM birth_congratulations WHERE patient_id IS NOT NULL
            UNION SELECT patient_id FROM pregnancy_outcomes WHERE voided_at IS NULL AND patient_id IS NOT NULL
         ) t ORDER BY patient_id`
    );
    return rows.map(r => r.patient_id);
}

async function loadBatch(db, ids) {
    const marks = placeholders(ids);
    const [visitRows] = await db.query(
        `SELECT mr_id, patient_id, mr_category, created_at, import_source
         FROM sunday_clinic_records WHERE mr_category = 'obstetri' AND patient_id IN (${marks})`,
        ids
    );
    const mrIds = visitRows.map(v => v.mr_id);
    const newest = new Map();
    if (mrIds.length) {
        const [anamnesaRows] = await db.query(
            `SELECT mr_id, record_data FROM medical_records
             WHERE record_type = 'anamnesa' AND mr_id IN (${placeholders(mrIds)})
             ORDER BY version ASC, updated_at ASC`,
            mrIds
        );
        for (const row of anamnesaRows) newest.set(row.mr_id, parseJson(row.record_data) || {});
    }
    const [birthRows] = await db.query(
        `SELECT id, patient_id, birth_date, created_at, child_number, birth_weight, gender
         FROM birth_congratulations WHERE patient_id IN (${marks})`,
        ids
    );
    const [outcomeRows] = await db.query(
        `SELECT id, patient_id, outcome_type, event_date
         FROM pregnancy_outcomes WHERE voided_at IS NULL AND patient_id IN (${marks})`,
        ids
    );

    const data = new Map(ids.map(id => [id, { patientId: id, visits: [], births: [], outcomes: [] }]));
    for (const v of visitRows) {
        const anamnesa = newest.get(v.mr_id) || {};
        data.get(v.patient_id).visits.push({
            mr_id: v.mr_id,
            mr_category: v.mr_category,
            created_at: v.created_at,
            import_source: v.import_source,
            hpht: anamnesa.hpht,
            hpl: anamnesa.hpl,
            riwayat_persalinan: anamnesa.riwayat_persalinan
        });
    }
    for (const b of birthRows) data.get(b.patient_id).births.push(b);
    for (const o of outcomeRows) data.get(o.patient_id).outcomes.push(o);
    return data;
}

async function existingFingerprints(conn, patientId, { lock }) {
    const [rows] = await conn.query(
        `SELECT id, fingerprint FROM pregnancies WHERE patient_id = ?${lock ? ' FOR UPDATE' : ''}`,
        [patientId]
    );
    return {
        map: new Map(rows.filter(r => r.fingerprint).map(r => [r.fingerprint, r.id])),
        hasLive: rows.some(r => !r.fingerprint)
    };
}

function toJson(value) {
    return value === null || value === undefined ? null : JSON.stringify(value);
}

function reviewReasonOf(plan, fingerprint) {
    const reasons = [];
    for (const r of plan.reviews) {
        if (r.fingerprint === fingerprint && !reasons.includes(r.reason)) reasons.push(r.reason);
    }
    if (!reasons.length) return null;
    const text = reasons.join('; ');
    return text.length > REVIEW_REASON_MAX ? text.slice(0, REVIEW_REASON_MAX) : text;
}

async function writePlan(conn, patientId, plan, existing) {
    // Only pregnancies inserted in this run get links; existing ones keep whatever links they have.
    const ids = new Map();
    for (const p of plan.pregnancies) {
        if (existing.has(p.fingerprint)) continue;
        const [result] = await conn.query(
            `INSERT INTO pregnancies
                (patient_id, sequence, source, hpht, hpl, year, status, outcome, ended_on, ga_weeks_at_end,
                 delivery_method, delivery_indication, complications, babies, kuretase, term,
                 needs_review, review_reason, fingerprint, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backfill', 'backfill')`,
            [patientId, p.sequence, p.source, p.hpht, p.hpl, p.year, p.status, p.outcome, p.ended_on, p.ga_weeks_at_end,
                p.delivery_method, p.delivery_indication, toJson(p.complications), toJson(p.babies), p.kuretase, p.term,
                p.needs_review ? 1 : 0, p.needs_review ? reviewReasonOf(plan, p.fingerprint) : null, p.fingerprint]
        );
        ids.set(p.fingerprint, result.insertId);
    }
    const inserted = l => ids.has(l.fingerprint);
    for (const l of plan.visitLinks.filter(inserted)) {
        await conn.query(
            'UPDATE sunday_clinic_records SET pregnancy_id = ? WHERE mr_id = ? AND patient_id = ? AND pregnancy_id IS NULL',
            [ids.get(l.fingerprint), l.mr_id, patientId]
        );
    }
    for (const l of plan.outcomeLinks.filter(inserted)) {
        await conn.query(
            'UPDATE pregnancy_outcomes SET pregnancy_id = ? WHERE id = ? AND patient_id = ? AND pregnancy_id IS NULL',
            [ids.get(l.fingerprint), l.id, patientId]
        );
    }
    for (const l of plan.birthLinks.filter(inserted)) {
        await conn.query(
            'UPDATE birth_congratulations SET pregnancy_id = ? WHERE id = ? AND patient_id = ? AND pregnancy_id IS NULL',
            [ids.get(l.fingerprint), l.id, patientId]
        );
    }
}

async function run({ db, apply = false, today = new Date(), batchSize = BATCH_SIZE, logger = console } = {}) {
    const summary = {
        mode: apply ? 'apply' : 'dry-run',
        patients: 0,
        pregnancies: 0,
        clinic: 0,
        external: 0,
        ongoing: 0,
        needs_review: 0,
        skipped_existing: 0,
        skipped_live: 0,
        failed: 0,
        samples: []
    };

    const patientIds = await listPatientIds(db);
    for (let i = 0; i < patientIds.length; i += batchSize) {
        const batch = patientIds.slice(i, i + batchSize);
        const data = await loadBatch(db, batch);
        for (const patientId of batch) {
            summary.patients += 1;
            let conn = null;
            try {
                const plan = planBackfill(data.get(patientId), { today });
                if (apply) {
                    conn = await db.getConnection();
                    await conn.beginTransaction();
                }
                const found = await existingFingerprints(conn || db, patientId, { lock: apply });
                if (found.hasLive) {
                    if (conn) await conn.rollback();
                    summary.skipped_live += 1;
                    if (summary.samples.filter(s => s.reason === LIVE_REASON).length < MAX_SAMPLES) {
                        summary.samples.push({ patient_id: patientId, reason: LIVE_REASON });
                    }
                    continue;
                }
                const existing = found.map;
                const fresh = plan.pregnancies.filter(p => !existing.has(p.fingerprint));
                if (apply) {
                    await writePlan(conn, patientId, plan, existing);
                    await conn.commit();
                }
                summary.skipped_existing += plan.pregnancies.length - fresh.length;
                summary.pregnancies += fresh.length;
                summary.clinic += fresh.filter(p => p.source === 'clinic').length;
                summary.external += fresh.filter(p => p.source === 'external').length;
                summary.ongoing += fresh.filter(p => p.status === 'ongoing').length;
                summary.needs_review += fresh.filter(p => p.needs_review).length;
                const freshFingerprints = new Set(fresh.map(p => p.fingerprint));
                for (const review of plan.reviews) {
                    if (freshFingerprints.has(review.fingerprint) && summary.samples.filter(s => s.reason !== LIVE_REASON).length < MAX_SAMPLES) {
                        summary.samples.push({ patient_id: patientId, reason: review.reason });
                    }
                }
            } catch (error) {
                summary.failed += 1;
                if (conn) {
                    try { await conn.rollback(); } catch (e) { /* ignore */ }
                }
                logger.error(`[backfill-pregnancies] gagal untuk pasien ${patientId}: ${(error && error.code) || 'ERROR'}`);
            } finally {
                if (conn) conn.release();
            }
        }
    }
    return summary;
}

async function main() {
    const db = require('../db');
    try {
        const { apply } = parseArguments(process.argv.slice(2));
        const summary = await run({ db, apply });
        console.log(JSON.stringify(summary, null, 2));
        if (summary.failed > 0) process.exitCode = 1;
    } catch (error) {
        console.error(`[backfill-pregnancies] ${(error && error.code) || error.message}`);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { run, parseArguments };
