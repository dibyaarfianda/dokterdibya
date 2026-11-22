'use strict';

/**
 * Pure rules for a patient reporting how her pregnancy ended (portal).
 * Dates are 'YYYY-MM-DD' strings; day maths uses calendar day numbers, never toISOString.
 */

const { toDateString } = require('./PregnancyEnd');
const { datingOf, dayNumber } = require('./CurrentPregnancy');
const { gaWeeksAt, lossTypeForGa } = require('./PregnancyEpisodeRules');

const REPORT_ANSWERS = Object.freeze(['lahir_sehat', 'keguguran', 'ektopik', 'masih_hamil']);
const SNOOZE_DAYS = 7;
const MAX_PLACE_LENGTH = 120;
const MIN_WEIGHT_G = 500;
const MAX_WEIGHT_G = 6000;
const MAX_BABIES = 3;
const DELIVERY_LABELS = Object.freeze({ normal: 'Spt B (Spontan)', sc: 'SC (Caesar)' });
const REVIEW_REASON = 'Dilaporkan pasien';
const DAY_MS = 24 * 60 * 60 * 1000;

class PatientReportError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'PatientReportError';
        this.status = status;
    }
}

function pad(n) {
    return String(n).padStart(2, '0');
}

// UTC day number -> its own calendar date.
function fromDay(n) {
    const d = new Date(n * DAY_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Same thresholds as PregnancyEpisodeService.termForGa (kept private there).
function termForGa(ga) {
    if (ga === null || ga === undefined) return null;
    if (ga < 37) return 'preterm';
    if (ga >= 42) return 'postterm';
    return 'aterm';
}

/** True when an ongoing pregnancy's HPL is before today. */
function isPastHpl(ongoingRow, todayStr) {
    if (!ongoingRow) return false;
    const dating = datingOf(ongoingRow);
    const today = dayNumber(todayStr);
    if (!dating || today === null) return false;
    return dayNumber(dating.hpl) < today;
}

/** Ask only when past HPL and not snoozed (snooze null or before today). */
function shouldAsk(ongoingRow, todayStr) {
    if (!isPastHpl(ongoingRow, todayStr)) return false;
    const snoozed = toDateString(ongoingRow.report_snoozed_until);
    if (!snoozed) return true;
    return dayNumber(snoozed) < dayNumber(todayStr);
}

function snoozeUntil(todayStr) {
    const today = dayNumber(todayStr);
    if (today === null) return null;
    return fromDay(today + SNOOZE_DAYS);
}

function fail(message) {
    return new PatientReportError(400, message);
}

function normalizeBabies(rawBabies) {
    if (!Array.isArray(rawBabies) || rawBabies.length < 1 || rawBabies.length > MAX_BABIES) {
        throw fail('Jumlah bayi harus 1 sampai 3.');
    }
    return rawBabies.map(b => {
        const w = b ? b.weight_g : undefined;
        if (typeof w !== 'number' || !Number.isInteger(w) || w < MIN_WEIGHT_G || w > MAX_WEIGHT_G) {
            throw fail('Berat bayi harus 500 sampai 6000 gram.');
        }
        return { weight_g: w, alive: true };
    });
}

/**
 * Validate a patient's closing answer -> { cols } for the pregnancies UPDATE.
 * Throws PatientReportError(400, ...) on invalid input. 'masih_hamil' is not a closing answer.
 */
function normalizePatientReport(body, { hpht, today, patientId } = {}) {
    const b = body && typeof body === 'object' ? body : {};
    const answer = b.answer;
    if (answer === 'masih_hamil') throw fail('Jawaban ini tidak menutup kehamilan.');
    if (!REPORT_ANSWERS.includes(answer)) throw fail('Jawaban tidak valid.');

    const endedOn = typeof b.ended_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.ended_on)
        ? toDateString(b.ended_on)
        : null;
    if (!endedOn) throw fail('Tanggal wajib diisi.');
    const endDay = dayNumber(endedOn);
    const hphtDay = dayNumber(hpht);
    const todayDay = dayNumber(today);
    if (hphtDay !== null && endDay < hphtDay) throw fail('Tanggal tidak boleh sebelum HPHT.');
    if (todayDay !== null && endDay > todayDay) throw fail('Tanggal tidak boleh di masa depan.');

    let place = null;
    if (b.place !== undefined && b.place !== null && String(b.place).trim() !== '') {
        place = String(b.place).trim();
        if (place.length > MAX_PLACE_LENGTH) throw fail('Tempat terlalu panjang (maksimal 120 karakter).');
    }

    const ga = gaWeeksAt(hpht, endedOn);
    const cols = {
        status: 'ended',
        ended_on: endedOn,
        ga_weeks_at_end: ga === null ? null : Math.min(ga, 127), // signed TINYINT column
        delivery_place: place,
        ended_by_patient: 1,
        needs_review: 1,
        review_reason: REVIEW_REASON,
        updated_by: `patient:${patientId}`
    };

    if (answer === 'lahir_sehat') {
        if (!place) throw fail('Tempat bersalin wajib diisi.');
        const method = typeof b.delivery === 'string' && Object.prototype.hasOwnProperty.call(DELIVERY_LABELS, b.delivery)
            ? DELIVERY_LABELS[b.delivery]
            : null;
        if (!method) throw fail('Cara persalinan tidak valid.');
        const babies = normalizeBabies(b.babies);
        return {
            cols: {
                ...cols,
                outcome: 'lahir_hidup',
                delivery_method: method,
                babies: JSON.stringify(babies),
                term: termForGa(ga)
            }
        };
    }

    return {
        cols: {
            ...cols,
            outcome: answer === 'ektopik' ? 'ektopik' : lossTypeForGa(ga),
            delivery_method: null,
            babies: null,
            term: null
        }
    };
}

module.exports = {
    REPORT_ANSWERS,
    SNOOZE_DAYS,
    PatientReportError,
    isPastHpl,
    shouldAsk,
    snoozeUntil,
    normalizePatientReport,
    termForGa
};
