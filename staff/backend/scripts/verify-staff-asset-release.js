#!/usr/bin/env node
const { verifyPublishedStaffRelease } = require('../services/staffAssetDeployment');

function parseArguments(args) {
    const options = { versions: [], paths: [] };
    if (args.length < 12 || args.length % 2) throw new Error('Staff verification requires origin, release base, versions and paths');
    for (let index = 0; index < args.length; index += 2) {
        const flag = args[index]; const value = args[index + 1];
        if (!value || value.startsWith('--')) throw new Error('Invalid Staff verification argument');
        if (flag === '--base-url' && !options.baseUrl) options.baseUrl = value;
        else if (flag === '--release-base' && !options.releaseBase) options.releaseBase = value;
        else if (flag === '--version') options.versions.push(value);
        else if (flag === '--path') options.paths.push(value);
        else throw new Error('Unknown or duplicate Staff verification argument');
    }
    if (!options.baseUrl || !options.releaseBase || options.versions.length < 2 || !options.paths.length) {
        throw new Error('Incomplete Staff verification arguments');
    }
    return options;
}

async function main() {
    const result = await verifyPublishedStaffRelease(parseArguments(process.argv.slice(2)));
    for (const asset of result.assets) process.stdout.write(`${JSON.stringify(asset)}\n`);
}

main().catch(() => { process.stderr.write('Staff release verification failed\n'); process.exitCode = 1; });
