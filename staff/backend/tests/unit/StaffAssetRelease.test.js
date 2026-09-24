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

test('a concurrent stale recovery cannot remove the next publisher lock', async () => {
    await fs.promises.mkdir(releaseBase);
    await fs.promises.mkdir(path.join(releaseBase, '.v413.tmp-old'));
    await fs.promises.writeFile(lockFile(), JSON.stringify({ pid: 999999, startedAt: 1000, version: 'v413', tempBasename: '.v413.tmp-old' }));
    let releaseUnlink;
    let reachedUnlink;
    const unlinkPaused = new Promise(resolve => { reachedUnlink = resolve; });
    const unlinkGate = new Promise(resolve => { releaseUnlink = resolve; });
    let releaseCopy;
    let reachedCopy;
    const copyStarted = new Promise(resolve => { reachedCopy = resolve; });
    const copyGate = new Promise(resolve => { releaseCopy = resolve; });
    const realUnlink = fs.promises.unlink;
    const realCopy = fs.promises.copyFile;
    let paused = false;
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockImplementation(async target => {
        if (target === lockFile() && !paused) {
            paused = true;
            reachedUnlink();
            await unlinkGate;
        }
        return realUnlink(target);
    });
    const copySpy = jest.spyOn(fs.promises, 'copyFile').mockImplementation(async (...args) => {
        reachedCopy();
        await copyGate;
        return realCopy(...args);
    });
    const staleInput = { ...input(), now: () => 601001 };
    const first = stageStaffAssetRelease(staleInput);
    let second;
    let observed;
    let liveLockPreserved = false;
    try {
        await unlinkPaused;
        second = stageStaffAssetRelease(staleInput);
        observed = await Promise.race([
            second.then(() => 'resolved', () => 'rejected'),
            copyStarted.then(() => 'second reached copy')
        ]);
        if (observed === 'rejected') {
            releaseUnlink();
            await copyStarted;
            const activeLock = await fs.promises.readFile(lockFile(), 'utf8');
            const third = await stageStaffAssetRelease(staleInput).then(() => 'resolved', () => 'rejected');
            liveLockPreserved = third === 'rejected' && await fs.promises.readFile(lockFile(), 'utf8') === activeLock;
        }
    } finally {
        releaseUnlink();
        releaseCopy();
        await Promise.allSettled([first, second].filter(Boolean));
        unlinkSpy.mockRestore();
        copySpy.mockRestore();
    }
    expect(observed).toBe('rejected');
    expect(liveLockPreserved).toBe(true);
    expect((await fs.promises.readdir(releaseBase)).filter(name => name.endsWith('.publish.lock'))).toEqual([]);
    expect(await fs.promises.access(finalDir())).toBeUndefined();
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
