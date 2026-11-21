'use strict';

/**
 * Pure rules for pregnancy episodes (one record per pregnancy per patient).
 * Dates are local 'YYYY-MM-DD' strings (or Date objects read with local components);
 * toISOString is never used for date-only values.
 */

const { toDateString } = require('./PregnancyEnd');

// HPHT within this many days (either direction) of the ongoing pregnancy's HPHT is a dating correction.
const SAME_PREGNANCY_DAYS = 14;
// 42 weeks: a new HPHT this far after the ongoing one can only be a new pregnancy.
const NEW_PREGNANCY_AFTER_DAYS = 294;
// Loss before this many weeks is an abortus; from this many weeks it is a stillbirth (lahir mati).
const VIABILITY_WEEKS = 20;
const DELIVERY_METHODS = Object.freeze(['Spt B (Spontan)', 'SC (Caesar)', 'Vakum', 'Forceps']);

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(value) {
    const str = toDateString(value);
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    // UTC math on the calendar components avoids DST shifts; the string itself is local.
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function gaWeeksAt(hpht, date) {
    const start = dayNumber(hpht);
    const end = dayNumber(date);
    if (start === null || end === null || end < start) return null;
    return Math.floor((end - start) / 7);
}

function lossTypeForGa(weeks) {
    if (weeks === null || weeks === undefined || Number.isNaN(Number(weeks))) return null;
    return Number(weeks) >= VIABILITY_WEEKS ? 'lahir_mati' : 'abortus';
}

/**
 * Decide what an obstetri visit save with `newHpht` means for the patient's episodes.
 * ongoing: { hpht, ended } of the patient's newest pregnancy, or null.
 */
function decideEpisodeAction({ ongoing, newHpht } = {}) {
    const newDay = dayNumber(newHpht);
    if (newDay === null) return 'none';
    if (!ongoing || ongoing.ended) return 'start';
    const ongoingDay = dayNumber(ongoing.hpht);
    if (ongoingDay === null) return 'start';
    const diff = newDay - ongoingDay;
    if (Math.abs(diff) <= SAME_PREGNANCY_DAYS) return 'update';
    if (diff < 0) return 'none';
    return 'start_needs_previous_end';
}

/** True when newHpht is more than 42 weeks after hpht (can only be a new pregnancy). */
function isAfterFullTerm(hpht, newHpht) {
    const a = dayNumber(hpht);
    const b = dayNumber(newHpht);
    return a !== null && b !== null && b - a > NEW_PREGNANCY_AFTER_DAYS;
}

function isOngoing(p) {
    return !!p && p.status === 'ongoing';
}

function computeObstetricTotals(pregnancies, { includeOngoing = false } = {}) {
    const list = Array.isArray(pregnancies) ? pregnancies : [];
    const totals = { gravida: 0, para: 0, abortus: 0, anak_hidup: 0 };
    for (const p of list) {
        if (!p) continue;
        if (isOngoing(p)) {
            if (includeOngoing) totals.gravida += 1;
            continue;
        }
        totals.gravida += 1;
        if (p.outcome === 'lahir_hidup' || p.outcome === 'lahir_mati') totals.para += 1;
        if (p.outcome === 'abortus' || p.outcome === 'ektopik') totals.abortus += 1;
        if (p.outcome === 'lahir_hidup') {
            const babies = Array.isArray(p.babies) ? p.babies : [];
            totals.anak_hidup += babies.length
                ? babies.filter(b => !b || b.alive !== false).length
                : 1;
        }
    }
    return totals;
}

/**
 * Counts the automatic obstetric diagnosis needs beyond G/P/A/hidup. Ended deliveries only
 * (clinic and external alike); ongoing pregnancies are never a delivery.
 * preterm = term 'preterm'; every other delivery (aterm, postterm, unknown) counts as aterm so
 * aterm + preterm always equals para. sc_count = deliveries by SC (Caesar).
 */
function computeDiagnosisCounts(pregnancies) {
    const out = { aterm: 0, preterm: 0, sc_count: 0 };
    for (const p of Array.isArray(pregnancies) ? pregnancies : []) {
        if (!p || isOngoing(p)) continue;
        if (p.outcome !== 'lahir_hidup' && p.outcome !== 'lahir_mati') continue;
        // Unknown-term deliveries count as aterm here (never dropped from the P string).
        if (p.term === 'preterm') out.preterm += 1; else out.aterm += 1;
        if (p.delivery_method === 'SC (Caesar)') out.sc_count += 1;
    }
    return out;
}

function sortKey(p) {
    const day = dayNumber(p.ended_on);
    if (day !== null) return day;
    const hpht = dayNumber(p.hpht);
    if (hpht !== null) return hpht;
    if (p.year) return Math.round(Date.UTC(Number(p.year), 0, 1) / DAY_MS);
    return Number.MAX_SAFE_INTEGER;
}

/**
 * Ended pregnancies -> entries in the shape the anamnesa riwayat persalinan editor uses.
 * One entry per pregnancy: for multiples berat_lahir / jenis_kelamin come from the first baby.
 */
function toRiwayatPersalinanList(pregnancies) {
    const list = (Array.isArray(pregnancies) ? pregnancies : [])
        .filter(p => p && !isOngoing(p))
        .map((p, index) => ({ p, index }))
        .sort((a, b) => (sortKey(a.p) - sortKey(b.p)) || (a.index - b.index));

    const entries = [];
    for (const { p } of list) {
        const ended = toDateString(p.ended_on);
        const year = ended ? Number(ended.slice(0, 4)) : (p.year ? Number(p.year) : null);
        if (p.outcome === 'lahir_hidup' || p.outcome === 'lahir_mati') {
            const first = Array.isArray(p.babies) && p.babies.length ? p.babies[0] : null;
            entries.push({
                type: 'DELIVERY',
                tahun: year,
                bulan: ended ? Number(ended.slice(5, 7)) : null,
                // Unknown term stays unknown (never guessed as Aterm); the editor has no Postterm option.
                persalinan: p.term === 'preterm' ? 'Preterm' : (p.term === 'aterm' || p.term === 'postterm' ? 'Aterm' : null),
                metode_persalinan: p.delivery_method || null,
                berat_lahir: first && first.weight_g ? first.weight_g : null,
                jenis_kelamin: first && first.sex ? first.sex : null,
                kuretase: null
            });
        } else if (p.outcome === 'abortus' || p.outcome === 'ektopik') {
            entries.push({
                type: 'ABORTUS',
                tahun: year,
                bulan: null,
                persalinan: null,
                metode_persalinan: null,
                berat_lahir: null,
                jenis_kelamin: null,
                kuretase: p.kuretase === 'Ya' ? 'Ya' : 'Tidak'
            });
        }
    }
    return entries;
}

module.exports = {
    SAME_PREGNANCY_DAYS,
    NEW_PREGNANCY_AFTER_DAYS,
    VIABILITY_WEEKS,
    DELIVERY_METHODS,
    gaWeeksAt,
    lossTypeForGa,
    decideEpisodeAction,
    isAfterFullTerm,
    computeObstetricTotals,
    computeDiagnosisCounts,
    toRiwayatPersalinanList
};
