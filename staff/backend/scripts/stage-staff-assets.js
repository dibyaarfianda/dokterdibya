#!/usr/bin/env node
const { stageStaffAssetRelease, validateReleaseVersion } = require('../services/staffAssetRelease');

const flagToKey = {
    '--repository-root': 'repositoryRoot',
    '--release-base': 'releaseBase',
    '--version': 'version',
    '--source-commit': 'sourceCommit'
};

function parseArguments(args) {
    if (args.length !== 8) throw new Error('Invalid Staff release arguments');
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = flagToKey[args[index]];
        if (!key || Object.hasOwn(options, key) || !args[index + 1] || args[index + 1].startsWith('--')) {
            throw new Error('Invalid Staff release arguments');
        }
        options[key] = args[index + 1];
    }
    if (Object.keys(options).length !== 4) throw new Error('Invalid Staff release arguments');
    validateReleaseVersion(options.version);
    if (!/^[0-9a-f]{40}$/i.test(options.sourceCommit)) throw new Error('Invalid source commit SHA');
    return options;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const result = await stageStaffAssetRelease(options);
    process.stdout.write(`${JSON.stringify({
        version: result.manifest.version,
        status: result.status,
        releaseDir: result.releaseDir,
        fileCount: result.manifest.fileCount,
        totalBytes: result.manifest.totalBytes,
        manifestSha256: result.manifestSha256
    })}\n`);
}

main().catch(() => {
    process.stderr.write('Staff asset release staging failed\n');
    process.exitCode = 1;
});
