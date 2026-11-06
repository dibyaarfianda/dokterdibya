const { planAdjustmentAllocation, assertNoDirectStockEdit, effectiveUnitCost } = require('../../services/StockLedgerService');
const batches = [{ id: 1, quantity_remaining: 2, cost_price: 1000 }, { id: 3, quantity_remaining: 0, cost_price: 900 }, { id: 2, quantity_remaining: 5, cost_price: 1100 }];
test('positive delta creates one new batch and touches no existing batch', () => {
  expect(planAdjustmentAllocation({ quantityDelta: 5, batches, batchId: null, unitCost: 1200 }))
    .toEqual({ deductions: [], legacyQuantity: 0, legacyCostPrice: 1200, newBatchQuantity: 5 });
});
test('negative delta deducts FIFO and skips empty batches', () => {
  expect(planAdjustmentAllocation({ quantityDelta: -4, batches, batchId: null, unitCost: 1200 }).deductions)
    .toEqual([{ batchId: 1, quantity: 2, costPrice: 1000 }, { batchId: 2, quantity: 2, costPrice: 1100 }]);
});
test('chosen batch is drained first, then FIFO', () => {
  expect(planAdjustmentAllocation({ quantityDelta: -6, batches, batchId: 2, unitCost: 1200 }).deductions)
    .toEqual([{ batchId: 2, quantity: 5, costPrice: 1100 }, { batchId: 1, quantity: 1, costPrice: 1000 }]);
});
test('shortfall beyond all batches becomes a legacy remainder at unit cost', () => {
  const plan = planAdjustmentAllocation({ quantityDelta: -9, batches, batchId: null, unitCost: 1200 });
  expect(plan.legacyQuantity).toBe(2); expect(plan.legacyCostPrice).toBe(1200); expect(plan.newBatchQuantity).toBe(0);
});
test('unknown chosen batch and zero delta are rejected', () => {
  expect(() => planAdjustmentAllocation({ quantityDelta: -1, batches, batchId: 99, unitCost: 0 })).toThrow(expect.objectContaining({ statusCode: 409, message: 'Batch tidak ditemukan untuk obat ini' }));
  expect(() => planAdjustmentAllocation({ quantityDelta: 0, batches, batchId: null, unitCost: 0 })).toThrow(expect.objectContaining({ statusCode: 400 }));
});
test('direct stock edits are allowed only when the value is absent or unchanged', () => {
  for (const value of [undefined, null, '', '5', 5]) expect(() => assertNoDirectStockEdit(value, 5)).not.toThrow();
  let error; try { assertNoDirectStockEdit(4, 5); } catch (e) { error = e; }
  expect(error).toMatchObject({ statusCode: 409, code: 'STOCK_EDIT_NOT_ALLOWED' });
  expect(error.message).toContain('Ajukan Penyesuaian'); expect(error.message).toContain('muat ulang');
});
test('effective unit cost prefers default cost, then latest batch cost', () => {
  expect(effectiveUnitCost({ defaultCostPrice: 0, latestBatchCost: 900 })).toBe(900);
  expect(effectiveUnitCost({ defaultCostPrice: '1500.50', latestBatchCost: 900 })).toBe(1500.5);
  expect(effectiveUnitCost({ defaultCostPrice: null, latestBatchCost: null })).toBe(0);
});
