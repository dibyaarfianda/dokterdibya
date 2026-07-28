'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', 'tests', 'migrations', 'scripts'].includes(entry.name)) return [];
            return listJavaScriptFiles(fullPath);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

const REQUIRED_TABLES = [
    'birth_class_sessions',
    'birth_class_registrations',
    'community_chat_rooms',
    'community_chat_profiles',
    'community_chat_messages',
    'community_chat_room_moderators',
    'community_chat_room_members',
    'contraction_sessions',
    'contraction_events',
    'docboard_space_schedules',
    'docboard_alarms',
    'guest_activity_log',
    'kick_counter_sessions',
    'kick_counter_kicks',
    'patient_access_blocklist',
    'patient_queue_reminder_settings',
    'patient_workdesk_layouts',
    'polls',
    'poll_options',
    'poll_votes',
    'poll_comments',
    'poll_comment_likes',
    'staff_workdesk_layouts',
    'support_faq',
    'support_chat_sessions',
    'support_chat_messages',
    'support_chat_ratings',
    'staff_daily_briefings',
    'staff_duty_logs'
];

describe('Wave 6 operational schema and startup contracts', () => {
    test('active JavaScript contains no runtime schema mutation', () => {
        const offenders = listJavaScriptFiles(backendRoot)
            .filter((filePath) => /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX)\b/i.test(fs.readFileSync(filePath, 'utf8')))
            .map((filePath) => path.relative(backendRoot, filePath));

        expect(offenders).toEqual([]);
    });

    test('additive migration owns every operational table and schema evolution', () => {
        const migration = read('migrations/20260719_staff_wave6_operational_schema.sql');

        for (const tableName of REQUIRED_TABLES) {
            expect(migration).toContain(tableName);
        }
        expect(migration).toContain('medical_records');
        expect(migration).toContain('birth_congratulations');
        expect(migration).toContain("'pemeriksaan_ginekologi'");
        expect(migration).toContain("'penunjang'");
        expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/i);
    });

    test('operational validator exposes scoped cached validation and explicit migration error', () => {
        const validator = read('services/OperationalSchemaValidator.js');

        expect(validator).toContain('OPERATIONAL_SCHEMA_SCOPES');
        expect(validator).toContain('validateOperationalSchemaScope');
        expect(validator).toContain('validateAllOperationalSchemas');
        expect(validator).toContain('20260719_staff_wave6_operational_schema.sql');
        expect(validator).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE/i);
    });

    test('Firebase and SMTP external checks are lazy and degraded-safe', () => {
        const firebase = read('services/firebase.js');
        const notification = read('utils/notification.js');

        expect(firebase).toContain('function initializeFirebase()');
        expect(firebase).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
        expect(firebase).not.toContain("const serviceAccountPath = path.join(__dirname");
        expect(notification).toContain('async verifyEmailTransport()');

        const constructorStart = notification.indexOf('constructor()');
        const constructorEnd = notification.indexOf('invalidateTemplateCache()', constructorStart);
        expect(notification.slice(constructorStart, constructorEnd)).not.toContain('emailTransporter.verify()');
    });

    test('PM2 defaults to one cluster worker with readiness and short crash delay', () => {
        const ecosystem = read('ecosystem.config.js');

        expect(ecosystem).toContain("exec_mode: process.env.PM2_EXEC_MODE || 'cluster'");
        expect(ecosystem).toContain('instances: parseInt(process.env.PM2_INSTANCES, 10) || 1');
        expect(ecosystem).toContain('wait_ready: true');
        expect(ecosystem).toContain('restart_delay: 1000');
    });
});
