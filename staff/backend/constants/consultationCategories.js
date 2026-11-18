'use strict';

/**
 * Klinik Privat booking categories (sunday_appointments.consultation_category).
 * Labels match getCategoryLabel() in routes/sunday-appointments.js; a unit test keeps them equal.
 */
const CONSULTATION_CATEGORIES = Object.freeze({
    obstetri: 'Kehamilan (Obstetri)',
    gyn_repro: 'Program Hamil (Reproduksi)',
    gyn_special: 'Ginekologi Umum'
});

const CONSULTATION_CATEGORY_CODES = Object.freeze(Object.keys(CONSULTATION_CATEGORIES));

function isConsultationCategory(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CONSULTATION_CATEGORIES, code);
}

module.exports = {
    CONSULTATION_CATEGORIES,
    CONSULTATION_CATEGORY_CODES,
    isConsultationCategory
};
