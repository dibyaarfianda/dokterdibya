#!/usr/bin/env node
/**
 * Medify Queue Robot
 *
 * Uses existing protected API endpoints to process the current Medify queue
 * without duplicating business logic. For each queue item it can:
 * - resolve the patient into the local database
 * - trigger on-demand Medify CPPT caching
 * - report whether a DRD already exists
 *
 * Usage:
 *   npm run robot:melinda
 *   npm run robot:gambiran
 *   npm run robot:gambiran -- --limit 5
 *   npm run robot:gambiran -- --dry-run
 *   npm run robot:gambiran -- --only-with-med-id
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');

const LOCATION_LABELS = {
    rsia_melinda: 'Melinda',
    rsud_gambiran: 'Gambiran'
};
const args = process.argv.slice(2);

function getArgValue(flag) {
    const index = args.indexOf(flag);
    if (index === -1) {
        return null;
    }

    return args[index + 1] || null;
}

function hasFlag(flag) {
    return args.includes(flag);
}

function getLocation() {
        const location = getArgValue('--location') || process.env.MEDIFY_QUEUE_LOCATION || 'rsia_melinda';
        if (!LOCATION_LABELS[location]) {
                throw new Error(`Unsupported location: ${location}`);
        }
        return location;
}

function printHelp() {
        console.log(`Medify Queue Robot

Usage:
  npm run robot:melinda
    npm run robot:gambiran
    npm run robot:gambiran -- --limit 5
    npm run robot:gambiran -- --dry-run
    npm run robot:gambiran -- --only-with-med-id
    npm run robot:gambiran -- --api-base http://127.0.0.1:3000

Flags:
    --location <id>       Queue source: rsia_melinda or rsud_gambiran
  --limit <n>            Process only the first n queue items
  --dry-run              Fetch queue and print what would be processed
  --only-with-med-id     Skip queue rows that don't have a Medify case ID
  --verbose              Print per-item API responses
  --api-base <url>       Override API base URL (default: API_BASE_URL or http://localhost:3000)
  --help                 Show this help
`);
}

function getApiBase() {
    return getArgValue('--api-base') || process.env.API_BASE_URL || 'http://localhost:3000';
}

function getLimit() {
    const raw = getArgValue('--limit');
    if (!raw) {
        return null;
    }

    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function generateSystemToken() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('JWT_SECRET is not configured');
    }

    const location = getLocation();
    const locationLabel = LOCATION_LABELS[location];

    return jwt.sign(
        {
            id: `SYSTEM_${location.toUpperCase()}_ROBOT`,
            name: `${locationLabel} Queue Robot`,
            role: 'dokter',
            role_id: 1,
            is_superadmin: true,
            isRobot: true
        },
        jwtSecret,
        { expiresIn: '1h' }
    );
}

function makeRequest(url, token, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        const payload = body ? JSON.stringify(body) : '';

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: `${urlObj.pathname}${urlObj.search}`,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(payload ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                } : {})
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let parsed = data;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (_) {
                    // Keep raw string when response isn't JSON.
                }

                resolve({
                    status: res.statusCode,
                    data: parsed
                });
            });
        });

        req.on('error', reject);

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

async function fetchQueue(apiBase, token, location) {
    return makeRequest(`${apiBase}/api/appointments/hospital/${location}/live-queue`, token, 'GET');
}

async function resolveQueueItem(apiBase, token, location, item) {
    return makeRequest(
        `${apiBase}/api/appointments/hospital/${location}/resolve-queue-patient`,
        token,
        'POST',
        {
            medId: item.medId || null,
            patientName: item.patientName || '',
            age: Number.isFinite(item.age) ? item.age : null,
            medicalRecordNo: item.medicalRecordNo || null,
            autoCreatePatient: true
        }
    );
}

async function main() {
    if (hasFlag('--help')) {
        printHelp();
        return;
    }

    const apiBase = getApiBase();
    const limit = getLimit();
    const dryRun = hasFlag('--dry-run');
    const onlyWithMedId = hasFlag('--only-with-med-id');
    const verbose = hasFlag('--verbose');
    const location = getLocation();
    const locationLabel = LOCATION_LABELS[location];
    const token = generateSystemToken();

    console.log(`[Robot] API base: ${apiBase}`);
    console.log(`[Robot] Fetching ${location} live queue...`);

    const queueResponse = await fetchQueue(apiBase, token, location);
    if (queueResponse.status !== 200 || !queueResponse.data?.success) {
        throw new Error(queueResponse.data?.message || `Failed to fetch ${locationLabel} live queue`);
    }

    let items = queueResponse.data.queue?.items || [];
    if (onlyWithMedId) {
        items = items.filter((item) => !!item.medId);
    }
    if (limit) {
        items = items.slice(0, limit);
    }

    const summary = {
        queueCount: queueResponse.data.queue?.items?.length || 0,
        selectedCount: items.length,
        dryRun,
        resolved: 0,
        unresolved: 0,
        autoCreated: 0,
        existingDrd: 0,
        prefillReady: 0,
        prefillSkipped: 0,
        prefillUnavailable: 0,
        matchedByNik: 0,
        matchedByNameAge: 0,
        failures: []
    };

    if (dryRun) {
        console.log(JSON.stringify({
            ...summary,
            preview: items.map((item) => ({
                queueNumber: item.queueNumber,
                patientName: item.patientName,
                medId: item.medId || null,
                age: item.age ?? null
            }))
        }, null, 2));
        return;
    }

    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        console.log(`[Robot] ${index + 1}/${items.length} ${item.queueNumber || '-'} ${item.patientName || '-'}${item.medId ? ` (${item.medId})` : ''}`);

        try {
            const response = await resolveQueueItem(apiBase, token, location, item);
            const payload = response.data || {};

            if (response.status !== 200 || !payload.success) {
                summary.unresolved++;
                summary.failures.push({
                    queueNumber: item.queueNumber,
                    patientName: item.patientName,
                    message: payload.message || `HTTP ${response.status}`
                });
                if (verbose) {
                    console.log(JSON.stringify({ queueItem: item, response: payload }, null, 2));
                }
                continue;
            }

            summary.resolved++;

            if (payload.patientAutoCreated) {
                summary.autoCreated++;
            }

            if (payload.matchedBy === 'nik') {
                summary.matchedByNik++;
            } else if (payload.matchedBy === 'name_age') {
                summary.matchedByNameAge++;
            }

            if (payload.existingMrId) {
                summary.existingDrd++;
            }

            if (payload.prefillStatus === 'success' || payload.prefillStatus === 'existing') {
                summary.prefillReady++;
            } else if (payload.prefillStatus === 'skipped') {
                summary.prefillSkipped++;
            } else {
                summary.prefillUnavailable++;
            }

            if (verbose) {
                console.log(JSON.stringify({ queueItem: item, response: payload }, null, 2));
            }
        } catch (error) {
            summary.unresolved++;
            summary.failures.push({
                queueNumber: item.queueNumber,
                patientName: item.patientName,
                message: error.message
            });
        }
    }

    console.log('[Robot] Completed');
    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error('[Robot] Fatal error:', error.message);
    process.exit(1);
});