const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;

const RELEASE_VERSION = /^v[1-9][0-9]*$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
// A lock younger than ten minutes is never recovered automatically.
const STALE_LOCK_MS = 10 * 60 * 1000;

function validateReleaseVersion(value) {
    if (typeof value !== 'string' || !RELEASE_VERSION.test(value)) throw new Error('Invalid Staff release version');
    return value;
}

function validateSourceCommit(value) {
    if (typeof value !== 'string' || !COMMIT_SHA.test(value)) throw new Error('Invalid source commit SHA');
    return value;
}

async function hashFile(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function buildStaffReleaseManifest({ publicRoot, version, sourceCommit }) {
    validateReleaseVersion(version);
    validateSourceCommit(sourceCommit);
    const root = path.resolve(publicRoot);
    const files = [];
    async function visit(directory, relative = '') {
        for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
            const name = relative ? `${relative}/${entry.name}` : entry.name;
            const absolute = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`Symbolic link in Staff assets: ${name}`);
            if (entry.isDirectory()) await visit(absolute, name);
            else if (entry.isFile()) {
                if (name === 'release-manifest.json') continue;
                const stat = await fs.promises.lstat(absolute);
                if (!stat.isFile()) throw new Error(`Non-file Staff asset: ${name}`);
                files.push({ path: name, bytes: stat.size, sha256: await hashFile(absolute) });
            } else throw new Error(`Non-file Staff asset: ${name}`);
        }
    }
    await visit(root);
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { schemaVersion: 1, version, sourceCommit, fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
}

function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pathsOverlap(left, right) {
    return left === right || isInside(left, right) || isInside(right, left);
}

async function optionalLstat(target) {
    try { return await fs.promises.lstat(target); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function physicalPath(target) {
    let existing = path.resolve(target);
    const suffix = [];
    for (;;) {
        try { return path.resolve(await fs.promises.realpath(existing), ...suffix.reverse()); }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            if (await optionalLstat(existing)) throw new Error('Invalid release base alias');
            const parent = path.dirname(existing);
            if (parent === existing) throw error;
            suffix.push(path.basename(existing));
            existing = parent;
        }
    }
}

function sameManifest(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

async function compareExisting(finalDir, expected) {
    try {
        const finalStat = await fs.promises.lstat(finalDir);
        if (!finalStat.isDirectory() || finalStat.isSymbolicLink()) return false;
        const rootEntries = await fs.promises.readdir(finalDir, { withFileTypes: true });
        if (rootEntries.length !== 2 ||
            !rootEntries.some(entry => entry.name === 'release-manifest.json' && entry.isFile() && !entry.isSymbolicLink()) ||
            !rootEntries.some(entry => entry.name === 'staff' && entry.isDirectory() && !entry.isSymbolicLink())) return false;
        const staffDir = path.join(finalDir, 'staff');
        const staffEntries = await fs.promises.readdir(staffDir, { withFileTypes: true });
        if (staffEntries.length !== 1 || staffEntries[0].name !== 'public' ||
            !staffEntries[0].isDirectory() || staffEntries[0].isSymbolicLink()) return false;
        const publicRoot = path.join(staffDir, 'public');
        // The source manifest is excluded from assets; only the release-root manifest is allowed.
        if (await optionalLstat(path.join(publicRoot, 'release-manifest.json'))) return false;
        const manifestPath = path.join(finalDir, 'release-manifest.json');
        const bytes = await fs.promises.readFile(manifestPath, 'utf8');
        if (bytes !== `${JSON.stringify(expected, null, 2)}\n`) return false;
        const actual = await buildStaffReleaseManifest({ publicRoot, version: expected.version, sourceCommit: expected.sourceCommit });
        return sameManifest(actual, expected);
    } catch (_) { return false; }
}

function validTempBasename(version, name) {
    return typeof name === 'string' && name.startsWith(`.${version}.tmp-`) &&
        /^\.[a-z0-9]+\.tmp-[a-zA-Z0-9-]+$/.test(name) && path.basename(name) === name;
}

function pidIsLive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return true;
    try { process.kill(pid, 0); return true; }
    catch (error) { return error.code !== 'ESRCH'; }
}

function sameFileIdentity(left, right) {
    return left && right && right.isFile() && !right.isSymbolicLink() &&
        left.dev === right.dev && left.ino === right.ino;
}

const CLAIM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function claimIdFromName(version, name) {
    const prefix = `.${version}.recover-`;
    if (!name.startsWith(prefix) || !name.endsWith('.claim')) return null;
    const id = name.slice(prefix.length, -'.claim'.length);
    return CLAIM_ID.test(id) ? id : null;
}

function tempClaimIdFromName(version, name) {
    const prefix = `.${version}.recover-`;
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) return null;
    const id = name.slice(prefix.length, -'.tmp'.length);
    return CLAIM_ID.test(id) ? id : null;
}

async function removeExactClaim(claim, expectedBytes = claim.bytes) {
    const stat = await optionalLstat(claim.path);
    if (!sameFileIdentity(claim.identity, stat)) return false;
    let bytes;
    try { bytes = await fs.promises.readFile(claim.path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (expectedBytes !== null && bytes !== expectedBytes) return false;
    if (!sameFileIdentity(claim.identity, await optionalLstat(claim.path))) return false;
    try { await fs.promises.unlink(claim.path); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function createRecoveryClaim({ releaseBase, version, now }) {
    const invocationId = randomUUID();
    const claimPath = path.resolve(releaseBase, `.${version}.recover-${invocationId}.claim`);
    const tempPath = path.resolve(releaseBase, `.${version}.recover-${invocationId}.tmp`);
    if (!isInside(releaseBase, claimPath) || !isInside(releaseBase, tempPath)) throw new Error('Staff recovery claim escapes release base');
    const handle = await fs.promises.open(tempPath, 'wx');
    let identity;
    let closed = false;
    try {
        identity = await handle.stat();
        const bytes = `${JSON.stringify({ pid: process.pid, startedAt: now(), version,
            invocationId, orderNs: process.hrtime.bigint().toString() })}\n`;
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        closed = true;
        if (await optionalLstat(claimPath)) throw new Error('Staff recovery claim already exists');
        await fs.promises.rename(tempPath, claimPath);
        if (!sameFileIdentity(identity, await optionalLstat(claimPath)) ||
            await fs.promises.readFile(claimPath, 'utf8') !== bytes) {
            throw new Error('Staff recovery claim changed during finalization');
        }
        return { path: claimPath, identity, bytes, invocationId };
    } catch (error) {
        if (identity) {
            await removeExactClaim({ path: tempPath, identity, bytes: null }, null);
            await removeExactClaim({ path: claimPath, identity, bytes: null }, null);
        }
        throw error;
    } finally { if (!closed) await handle.close(); }
}

async function listLiveClaims({ releaseBase, version, now }) {
    const claims = [];
    let incomplete = false;
    for (const entry of await fs.promises.readdir(releaseBase, { withFileTypes: true })) {
        const tempId = tempClaimIdFromName(version, entry.name);
        if (tempId) {
            const tempPath = path.resolve(releaseBase, entry.name);
            if (!isInside(releaseBase, tempPath) || !entry.isFile() || entry.isSymbolicLink()) {
                throw new Error('Unsafe Staff recovery temp claim path');
            }
            const identity = await optionalLstat(tempPath);
            if (!identity) { incomplete = true; continue; }
            if (!identity.isFile() || identity.isSymbolicLink()) throw new Error('Unsafe Staff recovery temp claim path');
            if (now() - identity.mtimeMs > STALE_LOCK_MS) {
                if (!await removeExactClaim({ path: tempPath, identity, bytes: null }, null)) incomplete = true;
            } else incomplete = true;
            continue;
        }
        const id = claimIdFromName(version, entry.name);
        if (!id) continue;
        const claimPath = path.resolve(releaseBase, entry.name);
        if (!isInside(releaseBase, claimPath) || !entry.isFile() || entry.isSymbolicLink()) {
            throw new Error('Unsafe Staff recovery claim path');
        }
        const identity = await optionalLstat(claimPath);
        if (!identity) { incomplete = true; continue; }
        if (!identity.isFile() || identity.isSymbolicLink()) throw new Error('Unsafe Staff recovery claim path');
        let bytes;
        try { bytes = await fs.promises.readFile(claimPath, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') { incomplete = true; continue; } throw error; }
        let record;
        try { record = JSON.parse(bytes); }
        catch (_) { record = null; }
        const valid = record && record.version === version && record.invocationId === id &&
            Number.isSafeInteger(record.pid) && record.pid > 0 && Number.isFinite(record.startedAt) &&
            typeof record.orderNs === 'string' && /^\d+$/.test(record.orderNs);
        if (!valid) throw new Error('Invalid finalized Staff recovery claim');
        const expired = now() - record.startedAt > STALE_LOCK_MS;
        const exactClaim = { path: claimPath, identity, bytes, invocationId: id };
        if (expired && !pidIsLive(record.pid)) {
            if (!await removeExactClaim(exactClaim)) incomplete = true;
            continue;
        }
        claims.push(record);
    }
    return { claims, incomplete };
}

async function electRecoveryClaim({ claim, releaseBase, version, now }) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const { claims, incomplete } = await listLiveClaims({ releaseBase, version, now });
        claims.sort((a, b) => {
            const left = BigInt(a.orderNs);
            const right = BigInt(b.orderNs);
            return left < right ? -1 : left > right ? 1 : a.invocationId.localeCompare(b.invocationId);
        });
        if (!incomplete && claims[0]?.invocationId === claim.invocationId) return;
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Another Staff recovery claim is active');
}

async function recoverStaleLock({ lockPath, releaseBase, version, finalDir, now, protectedRoots }) {
    const stat = await optionalLstat(lockPath);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe Staff release publication lock');
    let oldBytes;
    let old;
    try { oldBytes = await fs.promises.readFile(lockPath, 'utf8'); old = JSON.parse(oldBytes); }
    catch (_) { throw new Error('Invalid Staff release publication lock'); }
    if (old.version !== version || !Number.isFinite(old.startedAt) ||
        now() - old.startedAt <= STALE_LOCK_MS || pidIsLive(old.pid) ||
        !validTempBasename(version, old.tempBasename)) {
        throw new Error('Staff release publication lock is live or invalid');
    }
    const oldTemp = path.resolve(releaseBase, old.tempBasename);
    const actualTemp = await physicalPath(oldTemp);
    if (!isInside(releaseBase, actualTemp) ||
        protectedRoots.some(root => pathsOverlap(actualTemp, root)) ||
        await optionalLstat(finalDir)) {
        throw new Error('Staff release publication lock cleanup overlaps a protected path');
    }
    if (!sameFileIdentity(stat, await optionalLstat(lockPath)) ||
        await fs.promises.readFile(lockPath, 'utf8') !== oldBytes) throw new Error('Staff release publication lock changed');
    const oldTempStat = await optionalLstat(oldTemp);
    if (oldTempStat) {
        if (!oldTempStat.isDirectory() || oldTempStat.isSymbolicLink()) throw new Error('Unsafe stale Staff release temp');
        await fs.promises.rm(oldTemp, { recursive: true });
    }
    if (!sameFileIdentity(stat, await optionalLstat(lockPath)) ||
        await fs.promises.readFile(lockPath, 'utf8') !== oldBytes) throw new Error('Staff release publication lock changed');
    await fs.promises.unlink(lockPath);
}

async function createPublicationLock(lockPath, ownBytes) {
    const handle = await fs.promises.open(lockPath, 'wx');
    let identity;
    try {
        identity = await handle.stat();
        await handle.writeFile(ownBytes);
        return ownBytes;
    } catch (error) {
        if (identity) {
            const current = await optionalLstat(lockPath);
            if (sameFileIdentity(identity, current)) await fs.promises.unlink(lockPath);
        }
        throw error;
    } finally { await handle.close(); }
}

async function acquireLock({ lockPath, releaseBase, version, finalDir, tempBasename, now, protectedRoots }) {
    const ownBytes = `${JSON.stringify({ pid: process.pid, startedAt: now(), version, tempBasename })}\n`;
    try { return await createPublicationLock(lockPath, ownBytes); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const claim = await createRecoveryClaim({ releaseBase, version, now });
    try {
        await electRecoveryClaim({ claim, releaseBase, version, now });
        await recoverStaleLock({ lockPath, releaseBase, version, finalDir, now, protectedRoots });
        try { return await createPublicationLock(lockPath, ownBytes); }
        catch (error) { if (error.code === 'EEXIST') throw new Error('Staff release publication lock exists'); throw error; }
    } finally { await removeExactClaim(claim); }
}

async function stageStaffAssetRelease({ repositoryRoot, releaseBase, version, sourceCommit, now = () => Date.now() }) {
    validateReleaseVersion(version);
    validateSourceCommit(sourceCommit);
    if (!repositoryRoot || !releaseBase) throw new Error('Repository root and release base are required');
    const repository = await fs.promises.realpath(path.resolve(repositoryRoot));
    const base = await physicalPath(releaseBase);
    if (pathsOverlap(repository, base)) throw new Error('Invalid release base overlapping repository root');
    const sourcePublic = await fs.promises.realpath(path.resolve(repository, 'staff', 'public'));
    if (!isInside(repository, sourcePublic)) {
        throw new Error('Staff public source escapes repository root');
    }
    const finalDir = path.resolve(base, version);
    const tempBasename = `.${version}.tmp-${process.pid}-${randomUUID()}`;
    const tempDir = path.resolve(base, tempBasename);
    const tempPublic = path.join(tempDir, 'staff', 'public');
    const lockPath = path.resolve(base, `.${version}.publish.lock`);
    if (!isInside(base, finalDir) || !isInside(base, tempDir) || !isInside(base, lockPath)) {
        throw new Error('Staff release path escapes release base');
    }
    const manifest = await buildStaffReleaseManifest({ publicRoot: sourcePublic, version, sourceCommit });
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
    await fs.promises.mkdir(base, { recursive: true });
    const invalid = path.join(base, '.invalid');
    if (await optionalLstat(invalid)) throw new Error('Invalid Staff release base: .invalid path exists');
    const protectedRoots = [repository, sourcePublic, finalDir, lockPath];
    const ownLockBytes = await acquireLock({ lockPath, releaseBase: base, version, finalDir, tempBasename, now, protectedRoots });
    try {
        if (await optionalLstat(finalDir)) {
            if (!await compareExisting(finalDir, manifest)) throw new Error('Staff release already exists with different content');
            return { status: 'existing', releaseDir: finalDir, manifest, manifestSha256 };
        }
        await fs.promises.mkdir(tempDir);
        await fs.promises.mkdir(tempPublic, { recursive: true });
        for (const file of manifest.files) {
            const from = path.resolve(sourcePublic, ...file.path.split('/'));
            const to = path.resolve(tempPublic, ...file.path.split('/'));
            if (!isInside(sourcePublic, from) || !isInside(tempPublic, to)) throw new Error('Staff asset path escapes staging directory');
            await fs.promises.mkdir(path.dirname(to), { recursive: true });
            await fs.promises.copyFile(from, to);
        }
        await fs.promises.writeFile(path.join(tempDir, 'release-manifest.json'), manifestBytes, { flag: 'wx' });
        const copied = await buildStaffReleaseManifest({ publicRoot: tempPublic, version, sourceCommit });
        if (!sameManifest(copied, manifest) || await fs.promises.readFile(path.join(tempDir, 'release-manifest.json'), 'utf8') !== manifestBytes) {
            throw new Error('Staff asset checksum mismatch after copy');
        }
        if (await optionalLstat(finalDir)) {
            if (!await compareExisting(finalDir, manifest)) throw new Error('Staff release already exists with different content');
            return { status: 'existing', releaseDir: finalDir, manifest, manifestSha256 };
        }
        try { await fs.promises.rename(tempDir, finalDir); }
        catch (error) {
            if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code) || !await optionalLstat(finalDir)) throw error;
            if (!await compareExisting(finalDir, manifest)) throw new Error('Staff release already exists with different content');
            return { status: 'existing', releaseDir: finalDir, manifest, manifestSha256 };
        }
        return { status: 'published', releaseDir: finalDir, manifest, manifestSha256 };
    } finally {
        if (isInside(base, tempDir) && !protectedRoots.some(root => pathsOverlap(tempDir, root))) {
            const stat = await optionalLstat(tempDir);
            if (stat && stat.isDirectory() && !stat.isSymbolicLink()) await fs.promises.rm(tempDir, { recursive: true });
        }
        if (await optionalLstat(lockPath)) {
            try {
                if (await fs.promises.readFile(lockPath, 'utf8') === ownLockBytes) await fs.promises.unlink(lockPath);
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
    }
}

module.exports = { validateReleaseVersion, buildStaffReleaseManifest, stageStaffAssetRelease };
