const fs = require('fs');
const path = require('path');
const servicePath = path.join(__dirname, '../../services/EstimasiBiayaDraft.js');
const api = fs.existsSync(servicePath) ? require(servicePath) : {};
const config = () => ({
    version: 2, aliases: { 7: 'Paket A' },
    trimesters: {
        t1: { template_id: 1, template_name: 'RAHASIA TEMPLATE', medications: [{ obat_id: 7, name: 'RAHASIA OBAT', quantity: 30, unit: 'tablet', caraPakai: 'RAHASIA DOSIS' }], repeats: 2,
            services: [{ tindakan_id: 9, quantity: 1, repeats: 1 }] },
        t2: { template_id: null, medications: [], repeats: 1, services: [{ tindakan_id: 9, quantity: 1, repeats: 0 }] },
        t3: { template_id: null, medications: [], repeats: 1, services: [{ tindakan_id: 9, quantity: 1, repeats: 0 }] }
    }
});
const catalog = () => ({
    medications: [{ id: 7, name: 'RAHASIA OBAT', price: 1500, unit: 'tablet', is_active: 1 }],
    services: [{ id: 9, name: 'Konsultasi', price: 100000, category: 'LAYANAN', is_active: 1 }],
    templates: [{ id: 1 }]
});
describe('draft estimasi pasien', () => {
    test('provides isolated draft and privacy-safe calculation contract', () => {
        expect(typeof api.normalizeDraft).toBe('function');
        expect(typeof api.buildPreview).toBe('function');
    });
    test('preserves 30-unit prescription; repeats prescription independently from service', () => {
        const result = api.buildPreview(config(), catalog());
        expect(result.ready).toBe(true);
        expect(result.trimesters.t1.medication_total).toBe(90000);
        expect(result.trimesters.t1.service_total).toBe(100000);
        expect(result.total).toBe(190000);
        expect(JSON.stringify(result)).not.toMatch(/RAHASIA|obat_id|template_name|caraPakai/);
    });
    test('zero repeats and latest prices are respected', () => {
        const draft = config(); draft.trimesters.t1.repeats = 0;
        expect(api.buildPreview(draft, catalog()).total).toBe(100000);
        const prices = catalog(); prices.medications[0].price = 2000;
        expect(api.buildPreview(config(), prices).total).toBe(220000);
    });
    test.each(['alias', 'inactive', 'missing', 'price', 'unit', 'template', 'negative', 'fraction-repeat', 'blank-repeat', 'blank-service-repeat'])('incomplete %s has no misleading total or leaked names', reason => {
        const draft = config(); const prices = catalog();
        if (reason === 'alias') draft.aliases = {};
        if (reason === 'inactive') prices.medications[0].is_active = 0;
        if (reason === 'missing') prices.medications = [];
        if (reason === 'price') prices.medications[0].price = null;
        if (reason === 'unit') draft.trimesters.t1.medications[0].unit = 'strip';
        if (reason === 'template') prices.templates = [];
        if (reason === 'negative') draft.trimesters.t1.repeats = -1;
        if (reason === 'fraction-repeat') draft.trimesters.t1.repeats = 1.5;
        if (reason === 'blank-repeat') draft.trimesters.t1.repeats = null;
        if (reason === 'blank-service-repeat') draft.trimesters.t1.services[0].repeats = null;
        const result = api.buildPreview(draft, prices);
        expect(result.ready).toBe(false);
        expect(result.total).toBeNull();
        expect(JSON.stringify(result)).not.toMatch(/RAHASIA/);
    });
    test('snapshot quantities remain intact when source template changes', () => {
        const prices = catalog(); prices.templates[0].items = [{ quantity: 99 }];
        expect(api.buildPreview(config(), prices).total).toBe(190000);
    });
    test('normalization strips unrelated and unsafe fields while preserving snapshot', () => {
        const draft = config(); draft.published = true;
        const normalized = api.normalizeDraft(draft);
        expect(normalized.published).toBeUndefined();
        expect(normalized.trimesters.t1.medications[0].quantity).toBe(30);
        expect(normalized.trimesters.t1.medications[0].caraPakai).toBeUndefined();
    });
    test('single trimester can be calculated while other trimesters are incomplete', () => {
        const { calculateEstimate } = require('../../../../public/scripts/cost-estimate-engine');
        const draft = config(); draft.trimesters.t2.services = [];
        const result = api.buildPreview(draft, catalog());
        expect(result.total).toBeNull();
        expect(calculateEstimate(result, { trimester: 't1' }).total).toBe(190000);
        expect(calculateEstimate(result, { trimester: 't1', repeats: { t1: 0 }, services: { 't1-service-0': 0 } }).total).toBe(0);
    });
});
