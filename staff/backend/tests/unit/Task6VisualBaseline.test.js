const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderMaskedShell, pixelDifferenceRatio, pixelDifferenceGrid } = require('../../scripts/visual-structure-check');

const root = path.resolve(__dirname, '../../../..');
const baselineCommit = 'e6105ef6';
const shells = [
    { file: 'staff/public/index-adminlte.html', viewport: { width: 1366, height: 768, deviceScaleFactor: 1 } },
    { file: 'public/patient-menu.html', viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } }
];
const baselineFile = file => execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
const currentFile = file => fs.readFileSync(path.join(root, file));

test.each(shells)('$file masked visual screenshot matches approved pre-Task6 commit', async ({ file, viewport }) => {
    let beforeDetails;
    let afterDetails;
    const before = await renderMaskedShell({ file, viewport, readFile: baselineFile,
        onDiagnostics: details => { beforeDetails = details; } });
    const after = await renderMaskedShell({ file, viewport, readFile: currentFile,
        onDiagnostics: details => { afterDetails = details; } });
    const ratio = await pixelDifferenceRatio(before, after);
    if (ratio >= 0.002 && process.env.CI) {
        // Only static fixture hashes and layout geometry; no live account data.
        console.error('Masked visual fixture diagnostics', JSON.stringify({ file, ratio,
            grid: await pixelDifferenceGrid(before, after),
            before: beforeDetails, after: afterDetails }));
        const directory = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'staff-visual-diff');
        const name = file.replace(/[^a-z0-9_-]+/gi, '-');
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, `${name}-before.png`), before);
        fs.writeFileSync(path.join(directory, `${name}-after.png`), after);
    }
    expect(ratio).toBeLessThan(0.002);
}, 120000);

test('visual gate rejects CSS displacement with unchanged DOM', async () => {
    const shell = shells[0];
    const before = await renderMaskedShell({ ...shell, readFile: baselineFile });
    const displaced = await renderMaskedShell({ ...shell, readFile: currentFile,
        extraCss: 'body { transform: translateX(80px) !important; }' });
    expect(await pixelDifferenceRatio(before, displaced)).toBeGreaterThan(0.02);
}, 120000);
