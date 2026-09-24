#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { renderStaffAssetNginx } = require('../services/staffAssetNginxConfig');

function parseArguments(args) {
    const flags = { '--release-base': 'releaseBase', '--current-root': 'currentRoot',
        '--map-output': 'mapOutput', '--location-output': 'locationOutput' };
    if (args.length !== 8) throw new Error('Four Staff Nginx arguments are required');
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = flags[args[index]];
        if (!key || Object.hasOwn(options, key) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Invalid Staff Nginx arguments');
        options[key] = args[index + 1];
    }
    return options;
}

async function atomicWrite(target, text) {
    const temporary = `${target}.tmp-${randomUUID()}`;
    let created = false;
    try {
        const handle = await fs.promises.open(temporary, 'wx');
        created = true;
        try { await handle.writeFile(text); await handle.sync(); }
        finally { await handle.close(); }
        await fs.promises.rename(temporary, target);
    } finally { if (created) await fs.promises.rm(temporary, { force: true }); }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    // Resolve existing parents as well, so symlinked directories cannot alias the outputs.
    const resolveOutput = async output => path.join(await fs.promises.realpath(path.dirname(path.resolve(output))), path.basename(output));
    const mapOutput = await resolveOutput(options.mapOutput);
    const locationOutput = await resolveOutput(options.locationOutput);
    const comparison = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (comparison(mapOutput) === comparison(locationOutput)) throw new Error('Staff Nginx output paths must differ');
    const { mapConfig, locationConfig } = renderStaffAssetNginx(options);
    await atomicWrite(mapOutput, mapConfig);
    await atomicWrite(locationOutput, locationConfig);
}

main().catch(() => { process.stderr.write('Staff Nginx rendering failed\n'); process.exitCode = 1; });
