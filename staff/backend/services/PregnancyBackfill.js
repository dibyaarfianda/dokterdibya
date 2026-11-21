'use strict';

/**
 * One-time backfill planner for pregnancy episodes. Pure: takes one patient's raw rows and
 * returns what to write. No database access here (see scripts/backfill-pregnancies.js).
 *
 * patientData = {
 *   patientId,
 *   visits:   [{ mr_id, mr_category, created_at, import_source, hpht, hpl, riwayat_persalinan }],
 *   births:   [{ id, birth_date, created_at, child_number, birth_weight, gender }],
 *   outcomes: [{ id, outcome_type, event_date }]
 * }
 * Links refer to planned pregnancies by `fingerprint` (ids exist only after insert).
 */

const { toDateString, END_TOLERANCE_DAYS } = require('./PregnancyEnd');
const { SAME_PREGNANCY_DAYS, NEW_PREGNANCY_AFTER_DAYS, gaWeeksAt } = require('./PregnancyEpisodeRules');

const FULL_TERM_DAYS = 280;
const TWIN_WINDOW_DAYS = 3;
const MAX_GA_WEEKS = 45;
const MIN_YEAR = 1990;

const REASONS = Object.freeze({
    END_UNKNOWN: 'Akhir kehamilan tidak diketahui',
    ORPHAN_EVENT: 'Kejadian tanpa data kehamilan',
    HISTORY_DIFFERS: 'Riwayat persalinan berbeda antar kunjungan',
    NO_METHOD: 'Cara lahir belum diisi'
});

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(str) {
    const [y, m, d] = str.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function addDays(str, days) {
    const date = new Date((dayNumber(str) + days) * DAY_MS);
    const pad = n => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function diffDays(a, b) {
    return dayNumber(a) - dayNumber(b);
}

function todayString(today) {
    return toDateString(today instanceof Date ? today : (today || new Date()));
}

/** Plausible date string or null (junk typed into anamnesa fields). */
function cleanDate(value, today) {
    const str = toDateString(typeof value === 'string' ? value.trim() : value);
    if (!str) return null;
    const year = Number(str.slice(0, 4));
    if (year < MIN_YEAR || year > Number(today.slice(0, 4)) + 1) return null;
    return str;
}

function createdMs(value) {
    if (value instanceof Date) return value.getTime();
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
}

function parseList(raw) {
    let value = raw;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) { return []; }
    }
    if (!Array.isArray(value)) return [];
    return value.filter(e => e && typeof e === 'object' && (e.type === 'DELIVERY' || e.type === 'ABORTUS'));
}

function entrySignature(e) {
    return JSON.stringify([e.type, e.tahun, e.bulan, e.persalinan, e.metode_persalinan, e.berat_lahir, e.jenis_kelamin, e.kuretase]
        .map(v => (v === undefined || v === null ? '' : String(v).trim())));
}

function parseWeight(value) {
    const digits = String(value === undefined || value === null ? '' : value).replace(/\D/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return n > 0 && n <= 32767 ? n : null;
}

function parseSex(value) {
    const first = String(value === undefined || value === null ? '' : value).trim().charAt(0).toLowerCase();
    if (first === 'm' || first === 'l') return 'L';
    if (first === 'f' || first === 'p') return 'P';
    return null;
}

function parseYear(value, today) {
    const n = Number(String(value === undefined || value === null ? '' : value).trim());
    if (!Number.isInteger(n) || n < MIN_YEAR || n > Number(today.slice(0, 4)) + 1) return null;
    return n;
}

function emptyPregnancy(fingerprint, source) {
    return {
        fingerprint,
        source,
        sequence: 0,
        hpht: null,
        hpl: null,
        year: null,
        status: 'ended',
        outcome: null,
        ended_on: null,
        ga_weeks_at_end: null,
        delivery_method: null,
        delivery_indication: null,
        complications: null,
        babies: null,
        kuretase: null,
        term: null,
        needs_review: false
    };
}

function gaCapped(hpht, endedOn) {
    if (!hpht || !endedOn) return null;
    const weeks = gaWeeksAt(hpht, endedOn);
    return Math.min(MAX_GA_WEEKS, Math.max(0, weeks === null ? 0 : weeks));
}

function termFrom(persalinan) {
    if (persalinan === 'Aterm') return 'aterm';
    if (persalinan === 'Preterm') return 'preterm';
    return null;
}

function outcomeClass(outcome) {
    if (outcome === 'lahir_hidup' || outcome === 'lahir_mati') return 'birth';
    if (outcome === 'abortus' || outcome === 'ektopik') return 'loss';
    return null;
}

function planBackfill(patientData, options = {}) {
    const today = todayString(options.today);
    const data = patientData || {};
    const plan = { pregnancies: [], visitLinks: [], outcomeLinks: [], birthLinks: [], reviews: [] };
    const addReview = (fingerprint, reason) => plan.reviews.push({ fingerprint, reason });

    // ---- visits -> clinic groups ---------------------------------------------------------
    const visits = (data.visits || [])
        .filter(v => v && v.mr_id && (!v.mr_category || v.mr_category === 'obstetri'))
        .map(v => {
            const hpl = cleanDate(v.hpl, today);
            const hpht = cleanDate(v.hpht, today) || (hpl ? addDays(hpl, -FULL_TERM_DAYS) : null);
            return { raw: v, mr_id: v.mr_id, ms: createdMs(v.created_at), date: toDateString(v.created_at), hpht, hpl };
        })
        .sort((a, b) => (a.ms - b.ms) || String(a.mr_id).localeCompare(String(b.mr_id)));

    const groups = [];
    for (const v of visits.filter(x => x.hpht)) {
        const group = groups.find(g => Math.abs(diffDays(v.hpht, g.hpht)) <= SAME_PREGNANCY_DAYS);
        if (group) {
            group.visits.push(v);
            group.hpht = v.hpht; // dating correction: the newest visit's HPHT wins
            if (v.hpl) group.hpl = v.hpl;
        } else {
            groups.push({ visits: [v], hpht: v.hpht, hpl: v.hpl, firstMrId: v.mr_id });
        }
    }
    groups.sort((a, b) => diffDays(a.hpht, b.hpht));

    for (const v of visits.filter(x => !x.hpht)) {
        if (!v.date) continue;
        let best = null;
        for (const g of groups) {
            const age = diffDays(v.date, g.hpht);
            if (age < 0 || age > NEW_PREGNANCY_AFTER_DAYS) continue;
            if (!best || diffDays(g.hpht, best.hpht) > 0) best = g;
        }
        if (best) best.visits.push(v);
    }

    // ---- end events ----------------------------------------------------------------------
    const births = (data.births || [])
        .map(b => ({ row: b, date: toDateString(b.birth_date) || toDateString(b.created_at) }))
        .filter(b => b.date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.row.id) - Number(b.row.id)));
    const events = [];
    for (const b of births) {
        const last = events.length ? events[events.length - 1] : null;
        if (last && last.kind === 'birth' && diffDays(b.date, last.date) <= TWIN_WINDOW_DAYS) {
            last.rows.push(b.row);
        } else {
            events.push({ kind: 'birth', date: b.date, rows: [b.row] });
        }
    }
    for (const o of data.outcomes || []) {
        const date = toDateString(o.event_date);
        if (!date) continue;
        if (o.outcome_type !== 'keguguran' && o.outcome_type !== 'lahir_mati') continue;
        events.push({ kind: 'outcome', date, rows: [o], type: o.outcome_type });
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    function babiesOf(rows) {
        return rows
            .slice()
            .sort((a, b) => (Number(a.child_number) || 0) - (Number(b.child_number) || 0) || Number(a.id) - Number(b.id))
            .map(r => ({ weight_g: parseWeight(r.birth_weight), sex: parseSex(r.gender), alive: true }));
    }

    function applyEvent(p, ev) {
        p.status = 'ended';
        p.ended_on = ev.date;
        if (ev.kind === 'birth') {
            p.outcome = 'lahir_hidup';
            p.babies = babiesOf(ev.rows);
        } else {
            p.outcome = ev.type === 'lahir_mati' ? 'lahir_mati' : 'abortus';
        }
        p.ga_weeks_at_end = gaCapped(p.hpht, ev.date);
    }

    function linkEvent(ev, fingerprint) {
        for (const row of ev.rows) {
            (ev.kind === 'birth' ? plan.birthLinks : plan.outcomeLinks).push({ id: row.id, fingerprint });
        }
    }

    // ---- clinic pregnancies --------------------------------------------------------------
    const claimed = new Set();
    const clinic = [];
    groups.forEach((g, i) => {
        const p = emptyPregnancy(`c:${g.firstMrId}`, 'clinic');
        p.hpht = g.hpht;
        p.hpl = g.hpl || null;
        const lower = addDays(g.hpht, -END_TOLERANCE_DAYS);
        const next = groups[i + 1];
        const upper = next ? addDays(next.hpht, -END_TOLERANCE_DAYS) : null;
        const ev = events.find(e => !claimed.has(e) && e.date >= lower && (upper === null || e.date < upper));
        if (ev) {
            claimed.add(ev);
            applyEvent(p, ev);
            linkEvent(ev, p.fingerprint);
        } else {
            p.status = 'unended';
        }
        for (const v of g.visits) plan.visitLinks.push({ mr_id: v.mr_id, fingerprint: p.fingerprint });
        clinic.push(p);
    });

    let newestUnended = null;
    for (const p of clinic) if (p.status === 'unended') newestUnended = p;
    for (const p of clinic) {
        if (p.status !== 'unended') continue;
        if (p === newestUnended && diffDays(today, p.hpht) <= NEW_PREGNANCY_AFTER_DAYS) {
            p.status = 'ongoing';
        } else {
            p.status = 'ended';
            p.outcome = 'unknown';
            p.needs_review = true;
            addReview(p.fingerprint, REASONS.END_UNKNOWN);
        }
    }

    const pregnancies = [...clinic];

    // ---- unmatched events ----------------------------------------------------------------
    for (const ev of events) {
        if (claimed.has(ev)) continue;
        const first = ev.rows[0];
        const p = emptyPregnancy(`${ev.kind === 'birth' ? 'b' : 'o'}:${first.id}`, 'external');
        applyEvent(p, ev);
        p.year = Number(ev.date.slice(0, 4));
        p.needs_review = true;
        addReview(p.fingerprint, REASONS.ORPHAN_EVENT);
        linkEvent(ev, p.fingerprint);
        pregnancies.push(p);
    }

    // ---- external history ----------------------------------------------------------------
    const lists = visits.map(v => ({ ms: v.ms, list: parseList(v.raw.riwayat_persalinan) })).filter(l => l.list.length);
    let best = null;
    for (const l of lists) {
        if (!best || l.list.length > best.list.length || (l.list.length === best.list.length && l.ms >= best.ms)) best = l;
    }
    let historyDiffers = false;
    if (best) {
        const bestSigs = new Set(best.list.map(entrySignature));
        historyDiffers = lists.some(l => l.list.some(e => !bestSigs.has(entrySignature(e))));
        const mergeTargets = pregnancies.filter(p => p.status === 'ended' && outcomeClass(p.outcome));
        const merged = new Set();
        best.list.forEach((entry, index) => {
            const year = parseYear(entry.tahun, today);
            const cls = entry.type === 'DELIVERY' ? 'birth' : 'loss';
            const target = year === null ? null : mergeTargets.find(p =>
                !merged.has(p) && outcomeClass(p.outcome) === cls && p.ended_on && Number(p.ended_on.slice(0, 4)) === year);
            const method = entry.metode_persalinan ? String(entry.metode_persalinan).trim() || null : null;
            if (target) {
                merged.add(target);
                if (entry.type === 'DELIVERY') {
                    if (!target.delivery_method) target.delivery_method = method;
                    if (!target.term) target.term = termFrom(entry.persalinan);
                    if (!target.babies) {
                        const weight = parseWeight(entry.berat_lahir);
                        const sex = parseSex(entry.jenis_kelamin);
                        if (weight || sex) target.babies = [{ weight_g: weight, sex, alive: true }];
                    }
                } else if (!target.kuretase && (entry.kuretase === 'Ya' || entry.kuretase === 'Tidak')) {
                    target.kuretase = entry.kuretase;
                }
                return;
            }
            const p = emptyPregnancy(`e:${index}:${entry.tahun === undefined || entry.tahun === null ? '' : String(entry.tahun).trim()}:${entry.type}`, 'external');
            p.year = year;
            if (entry.type === 'DELIVERY') {
                p.outcome = 'lahir_hidup';
                p.delivery_method = method;
                p.term = termFrom(entry.persalinan);
                const weight = parseWeight(entry.berat_lahir);
                const sex = parseSex(entry.jenis_kelamin);
                if (weight || sex) p.babies = [{ weight_g: weight, sex, alive: true }];
                if (!method) {
                    p.needs_review = true;
                    addReview(p.fingerprint, REASONS.NO_METHOD);
                }
            } else {
                p.outcome = 'abortus';
                if (entry.kuretase === 'Ya' || entry.kuretase === 'Tidak') p.kuretase = entry.kuretase;
            }
            pregnancies.push(p);
        });
    }

    // ---- sequence ------------------------------------------------------------------------
    const key = p => {
        if (p.hpht) return dayNumber(p.hpht);
        if (p.year) return dayNumber(`${p.year}-07-01`);
        if (p.ended_on) return dayNumber(p.ended_on);
        return Number.MIN_SAFE_INTEGER;
    };
    pregnancies
        .map((p, index) => ({ p, index }))
        .sort((a, b) => (key(a.p) - key(b.p)) || (a.index - b.index))
        .forEach(({ p }, i) => { p.sequence = i + 1; });
    pregnancies.sort((a, b) => a.sequence - b.sequence);

    if (historyDiffers && pregnancies.length) {
        const newest = pregnancies[pregnancies.length - 1];
        newest.needs_review = true;
        addReview(newest.fingerprint, REASONS.HISTORY_DIFFERS);
    }

    plan.pregnancies = pregnancies;
    return plan;
}

module.exports = { planBackfill, REASONS };
