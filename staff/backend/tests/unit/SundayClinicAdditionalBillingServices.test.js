const fs = require('fs');
const path = require('path');

const { normalizeAdditionalBillingItems } = require('../../services/sunday-clinic/shared');

const repoRoot = path.resolve(__dirname, '../../../..');

describe('Sunday Clinic additional billing service catalog', () => {
    test('normalizes an active tindakan using the server-side catalog price', async () => {
        const connection = {
            query: jest.fn().mockResolvedValue([[
                {
                    id: 17,
                    code: 'T17',
                    name: 'USG Tambahan',
                    category: 'TINDAKAN MEDIS',
                    price: 175000
                }
            ]])
        };

        const result = await normalizeAdditionalBillingItems(connection, [{
            item_type: 'tindakan',
            tindakan_id: 17,
            quantity: 2,
            price: 1
        }]);

        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tindakan'),
            [17]
        );
        expect(result).toEqual([{
            item_type: 'tindakan',
            item_code: 'T17',
            item_name: 'USG Tambahan',
            quantity: 2,
            price: 175000,
            total: 350000,
            item_data: {
                source: 'additional-billing',
                tindakanId: 17,
                category: 'TINDAKAN MEDIS'
            }
        }]);
    });

    test('loads and exposes pelayanan in the additional billing editor', () => {
        const source = fs.readFileSync(
            path.join(repoRoot, 'staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'billing.js'),
            'utf8'
        ).replace(/\r\n/g, '\n');

        expect(source).toContain('<option value="tindakan">Pelayanan</option>');
        expect(source).toContain("fetch('/api/tindakan?active=true'");
        expect(source).toContain('additionalBillingModalState.tindakanList');
        expect(source).toContain("item_type: 'tindakan'");
    });

    test('migration permits tindakan items without changing existing item types', () => {
        const migration = fs.readFileSync(
            path.join(repoRoot, 'staff', 'backend', 'migrations', '20260802_add_tindakan_to_additional_billing_items.sql'),
            'utf8'
        );

        expect(migration).toMatch(/ENUM\('obat', 'admin', 'tindakan'\)/i);
    });
});
