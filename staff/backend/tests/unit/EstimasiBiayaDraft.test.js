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
// Keep the existing medication/service regression cases isolated from visit fees.
function itemOnlyPreview(...args) {
    const preview = api.buildPreview(...args);
    const { mandatory_costs, ...items } = preview;
    return require('../../../../public/scripts/cost-estimate-engine').calculateEstimate(items);
}
describe('draft estimasi pasien', () => {
    test('provides isolated draft and privacy-safe calculation contract', () => {
        expect(typeof api.normalizeDraft).toBe('function');
        expect(typeof api.buildPreview).toBe('function');
    });
    test('preserves 30-unit prescription; repeats prescription independently from service', () => {
        const result = itemOnlyPreview(config(), catalog());
        expect(result.ready).toBe(true);
        expect(result.trimesters.t1.medication_total).toBe(90000);
        expect(result.trimesters.t1.service_total).toBe(100000);
        expect(result.total).toBe(190000);
        expect(JSON.stringify(result)).not.toMatch(/RAHASIA|obat_id|template_name|caraPakai/);
    });
    test('zero repeats and latest prices are respected', () => {
        const draft = config(); draft.trimesters.t1.repeats = 0;
        expect(itemOnlyPreview(draft, catalog()).total).toBe(100000);
        const prices = catalog(); prices.medications[0].price = 2000;
        expect(itemOnlyPreview(config(), prices).total).toBe(220000);
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
        const result = itemOnlyPreview(draft, prices);
        expect(result.ready).toBe(false);
        expect(result.total).toBeNull();
        expect(JSON.stringify(result)).not.toMatch(/RAHASIA/);
    });
    test('snapshot quantities remain intact when source template changes', () => {
        const prices = catalog(); prices.templates[0].items = [{ quantity: 99 }];
        expect(itemOnlyPreview(config(), prices).total).toBe(190000);
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
        const result = itemOnlyPreview(draft, catalog());
        expect(result.total).toBeNull();
        expect(calculateEstimate(result, { trimester: 't1' }).total).toBe(190000);
        expect(calculateEstimate(result, { trimester: 't1', repeats: { t1: 0 }, services: { 't1-service-0': 0 } }).total).toBe(0);
    });
    test('valid service subtotal survives medication unit mismatch and missing alias', () => {
        const draft = config(); draft.aliases = {}; draft.trimesters.t1.medications[0].unit = 'strip';
        const result = itemOnlyPreview(draft, catalog());
        expect(result.trimesters.t1.service_total).toBe(100000);
        expect(result.trimesters.t1.medication_total).toBeNull();
        expect(result.trimesters.t1.total).toBeNull();
        expect(result.total).toBeNull();
    });
    test('valid medication subtotal survives incomplete service', () => {
        const prices = catalog(); prices.services[0].price = null;
        const result = itemOnlyPreview(config(), prices);
        expect(result.trimesters.t1.medication_total).toBe(90000);
        expect(result.trimesters.t1.service_total).toBeNull();
        expect(result.total).toBeNull();
    });
    test('invalid simulated service repeat affects only services and can be corrected', () => {
        const { calculateEstimate } = require('../../../../public/scripts/cost-estimate-engine');
        const source = itemOnlyPreview(config(), catalog());
        const invalid = calculateEstimate(source, {services: {'t1-service-0': -1}});
        expect(invalid.trimesters.t1.medication_total).toBe(90000);
        expect(invalid.trimesters.t1.service_total).toBeNull();
        expect(calculateEstimate(source, {services: {'t1-service-0': 1}}).total).toBe(190000);
    });

});


describe('mandatory master prices', () => {
    test('loads active admin and both control books at their current prices', () => {
        const prices = catalog();
        prices.services.push({id:1,name:'Biaya Admin',price:'15000.00',is_active:1},
            {id:3,name:'Buku Kontrol Obstetri',price:'25000.00',is_active:1},
            {id:59,name:'Buku Kontrol Ginekologi',price:'25000.00',is_active:1});
        const result = api.buildPreview(config(), prices);
        expect(result.configuration_ready).toBe(true);
        expect(result.total).toBeNull(); // Patient simulation still needs visit counts.
        expect(result.mandatory_costs.admin).toEqual({label:'Biaya Admin',price:15000,ready:true});
        expect(result.mandatory_costs.books.obstetri.price).toBe(25000);
        expect(result.mandatory_costs.books.ginekologi.price).toBe(25000);
        prices.services.find(row => row.id === 3).price = '30000.00';
        expect(api.buildPreview(config(), prices).mandatory_costs.books.obstetri.price).toBe(30000);
    });
    test('missing or inactive mandatory price stays unavailable, never zero', () => {
        const prices = catalog();
        prices.services.push({id:1,price:15000,is_active:0});
        const fees = api.buildPreview(config(), prices).mandatory_costs;
        expect(fees.admin).toEqual({label:'Biaya Admin',price:null,ready:false});
        expect(fees.books.obstetri.ready).toBe(false);
        expect(fees.books.ginekologi.price).toBeNull();
    });
});


describe('mandatory first-visit and administration costs', () => {
    const calculate = require('../../../../public/scripts/cost-estimate-engine').calculateEstimate;
    function source() {
        const prices = catalog();
        prices.services.push({id:1,price:15000,is_active:1},{id:3,price:25000,is_active:1},{id:59,price:25000,is_active:1});
        return api.buildPreview(config(),prices);
    }
    test('one control book is charged once for all selected trimesters', () => {
        const result=calculate(source(),{trimester:'all',visits:{t1:3,t2:2,t3:4},book:'obstetri'});
        expect(result.book_total).toBe(25000);
        expect(result.total).toBe(350000); // 190000 services/meds + 9 visits * 15000 + one book
        expect(calculate(source(),{trimester:'t3',visits:{t3:1},book:'ginekologi'}).total).toBe(40000);
    });
    test('book choice and available prices are required; zero visits has no book charge', () => {
        expect(calculate(source(),{trimester:'t1',visits:{t1:1},book:'unknown'}).total).toBeNull();
        const data=source(); data.mandatory_costs.books.obstetri={price:null,ready:false};
        expect(calculate(data,{trimester:'t1',visits:{t1:1},book:'obstetri'}).total).toBeNull();
        const zero=calculate(source(),{trimester:'t1',visits:{t1:0},repeats:{t1:0},services:{'t1-service-0':0},book:'obstetri'});
        expect(zero.book_total).toBe(0); expect(zero.total).toBe(0);
    });
    test('mandatory services already in draft are not duplicated as optional services', () => {
        const draft=config();draft.trimesters.t1.services.push({tindakan_id:1,quantity:1,repeats:3},{tindakan_id:3,quantity:1,repeats:1});
        const preview=api.buildPreview(draft,catalog());
        expect(preview.trimesters.t1.items.filter(i=>i.kind==='service')).toHaveLength(1);
    });
    test('admin uses separate visit count and does not multiply by number of services', () => {
        const result=calculate(source(),{trimester:'t1',visits:{t1:3},book:'obstetri'});
        expect(result.trimesters.t1.admin_total).toBe(45000);
        expect(result.trimesters.t1.total).toBe(235000);
    });
    test('empty, fractional or negative visits do not produce a total', () => {
        for(const visits of [null,'',-1,1.5]) {
            const result=calculate(source(),{trimester:'t1',visits:{t1:visits},book:'obstetri'});
            expect(result.trimesters.t1.admin_total).toBeNull();
            expect(result.total).toBeNull();
        }
    });
    test('zero visits cannot bypass admin with active prescriptions or services', () => {
        const result=calculate(source(),{trimester:'t1',visits:{t1:0},book:'obstetri'});
        expect(result.total).toBeNull();
        expect(result.trimesters.t1.visit_issue).toMatch(/kunjungan/);
    });
    test('zero visits with zero selected items has no admin cost', () => {
        const result=calculate(source(),{trimester:'t1',visits:{t1:0},repeats:{t1:0},services:{'t1-service-0':0},book:'obstetri'});
        expect(result.trimesters.t1.admin_total).toBe(0);
    });
});
