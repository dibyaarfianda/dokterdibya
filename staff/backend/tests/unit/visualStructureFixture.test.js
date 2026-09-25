const sharp = require('sharp');
const { renderMaskedShell, pixelDifferenceGrid } = require('../../scripts/visual-structure-check');

test('masked visual fixture rejects an unavailable required stylesheet', async () => {
    const files = {
        'staff/public/fixture.html': '<!doctype html><html><head><link rel="stylesheet" href="/staff/public/styles/required.css"></head><body>Fixture</body></html>'
    };
    await expect(renderMaskedShell({
        file: 'staff/public/fixture.html',
        viewport: { width: 320, height: 240 },
        readFile: file => {
            if (!(file in files)) throw new Error(`Unavailable: ${file}`);
            return Buffer.from(files[file]);
        }
    })).rejects.toThrow('staff/public/styles/required.css');
});

test('masked visual fixture reports rendered shell geometry and required asset status', async () => {
    const diagnostics = [];
    await renderMaskedShell({
        file: 'staff/public/fixture.html',
        viewport: { width: 320, height: 240 },
        readFile: file => {
            if (file === 'staff/public/fixture.html') return Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="/staff/public/styles/required.css"></head><body><aside class="main-sidebar">Menu</aside></body></html>');
            if (file === 'staff/public/styles/required.css') return Buffer.from('body { background: rgb(10, 20, 30); } .main-sidebar { width: 180px; height: 100px; }');
            throw new Error(`Unavailable: ${file}`);
        },
        onDiagnostics: details => diagnostics.push(details)
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
        requiredAssetFailures: [],
        body: { backgroundColor: 'rgb(10, 20, 30)' },
        sidebar: { width: 180, height: 100 }
    });
    expect(diagnostics[0].requiredAssetHashes['staff/public/styles/required.css']).toMatch(/^[a-f0-9]{64}$/);
});

test('pixel difference grid locates a changed quadrant without masking it', async () => {
    const before = await sharp({ create: { width: 4, height: 4, channels: 3,
        background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const after = await sharp(before).composite([{ input: await sharp({ create: { width: 2, height: 2,
        channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
    expect(await pixelDifferenceGrid(before, after, 2, 2)).toEqual([[1, 0], [0, 0]]);
});

test('masked visual fixture captures the top of an autofocus-scrolled page', async () => {
    const diagnostics = [];
    await renderMaskedShell({
        file: 'staff/public/fixture.html',
        viewport: { width: 320, height: 240 },
        readFile: file => {
            if (file === 'staff/public/fixture.html') return Buffer.from('<!doctype html><html><body><main class="content-wrapper" style="height:3000px">Top</main><input autofocus></body></html>');
            throw new Error(`Unavailable: ${file}`);
        },
        onDiagnostics: details => diagnostics.push(details)
    });
    expect(diagnostics[0].scrollY).toBe(0);
    expect(diagnostics[0].content.y).toBe(8);
});
