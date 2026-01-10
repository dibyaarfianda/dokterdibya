#!/usr/bin/env node
/**
 * MEDIFY Daily Sync Cron Script
 * Runs daily to sync medical records from SIMRS Melinda and Gambiran
 *
 * Usage: node medify-cron.js [source]
 * source: rsia_melinda (default) or rsud_gambiran
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');

const SOURCES = ['rsia_melinda', 'rsud_gambiran'];
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Generate a system token for cron jobs
function generateSystemToken() {
    return jwt.sign(
        {
            id: 'SYSTEM_CRON',
            name: 'System Cron Job',
            role: 'dokter',
            role_id: 1,
            isCron: true
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// Make API request
function makeRequest(url, token) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// Check if credentials are configured for a source
async function checkCredentials(token, source) {
    try {
        const url = `${API_BASE}/api/medify-batch/credentials-status`;
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            };

            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.credentials?.[source] || false);
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            req.end();
        });
    } catch (err) {
        return false;
    }
}

async function runSync(source) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] MEDIFY Cron: Starting sync for ${source}`);

    try {
        const token = generateSystemToken();

        // Check if credentials are configured
        const hasCredentials = await checkCredentials(token, source);
        if (!hasCredentials) {
            console.log(`[${timestamp}] MEDIFY Cron: Skipping ${source} - credentials not configured`);
            return { success: false, message: 'Credentials not configured' };
        }

        // Trigger sync
        const url = `${API_BASE}/api/medify-batch/sync/${source}`;
        const result = await makeRequest(url, token);

        if (result.status === 200 && result.data.success) {
            console.log(`[${timestamp}] MEDIFY Cron: Sync started for ${source}`);
            console.log(`[${timestamp}] MEDIFY Cron: Batch ID: ${result.data.batchId}`);
            console.log(`[${timestamp}] MEDIFY Cron: Patients: ${result.data.count}`);
            return { success: true, ...result.data };
        } else if (result.status === 409) {
            console.log(`[${timestamp}] MEDIFY Cron: Sync already in progress for ${source}`);
            return { success: false, message: 'Sync already in progress' };
        } else {
            console.error(`[${timestamp}] MEDIFY Cron: Failed to start sync for ${source}`);
            console.error(`[${timestamp}] MEDIFY Cron: Response:`, result.data);
            return { success: false, message: result.data.message || 'Unknown error' };
        }
    } catch (error) {
        console.error(`[${timestamp}] MEDIFY Cron: Error:`, error.message);
        return { success: false, message: error.message };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const source = args[0];

    if (source) {
        // Run for specific source
        if (!SOURCES.includes(source)) {
            console.error(`Invalid source: ${source}. Must be one of: ${SOURCES.join(', ')}`);
            process.exit(1);
        }
        await runSync(source);
    } else {
        // Run for all configured sources
        console.log('MEDIFY Cron: Running sync for all configured sources...\n');
        for (const src of SOURCES) {
            await runSync(src);
            console.log(''); // Empty line between sources
        }
    }

    // Give some time for async operations to complete
    setTimeout(() => process.exit(0), 2000);
}

main().catch(err => {
    console.error('MEDIFY Cron: Fatal error:', err);
    process.exit(1);
});
