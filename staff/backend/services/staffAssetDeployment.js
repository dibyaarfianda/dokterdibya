const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildStaffReleaseManifest, validateReleaseVersion } = require('./staffAssetRelease');
const { PROTECTED_STAFF_ASSET_RELEASES } = require('./staffAssetNginxConfig');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MAP_LEGACY = 'map $arg_v $staff_asset_cache_control {\n    default "public, max-age=31536000, immutable";\n    ""      "no-cache, must-revalidate";\n}\n';
const STAFF_MARKER = '# IMPORTANT: Staff static files - must come BEFORE /staff/ proxy';
const PATIENT_MARKER = '# Patient portal static assets (fonts/images 30 days)';
const INCLUDE_ROOT = '/etc/nginx/snippets/';

function absoluteLocal(value) {
    if (typeof value !== 'string' || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error('Absolute local path required');
    return path.resolve(value);
}

async function rejectSymlinkComponents(value) {
    let part = path.parse(value).root;
    for (const segment of value.slice(part.length).split(path.sep).filter(Boolean)) {
        part = path.join(part, segment);
        try {
            const stat = await fs.promises.lstat(part);
            if (stat.isSymbolicLink()) throw new Error('Symlinked Staff deployment path');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}

function includeDestination(value) {
    if (typeof value !== 'string' || !/^\/etc\/nginx\/snippets\/[A-Za-z0-9._-]+[.]conf$/.test(value) ||
        value.includes('..') || !value.startsWith(INCLUDE_ROOT)) throw new Error('Unsafe Nginx include destination');
    return value;
}

function oneOccurrence(text, needle, label) {
    const first = text.indexOf(needle);
    if (first < 0 || text.indexOf(needle, first + needle.length) >= 0) throw new Error(`Expected exactly one ${label}`);
    return first;
}

function createCandidate(source, mapIncludePath, locationIncludePath) {
    if (!source.startsWith(MAP_LEGACY) || source.indexOf(MAP_LEGACY, MAP_LEGACY.length) !== -1) {
        throw new Error('Expected exact leading legacy Staff cache map once');
    }
    const mapReplaced = `include ${mapIncludePath};\n${source.slice(MAP_LEGACY.length)}`;
    const staff = oneOccurrence(mapReplaced, STAFF_MARKER, 'Staff marker');
    const patient = oneOccurrence(mapReplaced, PATIENT_MARKER, 'patient marker');
    if (patient <= staff || !/location\s+\^~\s+\/staff\/public\/\s*\{/.test(mapReplaced.slice(staff, patient))) {
        throw new Error('Invalid legacy Staff location range');
    }
    const start = staff + STAFF_MARKER.length;
    const lineEnd = mapReplaced.indexOf('\n', start);
    if (lineEnd < 0 || lineEnd >= patient || mapReplaced.slice(start, lineEnd).trim()) throw new Error('Invalid Staff marker line');
    const patientLineStart = mapReplaced.lastIndexOf('\n', patient - 1) + 1;
    if (mapReplaced.slice(patientLineStart, patient).trim()) throw new Error('Invalid patient marker line');
    return `${mapReplaced.slice(0, lineEnd + 1)}include ${locationIncludePath};\n\n${mapReplaced.slice(patientLineStart)}`;
}

async function prepareStaffNginxInstallation(input) {
    const site = absoluteLocal(input.siteConfig);
    const output = absoluteLocal(input.outputDirectory);
    const backup = absoluteLocal(input.backupDirectory);
    const mapDestination = includeDestination(input.mapIncludePath);
    const locationDestination = includeDestination(input.locationIncludePath);
    if (mapDestination === locationDestination || [output, backup].includes(site) || output === backup ||
        [output, backup].some(directory => site.startsWith(`${directory}${path.sep}`))) throw new Error('Staff deployment paths overlap');
    if (typeof input.mapConfig !== 'string' || typeof input.locationConfig !== 'string' ||
        !input.mapConfig.trim() || !input.locationConfig.trim()) throw new Error('Rendered Nginx includes required');
    for (const destination of [mapDestination, locationDestination]) {
        try { await fs.promises.lstat(destination); throw new Error('Nginx include destination already exists'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const target of [site, output, backup]) await rejectSymlinkComponents(target);
    const [siteStat, outputStat, backupStat] = await Promise.all([site, output, backup].map(target => fs.promises.lstat(target)));
    if (!siteStat.isFile() || !outputStat.isDirectory() || !backupStat.isDirectory()) throw new Error('Invalid Staff deployment input type');
    const sourceBytes = await fs.promises.readFile(site);
    const source = sourceBytes.toString('utf8');
    const candidate = createCandidate(source, mapDestination, locationDestination);
    const candidateSite = path.join(output, `${path.basename(site)}.candidate`);
    const mapCandidate = path.join(output, path.posix.basename(mapDestination));
    const locationCandidate = path.join(output, path.posix.basename(locationDestination));
    const backupSite = path.join(backup, `${path.basename(site)}.staff-assets.backup`);
    const installManifest = path.join(output, 'staff-asset-install.json');
    const targets = [candidateSite, mapCandidate, locationCandidate, backupSite, installManifest];
    if (new Set(targets).size !== targets.length || targets.includes(site)) throw new Error('Staff deployment output collision');
    for (const target of targets) {
        await rejectSymlinkComponents(target);
        try { await fs.promises.lstat(target); throw new Error('Staff deployment output already exists'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const sha256Values = { source: sha256(sourceBytes), candidate: sha256(candidate),
        map: sha256(input.mapConfig), location: sha256(input.locationConfig) };
    const result = { candidateSite, mapCandidate, locationCandidate, backupSite, installManifest, sha256: sha256Values };
    if (input.checkOnly) return result;
    const manifest = {
        schemaVersion: 1,
        sha256: sha256Values,
        protectedReleases: PROTECTED_STAFF_ASSET_RELEASES,
        install: [
            { source: mapCandidate, destination: mapDestination },
            { source: locationCandidate, destination: locationDestination },
            { source: candidateSite, destination: site }
        ],
        restore: [{ source: backupSite, destination: site }],
        removeOnRestore: [mapDestination, locationDestination]
    };
    const writes = [[backupSite, sourceBytes], [candidateSite, candidate], [mapCandidate, input.mapConfig],
        [locationCandidate, input.locationConfig], [installManifest, `${JSON.stringify(manifest, null, 2)}\n`]];
    const created = [];
    try {
        for (const [target, content] of writes) { await fs.promises.writeFile(target, content, { flag: 'wx' }); created.push(target); }
    } catch (error) {
        for (const target of created.reverse()) await fs.promises.unlink(target);
        throw error;
    }
    return result;
}

function safeRelativeAsset(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value) ||
        value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe Staff asset selection');
    return value;
}

async function readValidManifest(releaseBase, version) {
    validateReleaseVersion(version);
    const releaseDir = path.join(releaseBase, version);
    await rejectSymlinkComponents(releaseDir);
    const file = path.join(releaseDir, 'release-manifest.json');
    await rejectSymlinkComponents(file);
    const manifest = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.version !== version ||
        !/^[0-9a-f]{40}$/i.test(manifest.sourceCommit) || !Array.isArray(manifest.files)) throw new Error('Invalid Staff release manifest');
    const actual = await buildStaffReleaseManifest({ publicRoot: path.join(releaseDir, 'staff', 'public'), version, sourceCommit: manifest.sourceCommit });
    if (JSON.stringify(actual) !== JSON.stringify(manifest)) throw new Error('Staff release manifest hash mismatch');
    return manifest;
}

function validateBaseUrl(value) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Invalid Staff verification origin');
    return parsed.origin;
}

async function fetchChecked(origin, pathname) {
    const response = await fetch(`${origin}${pathname}`, { redirect: 'manual', cache: 'no-store' });
    const body = Buffer.from(await response.arrayBuffer());
    if (response.status >= 500) throw new Error('Staff verification received server error');
    return { status: response.status, bytes: body.length, sha256: sha256(body),
        cache: response.headers.get('cache-control') || '', contentType: response.headers.get('content-type') || '' };
}

async function verifyPublishedStaffRelease({ baseUrl, releaseBase, versions, paths }) {
    const origin = validateBaseUrl(baseUrl);
    const base = absoluteLocal(releaseBase);
    await rejectSymlinkComponents(base);
    if (!Array.isArray(versions) || new Set(versions).size < 2 || versions.some(version => { try { validateReleaseVersion(version); return false; } catch { return true; } })) {
        throw new Error('At least two valid Staff release versions required');
    }
    if (!Array.isArray(paths) || !paths.length || !paths.some(value => typeof value === 'string' && value.endsWith('.js'))) {
        throw new Error('At least one Staff JavaScript dependency required');
    }
    paths = [...new Set(paths.map(safeRelativeAsset))];
    try { await fs.promises.lstat(path.join(base, '.invalid')); throw new Error('Reserved .invalid release path exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const manifests = new Map();
    for (const version of versions) manifests.set(version, await readValidManifest(base, version));
    const assets = [];
    for (const version of versions) {
        const manifest = manifests.get(version);
        for (const relative of paths) {
            const expected = manifest.files.find(file => file.path === relative);
            if (!expected) throw new Error('Selected Staff asset absent from manifest');
            const response = await fetchChecked(origin, `/staff/public/${relative}?v=${version}`);
            if (response.status !== 200 || response.sha256 !== expected.sha256 || response.bytes !== expected.bytes ||
                !/\bimmutable\b/.test(response.cache)) throw new Error('Staff release response mismatch');
            assets.push({ version, path: relative, status: response.status, bytes: response.bytes, sha256: response.sha256 });
        }
    }
    let currentCandidates = new Set(versions);
    for (const relative of paths) {
        const response = await fetchChecked(origin, `/staff/public/${relative}`);
        if (response.status !== 200 || /\bimmutable\b/.test(response.cache) || !/no-cache|no-store/.test(response.cache)) {
            throw new Error('Current Staff asset routing mismatch');
        }
        currentCandidates = new Set([...currentCandidates].filter(version => manifests.get(version).files.some(file =>
            file.path === relative && file.sha256 === response.sha256 && file.bytes === response.bytes)));
        assets.push({ version: 'current', path: relative, status: response.status, bytes: response.bytes, sha256: response.sha256 });
    }
    if (!currentCandidates.size) throw new Error('Current Staff assets mix release bytes');
    const invalid = await fetchChecked(origin, `/staff/public/${paths.find(item => item.endsWith('.js'))}?v=v0`);
    if (invalid.status < 400 || invalid.status >= 500) throw new Error('Invalid Staff release unexpectedly succeeded');
    const html = await fetchChecked(origin, '/staff/public/index-adminlte.html');
    if (html.status !== 200 || !/no-store/.test(html.cache)) throw new Error('Current Staff HTML cache regression');
    const api = await fetchChecked(origin, '/api/health');
    if (api.status !== 200 || !/application\/json/.test(api.contentType) ||
        (api.cache && !/\bno-store\b|\bno-cache\b/.test(api.cache)) ||
        [...manifests.values()].some(manifest => manifest.files.some(file => file.sha256 === api.sha256))) {
        throw new Error('Staff release routing reached API');
    }
    return { ok: true, assets };
}

async function selectStaffReleaseCleanup({ releaseBase, currentVersion, previousVersion, retainCount = 5 }) {
    const base = absoluteLocal(releaseBase);
    await rejectSymlinkComponents(base);
    validateReleaseVersion(currentVersion);
    validateReleaseVersion(previousVersion);
    if (!Number.isInteger(retainCount) || retainCount < 1) throw new Error('Invalid Staff retention count');
    const entries = await fs.promises.readdir(base, { withFileTypes: true });
    if (entries.some(entry => entry.name === '.invalid')) throw new Error('Reserved .invalid release path exists');
    const versions = entries.filter(entry => /^v[1-9][0-9]*$/.test(entry.name)).map(entry => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Invalid Staff release directory');
        return entry.name;
    }).sort((a, b) => BigInt(b.slice(1)) > BigInt(a.slice(1)) ? 1 : -1);
    for (const version of versions) await readValidManifest(base, version);
    const protectedVersions = new Set([...PROTECTED_STAFF_ASSET_RELEASES, currentVersion, previousVersion,
        ...versions.slice(0, Math.max(5, retainCount))]);
    return versions.filter(version => !protectedVersions.has(version)).map(version => path.join(base, version));
}

module.exports = { prepareStaffNginxInstallation, verifyPublishedStaffRelease, selectStaffReleaseCleanup };
