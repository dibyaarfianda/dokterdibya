const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { validateReleaseVersion, buildStaffReleaseManifest, stageStaffAssetRelease } = require('../../services/staffAssetRelease');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceCommit = 'a'.repeat(40);
let root;
let repo;
let releaseBase;
let currentFixture;

async function fixture() {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'staff-release-test-'));
    repo = path.join(root, 'repo');
    releaseBase = path.join(root, 'releases');
    const publicRoot = path.join(repo, 'staff', 'public');
    const entries = [
        ['css/main.css', Buffer.from('body{}\n')],
        ['empty.txt', Buffer.alloc(0)],
        ['images/logo.bin', Buffer.from([0, 255, 42])],
        ['index.html', Buffer.from('<h1>Staff</h1>\n')],
        ['scripts/app.js', Buffer.from("console.log('ok');\n")]
    ];
    for (const [name, contents] of entries) {
        const target = path.join(publicRoot, name);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, contents);
    }
    return { publicRoot, entries };
}

beforeEach(async () => { currentFixture = await fixture(); });
afterEach(async () => { await fs.promises.rm(root, { recursive: true, force: true }); });

test.each(['v1', 'v413', 'v9999'])('accepts release version %s', value => {
    expect(validateReleaseVersion(value)).toBe(value);
});

test.each(['', 'v0', 'V414', 'v414/../x', '/v414', 'C:\\v414', ' v414', 'v414 ', 'v414?x', 'v414\\x'])('rejects unsafe release version %s', value => {
    expect(() => validateReleaseVersion(value)).toThrow(/Invalid Staff release version/);
});

test('rejects a non-string version even when coercion looks valid', () => {
    expect(() => validateReleaseVersion({ toString: () => 'v414' })).toThrow(/Invalid Staff release version/);
});

test('builds a deterministic complete manifest with slash-normalized sorted paths', async () => {
    const { publicRoot, entries } = currentFixture;
    const manifest = await buildStaffReleaseManifest({ publicRoot, version: 'v414', sourceCommit });
    expect(manifest).toEqual({
        schemaVersion: 1,
        version: 'v414',
        sourceCommit,
        fileCount: 5,
        totalBytes: entries.reduce((sum, [, bytes]) => sum + bytes.length, 0),
        files: entries.map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: sha256(bytes) }))
    });
});

test.each(['', 'abc', 'g'.repeat(40)])('rejects invalid source commit %s', async value => {
    await expect(buildStaffReleaseManifest({ publicRoot: path.join(repo, 'staff', 'public'), version: 'v1', sourceCommit: value })).rejects.toThrow(/source commit/i);
});

const input = () => ({ repositoryRoot: repo, releaseBase, version: 'v413', sourceCommit });
const finalDir = () => path.join(releaseBase, 'v413');
const lockFile = () => path.join(releaseBase, '.v413.publish.lock');
const recoveryClaims = async () => (await fs.promises.readdir(releaseBase)).filter(name => /^\.v413\.recover-[0-9a-f-]{36}\.claim$/.test(name));
async function stalePublication() {
    await fs.promises.mkdir(releaseBase);
    await fs.promises.mkdir(path.join(releaseBase, '.v413.tmp-old'));
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', tempBasename: '.v413.tmp-old' }));
}

async function hashTree(directory) {
    const names = [];
    async function visit(current, prefix = '') {
        for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
            const name = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) await visit(path.join(current, entry.name), name);
            else names.push([name, sha256(await fs.promises.readFile(path.join(current, entry.name)))]);
        }
    }
    await visit(directory);
    return names.sort((a, b) => a[0].localeCompare(b[0]));
}

test('publishes a complete release and an identical restage returns existing', async () => {
    const first = await stageStaffAssetRelease(input());
    expect(first.status).toBe('published');
    expect(first.releaseDir).toBe(finalDir());
    expect(first.manifest.fileCount).toBe(5);
    expect(first.manifestSha256).toBe(sha256(JSON.stringify(first.manifest, null, 2) + '\n'));
    expect(await fs.promises.readFile(path.join(finalDir(), 'release-manifest.json'), 'utf8')).toBe(JSON.stringify(first.manifest, null, 2) + '\n');
    const before = await hashTree(finalDir());
    const second = await stageStaffAssetRelease(input());
    expect(second).toEqual({ ...first, status: 'existing' });
    expect(await hashTree(finalDir())).toEqual(before);
});

test.each(['content', 'commit'])('rejects changed %s without replacing the release', async changed => {
    await stageStaffAssetRelease(input());
    const before = await hashTree(finalDir());
    if (changed === 'content') await fs.promises.writeFile(path.join(repo, 'staff', 'public', 'index.html'), 'changed');
    const changedInput = changed === 'commit' ? { ...input(), sourceCommit: 'b'.repeat(40) } : input();
    await expect(stageStaffAssetRelease(changedInput)).rejects.toThrow(/already exists with different content/i);
    expect(await hashTree(finalDir())).toEqual(before);
});

test('two concurrent publishers cannot publish different contents under one version', async () => {
    const otherRepo = path.join(root, 'other');
    await fs.promises.cp(repo, otherRepo, { recursive: true });
    await fs.promises.writeFile(path.join(otherRepo, 'staff', 'public', 'index.html'), 'other');
    const results = await Promise.allSettled([
        stageStaffAssetRelease(input()),
        stageStaffAssetRelease({ ...input(), repositoryRoot: otherRepo })
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results.find(result => result.status === 'fulfilled').value;
    expect(winner.status).toBe('published');
    expect(await buildStaffReleaseManifest({ publicRoot: finalDir(), version: 'v413', sourceCommit })).toEqual(winner.manifest);
});

test('a live publication lock fails closed', async () => {
    await fs.promises.mkdir(releaseBase);
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: process.pid, startedAt: Date.now(), version: 'v413', tempBasename: '.v413.tmp-other' }));
    await expect(stageStaffAssetRelease(input())).rejects.toThrow(/lock/i);
    expect(await fs.promises.readFile(lockFile(), 'utf8')).toContain('tmp-other');
});

test('failed lock-record write does not leave an orphaned lock', async () => {
    const original = fs.promises.open;
    const spy = jest.spyOn(fs.promises, 'open').mockImplementationOnce(async (...args) => {
        const handle = await original(...args);
        return { stat: () => handle.stat(), writeFile: async () => { throw new Error('simulated lock write failure'); }, close: () => handle.close() };
    });
    try { await expect(stageStaffAssetRelease(input())).rejects.toThrow(/simulated lock write failure/); }
    finally { spy.mockRestore(); }
    await expect(fs.promises.access(lockFile())).rejects.toMatchObject({ code: 'ENOENT' });
});

test('an old contained lock can be recovered with injected time', async () => {
    await fs.promises.mkdir(releaseBase);
    await fs.promises.mkdir(path.join(releaseBase, '.v413.tmp-old'));
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', tempBasename: '.v413.tmp-old' }));
    const result = await stageStaffAssetRelease({ ...input(), now: () => 1000 + 600001 });
    expect(result.status).toBe('published');
    await expect(fs.promises.access(path.join(releaseBase, '.v413.tmp-old'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('simultaneous unique recovery claims elect only one publisher', async () => {
    await stalePublication();
    const realOpen = fs.promises.open;
    const openedClaims = [];
    const spy = jest.spyOn(fs.promises, 'open').mockImplementation(async (target, ...args) => {
        if (String(target).endsWith('.claim')) openedClaims.push(path.basename(target));
        return realOpen(target, ...args);
    });
    let results;
    try { results = await Promise.allSettled([stageStaffAssetRelease({ ...input(), now: () => 601001 }), stageStaffAssetRelease({ ...input(), now: () => 601001 })]); }
    finally { spy.mockRestore(); }
    expect(openedClaims).toHaveLength(2);
    expect(new Set(openedClaims).size).toBe(2);
    expect(results.filter(item => item.status === 'fulfilled' && item.value.status === 'published')).toHaveLength(1);
    expect(results.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect(await recoveryClaims()).toEqual([]);
    expect(await fs.promises.access(finalDir())).toBeUndefined();
});

test('a later contender cannot delete or replace the winner unique claim', async () => {
    await stalePublication();
    const realUnlink = fs.promises.unlink;
    let releaseUnlink;
    let reachedUnlink;
    const paused = new Promise(resolve => { reachedUnlink = resolve; });
    const gate = new Promise(resolve => { releaseUnlink = resolve; });
    const spy = jest.spyOn(fs.promises, 'unlink').mockImplementation(async target => {
        if (target === lockFile()) { reachedUnlink(); await gate; }
        return realUnlink(target);
    });
    const first = stageStaffAssetRelease({ ...input(), now: () => 601001 });
    let second;
    let winnerClaim;
    let winnerBytes;
    let after;
    try {
        await paused;
        [winnerClaim] = await recoveryClaims();
        winnerBytes = winnerClaim && await fs.promises.readFile(path.join(releaseBase, winnerClaim), 'utf8');
        second = await stageStaffAssetRelease({ ...input(), now: () => 601001 }).then(() => 'resolved', () => 'rejected');
        after = await recoveryClaims();
        if (winnerClaim) expect(await fs.promises.readFile(path.join(releaseBase, winnerClaim), 'utf8')).toBe(winnerBytes);
    } finally {
        releaseUnlink();
        await Promise.allSettled([first]);
        spy.mockRestore();
    }
    expect(winnerClaim).toMatch(/^\.v413\.recover-[0-9a-f-]{36}\.claim$/);
    expect(second).toBe('rejected');
    expect(after).toEqual([winnerClaim]);
});

test('winner claim remains through acquisition of the new publication lock', async () => {
    await stalePublication();
    const realOpen = fs.promises.open;
    let claimsAtAcquisition;
    const spy = jest.spyOn(fs.promises, 'open').mockImplementation(async (target, ...args) => {
        const handle = await realOpen(target, ...args);
        if (target === lockFile()) claimsAtAcquisition = await recoveryClaims();
        return handle;
    });
    try { expect((await stageStaffAssetRelease({ ...input(), now: () => 601001 })).status).toBe('published'); }
    finally { spy.mockRestore(); }
    expect(claimsAtAcquisition).toHaveLength(1);
    expect(await recoveryClaims()).toEqual([]);
});

test('a crashed stale unique claim is pruned without touching the new claim', async () => {
    await stalePublication();
    const deadId = '11111111-1111-4111-8111-111111111111';
    const deadName = `.v413.recover-${deadId}.claim`;
    await fs.promises.writeFile(path.join(releaseBase, deadName), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', invocationId: deadId, orderNs: '1' }));
    const realOpen = fs.promises.open;
    let claimsAtAcquisition;
    const spy = jest.spyOn(fs.promises, 'open').mockImplementation(async (target, ...args) => {
        const handle = await realOpen(target, ...args);
        if (target === lockFile()) claimsAtAcquisition = await recoveryClaims();
        return handle;
    });
    try { expect((await stageStaffAssetRelease({ ...input(), now: () => 601001 })).status).toBe('published'); }
    finally { spy.mockRestore(); }
    expect(claimsAtAcquisition).toHaveLength(1);
    expect(claimsAtAcquisition).not.toContain(deadName);
    expect(await recoveryClaims()).toEqual([]);
});

test('a claim changed during stale pruning blocks publication', async () => {
    await stalePublication();
    const id = '11111111-1111-4111-8111-111111111111';
    const claimPath = path.join(releaseBase, `.v413.recover-${id}.claim`);
    await fs.promises.writeFile(claimPath, JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', invocationId: id, orderNs: '1' }));
    const liveBytes = JSON.stringify({ pid: process.pid, startedAt: 601001, version: 'v413', invocationId: id, orderNs: '1' });
    const realRead = fs.promises.readFile;
    let changed = false;
    const spy = jest.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
        const bytes = await realRead(...args);
        if (args[0] === claimPath && !changed) {
            changed = true;
            await fs.promises.writeFile(claimPath, liveBytes);
        }
        return bytes;
    });
    try { await expect(stageStaffAssetRelease({ ...input(), now: () => 601001 })).rejects.toThrow(/claim/i); }
    finally { spy.mockRestore(); }
    expect(await fs.promises.readFile(claimPath, 'utf8')).toBe(liveBytes);
    expect(await fs.promises.readFile(lockFile(), 'utf8')).toContain('tmp-old');
});

test('a contender after winner claim removal cannot delete the new live publication lock', async () => {
    await stalePublication();
    const realCopy = fs.promises.copyFile;
    let releaseCopy;
    let reachedCopy;
    const paused = new Promise(resolve => { reachedCopy = resolve; });
    const gate = new Promise(resolve => { releaseCopy = resolve; });
    const spy = jest.spyOn(fs.promises, 'copyFile').mockImplementation(async (...args) => {
        reachedCopy(); await gate; return realCopy(...args);
    });
    const publishing = stageStaffAssetRelease({ ...input(), now: () => 601001 });
    let contender;
    let sameLock;
    let claimsAtArrival;
    try {
        await paused;
        claimsAtArrival = await recoveryClaims();
        const liveBytes = await fs.promises.readFile(lockFile(), 'utf8');
        contender = await stageStaffAssetRelease({ ...input(), now: () => 601001 }).then(() => 'resolved', () => 'rejected');
        sameLock = await fs.promises.readFile(lockFile(), 'utf8') === liveBytes;
    } finally {
        releaseCopy();
        await publishing;
        spy.mockRestore();
    }
    expect(claimsAtArrival).toEqual([]);
    expect(contender).toBe('rejected');
    expect(sameLock).toBe(true);
});

test('a stale lock pointing outside its release base fails closed', async () => {
    await fs.promises.mkdir(releaseBase);
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', tempBasename: '../outside' }));
    await expect(stageStaffAssetRelease({ ...input(), now: () => 1000 + 600001 })).rejects.toThrow(/lock|temp/i);
    expect(await fs.promises.readFile(lockFile(), 'utf8')).toContain('../outside');
});

test('copy failure leaves no published release and preserves unrelated temporary directories', async () => {
    await fs.promises.mkdir(releaseBase);
    const neighbor = path.join(releaseBase, '.v413.tmp-neighbor');
    await fs.promises.mkdir(neighbor);
    const original = fs.promises.copyFile;
    const spy = jest.spyOn(fs.promises, 'copyFile').mockImplementationOnce(async () => { throw new Error('simulated copy failure'); });
    try {
        await expect(stageStaffAssetRelease(input())).rejects.toThrow(/simulated copy failure/);
    } finally { spy.mockRestore(); }
    expect(fs.promises.copyFile).toBe(original);
    await expect(fs.promises.access(finalDir())).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.promises.access(lockFile())).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.promises.readdir(neighbor)).toEqual([]);
    expect((await fs.promises.readdir(releaseBase)).filter(name => name.startsWith('.v413.tmp-'))).toEqual(['.v413.tmp-neighbor']);
});

test('post-copy checksum failure prevents publication', async () => {
    const spy = jest.spyOn(fs.promises, 'copyFile').mockImplementationOnce(async (_source, target) => fs.promises.writeFile(target, 'corrupt'));
    try { await expect(stageStaffAssetRelease(input())).rejects.toThrow(/checksum|different content/i); }
    finally { spy.mockRestore(); }
    await expect(fs.promises.access(finalDir())).rejects.toMatchObject({ code: 'ENOENT' });
});

test('a pre-existing unrelated release remains untouched', async () => {
    await fs.promises.mkdir(finalDir(), { recursive: true });
    await fs.promises.writeFile(path.join(finalDir(), 'unrelated.txt'), 'keep');
    const before = await hashTree(finalDir());
    await expect(stageStaffAssetRelease(input())).rejects.toThrow(/already exists with different content/i);
    expect(await hashTree(finalDir())).toEqual(before);
});

test('an identical release reached through a final symlink is rejected', async () => {
    const elsewhere = path.join(root, 'elsewhere');
    await stageStaffAssetRelease({ ...input(), releaseBase: elsewhere });
    await fs.promises.mkdir(releaseBase);
    await fs.promises.symlink(path.join(elsewhere, 'v413'), finalDir(), 'junction');
    await expect(stageStaffAssetRelease(input())).rejects.toThrow(/already exists with different content/i);
    expect((await fs.promises.lstat(finalDir())).isSymbolicLink()).toBe(true);
});

test.each(['directory', 'symlink'])('rejects pre-existing %s .invalid path', async kind => {
    await fs.promises.mkdir(releaseBase);
    const invalid = path.join(releaseBase, '.invalid');
    if (kind === 'directory') await fs.promises.mkdir(invalid);
    else await fs.promises.symlink(repo, invalid, 'junction');
    await expect(stageStaffAssetRelease(input())).rejects.toThrow(/invalid/i);
    expect((await fs.promises.lstat(invalid)).isDirectory()).toBe(kind === 'directory');
});

test('rejects a symbolic link inside source assets', async () => {
    await fs.promises.symlink(path.join(repo, 'staff', 'public', 'css'), path.join(repo, 'staff', 'public', 'linked'), 'junction');
    await expect(stageStaffAssetRelease(input())).rejects.toThrow(/symbolic link/i);
});

test('rejects release base equal to repository root', async () => {
    await expect(stageStaffAssetRelease({ ...input(), releaseBase: repo })).rejects.toThrow(/release base/i);
});

test('stale cleanup cannot remove a repository stored as the recorded temp directory', async () => {
    await fs.promises.mkdir(releaseBase);
    const protectedRepo = path.join(releaseBase, '.v413.tmp-old');
    await fs.promises.cp(repo, protectedRepo, { recursive: true });
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', tempBasename: '.v413.tmp-old' }));
    await expect(stageStaffAssetRelease({ ...input(), repositoryRoot: protectedRepo, now: () => 601001 })).rejects.toThrow(/release base|protected|overlap/i);
    expect(await fs.promises.readFile(path.join(protectedRepo, 'staff', 'public', 'index.html'), 'utf8')).toBe('<h1>Staff</h1>\n');
});

test('a release-base junction resolving inside the repository is rejected before publication', async () => {
    const actualBase = path.join(repo, 'release-store');
    const alias = path.join(root, 'release-alias');
    await fs.promises.mkdir(actualBase);
    await fs.promises.symlink(actualBase, alias, 'junction');
    await expect(stageStaffAssetRelease({ ...input(), releaseBase: alias })).rejects.toThrow(/release base|overlap/i);
    expect(await fs.promises.readdir(actualBase)).toEqual([]);
    expect((await fs.promises.lstat(alias)).isSymbolicLink()).toBe(true);
});

test('rejects a final path that escapes the release base', async () => {
    await expect(stageStaffAssetRelease({ ...input(), version: '../escape' })).rejects.toThrow(/Invalid Staff release version/);
    await expect(fs.promises.access(path.join(root, 'escape'))).rejects.toMatchObject({ code: 'ENOENT' });
});

const cli = path.resolve(__dirname, '../../scripts/stage-staff-assets.js');
const cliArgs = () => ['--repository-root', repo, '--release-base', releaseBase, '--version', 'v413', '--source-commit', sourceCommit];

test('CLI publishes with only the approved summary fields', async () => {
    const result = spawnSync(process.execPath, [cli, ...cliArgs()], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
        version: 'v413', status: 'published', releaseDir: finalDir(),
        fileCount: 5, totalBytes: currentFixture.entries.reduce((sum, [, bytes]) => sum + bytes.length, 0),
        manifestSha256: sha256(await fs.promises.readFile(path.join(finalDir(), 'release-manifest.json')))
    });
});

test.each([
    ['missing flag', ['--repository-root', 'x']],
    ['positional fallback', ['repo', 'releases', 'v413', sourceCommit]],
    ['invalid version', ['--repository-root', 'x', '--release-base', 'y', '--version', 'v0', '--source-commit', sourceCommit]],
    ['unknown flag', ['--repository-root', 'x', '--release-base', 'y', '--version', 'v413', '--source-commit', sourceCommit, '--extra', 'bad']]
])('CLI %s exits before filesystem mutation', (_label, args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: root });
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(root, 'y'))).toBe(false);
});
