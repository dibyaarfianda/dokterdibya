'use strict';

const db = require('../db');

const MIGRATION_NAME = '20260719_staff_wave6_operational_schema.sql';

const OPERATIONAL_SCHEMA_SCOPES = Object.freeze({
    birthClasses: {
        birth_class_sessions: ['id', 'learning_points', 'items_to_bring', 'price', 'benefits'],
        birth_class_registrations: ['id', 'session_id', 'payment_status', 'payment_method', 'payment_amount', 'paid_at']
    },
    communityChat: {
        community_chat_rooms: ['id', 'is_direct', 'direct_patient_id', 'direct_staff_id', 'is_archived'],
        community_chat_profiles: ['id', 'user_id', 'user_type'],
        community_chat_messages: ['id', 'room_id', 'sender_id'],
        community_chat_room_moderators: ['room_id', 'staff_user_id'],
        community_chat_room_members: ['room_id', 'user_id', 'user_type']
    },
    contractionTimer: {
        contraction_sessions: ['id', 'patient_id', 'started_at', 'status'],
        contraction_events: ['id', 'session_id', 'started_at_client', 'duration_seconds']
    },
    docboard: {
        docboard_space_schedules: ['id', 'user_id', 'space', 'schedule_date', 'status']
    },
    guestActivity: {
        guest_activity_log: ['id', 'session_id', 'event_type', 'created_at']
    },
    kickCounter: {
        kick_counter_sessions: ['id', 'patient_id', 'start_time', 'status'],
        kick_counter_kicks: ['id', 'session_id', 'kick_time']
    },
    medicalRecords: {
        medical_records: ['id', 'patient_id', 'visit_id', 'mr_id', 'record_type', 'record_data']
    },
    patientAccessBlocklist: {
        patient_access_blocklist: ['id', 'block_type', 'normalized_value', 'is_active']
    },
    patientNotifications: {
        patient_queue_reminder_settings: ['patient_id', 'enabled', 'threshold_ahead', 'background_push_enabled']
    },
    patientWorkdesk: {
        patient_workdesk_layouts: ['patient_id', 'layout_json', 'share_code', 'updated_at']
    },
    polls: {
        polls: ['id', 'title', 'status'],
        poll_options: ['id', 'poll_id', 'option_text'],
        poll_votes: ['id', 'poll_id', 'option_id', 'patient_id'],
        poll_comments: ['id', 'poll_id', 'patient_id', 'comment_text'],
        poll_comment_likes: ['id', 'comment_id', 'patient_id']
    },
    staffWorkdesk: {
        staff_workdesk_layouts: ['user_id', 'layout_json', 'updated_at']
    },
    supportChat: {
        support_faq: ['id', 'keywords', 'answer'],
        support_chat_sessions: [
            'id', 'patient_id', 'status', 'owner_staff_id', 'owner_staff_name',
            'owner_locked_at', 'resolved_at', 'resolved_by_staff_id', 'resolved_by_staff_name'
        ],
        support_chat_messages: ['id', 'session_id', 'sender_type', 'content'],
        support_chat_ratings: ['id', 'session_id', 'patient_id', 'rating'],
        staff_daily_briefings: ['id', 'staff_id', 'briefing_date'],
        staff_duty_logs: ['id', 'staff_id', 'duty_date']
    },
    birthTestimonials: {
        birth_congratulations: ['id', 'patient_testimonial', 'patient_testimonial_submitted_at']
    }
});

const scopeValidationPromises = new Map();
let allValidationPromise = null;

function schemaError(scopeName, missing) {
    const error = new Error(
        `Operational schema scope "${scopeName}" is incomplete: ${missing.join(', ')}. ` +
        `Run migration ${MIGRATION_NAME}.`
    );
    error.code = 'OPERATIONAL_SCHEMA_MISSING';
    error.statusCode = 503;
    error.scope = scopeName;
    error.missing = missing;
    return error;
}

function collectMissing(requirements, rows) {
    const available = new Map();
    for (const row of rows || []) {
        const tableName = row.TABLE_NAME || row.table_name;
        const columnName = row.COLUMN_NAME || row.column_name;
        if (!available.has(tableName)) available.set(tableName, new Set());
        available.get(tableName).add(columnName);
    }

    return Object.entries(requirements).flatMap(([tableName, columns]) => {
        const availableColumns = available.get(tableName) || new Set();
        return columns
            .filter((columnName) => !availableColumns.has(columnName))
            .map((columnName) => `${tableName}.${columnName}`);
    });
}

async function loadSchemaRows(requirements) {
    const tableNames = Object.keys(requirements);
    const [rows] = await db.query(
        `SELECT TABLE_NAME, COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN (?)`,
        [tableNames]
    );
    return rows;
}

function validateOperationalSchemaScope(scopeName) {
    if (!Object.prototype.hasOwnProperty.call(OPERATIONAL_SCHEMA_SCOPES, scopeName)) {
        return Promise.reject(new Error(`Unknown operational schema scope: ${scopeName}`));
    }

    if (!scopeValidationPromises.has(scopeName)) {
        const requirements = OPERATIONAL_SCHEMA_SCOPES[scopeName];
        const validation = loadSchemaRows(requirements).then((rows) => {
            const missing = collectMissing(requirements, rows);
            if (missing.length > 0) throw schemaError(scopeName, missing);
            return true;
        });
        scopeValidationPromises.set(scopeName, validation);
    }

    return scopeValidationPromises.get(scopeName);
}

function mergeAllRequirements() {
    const merged = {};
    for (const requirements of Object.values(OPERATIONAL_SCHEMA_SCOPES)) {
        for (const [tableName, columns] of Object.entries(requirements)) {
            merged[tableName] = Array.from(new Set([...(merged[tableName] || []), ...columns]));
        }
    }
    return merged;
}

function validateAllOperationalSchemas() {
    if (!allValidationPromise) {
        const requirements = mergeAllRequirements();
        allValidationPromise = loadSchemaRows(requirements).then((rows) => {
            const missing = collectMissing(requirements, rows);
            if (missing.length > 0) throw schemaError('all', missing);
            for (const scopeName of Object.keys(OPERATIONAL_SCHEMA_SCOPES)) {
                scopeValidationPromises.set(scopeName, Promise.resolve(true));
            }
            return true;
        });
    }
    return allValidationPromise;
}

function resetOperationalSchemaValidationForTests() {
    scopeValidationPromises.clear();
    allValidationPromise = null;
}

module.exports = {
    MIGRATION_NAME,
    OPERATIONAL_SCHEMA_SCOPES,
    collectMissing,
    validateOperationalSchemaScope,
    validateAllOperationalSchemas,
    resetOperationalSchemaValidationForTests
};
