#!/usr/bin/env node
/**
 * MEDIFY Daily Sync Cron Script
 * Runs daily to sync medical records from SIMRS Melinda and Gambiran
 *
 * Usage:
 *   node medify-cron.js                          # All sources, HTTP mode (default)
 *   node medify-cron.js rsia_melinda              # Specific source, HTTP mode
 *   node medify-cron.js rsia_melinda --mode http  # Explicit HTTP mode
 *   node medify-cron.js --use-puppeteer           # Fallback to puppeteer
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

/**
 * Make API request with optional JSON body
 */
function makeRequest(url, token, body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const bodyStr = body ? JSON.stringify(body) : '';

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
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

        if (bodyStr) {
            req.write(bodyStr);
        }
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

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
function getTodayDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function runSync(source, mode = 'http') {
    const timestamp = new Date().toISOString();
    const targetDate = getTodayDate();
    console.log(`[${timestamp}] MEDIFY Cron: Starting sync for ${source} (mode: ${mode}, date: ${targetDate})`);

    try {
        const token = generateSystemToken();

        // Check if credentials are configured
        const hasCredentials = await checkCredentials(token, source);
        if (!hasCredentials) {
            console.log(`[${timestamp}] MEDIFY Cron: Skipping ${source} - credentials not configured`);
            return { success: false, message: 'Credentials not configured' };
        }

        // Trigger sync with date and mode
        const url = `${API_BASE}/api/medify-batch/sync/${source}`;
        const result = await makeRequest(url, token, {
            date: targetDate,
            mode: mode
        });

        if (result.status === 200 && result.data.success) {
            console.log(`[${timestamp}] MEDIFY Cron: Sync started for ${source} (mode: ${result.data.mode || mode})`);
            console.log(`[${timestamp}] MEDIFY Cron: Batch ID: ${result.data.batchId}`);
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

    // Determine mode: default HTTP, with --use-puppeteer fallback
    let mode = 'http';
    if (args.includes('--use-puppeteer')) {
        mode = 'puppeteer';
    } else if (args.includes('--mode')) {
        const modeIdx = args.indexOf('--mode');
        if (args[modeIdx + 1]) {
            mode = args[modeIdx + 1] === 'puppeteer' ? 'puppeteer' : 'http';
        }
    }

    // Find source argument (first arg that's not a flag)
    const source = args.find(a => !a.startsWith('--') && SOURCES.includes(a));

    console.log(`MEDIFY Cron: Mode = ${mode}`);

    if (source) {
        // Run for specific source
        await runSync(source, mode);
    } else {
        // Run for all configured sources
        console.log('MEDIFY Cron: Running sync for all configured sources...\n');
        for (const src of SOURCES) {
            await runSync(src, mode);
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
