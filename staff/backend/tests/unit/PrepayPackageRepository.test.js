'use strict';

const {
    listPackages,
    getPackageByCode,
    savePackage,
    setPackageActive,
    buildPackagesFromMapping
} = require('../../services/PrepayPackageRepository');

function stubExecutor(handlers) {
    const calls = [];
    return {
        calls,
        query: jest.fn(async (sql, params) => {
            calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            const handler = handlers.shift();
            return handler ? handler(sql, params) : [[]];
        })
    };
}

describe('buildPackagesFromMapping', () => {
    const mapping = {
        categories: {
            obstetri: { items: [{ tindakan_id: 6, quantity: 1 }] },
            obstetri_usg4d: { items: [{ tindakan_id: 9, quantity: 1 }] },
            gyn_repro: { items: [{ tindakan_id: 8, quantity: 1 }] },
            gyn_special: { items: [{ tindakan_id: 8, quantity: 2 }] }
        }
    };

    test('copies the four legacy products in order with their labels, categories and items', () => {
        const rows = buildPackagesFromMapping(mapping);
        expect(rows.map(row => row.code)).toEqual(['obstetri', 'obstetri_usg4d', 'gyn_repro', 'gyn_special']);
        expect(rows.map(row => row.category)).toEqual(['obstetri', 'obstetri', 'gyn_repro', 'gyn_special']);
        expect(rows.map(row => row.sort_order)).toEqual([10, 20, 30, 40]);
        expect(rows[1].name).toBe('Kehamilan + USG 4D');
        expect(rows[0].items).toEqual([{ item_type: 'tindakan', ref_id: 6, quantity: 1, sort_order: 0 }]);
        expect(rows[3].items).toEqual([{ item_type: 'tindakan', ref_id: 8, quantity: 2, sort_order: 0 }]);
        rows.forEach(row => {
            expect(row.week_min).toBeNull();
            expect(row.week_max).toBeNull();
        });
    });

    test('skips legacy products that have no items in the mapping', () => {
        const rows = buildPackagesFromMapping({ categories: { gyn_repro: { items: [{ tindakan_id: 8, quantity: 1 }] } } });
        expect(rows.map(row => row.code)).toEqual(['gyn_repro']);
        expect(rows[0].sort_order).toBe(30);
        expect(buildPackagesFromMapping({})).toEqual([]);
    });
});

describe('savePackage', () => {
    const items = [
        { item_type: 'tindakan', ref_id: 6, quantity: 1, sort_order: 0 },
        { item_type: 'obat', ref_id: 3, quantity: 2, sort_order: 1 }
    ];
    const base = { name: 'Paket', description: null, category: 'obstetri', week_min: 4, week_max: 12, is_active: true, sort_order: 10, items };

    test('create inserts the package, sets code pkg_<insertId>, then inserts the items', async () => {
        const connection = stubExecutor([() => [{ insertId: 77 }]]);
        const result = await savePackage(connection, base, { id: 5, name: 'Dokter' });
        expect(result).toEqual({ id: 77, code: 'pkg_77' });
        const sqls = connection.calls.map(call => call.sql);
        expect(sqls[0]).toMatch(/^INSERT INTO checkup_prepay_packages/);
        expect(connection.calls[0].params).toContain('5');
        expect(sqls[1]).toMatch(/^UPDATE checkup_prepay_packages SET code = \? WHERE id = \?/);
        expect(connection.calls[1].params).toEqual(['pkg_77', 77]);
        expect(sqls.slice(2).every(sql => /^INSERT INTO checkup_prepay_package_items/.test(sql))).toBe(true);
        expect(sqls).toHaveLength(4);
        expect(connection.calls[2].params).toEqual([77, 'tindakan', 6, 1, 0]);
        expect(connection.calls[3].params).toEqual([77, 'obat', 3, 2, 1]);
        expect(sqls.some(sql => /BEGIN|COMMIT|ROLLBACK/i.test(sql))).toBe(false);
    });

    test('create keeps a given legacy code and skips the code update', async () => {
        const connection = stubExecutor([() => [{ insertId: 9 }]]);
        const result = await savePackage(connection, { ...base, code: 'obstetri', items: [] }, null);
        expect(result).toEqual({ id: 9, code: 'obstetri' });
        expect(connection.calls.map(call => call.sql).some(sql => /SET code = \?/.test(sql))).toBe(false);
        expect(connection.calls[0].params).toContain('obstetri');
        expect(connection.calls[0].params).toContain(null);
    });

    test('update changes the row, deletes all items, then re-inserts them', async () => {
        const connection = stubExecutor([
            () => [{ affectedRows: 1 }],
            () => [{ affectedRows: 2 }],
            () => [{ affectedRows: 1 }],
            () => [{ affectedRows: 1 }]
        ]);
        const result = await savePackage(connection, { ...base, id: 12, code: 'pkg_12' }, { id: 5 });
        expect(result).toEqual({ id: 12, code: 'pkg_12' });
        const sqls = connection.calls.map(call => call.sql);
        expect(sqls[0]).toMatch(/^UPDATE checkup_prepay_packages SET /);
        expect(sqls[1]).toBe('DELETE FROM checkup_prepay_package_items WHERE package_id = ?');
        expect(connection.calls[1].params).toEqual([12]);
        expect(sqls[2]).toMatch(/^INSERT INTO checkup_prepay_package_items/);
        expect(sqls).toHaveLength(4);
    });

    test('update of a missing package throws before touching items', async () => {
        const connection = stubExecutor([() => [{ affectedRows: 0 }]]);
        await expect(savePackage(connection, { ...base, id: 99 }, null)).rejects.toThrow(/tidak ditemukan/);
        expect(connection.calls).toHaveLength(1);
    });

    test('actor ids are truncated to 64 characters', async () => {
        const connection = stubExecutor([() => [{ insertId: 1 }]]);
        await savePackage(connection, { ...base, code: 'x', items: [] }, { id: 'a'.repeat(100) });
        expect(connection.calls[0].params).toContain('a'.repeat(64));
    });
});

describe('listPackages and getPackageByCode', () => {
    const packageRows = [
        { id: '2', code: 'obstetri', name: 'A', description: null, category: 'obstetri', week_min: '4', week_max: '12', is_active: 1, sort_order: '10' },
        { id: 3, code: 'gyn_repro', name: 'B', description: 'x', category: 'gyn_repro', week_min: null, week_max: null, is_active: 0, sort_order: 30 }
    ];
    const itemRows = [
        { package_id: 2, item_type: 'tindakan', ref_id: '6', quantity: '1', sort_order: '0' },
        { package_id: 2, item_type: 'obat', ref_id: 3, quantity: 2, sort_order: 1 },
        { package_id: 3, item_type: 'tindakan', ref_id: 8, quantity: 1, sort_order: 0 }
    ];

    test('activeOnly filters in SQL, items load with a second query and are grouped with numeric types', async () => {
        const executor = stubExecutor([() => [packageRows], () => [itemRows]]);
        const result = await listPackages(executor, { activeOnly: true });
        expect(executor.calls[0].sql).toContain('is_active = 1');
        expect(executor.calls[0].sql).toContain('ORDER BY category, sort_order, id');
        expect(executor.calls[1].sql).toContain('WHERE package_id IN (?)');
        expect(executor.calls[1].sql).toContain('ORDER BY package_id, sort_order, id');
        expect(executor.calls[1].params).toEqual([[2, 3]]);
        expect(result[0]).toEqual({
            id: 2, code: 'obstetri', name: 'A', description: null, category: 'obstetri',
            week_min: 4, week_max: 12, is_active: true, sort_order: 10,
            items: [
                { item_type: 'tindakan', ref_id: 6, quantity: 1, sort_order: 0 },
                { item_type: 'obat', ref_id: 3, quantity: 2, sort_order: 1 }
            ]
        });
        expect(result[1].is_active).toBe(false);
        expect(result[1].week_min).toBeNull();
        expect(result[1].items).toHaveLength(1);
    });

    test('without activeOnly there is no is_active filter, and no packages means no item query', async () => {
        const executor = stubExecutor([() => [[]]]);
        expect(await listPackages(executor)).toEqual([]);
        expect(executor.calls[0].sql).not.toContain('is_active = 1');
        expect(executor.calls).toHaveLength(1);
    });

    test('getPackageByCode returns one package or null', async () => {
        const found = stubExecutor([() => [[packageRows[0]]], () => [[itemRows[0]]]]);
        const pkg = await getPackageByCode(found, 'obstetri');
        expect(found.calls[0].sql).toContain('WHERE code = ?');
        expect(found.calls[0].params).toEqual(['obstetri']);
        expect(pkg.items).toHaveLength(1);
        expect(await getPackageByCode(stubExecutor([() => [[]]]), 'nope')).toBeNull();
    });
});

describe('setPackageActive', () => {
    test('updates the flag and reports whether a row matched', async () => {
        const executor = stubExecutor([() => [{ affectedRows: 1 }], () => [{ affectedRows: 0 }]]);
        expect(await setPackageActive(executor, 4, false, { id: 1 })).toBe(true);
        expect(executor.calls[0].params).toEqual([0, '1', 4]);
        expect(await setPackageActive(executor, 5, true, null)).toBe(false);
    });
});
