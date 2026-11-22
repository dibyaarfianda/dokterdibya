'use strict';

// A patient can have several birth cards (one per child). Staff writes target ONE card:
// by birth_id when given; without it (older cached staff pages) only when the patient has
// at most one card, so a second child's card is never overwritten or deleted by accident.

const MULTI_BIRTH_CARD_MESSAGE = 'Pasien punya lebih dari satu kartu kelahiran. Muat ulang halaman lalu pilih kartunya.';

/**
 * -> { row: {id, photo_r2_key} | null } or { status, message } when the request must be refused.
 */
async function resolveBirthCard(db, patientId, rawBirthId) {
    const [rows] = await db.query(
        'SELECT id, photo_r2_key FROM birth_congratulations WHERE patient_id = ? ORDER BY child_number ASC, id ASC',
        [patientId]
    );
    const list = rows || [];
    if (rawBirthId !== undefined && rawBirthId !== null && rawBirthId !== '') {
        const id = Number(rawBirthId);
        if (!Number.isInteger(id) || id < 1) return { status: 400, message: 'ID kartu kelahiran tidak valid' };
        const row = list.find(r => Number(r.id) === id);
        if (!row) return { status: 404, message: 'Kartu kelahiran tidak ditemukan' };
        return { row };
    }
    if (list.length > 1) return { status: 409, message: MULTI_BIRTH_CARD_MESSAGE };
    return { row: list[0] || null };
}

module.exports = { resolveBirthCard, MULTI_BIRTH_CARD_MESSAGE };
