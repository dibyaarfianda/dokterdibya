const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function functionBody(source, name) {
    const start = source.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

const fragment = () => read('staff', 'public', 'fragments', 'pages', 'kelola-obat-page.html');
const script = () => read('staff', 'public', 'scripts', 'kelola-obat.js');
const adjustment = () => read('staff', 'public', 'scripts', 'kelola-obat-adjustment.js');

describe('kelola obat adjustment request', () => {
    test('save payloads no longer carry stock', () => {
        expect(script()).not.toMatch(/JSON\.stringify\(\{[^}]*\bstock\b[^}]*\}\)/);
    });

    test('stock is read-only and only shown while editing', () => {
        const html = fragment();
        expect(html).toMatch(/id="kelola-obat-stock-group"[^>]*d-none|d-none[^>]*id="kelola-obat-stock-group"/);
        expect(html).toContain('Stok (baca-saja)');
        expect(html).toMatch(/<input[^>]+id="kelola-obat-stock"[^>]*\breadonly\b/);

        const src = script();
        const editBody = functionBody(src, 'editObat');
        expect(editBody).toContain("getElementById('kelola-obat-stock-group')");
        expect(editBody).toContain("classList.remove('d-none')");
        const resetBody = functionBody(src, 'resetForm');
        expect(resetBody).toContain("getElementById('kelola-obat-stock-group')");
        expect(resetBody).toContain("classList.add('d-none')");
    });

    test('adjustment action is permission gated', () => {
        expect(script()).toMatch(/hasAccountPermission\('inventory\.adjust'\)[\s\S]{0,400}window\.openAdjustmentRequestModal\(/);
        expect(script()).toContain("from './kelola-obat-adjustment.js'");
    });

    test('row button passes the name through escaped data attributes, not inline JS', () => {
        const src = script();
        expect(src).toContain('data-obat-name="${escapeAttr(');
        expect(src).toContain('this.dataset.obatName');
        expect(src).not.toContain("openAdjustmentRequestModal('${item.id}', '${(item.name");
        expect(src).toMatch(/function escapeAttr\(/);
        expect(src).toContain(".replace(/\"/g, '&quot;')");
        expect(src).toContain(".replace(/'/g, '&#39;')");
    });

    test('submit is protected against double submission', () => {
        expect(fragment()).toMatch(/<button[^>]+id="adj-submit"/);
        const mod = adjustment();
        expect(mod).toContain('adj-submit');
        expect(mod).toContain('disabled = true');
        expect(mod).toMatch(/finally\s*\{/);
    });

    test('adjustment modal matches the request contract', () => {
        const html = fragment();
        expect(html).toContain('id="kelola-obat-adjustment-modal"');
        ['rusak', 'pecah', 'kedaluwarsa', 'hilang', 'salah_hitung', 'lainnya'].forEach((value) => {
            expect(html).toContain(`value="${value}"`);
        });
        expect(html).not.toContain('value="opname"');
        expect(html).toContain('Stok tidak langsung berubah. Pengajuan menunggu persetujuan dokter.');
        ['adj-obat-id', 'adj-obat-name', 'adj-direction', 'adj-quantity', 'adj-category', 'adj-batch', 'adj-note'].forEach((id) => {
            expect(html).toContain(`id="${id}"`);
        });
        expect(html).toContain('onclick="window.submitAdjustmentRequest()"');

        const mod = adjustment();
        [
            "'/api/inventory/adjust'",
            'quantity_delta',
            'reason_category',
            'reason_note',
            'batch_id',
            'window.openAdjustmentRequestModal =',
            'window.submitAdjustmentRequest ='
        ].forEach((token) => {
            expect(mod).toContain(token);
        });
        expect(mod).toMatch(/export\s+(async\s+)?function\s+openAdjustmentRequestModal/);
        expect(mod).toMatch(/export\s+(async\s+)?function\s+submitAdjustmentRequest/);
    });

describe('Kelola Obat escapes server text', () => {
    test('obat text and purchase button are escaped', () => {
        const src = script();
        expect(src).not.toContain("<td>${item.name || '-'}</td>");
        expect(src).not.toContain("openPurchaseModal('${item.id}'");
        expect(src).toContain("escapeAttr(item.name || '-')");
        expect(src).toContain('escapeAttr(item.supplier_name');
        expect(src).toContain('escapeAttr(item.category || ');
        expect(src).toContain('window.openPurchaseModal(this.dataset.obatId, this.dataset.obatName)');
    });
});
});
