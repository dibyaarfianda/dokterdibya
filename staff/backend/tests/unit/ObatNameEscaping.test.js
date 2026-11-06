const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function readScript(name) {
    return read('staff', 'public', 'scripts', name);
}

function loadEscapeHtml(source) {
    const match = source.match(/function escapeHtml\(value\) \{[\s\S]*?\n\}/);
    if (!match) throw new Error('escapeHtml helper not found');
    // eslint-disable-next-line no-new-func
    return new Function(`${match[0]}\nreturn escapeHtml;`)();
}

const MODULES = ['penjualan-obat.js', 'billing-obat.js', 'cashier.js', 'analytics.js'];
const PAYLOAD = `<img src=x onerror="alert('x')">&`;
const ESCAPED = '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;';

describe('obat text is HTML-escaped before innerHTML rendering', () => {
    test.each(MODULES)('%s has a local escapeHtml helper covering & < > " \'', (file) => {
        const escapeHtml = loadEscapeHtml(readScript(file));

        expect(escapeHtml(PAYLOAD)).toBe(ESCAPED);
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(12)).toBe('12');
    });

    test.each(MODULES)('%s no longer interpolates raw obat name/code/category fields', (file) => {
        // console.* lines are log text, not HTML; everything else must go through escapeHtml().
        const htmlLines = readScript(file).split('\n').filter((line) => !/console\.\w+\(/.test(line));
        const raw = htmlLines.join('\n').match(/\$\{(?:item|o|drug|service|doctor|sale)\.(?:name|code|category|obat_name|obat_code|doctor_name|patient_name|usage)\b[^}]*\}/g);

        expect(raw).toBeNull();
    });

    test('penjualan-obat escapes obat dropdown options, sales list, and sale detail', () => {
        const script = readScript('penjualan-obat.js');

        expect(script).toContain('<option value="${escapeHtml(o.id)}"');
        expect(script).toContain('data-code="${escapeHtml(o.code)}"');
        expect(script).toContain('data-name="${escapeHtml(o.name)}"');
        expect(script).toContain('data-price="${escapeHtml(o.price)}"');
        expect(script).toContain('data-stock="${escapeHtml(o.stock)}"');
        expect(script).toContain('${escapeHtml(o.code)} - ${escapeHtml(o.name)} (Stok: ${escapeHtml(o.stock)})');
        expect(script).toContain('<td>${escapeHtml(item.obat_code)} - ${escapeHtml(item.obat_name)}</td>');
        expect(script).toContain('<td><strong>${escapeHtml(sale.sale_number)}</strong></td>');
        expect(script).toContain("${escapeHtml(sale.patient_name || '-')}");
        expect(script).toContain("<p><strong>Dibuat oleh:</strong> ${escapeHtml(sale.created_by || '-')}</p>");
        expect(script).toContain('oleh ${escapeHtml(sale.confirmed_by)}');
        expect(script).toContain('oleh ${escapeHtml(sale.paid_by)}');
        expect(script).toContain('Gagal memuat data: ${escapeHtml(error.message)}');
        expect(script).toContain('return badges[status] || escapeHtml(status);');
    });

    test('billing-obat escapes names and passes the remove id through a data attribute', () => {
        const script = readScript('billing-obat.js');

        expect(script).toContain('<span>${escapeHtml(item.name)} ${stockBadge}</span>');
        expect(script).toContain('<strong>${escapeHtml(item.name)}</strong>');
        expect(script).toContain('Stok: ${escapeHtml(item.stock)}');
        expect(script).toContain("required>${escapeHtml(item.usage || '')}</textarea>");
        expect(script).toContain('data-obat-id="${escapeHtml(item.id)}" onclick="window.removeObat(this.dataset.obatId)"');
        expect(script).not.toContain('window.removeObat(${item.id})');
        expect(script).toContain('${escapeHtml(patientNameFromSession)} (ID: ${escapeHtml(patientId)})');
    });

    test('cashier escapes tindakan/obat names and cara pakai in the summary tables', () => {
        const script = readScript('cashier.js');

        expect(script.match(/<td>\$\{escapeHtml\(item\.name\)\}<\/td>/g)).toHaveLength(2);
        expect(script).toContain('<td>${escapeHtml(item.quantity)}</td>');
        expect(script).toContain('<td>${escapeHtml(caraPakai)}</td>');
    });

    test('analytics escapes low-stock, top-drug, top-service, and doctor tables', () => {
        const script = readScript('analytics.js');

        expect(script).toContain('<td>${escapeHtml(item.name)}</td>');
        expect(script).toContain("<td>${escapeHtml(item.category || '-')}</td>");
        expect(script).toContain('<td>${escapeHtml(item.stock)}</td>');
        expect(script).toContain('<td>${escapeHtml(item.min_stock)}</td>');
        expect(script).toContain('<td>${escapeHtml(item.shortage)}</td>');
        expect(script).toContain('</span>${escapeHtml(drug.name)}</td>');
        expect(script).toContain('</span>${escapeHtml(service.name)}</td>');
        expect(script).toContain('<td>${escapeHtml(doctor.doctor_name)}</td>');
    });
});
