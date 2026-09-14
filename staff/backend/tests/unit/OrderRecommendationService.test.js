const fs = require('fs');
const modulePath = require('path').resolve(__dirname, '../../services/OrderRecommendationService.js');
const Service = fs.existsSync(modulePath) ? require(modulePath) : {};
const base = () => ({
    asOf: '2026-09-14', historyStart: '2025-11-30',
    obat: [{ id: 1, code: 'A', name: 'Obat A', unit: 'pcs', stock: 20, min_stock: 10, default_supplier_id: 1, created_at: '2025-11-02', default_cost_price: 500 }],
    batches: [{ id: 1, obat_id: 1, supplier_id: 1, purchase_date: '2026-08-01', expiry_date: '2027-01-01', quantity_remaining: 20, cost_price: 600 }],
    movements: [{ obat_id: 1, reference_type: 'obat_sale', reference_id: 1, movement_type: 'sale', quantity: -60, date: '2026-09-01' }],
    sources: [{ obat_id: 1, reference_type: 'obat_sale', reference_id: 1, status: 'payment_pending', quantity: 60, is_test: 0 }],
    suppliers: [{ id: 1, name: 'Supplier', lead_days: 7, safety_days: 7, version: 0 }], activeDrafts: []
});
test('engine exists as callable behavior', () => expect(typeof Service.analyze).toBe('function'));
test('approved formula and paid-pending physical demand', () => {
    const [r] = Service.analyze(base());
    expect(r).toMatchObject({ daily_demand: 2, reorder_point: 28, target_stock: 88, recommended_quantity: 68, priority: 'order', estimated_unit_cost: 600 });
    expect(r.external).toMatchObject({ units30: 60, transactions30: 1 });
});
test('batch splits count one transaction; both clinic kinds counted separately from external', () => {
    const data = base();
    data.movements[0].quantity = -20;
    data.movements.push({ ...data.movements[0], quantity: -40 });
    for (const type of ['billing', 'sunday_clinic_billing', 'sunday_clinic_additional_billing']) {
        data.movements.push({ ...data.movements[0], reference_type: type, quantity: -10 });
        data.sources.push({ ...data.sources[0], reference_type: type, status: 'paid', quantity: 10 });
    }
    const [r] = Service.analyze(data);
    expect(r.external.transactions90).toBe(1);
    expect(r.clinic).toMatchObject({ units30: 30, transactions90: 3 });
});
test.each(['draft', 'cancelled', 'missing', 'test', 'mismatch', 'return'])('%s evidence cannot inflate recommendations', (issue) => {
    const data = base();
    if (issue === 'missing') data.sources = [];
    else if (issue === 'test') data.sources[0].is_test = 1;
    else if (issue === 'mismatch') data.sources[0].quantity = 59;
    else if (issue === 'return') data.movements.push({ ...data.movements[0], movement_type: 'return', quantity: 2 });
    else data.sources[0].status = issue;
    const [r] = Service.analyze(data);
    expect(r.external.units90).toBe(0);
    expect(r.priority).toBe('manual');
});
test('WIB calendar boundary and full prior days, not current partial day', () => {
    expect(Service.periods(new Date('2026-09-13T17:01:00Z'))).toEqual({ asOf: '2026-09-14', start30: '2026-08-15', start90: '2026-06-16' });
    const data = base();
    data.movements[0].date = '2026-09-14';
    expect(Service.analyze(data)[0].external.units30).toBe(0);
    data.movements[0].date = '2026-08-15';
    expect(Service.analyze(data)[0].external.units30).toBe(60);
    data.movements[0].date = '2026-08-14';
    expect(Service.analyze(data)[0].external.units30).toBe(0);
});
test('expiry, legacy, stock mismatch and short history are explicit manual warnings', () => {
    const data = base(); data.batches[0].expiry_date = '2026-09-13';
    const [expired] = Service.analyze(data);
    expect(expired.usable_stock).toBe(0);
    expect(expired.expired_stock).toBe(20);
    expect(expired.priority).toBe('urgent');
    data.batches = [];
    expect(Service.analyze(data)[0]).toMatchObject({ priority: 'manual', batch_stock: 0 });
    data.obat[0].created_at = '2026-08-21';
    expect(Service.analyze(data)[0].history_limited).toBe(true);
});
test('supplier changes recompute lead and cost; fingerprint ignores generation time but detects evidence changes', () => {
    const data = base(); const [r] = Service.analyze(data);
    expect(Service.analyze(data)[0].analysis_fingerprint).toBe(r.analysis_fingerprint);
    const supplier = { id: 2, name: 'B', lead_days: 14, safety_days: 7, version: 0 };
    const switched = Service.forSupplier(r, 2, [...data.suppliers, supplier]);
    expect(switched).toMatchObject({ supplier_id: 2, lead_days: 14, priority: 'urgent', estimated_unit_cost: 500, cost_source: 'default_estimate' });
    expect(switched.analysis_fingerprint).not.toBe(r.analysis_fingerprint);
    data.obat[0].stock = 19;
    expect(Service.analyze(data)[0].analysis_fingerprint).not.toBe(r.analysis_fingerprint);
});
test('top 20 percent includes boundary ties and low history never bulk eligible', () => {
    const data = base();
    data.obat = Array.from({ length: 6 }, (_, i) => ({ ...data.obat[0], id: i + 1 }));
    data.batches = data.obat.map(o => ({ ...data.batches[0], obat_id: o.id }));
    data.movements = []; data.sources = [];
    for (const o of data.obat) {
        for (let i = 0; i < (o.id <= 3 ? 3 : 1); i++) {
            const source = { obat_id: o.id, reference_type: 'obat_sale', reference_id: i + 1, status: 'paid', quantity: 2 };
            data.sources.push(source);
            data.movements.push({ ...source, date: '2026-09-01', movement_type: 'sale', quantity: -2 });
        }
    }
    expect(Service.analyze(data).filter(r => r.fast_moving).map(r => r.obat_id).sort()).toEqual([1, 2, 3]);
});
test('source total checks include older fragments without including them in window', () => {
    const data = base();
    data.movements.push({ ...data.movements[0], date: '2026-01-01', quantity: -10 });
    data.sources[0].quantity = 70;
    expect(Service.analyze(data)[0].external.units90).toBe(60);
});
