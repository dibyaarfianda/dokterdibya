#!/bin/bash
# Fix Astina 12 (id=67): physical stock = 2, batch remaining should match

echo "=== BEFORE FIX ==="
mysql -u root dibyaklinik -e "SELECT id, name, stock FROM obat WHERE id = 67"
mysql -u root dibyaklinik -e "SELECT id, batch_number, quantity_purchased, quantity_remaining FROM obat_batches WHERE obat_id = 67 AND quantity_remaining > 0"

echo ""
echo "=== FIXING ==="

# Revert obat.stock back to 2
mysql -u root dibyaklinik -e "UPDATE obat SET stock = 2 WHERE id = 67"

# Fix batch 69 (only batch with remaining): 17 -> 2
mysql -u root dibyaklinik -e "UPDATE obat_batches SET quantity_remaining = 2 WHERE id = 69 AND obat_id = 67"

# Log the adjustment
mysql -u root dibyaklinik -e "INSERT INTO stock_movements (obat_id, batch_id, movement_type, quantity, reference_type, notes, created_at, created_by) VALUES (67, 69, 'adjustment', -15, 'manual', 'Stock reconciliation: physical count = 2, batch was 17', NOW(), 1)"

echo ""
echo "=== AFTER FIX ==="
mysql -u root dibyaklinik -e "SELECT id, name, stock FROM obat WHERE id = 67"
mysql -u root dibyaklinik -e "SELECT id, batch_number, quantity_purchased, quantity_remaining FROM obat_batches WHERE obat_id = 67 AND quantity_remaining > 0"
