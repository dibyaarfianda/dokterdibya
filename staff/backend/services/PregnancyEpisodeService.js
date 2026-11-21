'use strict';

/**
 * Pregnancy episodes: one record per pregnancy per patient (table `pregnancies`).
 * Only the interactive visit-page resolve call may start a pregnancy, and only for the
 * patient's newest obstetri visit. Closing is for dokter/bidan only (assertCanClose, enforced by routes).
 * Dates are local 'YYYY-MM-DD' strings; toISOString is never used for date-only values.
 */

const { toDateString } = require('./PregnancyEnd');
const rules = require('./PregnancyEpisodeRules');
const { PREGNANCY_COMPLICATIONS } = require('../constants/pregnancyComplications');
const { ROLE_IDS, ROLE_NAMES } = require('../constants/roles');

const { SAME_PREGNANCY_DAYS, DELIVERY_METHODS, gaWeeksAt, lossTypeForGa, decideEpisodeAction, isAfterFullTerm } = rules;

const OUTCOMES = ['lahir_hidup', 'lahir_mati', 'abortus', 'ektopik'];
const BIRTH_OUTCOMES = ['lahir_hidup', 'lahir_mati'];
const SPONTANEOUS_METHOD = 'Spt B (Spontan)';
const LINK_TABLES = ['pregnancy_outcomes', 'birth_congratulations'];
const COMPLICATION_CODES = PREGNANCY_COMPLICATIONS.map(c => c.code);
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWEST_VISIT_MESSAGE = 'Hanya kunjungan obstetri terbaru yang dapat memulai kehamilan baru';

class PregnancyEpisodeError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'PregnancyEpisodeError';
        this.status = status;
    }
}

function fail(status, message) {
    throw new PregnancyEpisodeError(status, message);
}

/** Strict 'YYYY-MM-DD' (or Date) only, else null. */
function parseDate(value) {
    if (value instanceof Date) return toDateString(value);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    return toDateString(value.trim());
}

function dayNumber(str) {
    const [y, m, d] = str.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function parseJson(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function hydrate(row) {
    if (!row) return null;
    const out = { ...row };
    for (const key of ['hpht', 'hpl', 'ended_on']) out[key] = toDateString(row[key]);
    out.complications = parseJson(row.complications, []);
    out.babies = parseJson(row.babies, []);
    if (!Array.isArray(out.complications)) out.complications = [];
    if (!Array.isArray(out.babies)) out.babies = [];
    return out;
}

function actorId(actor) {
    if (!actor || typeof actor !== 'object') return null;
    const id = actor.id !== undefined ? actor.id : (actor.user_id !== undefined ? actor.user_id : actor.new_id);
    return id === undefined || id === null ? null : String(id).slice(0, 64);
}

function cleanText(value, max, message) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (text === '') return null;
    if (text.length > max) fail(400, message);
    return text;
}

function normalizeComplications(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail(400, 'Komplikasi tidak valid');
    const seen = [];
    for (const code of value) {
        if (!COMPLICATION_CODES.includes(code)) fail(400, 'Komplikasi tidak valid');
        if (!seen.includes(code)) seen.push(code);
    }
    return seen;
}

function normalizeBabies(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > 10) fail(400, 'Data bayi tidak valid');
    return value.map(item => {
        if (!item || typeof item !== 'object') fail(400, 'Data bayi tidak valid');
        const baby = {};
        if (item.weight_g !== undefined && item.weight_g !== null && item.weight_g !== '') {
            const w = Number(item.weight_g);
            if (!Number.isInteger(w) || w < 100 || w > 7000) fail(400, 'Data bayi tidak valid');
            baby.weight_g = w;
        }
        if (item.sex !== undefined && item.sex !== null && item.sex !== '') {
            if (item.sex !== 'L' && item.sex !== 'P') fail(400, 'Data bayi tidak valid');
            baby.sex = item.sex;
        }
        if (item.alive !== undefined && item.alive !== null) {
            if (typeof item.alive !== 'boolean') fail(400, 'Data bayi tidak valid');
            baby.alive = item.alive;
        }
        return baby;
    });
}

function termForGa(ga) {
    if (ga === null || ga === undefined) return null;
    if (ga < 37) return 'preterm';
    if (ga >= 42) return 'postterm';
    return 'aterm';
}

/**
 * Validate and normalise the "end of pregnancy" fields into column values.
 * ctx: { hpht, newHpht, requireDate, allowUnknown, requireBirthDetails }
 */
function normalizeEnd(input, ctx = {}) {
    const { hpht = null, newHpht = null, requireDate = true, allowUnknown = false, requireBirthDetails = true } = ctx;
    const src = input || {};
    const outcome = src.outcome;
    const isUnknown = allowUnknown && outcome === 'unknown';
    if (!OUTCOMES.includes(outcome) && !isUnknown) fail(400, 'Hasil akhir kehamilan tidak valid');

    let endedOn = null;
    if (src.ended_on !== undefined && src.ended_on !== null && src.ended_on !== '') {
        endedOn = parseDate(src.ended_on);
        if (!endedOn) fail(400, 'Tanggal selesai tidak valid');
    } else if (requireDate) {
        fail(400, 'Tanggal selesai tidak valid');
    }
    const hphtStr = toDateString(hpht);
    if (endedOn && hphtStr && endedOn < hphtStr) {
        fail(400, 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut');
    }
    const newStr = toDateString(newHpht);
    if (endedOn && newStr && endedOn >= newStr) {
        fail(400, 'Tanggal selesai harus sebelum HPHT kehamilan baru');
    }

    const isBirth = BIRTH_OUTCOMES.includes(outcome);
    let deliveryMethod = null;
    let deliveryIndication = null;
    if (isBirth) {
        if (src.delivery_method !== undefined && src.delivery_method !== null && src.delivery_method !== '') {
            if (!DELIVERY_METHODS.includes(src.delivery_method)) fail(400, 'Cara lahir wajib diisi');
            deliveryMethod = src.delivery_method;
        } else if (requireBirthDetails) {
            fail(400, 'Cara lahir wajib diisi');
        }
        deliveryIndication = cleanText(src.delivery_indication, 255, 'Indikasi maksimal 255 karakter');
        if (deliveryMethod && deliveryMethod !== SPONTANEOUS_METHOD && !deliveryIndication) {
            fail(400, 'Indikasi wajib diisi untuk persalinan SC/Vakum/Forceps');
        }
    }

    const complications = normalizeComplications(src.complications);
    const complicationNotes = cleanText(src.complication_notes, 500, 'Catatan komplikasi maksimal 500 karakter');
    const babies = isBirth ? normalizeBabies(src.babies) : [];
    let kuretase = null;
    if (outcome === 'abortus') {
        if (src.kuretase === 'Ya' || src.kuretase === 'Tidak') kuretase = src.kuretase;
        else if (src.kuretase !== undefined && src.kuretase !== null && src.kuretase !== '') fail(400, 'Kuretase tidak valid');
    }

    const ga = endedOn && hphtStr ? gaWeeksAt(hphtStr, endedOn) : null;
    let warning = null;
    const expected = lossTypeForGa(ga);
    if (ga !== null && outcome === 'abortus' && expected === 'lahir_mati') {
        warning = 'Usia kehamilan ≥20 minggu biasanya dicatat sebagai lahir mati';
    } else if (ga !== null && outcome === 'lahir_mati' && expected === 'abortus') {
        warning = 'Usia kehamilan <20 minggu biasanya dicatat sebagai abortus';
    }

    const cols = {
        outcome,
        ended_on: endedOn,
        ga_weeks_at_end: ga === null ? null : Math.min(ga, 127),
        delivery_method: deliveryMethod,
        delivery_indication: deliveryIndication,
        complications: complications.length ? JSON.stringify(complications) : null,
        complication_notes: complicationNotes,
        babies: babies.length ? JSON.stringify(babies) : null,
        kuretase,
        term: isBirth ? termForGa(ga) : null,
        needs_review: isBirth && !deliveryMethod ? 1 : 0
    };
    return { cols, warning };
}

function isCloser(actor) {
    if (!actor || typeof actor !== 'object') return false;
    if (actor.is_superadmin) return true;
    if (actor.role_id === ROLE_IDS.DOKTER || actor.role_id === ROLE_IDS.BIDAN) return true;
    return actor.role === ROLE_NAMES.DOKTER || actor.role === ROLE_NAMES.BIDAN;
}

function assertCanClose(actor) {
    if (!isCloser(actor)) fail(403, 'Hanya dokter atau bidan yang dapat menutup kehamilan');
}

function sortKey(p) {
    const str = p.ended_on || p.hpht;
    if (str) return dayNumber(str);
    if (p.year) return Math.round(Date.UTC(Number(p.year), 0, 1) / DAY_MS);
    return -Infinity;
}

function createPregnancyEpisodeService({ db, now = () => new Date() }) {
    async function withConn(conn, work) {
        if (conn) return work(conn);
        const own = await db.getConnection();
        try {
            await own.beginTransaction();
            const result = await work(own);
            await own.commit();
            return result;
        } catch (err) {
            try { await own.rollback(); } catch (e) { /* keep original error */ }
            throw err;
        } finally {
            own.release();
        }
    }

    async function lockPregnancies(conn, patientId) {
        const [rows] = await conn.query(
            'SELECT * FROM pregnancies WHERE patient_id = ? ORDER BY sequence ASC, id ASC FOR UPDATE',
            [patientId]
        );
        return (rows || []).map(hydrate);
    }

    function ongoingOf(rows) {
        const ongoing = rows.filter(p => p.status === 'ongoing');
        return ongoing.length ? ongoing[ongoing.length - 1] : null;
    }

    function nextSequence(rows) {
        return rows.reduce((max, p) => Math.max(max, Number(p.sequence) || 0), 0) + 1;
    }

    async function fetchOne(conn, id) {
        const [rows] = await conn.query('SELECT * FROM pregnancies WHERE id = ?', [id]);
        return hydrate(rows && rows[0]);
    }

    async function updateRow(conn, id, cols, actor) {
        const entries = Object.entries({ ...cols, updated_by: actorId(actor) });
        const set = entries.map(([k]) => `${k} = ?`).join(', ');
        await conn.query(`UPDATE pregnancies SET ${set} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
    }

    async function insertRow(conn, cols, actor) {
        const data = { ...cols, created_by: actorId(actor), updated_by: actorId(actor) };
        const keys = Object.keys(data);
        const [result] = await conn.query(
            `INSERT INTO pregnancies (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
            keys.map(k => data[k])
        );
        return result.insertId;
    }

    async function assertVisitOfPatient(conn, patientId, mrId) {
        const [rows] = await conn.query(
            'SELECT mr_id FROM sunday_clinic_records WHERE mr_id = ? AND patient_id = ? FOR UPDATE',
            [mrId, patientId]
        );
        if (!rows || rows.length === 0) fail(404, 'Kunjungan tidak ditemukan untuk pasien ini');
    }

    async function linkVisit(conn, pregnancyId, mrId, patientId) {
        await conn.query(
            'UPDATE sunday_clinic_records SET pregnancy_id = ? WHERE mr_id = ? AND patient_id = ?',
            [pregnancyId, mrId, patientId]
        );
    }

    async function readVisitAnamnesa(conn, patientId, mrId) {
        const [rows] = await conn.query(
            `SELECT record_data FROM medical_records
             WHERE mr_id = ? AND patient_id = ? AND record_type = 'anamnesa'
             ORDER BY version DESC, updated_at DESC LIMIT 1`,
            [mrId, patientId]
        );
        const data = rows && rows[0] ? parseJson(rows[0].record_data, null) : null;
        return {
            hpht: data ? parseDate(typeof data.hpht === 'string' ? data.hpht.trim() : data.hpht) : null,
            hpl: data ? parseDate(typeof data.hpl === 'string' ? data.hpl.trim() : data.hpl) : null
        };
    }

    async function assertNewestObstetriVisit(conn, patientId, mrId) {
        const [rows] = await conn.query(
            `SELECT mr_id FROM sunday_clinic_records
             WHERE patient_id = ? AND mr_category = 'obstetri'
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [patientId]
        );
        if (!rows || !rows[0] || rows[0].mr_id !== mrId) fail(409, NEWEST_VISIT_MESSAGE);
    }

    async function createOngoing(conn, patientId, rows, { hpht, hpl }, actor) {
        const id = await insertRow(conn, {
            patient_id: patientId,
            sequence: nextSequence(rows),
            source: 'clinic',
            hpht,
            hpl: hpl || null,
            status: 'ongoing'
        }, actor);
        return fetchOne(conn, id);
    }

    function withinSameWindow(a, b) {
        return !!a && !!b && Math.abs(dayNumber(a) - dayNumber(b)) <= SAME_PREGNANCY_DAYS;
    }

    async function list(patientId) {
        const [rows] = await db.query(
            `SELECT p.*,
                (SELECT r.mr_id FROM sunday_clinic_records r
                 WHERE r.pregnancy_id = p.id ORDER BY r.created_at DESC, r.mr_id DESC LIMIT 1) AS latest_mr_id
             FROM pregnancies p WHERE p.patient_id = ?`,
            [patientId]
        );
        return (rows || []).map(hydrate).sort((a, b) => {
            const ao = a.status === 'ongoing' ? 1 : 0;
            const bo = b.status === 'ongoing' ? 1 : 0;
            if (ao !== bo) return bo - ao;
            const diff = sortKey(b) - sortKey(a);
            if (diff !== 0 && !Number.isNaN(diff)) return diff;
            return (Number(b.sequence) || 0) - (Number(a.sequence) || 0);
        });
    }

    async function resolveFromVisit(patientId, mrId, actor) {
        return withConn(null, async conn => {
            await assertVisitOfPatient(conn, patientId, mrId);
            const { hpht, hpl } = await readVisitAnamnesa(conn, patientId, mrId);
            const rows = await lockPregnancies(conn, patientId);
            const ongoing = ongoingOf(rows);
            const action = decideEpisodeAction({
                ongoing: ongoing ? { hpht: ongoing.hpht, ended: false } : null,
                newHpht: hpht
            });

            if (action === 'none') {
                if (ongoing) {
                    await conn.query(
                        'UPDATE sunday_clinic_records SET pregnancy_id = ? WHERE mr_id = ? AND patient_id = ? AND pregnancy_id IS NULL',
                        [ongoing.id, mrId, patientId]
                    );
                    return { action, pregnancy: ongoing };
                }
                return { action };
            }

            if (action === 'update') {
                await updateRow(conn, ongoing.id, { hpht, hpl: hpl || ongoing.hpl || null }, actor);
                await linkVisit(conn, ongoing.id, mrId, patientId);
                return { action, pregnancy: await fetchOne(conn, ongoing.id) };
            }

            // start / start_needs_previous_end: only the patient's newest obstetri visit may do this.
            await assertNewestObstetriVisit(conn, patientId, mrId);

            if (action === 'start') {
                const pregnancy = await createOngoing(conn, patientId, rows, { hpht, hpl }, actor);
                await linkVisit(conn, pregnancy.id, mrId, patientId);
                return { action, pregnancy };
            }

            return {
                action,
                previous: ongoing,
                after_full_term: isAfterFullTerm(ongoing.hpht, hpht)
            };
        });
    }

    async function startWithPreviousEnd(patientId, mrId, previousEnd, actor) {
        return withConn(null, async conn => {
            await assertVisitOfPatient(conn, patientId, mrId);
            const { hpht, hpl } = await readVisitAnamnesa(conn, patientId, mrId);
            if (!hpht) fail(400, 'HPHT kehamilan baru wajib diisi');
            const rows = await lockPregnancies(conn, patientId);
            await assertNewestObstetriVisit(conn, patientId, mrId);
            const ongoing = ongoingOf(rows);

            // Idempotent retry / double click: the new pregnancy already exists.
            if (ongoing && withinSameWindow(ongoing.hpht, hpht)) {
                await linkVisit(conn, ongoing.id, mrId, patientId);
                return { action: 'start', pregnancy: ongoing, already: true };
            }

            let warning = null;
            if (ongoing) {
                const end = normalizeEnd(previousEnd, { hpht: ongoing.hpht, newHpht: hpht });
                warning = end.warning;
                await updateRow(conn, ongoing.id, { ...end.cols, status: 'ended' }, actor);
            }
            const pregnancy = await createOngoing(conn, patientId, rows, { hpht, hpl }, actor);
            await linkVisit(conn, pregnancy.id, mrId, patientId);
            const result = { action: 'start', pregnancy };
            if (warning) result.warning = warning;
            return result;
        });
    }

    async function endOngoing(patientId, payload, actor, conn) {
        const { linkTable, linkId } = payload || {};
        if (linkTable !== undefined && linkTable !== null && !LINK_TABLES.includes(linkTable)) {
            fail(400, 'Tabel tautan tidak valid');
        }
        return withConn(conn, async c => {
            const rows = await lockPregnancies(c, patientId);
            // Idempotency: a source row already linked to a pregnancy updates that pregnancy
            // (never inserts another one and never ends a different ongoing pregnancy).
            let linked = null;
            if (linkTable && linkId !== undefined && linkId !== null) {
                const [linkRows] = await c.query(`SELECT pregnancy_id FROM ${linkTable} WHERE id = ? FOR UPDATE`, [linkId]);
                const existingId = linkRows && linkRows[0] ? linkRows[0].pregnancy_id : null;
                if (existingId) linked = rows.find(p => p.id === existingId) || null;
            }
            const ongoing = linked || ongoingOf(rows);
            // Mark-delivered / pregnancy-outcome callers may not know the delivery details yet:
            // the birth is flagged needs_review and completed later through updateHistory.
            const end = normalizeEnd(payload, { hpht: ongoing ? ongoing.hpht : null, requireBirthDetails: false });
            let id;
            if (ongoing) {
                await updateRow(c, ongoing.id, { ...end.cols, status: 'ended' }, actor);
                id = ongoing.id;
            } else {
                id = await insertRow(c, {
                    patient_id: patientId,
                    sequence: nextSequence(rows),
                    source: 'clinic',
                    status: 'ended',
                    ...end.cols
                }, actor);
            }
            if (linkTable && linkId !== undefined && linkId !== null) {
                await c.query(`UPDATE ${linkTable} SET pregnancy_id = ? WHERE id = ?`, [id, linkId]);
            }
            const result = { pregnancy: await fetchOne(c, id) };
            if (end.warning) result.warning = end.warning;
            return result;
        });
    }

    function parseYear(value) {
        if (value === undefined || value === null || value === '') return null;
        const y = Number(value);
        if (!Number.isInteger(y) || y < 1950 || y > now().getFullYear()) fail(400, 'Tahun tidak valid');
        return y;
    }

    async function updateHistory(patientId, pregnancyId, fields, actor) {
        const f = fields || {};
        return withConn(null, async conn => {
            const [found] = await conn.query(
                'SELECT * FROM pregnancies WHERE id = ? AND patient_id = ? FOR UPDATE',
                [pregnancyId, patientId]
            );
            const row = hydrate(found && found[0]);
            if (!row) fail(404, 'Kehamilan tidak ditemukan');
            if (row.status === 'ongoing') fail(409, 'Kehamilan yang sedang berjalan tidak dapat diubah dari riwayat');

            const external = row.source === 'external';
            let hpht = row.hpht;
            let hpl = row.hpl;
            if (f.hpht !== undefined) {
                const next = f.hpht === null || f.hpht === '' ? null : parseDate(f.hpht);
                if (f.hpht !== null && f.hpht !== '' && !next) fail(400, 'HPHT tidak valid');
                if (!external && next !== row.hpht) fail(400, 'HPHT kehamilan klinik tidak dapat diubah');
                hpht = next;
            }
            if (external && f.hpl !== undefined) {
                hpl = f.hpl === null || f.hpl === '' ? null : parseDate(f.hpl);
                if (f.hpl !== null && f.hpl !== '' && !hpl) fail(400, 'HPL tidak valid');
            }
            const year = f.year !== undefined ? parseYear(f.year) : row.year;

            const merged = {
                outcome: f.outcome !== undefined ? f.outcome : row.outcome,
                ended_on: f.ended_on !== undefined ? f.ended_on : row.ended_on,
                delivery_method: f.delivery_method !== undefined ? f.delivery_method : row.delivery_method,
                delivery_indication: f.delivery_indication !== undefined ? f.delivery_indication : row.delivery_indication,
                complications: f.complications !== undefined ? f.complications : row.complications,
                complication_notes: f.complication_notes !== undefined ? f.complication_notes : row.complication_notes,
                babies: f.babies !== undefined ? f.babies : row.babies,
                kuretase: f.kuretase !== undefined ? f.kuretase : row.kuretase
            };
            const end = normalizeEnd(merged, {
                hpht,
                requireDate: !(external && year),
                allowUnknown: external
            });
            const cols = { ...end.cols };
            if (external) {
                cols.hpht = hpht;
                cols.hpl = hpl;
                cols.year = end.cols.ended_on ? Number(end.cols.ended_on.slice(0, 4)) : year;
            } else if (f.year !== undefined) {
                cols.year = year;
            }
            await updateRow(conn, row.id, cols, actor);
            const result = { pregnancy: await fetchOne(conn, row.id) };
            if (end.warning) result.warning = end.warning;
            return result;
        });
    }

    async function addExternal(patientId, fields, actor) {
        const f = fields || {};
        return withConn(null, async conn => {
            const year = parseYear(f.year);
            const end = normalizeEnd(f, { hpht: f.hpht ? parseDate(f.hpht) : null, requireDate: !year, allowUnknown: true });
            const hpht = f.hpht ? parseDate(f.hpht) : null;
            if (f.hpht && !hpht) fail(400, 'HPHT tidak valid');
            const finalYear = end.cols.ended_on ? Number(end.cols.ended_on.slice(0, 4)) : year;
            if (!finalYear) fail(400, 'Tahun tidak valid');
            const rows = await lockPregnancies(conn, patientId);
            const id = await insertRow(conn, {
                patient_id: patientId,
                sequence: nextSequence(rows),
                source: 'external',
                hpht,
                year: finalYear,
                status: 'ended',
                ...end.cols
            }, actor);
            const result = { pregnancy: await fetchOne(conn, id) };
            if (end.warning) result.warning = end.warning;
            return result;
        });
    }

    async function removeExternal(patientId, pregnancyId, actor) {
        void actor;
        const [result] = await db.query(
            "DELETE FROM pregnancies WHERE id = ? AND patient_id = ? AND source = 'external'",
            [pregnancyId, patientId]
        );
        if (!result || result.affectedRows === 0) fail(404, 'Kehamilan tidak ditemukan');
        return { removed: true };
    }

    return {
        list,
        resolveFromVisit,
        startWithPreviousEnd,
        updateHistory,
        addExternal,
        removeExternal,
        endOngoing,
        assertCanClose
    };
}

module.exports = {
    PregnancyEpisodeError,
    createPregnancyEpisodeService,
    OUTCOMES
};
