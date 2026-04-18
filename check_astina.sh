#!/bin/bash
# Check Astina stock discrepancy

echo "=== OBAT RECORD ==="
mysql -u root dibyaklinik -e "SELECT id, code, name, stock, default_cost_price, price FROM obat WHERE name LIKE '%stina%'"

echo ""
echo "=== BATCH DETAILS ==="
mysql -u root dibyaklinik -e "SELECT b.id, b.obat_id, b.batch_number, b.quantity_purchased, b.quantity_remaining, b.purchase_date, b.expiry_date FROM obat_batches b JOIN obat o ON b.obat_id = o.id WHERE o.name LIKE '%stina%' ORDER BY b.purchase_date"

echo ""
echo "=== STOCK MOVEMENTS ==="
mysql -u root dibyaklinik -e "SELECT sm.id, sm.obat_id, sm.movement_type, sm.quantity, sm.reference_type, sm.reference_id, sm.created_at FROM stock_movements sm JOIN obat o ON sm.obat_id = o.id WHERE o.name LIKE '%stina%' ORDER BY sm.created_at"

echo ""
echo "=== CALCULATED vs ACTUAL ==="
mysql -u root dibyaklinik -e "
SELECT 
  o.id, o.name, o.stock as actual_stock,
  COALESCE(SUM(CASE WHEN sm.movement_type='purchase' THEN sm.quantity ELSE 0 END), 0) as total_purchased,
  COALESCE(SUM(CASE WHEN sm.movement_type='sale' THEN sm.quantity ELSE 0 END), 0) as total_sold,
  COALESCE(SUM(CASE WHEN sm.movement_type='adjustment' THEN sm.quantity ELSE 0 END), 0) as total_adjusted,
  COALESCE(SUM(CASE WHEN sm.movement_type='purchase' THEN sm.quantity ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN sm.movement_type='sale' THEN sm.quantity ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN sm.movement_type='adjustment' THEN sm.quantity ELSE 0 END), 0) as calculated_stock
FROM obat o
LEFT JOIN stock_movements sm ON sm.obat_id = o.id
WHERE o.name LIKE '%stina%'
GROUP BY o.id, o.name, o.stock
"

echo ""
echo "=== BATCH SUM vs OBAT.STOCK ==="
mysql -u root dibyaklinik -e "
SELECT o.id, o.name, o.stock as obat_stock, COALESCE(SUM(b.quantity_remaining), 0) as batch_remaining
FROM obat o
LEFT JOIN obat_batches b ON b.obat_id = o.id
WHERE o.name LIKE '%stina%'
GROUP BY o.id, o.name, o.stock
"
