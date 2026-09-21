const fs = require('fs');
const path = require('path');
const scriptPath = path.join(__dirname, '../../scripts/apply-tindakan-tariffs-20260922.js');

test('rollout refuses unexpected identities/prices and skips already applied tariffs', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const { tariffs, validateRows } = require(scriptPath);
    const rows = tariffs.map(t => ({ id: t.id, code: t.code, name: t.name,
        category: t.category, price: t.oldPrice, is_active: 1 }));
    expect(validateRows(rows)).toHaveLength(18);
    expect(() => validateRows(rows.slice(1))).toThrow();
    expect(() => validateRows(rows.map((r, i) => i ? r : { ...r, name: 'Other procedure' }))).toThrow();
    expect(() => validateRows(rows.map((r, i) => i ? r : { ...r, price: 123456 }))).toThrow();
    expect(validateRows(rows.map((r, i) => ({ ...r, price: tariffs[i].newPrice })))).toHaveLength(0);
});
