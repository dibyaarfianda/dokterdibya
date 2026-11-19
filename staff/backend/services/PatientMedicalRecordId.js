'use strict';

/**
 * Patient id in the format P{year}{sequence}, e.g. P2025001.
 * Moved out of routes/patients-auth.js so CLI scripts can create patients with the same ids.
 */
async function generateUniqueMedicalRecordId(executor = require('../db'), now = new Date()) {
    const year = now.getFullYear();

    // Get the highest ID for this year
    const [maxIdResult] = await executor.query(
        `SELECT id FROM patients WHERE id LIKE 'P${year}%' ORDER BY id DESC LIMIT 1`
    );

    let nextNumber = 1;
    if (maxIdResult.length > 0) {
        const lastId = maxIdResult[0].id;
        const lastNumber = parseInt(lastId.substring(5)); // Remove 'P2025'
        nextNumber = lastNumber + 1;
    }

    return `P${year}${String(nextNumber).padStart(3, '0')}`;
}

module.exports = { generateUniqueMedicalRecordId };
