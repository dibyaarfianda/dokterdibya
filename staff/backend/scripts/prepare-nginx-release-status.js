#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { instrumentStatusLogging } = require('../services/nginxReleaseStatus');

function flag(name) {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
    return path.resolve(process.argv[index + 1]);
}

async function main() {
    if (process.argv.length !== 8) throw new Error('Site and two output paths required');
    const site = flag('--site');
    const candidate = flag('--candidate');
    const format = flag('--format');
    if (new Set([site, candidate, format]).size !== 3) throw new Error('Status log paths overlap');
    const stat = await fs.promises.lstat(site);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Regular Nginx site required');
    const source = await fs.promises.readFile(site, 'utf8');
    const prepared = instrumentStatusLogging(source);
    const formatSource = path.resolve(__dirname, '../../../deployment/nginx/dokterdibya-status-log-format.conf');
    const template = await fs.promises.readFile(formatSource, 'utf8');
    await fs.promises.writeFile(candidate, prepared, { flag: 'wx', mode: 0o600 });
    try { await fs.promises.writeFile(format, template, { flag: 'wx', mode: 0o600 }); }
    catch (error) { await fs.promises.unlink(candidate); throw error; }
    process.stdout.write('Status-only Nginx candidates prepared\n');
}

main().catch(() => { process.stderr.write('Status-only Nginx preparation failed\n'); process.exitCode = 1; });
