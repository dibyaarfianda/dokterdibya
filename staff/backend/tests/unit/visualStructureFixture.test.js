const { renderMaskedShell } = require('../../scripts/visual-structure-check');

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
