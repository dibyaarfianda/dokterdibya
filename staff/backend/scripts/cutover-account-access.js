#!/usr/bin/env node
'use strict';

const db = require('../db');
const {
    parseArguments,
    runCutover,
    writeReport
} = require('../services/AccountAccessCutoverService');

async function main() {
    const options = parseArguments(process.argv.slice(2));
    try {
        const report = await runCutover({
            db,
            role: options.role,
            operation: options.operation
        });
        writeReport(options.reportPath, report);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
        await db.end();
    }
}

main().catch(error => {
    process.stderr.write(`Account cutover failed: ${error.message}\n`);
    process.exitCode = 1;
});
