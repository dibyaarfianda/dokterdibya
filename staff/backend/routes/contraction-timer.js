/**
 * Contraction Timer API Routes
 *
 * Patient-facing contraction timing with conservative education and alarm output.
 * This is not a labor-phase diagnosis; active labor still requires clinical exam.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { validateOperationalSchemaScope } = require('../services/OperationalSchemaValidator');
const { verifyPatientToken } = require('../middleware/auth');
const {
    assessContractionPattern,
    normalizeGestationalAge
} = require('../services/ContractionAssessmentService');

const MAX_ACTIVE_SESSION_HOURS = 12;

let tablesReady = false;
let tablesPromise = null;

function setNoCacheHeaders(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function getPatientId(req) {
    return req.patient?.id ||
        req.patient?.patientId ||
        req.patient?.patient_id ||
        req.user?.id ||
        req.user?.patientId ||
        req.user?.patient_id ||
        req.user?.medicalRecordId;
}

function requirePatientId(req, res) {
    const patientId = getPatientId(req);
    if (!patientId) {
        res.status(401).json({
            success: false,
            message: 'Patient ID tidak ditemukan di token'
        });
        return null;
    }
    return patientId;
}

function formatDateLocal(dateValue = new Date()) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toSqlDateTime(dateValue) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function parseJsonSafe(value, fallbackValue) {
    if (!value) return fallbackValue;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallbackValue;
    }
}

function normalizeRedFlags(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 10);
}

async function ensureContractionTimerTables() {
    return validateOperationalSchemaScope('contractionTimer');
}

async function closeStaleActiveSessions(patientId) {
    await db.query(
        `UPDATE contraction_sessions
         SET status = 'completed',
             ended_at = DATE_ADD(started_at, INTERVAL ? HOUR)
         WHERE patient_id = ?
           AND status = 'active'
           AND started_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [MAX_ACTIVE_SESSION_HOURS, patientId, MAX_ACTIVE_SESSION_HOURS]
    );
}

async function getSessionEvents(sessionId) {
    const [events] = await db.query(
        `SELECT id, started_at_client, ended_at_client, duration_seconds, interval_from_previous_seconds
         FROM contraction_events
         WHERE session_id = ?
         ORDER BY started_at_client ASC`,
        [sessionId]
    );
    return events;
}

function buildAssessmentInput(session, events) {
    return {
        gestationalAge: {
            weeks: session.gestational_age_weeks,
            days: session.gestational_age_days
        },
        events,
        restHydrationResult: session.rest_hydration_result || 'unknown',
        redFlags: parseJsonSafe(session.red_flags_json, [])
    };
}

function serializeSession(session, events = []) {
    const assessment = assessContractionPattern(buildAssessmentInput(session, events));
    return {
        ...session,
        red_flags: parseJsonSafe(session.red_flags_json, []),
        events,
        assessment
    };
}

async function persistAssessment(sessionId, assessment) {
    await db.query(
        `UPDATE contraction_sessions
         SET assessment_final = ?,
             assessment_reason = ?
         WHERE id = ?`,
        [assessment.code, JSON.stringify({
            label: assessment.label,
            copy: assessment.copy,
            reasons: assessment.reasons,
            next_action: assessment.next_action,
            stats: assessment.stats
        }), sessionId]
    );
}

async function loadSessionForPatient(sessionId, patientId) {
    const [sessions] = await db.query(
        `SELECT *
         FROM contraction_sessions
         WHERE id = ? AND patient_id = ?
         LIMIT 1`,
        [sessionId, patientId]
    );
    return sessions[0] || null;
}

router.use(setNoCacheHeaders);
router.use(verifyPatientToken);
router.use(async (req, res, next) => {
    try {
        await ensureContractionTimerTables();
        next();
    } catch (error) {
        console.error('Error ensuring contraction timer tables:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyiapkan data kontraksi'
        });
    }
});

router.get('/today', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        await closeStaleActiveSessions(patientId);

        const today = formatDateLocal();
        const [sessions] = await db.query(
            `SELECT *
             FROM contraction_sessions
             WHERE patient_id = ? AND session_date = ?
             ORDER BY started_at DESC`,
            [patientId, today]
        );

        const serialized = [];
        for (const session of sessions) {
            const events = await getSessionEvents(session.id);
            serialized.push(serializeSession(session, events));
        }

        res.json({
            success: true,
            sessions: serialized,
            active_session: serialized.find((session) => session.status === 'active') || null,
            summary: {
                total_sessions: serialized.length,
                total_contractions: serialized.reduce((sum, session) => sum + Number(session.contraction_count || 0), 0)
            }
        });
    } catch (error) {
        console.error('Error getting contraction sessions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/session', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        await closeStaleActiveSessions(patientId);

        const gestationalAge = normalizeGestationalAge(req.body.gestational_age || req.body.gestationalAge);
        const initialAssessment = assessContractionPattern({
            gestationalAge,
            events: []
        });

        if (!initialAssessment.canUseTimer) {
            return res.status(400).json({
                success: false,
                message: initialAssessment.copy,
                assessment: initialAssessment
            });
        }

        const [existing] = await db.query(
            `SELECT id FROM contraction_sessions
             WHERE patient_id = ? AND status = 'active'
             LIMIT 1`,
            [patientId]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Masih ada sesi kontraksi aktif. Selesaikan dulu sebelum memulai sesi baru.'
            });
        }

        const source = String(req.body.source || 'unknown').slice(0, 30);
        const now = new Date();
        const [result] = await db.query(
            `INSERT INTO contraction_sessions
             (patient_id, session_date, gestational_age_weeks, gestational_age_days, source, status, started_at, assessment_final, assessment_reason)
             VALUES (?, ?, ?, ?, ?, 'active', NOW(), ?, ?)`,
            [
                patientId,
                formatDateLocal(now),
                gestationalAge?.weeks ?? null,
                gestationalAge?.days ?? null,
                source,
                initialAssessment.code,
                JSON.stringify(initialAssessment)
            ]
        );

        const session = await loadSessionForPatient(result.insertId, patientId);
        res.json({
            success: true,
            session: serializeSession(session, [])
        });
    } catch (error) {
        console.error('Error starting contraction session:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/event', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const sessionId = req.body.session_id || req.body.sessionId;
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'session_id diperlukan' });
        }

        const session = await loadSessionForPatient(sessionId, patientId);
        if (!session || session.status !== 'active') {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan atau sudah selesai' });
        }

        const startedAtSql = toSqlDateTime(req.body.started_at_client || req.body.startedAtClient);
        const endedAtSql = toSqlDateTime(req.body.ended_at_client || req.body.endedAtClient);
        if (!startedAtSql || !endedAtSql) {
            return res.status(400).json({ success: false, message: 'Waktu mulai dan selesai kontraksi tidak valid' });
        }

        const startedAt = new Date(req.body.started_at_client || req.body.startedAtClient);
        const endedAt = new Date(req.body.ended_at_client || req.body.endedAtClient);
        const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return res.status(400).json({ success: false, message: 'Durasi kontraksi tidak valid' });
        }

        const [previous] = await db.query(
            `SELECT started_at_client
             FROM contraction_events
             WHERE session_id = ?
             ORDER BY started_at_client DESC
             LIMIT 1`,
            [sessionId]
        );
        const previousStart = previous[0] ? new Date(previous[0].started_at_client) : null;
        const intervalSeconds = previousStart && !Number.isNaN(previousStart.getTime())
            ? Math.max(0, Math.round((startedAt.getTime() - previousStart.getTime()) / 1000))
            : null;

        const [eventResult] = await db.query(
            `INSERT INTO contraction_events
             (session_id, started_at_client, ended_at_client, duration_seconds, interval_from_previous_seconds)
             VALUES (?, ?, ?, ?, ?)`,
            [sessionId, startedAtSql, endedAtSql, durationSeconds, intervalSeconds]
        );

        await db.query(
            `UPDATE contraction_sessions
             SET contraction_count = contraction_count + 1
             WHERE id = ?`,
            [sessionId]
        );

        const updatedSession = await loadSessionForPatient(sessionId, patientId);
        const events = await getSessionEvents(sessionId);
        const serialized = serializeSession(updatedSession, events);
        await persistAssessment(sessionId, serialized.assessment);

        res.json({
            success: true,
            event: {
                id: eventResult.insertId,
                duration_seconds: durationSeconds,
                interval_from_previous_seconds: intervalSeconds
            },
            session: serialized
        });
    } catch (error) {
        console.error('Error recording contraction event:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/session/:id/assessment', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const session = await loadSessionForPatient(req.params.id, patientId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const restHydrationResult = String(req.body.rest_hydration_result || req.body.restHydrationResult || 'unknown').slice(0, 30);
        const redFlags = normalizeRedFlags(req.body.red_flags || req.body.redFlags);
        await db.query(
            `UPDATE contraction_sessions
             SET rest_hydration_result = ?,
                 red_flags_json = ?
             WHERE id = ?`,
            [restHydrationResult, JSON.stringify(redFlags), req.params.id]
        );

        const updatedSession = await loadSessionForPatient(req.params.id, patientId);
        const events = await getSessionEvents(req.params.id);
        const serialized = serializeSession(updatedSession, events);
        await persistAssessment(req.params.id, serialized.assessment);

        res.json({
            success: true,
            session: serialized
        });
    } catch (error) {
        console.error('Error updating contraction assessment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/session/:id/end', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const session = await loadSessionForPatient(req.params.id, patientId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        await db.query(
            `UPDATE contraction_sessions
             SET status = 'completed',
                 ended_at = NOW()
             WHERE id = ?`,
            [req.params.id]
        );

        const updatedSession = await loadSessionForPatient(req.params.id, patientId);
        const events = await getSessionEvents(req.params.id);
        const serialized = serializeSession(updatedSession, events);
        await persistAssessment(req.params.id, serialized.assessment);

        res.json({
            success: true,
            session: serialized
        });
    } catch (error) {
        console.error('Error ending contraction session:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/history', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const requestedLimit = parseInt(req.query.limit, 10) || 20;
        const limit = Math.min(Math.max(requestedLimit, 1), 50);
        const offset = (page - 1) * limit;

        const [sessions] = await db.query(
            `SELECT *
             FROM contraction_sessions
             WHERE patient_id = ?
             ORDER BY session_date DESC, started_at DESC
             LIMIT ? OFFSET ?`,
            [patientId, limit, offset]
        );
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM contraction_sessions WHERE patient_id = ?`,
            [patientId]
        );

        const serialized = [];
        for (const session of sessions) {
            const events = await getSessionEvents(session.id);
            serialized.push(serializeSession(session, events));
        }

        res.json({
            success: true,
            sessions: serialized,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Error getting contraction history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
