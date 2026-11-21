const { findOngoingPregnancy } = require('./PregnancyTrackerDates');

// Id of the patient's ongoing pregnancy, or null. Never throws: a failed lookup
// (e.g. table not migrated yet) must not block the patient's session.
async function findOngoingPregnancyId(db, patientId, log = console.error) {
    try {
        const pregnancy = await findOngoingPregnancy(db, patientId);
        return pregnancy ? pregnancy.id : null;
    } catch (error) {
        log('Session pregnancy lookup failed, saving session without pregnancy_id:', error.message);
        return null;
    }
}

module.exports = { findOngoingPregnancyId };
