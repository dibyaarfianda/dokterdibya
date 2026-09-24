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
        const manifestPath = path.join(finalDir, 'release-manifest.json');
        const bytes = await fs.promises.readFile(manifestPath, 'utf8');
        if (bytes !== `${JSON.stringify(expected, null, 2)}\n`) return false;
        const actual = await buildStaffReleaseManifest({ publicRoot: finalDir, version: expected.version, sourceCommit: expected.sourceCommit });
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

async function recoverStaleLock({ lockPath, recoveryPath, releaseBase, version, finalDir, now, protectedRoots }) {
    let guard;
    try { guard = await fs.promises.open(recoveryPath, 'wx'); }
    catch (error) {
        if (error.code === 'EEXIST') throw new Error('Staff release recovery lock exists');
        throw error;
    }
    let guardStat;
    try {
        guardStat = await guard.stat();
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
        if (await fs.promises.readFile(lockPath, 'utf8') !== oldBytes) throw new Error('Staff release publication lock changed');
        const oldTempStat = await optionalLstat(oldTemp);
        if (oldTempStat) {
            if (!oldTempStat.isDirectory() || oldTempStat.isSymbolicLink()) throw new Error('Unsafe stale Staff release temp');
            await fs.promises.rm(oldTemp, { recursive: true });
        }
        if (await fs.promises.readFile(lockPath, 'utf8') !== oldBytes) throw new Error('Staff release publication lock changed');
        await fs.promises.unlink(lockPath);
    } finally {
        await guard.close();
        const currentGuard = await optionalLstat(recoveryPath);
        if (guardStat && currentGuard && currentGuard.isFile() && !currentGuard.isSymbolicLink() &&
            currentGuard.dev === guardStat.dev && currentGuard.ino === guardStat.ino) {
            await fs.promises.unlink(recoveryPath);
        }
    }
}

async function acquireLock({ lockPath, recoveryPath, releaseBase, version, finalDir, tempBasename, now, protectedRoots }) {
    const record = { pid: process.pid, startedAt: now(), version, tempBasename };
    const ownBytes = `${JSON.stringify(record)}\n`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const handle = await fs.promises.open(lockPath, 'wx');
            const openedStat = await handle.stat();
            try { await handle.writeFile(ownBytes); }
            catch (error) {
                const currentStat = await optionalLstat(lockPath);
                if (currentStat && currentStat.isFile() && !currentStat.isSymbolicLink() &&
                    currentStat.dev === openedStat.dev && currentStat.ino === openedStat.ino) {
                    await fs.promises.unlink(lockPath);
                }
                throw error;
            } finally { await handle.close(); }
            return ownBytes;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if (attempt) throw new Error('Staff release publication lock exists');
            await recoverStaleLock({ lockPath, recoveryPath, releaseBase, version, finalDir, now, protectedRoots });
        }
    }
    throw new Error('Staff release publication lock exists');
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
    const lockPath = path.resolve(base, `.${version}.publish.lock`);
    const recoveryPath = path.resolve(base, `.${version}.recover.lock`);
    if (!isInside(base, finalDir) || !isInside(base, tempDir) || !isInside(base, lockPath) || !isInside(base, recoveryPath)) {
        throw new Error('Staff release path escapes release base');
    }
    const manifest = await buildStaffReleaseManifest({ publicRoot: sourcePublic, version, sourceCommit });
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
    await fs.promises.mkdir(base, { recursive: true });
    const invalid = path.join(base, '.invalid');
    if (await optionalLstat(invalid)) throw new Error('Invalid Staff release base: .invalid path exists');
    const protectedRoots = [repository, sourcePublic, finalDir, lockPath, recoveryPath];
    const ownLockBytes = await acquireLock({ lockPath, recoveryPath, releaseBase: base, version, finalDir, tempBasename, now, protectedRoots });
    try {
        if (await optionalLstat(finalDir)) {
            if (!await compareExisting(finalDir, manifest)) throw new Error('Staff release already exists with different content');
            return { status: 'existing', releaseDir: finalDir, manifest, manifestSha256 };
        }
        await fs.promises.mkdir(tempDir);
        for (const file of manifest.files) {
            const from = path.resolve(sourcePublic, ...file.path.split('/'));
            const to = path.resolve(tempDir, ...file.path.split('/'));
            if (!isInside(sourcePublic, from) || !isInside(tempDir, to)) throw new Error('Staff asset path escapes staging directory');
            await fs.promises.mkdir(path.dirname(to), { recursive: true });
            await fs.promises.copyFile(from, to);
        }
        await fs.promises.writeFile(path.join(tempDir, 'release-manifest.json'), manifestBytes, { flag: 'wx' });
        const copied = await buildStaffReleaseManifest({ publicRoot: tempDir, version, sourceCommit });
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
