#!/usr/bin/env node
const fs = require('fs');
const { prepareStaffNginxInstallation } = require('../services/staffAssetDeployment');

const flags = {
    '--site-config': 'siteConfig', '--map-config': 'mapFile', '--location-config': 'locationFile',
    '--map-include-path': 'mapIncludePath', '--location-include-path': 'locationIncludePath',
    '--output-directory': 'outputDirectory', '--backup-directory': 'backupDirectory'
};

function parseArguments(args) {
    const checkOnly = args.includes('--check-only');
    const pairs = args.filter(arg => arg !== '--check-only');
    if (pairs.length !== Object.keys(flags).length * 2 || args.filter(arg => arg === '--check-only').length > 1) {
        throw new Error('Every Staff Nginx preparation path flag is required');
    }
    const options = { checkOnly };
    for (let index = 0; index < pairs.length; index += 2) {
        const key = flags[pairs[index]];
        if (!key || Object.hasOwn(options, key) || !pairs[index + 1] || pairs[index + 1].startsWith('--')) {
            throw new Error('Invalid Staff Nginx preparation arguments');
        }
        options[key] = pairs[index + 1];
    }
    if (Object.keys(options).length !== Object.keys(flags).length + 1) throw new Error('Missing Staff Nginx preparation path');
    return options;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const [mapConfig, locationConfig] = await Promise.all([
        fs.promises.readFile(options.mapFile, 'utf8'), fs.promises.readFile(options.locationFile, 'utf8')
    ]);
    const result = await prepareStaffNginxInstallation({ ...options, mapConfig, locationConfig });
    process.stdout.write(`${JSON.stringify({ checkOnly: options.checkOnly, sha256: result.sha256,
        candidateSite: result.candidateSite, mapCandidate: result.mapCandidate,
        locationCandidate: result.locationCandidate, backupSite: result.backupSite,
        installManifest: result.installManifest })}\n`);
}

main().catch(() => { process.stderr.write('Staff Nginx preparation failed\n'); process.exitCode = 1; });
