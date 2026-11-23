#!/usr/bin/env node
'use strict';

/**
 * Nightly copy of the Medify Melinda drug usage report.
 *   node scripts/melinda-drug-usage-sync.js
 *   node scripts/melinda-drug-usage-sync.js --from 2026-10 --to 2026-11
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function optionValue(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
    const { createMelindaDrugUsageSync, periodsBetween } = require('../services/MelindaDrugUsageSync');
    const { createSession } = require('../services/medifyHttpService');
    const pool = require('../db');

    const args = process.argv.slice(2);
    const from = optionValue(args, '--from');
    const to = optionValue(args, '--to');
    if (Boolean(from) !== Boolean(to)) throw new Error('Gunakan --from dan --to bersama-sama');

    const periods = from ? periodsBetween(from, to) : undefined;
    const result = await createMelindaDrugUsageSync({ pool, createSession }).run({ periods });
    console.log(JSON.stringify({ at: new Date().toString(), ...result }));
    return result.status === 'success' || result.status === 'skipped' ? 0 : 1;
}

main()
    .then(code => process.exit(code))
    .catch(error => {
        console.error(`Melinda drug usage sync failed: ${error.message}`);
        process.exit(1);
    });
