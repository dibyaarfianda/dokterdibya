'use strict';

/**
 * Patient Activity Logger Service
 * Fire-and-forget async logging for patient portal activities.
 * Failures are silently caught — logging must never break patient requests.
 */

const db = require('../db');
const logger = require('../utils/logger');

const EVENTS = {
    LOGIN: 'login',
    VIEW_HALAMAN: 'view_halaman',
    BOOKING: 'booking',
    PEMBAYARAN: 'pembayaran'
};

/**
 * Log a patient activity (fire-and-forget).
 * @param {string} patientId - Patient ID (e.g. P2025001)
 * @param {string} eventType - One of EVENTS values
 * @param {object|null} details - { page_name, detail }
 * @param {object|null} req - Express request (for IP & user-agent)
 */
function logActivity(patientId, eventType, details, req) {
    if (!patientId || !eventType) return;

    db.query(
        'INSERT INTO patient_activity_log (patient_id, event_type, page_name, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [
            patientId,
            eventType,
            (details && details.page_name) || null,
            (details && details.detail) || null,
            (req && req.ip) || null,
            (req && req.get && req.get('User-Agent') || '').substring(0, 255) || null
        ]
    ).catch(function(err) {
        logger.error('Patient activity log failed', {
            error: err.message,
            patientId: patientId,
            eventType: eventType
        });
    });
}

module.exports = {
    EVENTS,
    logActivity
};
