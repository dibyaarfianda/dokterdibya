#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    runReconciliation, assertExternalPath, publishExclusive, canonicalJson, ReconciliationError
} = require('../services/LegacyMedicalReconciliation');

const VALUE_FLAGS = new Set(['--backup', '--backup-sha256', '--manifest',
    '--confirm-manifest-sha256', '--confirm', '--receipt']);

function parseArguments(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        if (flag === '--apply') {
            if (result.apply) throw new ReconciliationError('ARGUMENTS_INVALID');
            result.apply = true;
            continue;
        }
        if (!VALUE_FLAGS.has(flag) || result[flag] !== undefined || index + 1 >= argv.length ||
            argv[index + 1].startsWith('--')) throw new ReconciliationError('ARGUMENTS_INVALID');
        result[flag] = argv[++index];
    }
    if (!result['--backup'] || !result['--backup-sha256'] || !result['--manifest']) {
        throw new ReconciliationError('ARGUMENTS_INVALID');
    }
    if (!result.apply && (result['--confirm'] || result['--confirm-manifest-sha256'])) {
        throw new ReconciliationError('ARGUMENTS_INVALID');
    }
    return result;
}

function writePublicReceipt(filename, receipt) {
    const destination = assertExternalPath(filename);
    const temporary = path.join(path.dirname(destination), `.medical-receipt-${crypto.randomUUID()}.tmp`);
    try {
        const descriptor = fs.openSync(temporary, 'wx', 0o644);
        try {
            fs.writeFileSync(descriptor, `${canonicalJson(receipt)}\n`, 'utf8');
            fs.fsyncSync(descriptor);
        } finally { fs.closeSync(descriptor); }
        publishExclusive(temporary, destination);
    } catch (error) {
        if (error?.code === 'EEXIST') throw new ReconciliationError('RECEIPT_EXISTS');
        if (error instanceof ReconciliationError) throw error;
        throw new ReconciliationError('RECEIPT_WRITE_FAILED');
    } finally {
        try { fs.unlinkSync(temporary); } catch (_) { /* no partial public receipt remains */ }
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArguments(argv);
    if (options['--receipt']) assertExternalPath(options['--receipt']);
    let pool;
    try {
        const result = await runReconciliation({
            mode: options.apply ? 'apply' : 'dry-run',
            backupPath: options['--backup'], backupSha256: options['--backup-sha256'],
            manifestPath: options['--manifest'],
            confirmationSha256: options['--confirm-manifest-sha256'],
            confirmPhrase: options['--confirm'],
            dbFactory: () => {
                require('dotenv').config();
                const mysql = require('mysql2/promise');
                pool = mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
                    waitForConnections: false, connectionLimit: 1, timezone: '+07:00' });
                return pool;
            }
        });
        const receipt = { algorithmVersion: result.algorithmVersion, schemaVersion: result.schemaVersion,
            databaseVersion: result.databaseVersion, snapshotAt: result.snapshotAt,
            backupSha256: result.backupSha256, manifestSha256: result.manifestSha256,
            counts: result.counts, hashes: result.hashes };
        if (options['--receipt']) writePublicReceipt(options['--receipt'], receipt);
        process.stdout.write(`${canonicalJson(receipt)}\n`);
    } finally {
        if (pool) await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        // Never echo exception messages, private paths, SQL, identifiers or payloads.
        process.stderr.write(`ERROR ${error instanceof ReconciliationError ? error.code : 'RECONCILIATION_FAILED'}\n`);
        process.exitCode = 1;
    });
}

module.exports = { main, parseArguments, writePublicReceipt };
