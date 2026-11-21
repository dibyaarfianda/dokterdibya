'use strict';

// Android GET /api/patients/pregnancy-data: reads the pregnancies table (stage 2).
// Never names a loss: any ended pregnancy other than a live birth answers the neutral shape.

const { loadCurrentPregnancies, datingOf } = require('./CurrentPregnancy');
const { trackerDates } = require('./PregnancyTrackerDates');

const NEUTRAL = Object.freeze({ is_pregnant: false, has_given_birth: false });
const BIRTH_COLUMNS = `
    baby_name,
    DATE_FORMAT(birth_date, '%d %b %Y') as birth_date,
    birth_time,
    birth_weight,
    birth_length,
    photo_url,
    photo_r2_key,
    message as doctor_message`;
const MILESTONE_WEEKS = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];

function birthPayload(birth, getR2ProxyUrl) {
    // Backend proxy URL avoids direct R2 connectivity issues on patient devices
    const photoUrl = birth.photo_r2_key ? getR2ProxyUrl(birth.photo_r2_key) : birth.photo_url;
    return {
        is_pregnant: false,
        has_given_birth: true,
        birth_date: birth.birth_date,
        birth_time: birth.birth_time,
        baby_name: birth.baby_name,
        baby_weight: birth.birth_weight,
        baby_length: birth.birth_length,
        baby_photo_url: photoUrl,
        doctor_message: birth.doctor_message
    };
}

/** Published card of the last (live-birth) pregnancy: linked by pregnancy_id, else newest dated on/after its HPHT. */
async function findBirthCard(db, patientId, lastEnded) {
    const [linked] = await db.query(
        `SELECT ${BIRTH_COLUMNS}
           FROM birth_congratulations
          WHERE patient_id = ? AND pregnancy_id = ? AND is_published = 1
          ORDER BY created_at DESC
          LIMIT 1`,
        [patientId, lastEnded.id]
    );
    if (linked && linked.length > 0) return linked[0];

    // Fallback for cards saved before linking. Without any dating we cannot place a card in time: skip it.
    const dating = datingOf(lastEnded);
    if (!dating) return null;
    const [fallback] = await db.query(
        `SELECT ${BIRTH_COLUMNS}
           FROM birth_congratulations
          WHERE patient_id = ? AND is_published = 1 AND pregnancy_id IS NULL
            AND COALESCE(birth_date, DATE(created_at)) >= ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [patientId, dating.hpht]
    );
    return fallback && fallback.length > 0 ? fallback[0] : null;
}

function pregnancyPayload(dating, t, { BABY_SIZES, PREGNANCY_TIPS }) {
    const weeks = t.weeksPregnant;
    const babySize = BABY_SIZES[weeks] || BABY_SIZES[Math.min(weeks, 40)] || { emoji: '👶', size: 'Bayi', length: '-' };
    const closest = MILESTONE_WEEKS.reduce((prev, curr) => (Math.abs(curr - weeks) < Math.abs(prev - weeks) ? curr : prev));
    let trimester = 1;
    if (weeks >= 13 && weeks < 27) trimester = 2;
    else if (weeks >= 27) trimester = 3;
    return {
        is_pregnant: true,
        has_given_birth: false,
        weeks,
        days: t.daysExtra,
        trimester,
        hpht: dating.hpht,
        hpl: dating.hpl,
        progress: Math.min(t.daysPregnant / 280, 1.0),
        baby_size: babySize,
        tip: PREGNANCY_TIPS[closest] || ''
    };
}

async function buildPregnancyData(db, patientId, now, deps) {
    const current = (await loadCurrentPregnancies(db, [patientId])).get(String(patientId));
    if (!current) return { ...NEUTRAL };

    if (current.ongoing) {
        const dating = datingOf(current.ongoing);
        const t = dating ? trackerDates(dating.hpl, now) : null;
        if (t && t.weeksPregnant <= 42) return pregnancyPayload(dating, t, deps);
        return { ...NEUTRAL };
    }

    if (current.lastEnded && current.lastEnded.outcome === 'lahir_hidup') {
        const birth = await findBirthCard(db, patientId, current.lastEnded);
        if (birth) return birthPayload(birth, deps.getR2ProxyUrl);
    }
    return { ...NEUTRAL };
}

module.exports = { buildPregnancyData };
