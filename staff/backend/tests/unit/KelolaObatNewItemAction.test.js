const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('kelola obat new item action', () => {
    test('keeps an explicit add-new action available while editing an existing item', () => {
        const fragment = read('staff', 'public', 'fragments', 'pages', 'kelola-obat-page.html');
        const script = read('staff', 'public', 'scripts', 'kelola-obat.js');

        expect(fragment).toMatch(/button[^>]+onclick="window\.prepareNewObat\(\)"[^>]*>[\s\S]*?Tambah Obat Baru[\s\S]*?<\/button>/);
        expect(script).toContain('function prepareNewObat()');
        expect(script).toContain('form.reset();');
        expect(script).toContain('resetForm();');
        expect(script).toContain("nameInput?.focus();");
        expect(script).toContain('window.prepareNewObat = prepareNewObat;');
    });
});
