#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD_BACKEND = 'proxy_pass http://localhost:3000';
const PINNED_BACKEND = 'proxy_pass http://127.0.0.1:3000';

function pinSingleUpstream(source) {
    if (typeof source !== 'string'
        || source.match(/^include \/etc\/nginx\/snippets\/dokterdibya-staff-assets-map\.conf;$/gm)?.length !== 1
        || source.match(/^include \/etc\/nginx\/snippets\/dokterdibya-status-log-format\.conf;$/gm)?.length !== 1
        || source.match(/server_name dokterdibya\.com www\.dokterdibya\.com;/g)?.length !== 2
        || source.match(/^[ \t]*proxy_pass http:\/\/localhost:3000(?=[/;])/gm)?.length !== 6) {
        throw new Error('Unexpected Dokter Dibya upstream configuration');
    }
    const candidate = source.replace(/(^[ \t]*proxy_pass )http:\/\/localhost:3000(?=[/;])/gm,
        '$1http://127.0.0.1:3000');
    if (candidate.includes(OLD_BACKEND)
        || candidate.match(/^[ \t]*proxy_pass http:\/\/127\.0\.0\.1:3000(?=[/;])/gm)?.length !== 8
        || candidate.length !== source.length) {
        throw new Error('Incomplete Dokter Dibya upstream pin');
    }
    return candidate;
}

function flag(name) {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
    return process.argv[index + 1];
}

async function main() {
    if (process.argv.length !== 8) throw new Error('Site, output, and checksum required');
    const site = path.resolve(flag('--site'));
    const candidate = path.resolve(flag('--candidate'));
    const expectedSha256 = flag('--expected-sha256');
    if (site === candidate || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        throw new Error('Distinct paths and SHA-256 required');
    }
    const stat = await fs.promises.lstat(site);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Regular Nginx site required');
    const source = await fs.promises.readFile(site, 'utf8');
    const actualSha256 = crypto.createHash('sha256').update(source).digest('hex');
    if (actualSha256 !== expectedSha256) throw new Error('Nginx site changed');
    await fs.promises.writeFile(candidate, pinSingleUpstream(source), { flag: 'wx', mode: 0o600 });
    process.stdout.write('Single-address Nginx candidate prepared\n');
}

if (require.main === module) {
    main().catch(() => { process.stderr.write('Single-address Nginx preparation failed\n'); process.exitCode = 1; });
}

module.exports = { pinSingleUpstream, main, OLD_BACKEND, PINNED_BACKEND };
