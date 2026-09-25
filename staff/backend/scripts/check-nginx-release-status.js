#!/usr/bin/env node
const fs = require('fs');
const { scoreNginxStatusLog, STATUS_LOG } = require('../services/nginxReleaseStatus');

function main() {
    if (process.argv.length !== 4 || process.argv[2] !== '--cutover-ms'
        || !/^\d{13}$/.test(process.argv[3])) throw new Error('Exact cutover epoch milliseconds required');
    const cutover = Number(process.argv[3]);
    let contents = '';
    const previous = `${STATUS_LOG}.1`;
    if (fs.existsSync(previous)) contents += fs.readFileSync(previous, 'utf8');
    contents += fs.readFileSync(STATUS_LOG, 'utf8');
    const result = scoreNginxStatusLog(contents, { cutover, maxErrorRatePercent: 1 });
    process.stdout.write(JSON.stringify(result) + '\n');
}

try { main(); }
catch (_) { process.stderr.write('Nginx five-minute 5xx gate failed\n'); process.exitCode = 1; }
