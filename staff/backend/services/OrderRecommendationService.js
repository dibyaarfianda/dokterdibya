const { createHash } = require('crypto');

const DAY = 86400000;
const TYPES = new Set(['billing', 'sunday_clinic_billing', 'sunday_clinic_additional_billing', 'obat_sale']);
const number = value => Number(value) || 0;
const date = value => value ? String(value).slice(0, 10) : null;
const shift = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);
const key = row => `${row.reference_type}:${row.reference_id}:${row.obat_id}`;
const emptyMetric = () => ({ units30: 0, units90: 0, transactions30: 0, transactions90: 0 });

/** Read-only inventory evidence and transparent replenishment calculations. Never writes stock. */
class OrderRecommendationService {
    static periods(now = new Date()) {
        const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        return { asOf, start30: shift(asOf, -30), start90: shift(asOf, -90) };
    }

    static forSupplier(item, supplierId, suppliers) {
        const supplier = suppliers.find(s => Number(s.id) === Number(supplierId));
        const r = { ...item, supplier_id: supplier ? Number(supplier.id) : null, supplier_name: supplier?.name || null };
        r.lead_days = supplier ? number(supplier.lead_days) : 7;
        r.safety_days = supplier ? number(supplier.safety_days) : 7;
        r.reorder_point = Math.max(r.min_stock, Math.ceil(r.daily_demand * (r.lead_days + r.safety_days)));
        r.target_stock = Math.max(r.min_stock, Math.ceil(r.daily_demand * (r.lead_days + 30 + r.safety_days)));
        r.recommended_quantity = Math.max(0, Math.ceil(r.target_stock - r.usable_stock));
        r.days_remaining = r.daily_demand > 0 ? r.usable_stock / r.daily_demand : null;
        r.priority = r.manual_review ? 'manual' : (r.days_remaining <= r.lead_days ? 'urgent' : (r.usable_stock <= r.reorder_point ? 'order' : 'enough'));
        const cost = r.supplier_costs.find(c => Number(c.supplier_id) === Number(r.supplier_id));
        r.estimated_unit_cost = cost ? number(cost.cost_price) : (r.default_cost_price > 0 ? r.default_cost_price : null);
        r.cost_source = cost ? 'supplier_purchase' : (r.estimated_unit_cost !== null ? 'default_estimate' : 'unknown');
        const descriptions = {
            manual: 'Periksa bukti dan stok sebelum menentukan jumlah order.',
            urgent: 'Stok diperkirakan habis paling lambat saat barang tiba.',
            order: 'Stok sudah mencapai batas order termasuk cadangan.',
            enough: 'Stok masih di atas batas order.'
        };
        r.reasons = [descriptions[r.priority], `Dasar kebutuhan ${r.daily_demand.toFixed(2)} ${r.unit}/hari; target ${r.target_stock} ${r.unit}.`, ...r.warnings];
        // Hash only reproducible evidence. Other users' new drafts do not invalidate a quantity choice.
        const { analysis_fingerprint, active_drafts, fast_moving, ...evidence } = r;
        r.analysis_fingerprint = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
        return r;
    }

    static analyze({ obat, batches, movements, sources, historyStart, suppliers, activeDrafts = [], asOf }) {
        const start30 = shift(asOf, -30), start90 = shift(asOf, -90);
        const sourceMap = new Map();
        for (const source of sources) {
            const k = key(source), previous = sourceMap.get(k);
            sourceMap.set(k, previous ? { ...previous, quantity: number(previous.quantity) + number(source.quantity) } : { ...source });
        }
        const groups = new Map();
        for (const m of movements) {
            if (!['sale', 'return'].includes(m.movement_type)) continue;
            const k = key(m);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(m);
        }
        const items = obat.map(o => {
            const allBatches = batches.filter(b => Number(b.obat_id) === Number(o.id));
            const remaining = allBatches.filter(b => number(b.quantity_remaining) > 0)
                .sort((a, b) => String(a.purchase_date).localeCompare(String(b.purchase_date)) || number(a.id) - number(b.id))
                .map(b => ({ id: b.id, batch_number: b.batch_number || null, purchase_date: date(b.purchase_date), expiry_date: date(b.expiry_date), quantity_remaining: number(b.quantity_remaining) }));
            const batchStock = allBatches.reduce((sum, b) => sum + number(b.quantity_remaining), 0);
            const expired = remaining.filter(b => b.expiry_date && b.expiry_date < asOf).reduce((sum, b) => sum + b.quantity_remaining, 0);
            const observedStart = [date(o.created_at), date(historyStart)].filter(Boolean).sort().pop() || null;
            const limited = !observedStart || observedStart > start90;
            const warnings = new Set();
            let manual = limited;
            if (limited) warnings.add('Riwayat terbatas: belum terbukti mencakup 90 hari penuh.');
            if (number(o.stock) !== batchStock) { warnings.add('Stok tercatat berbeda dari jumlah sisa batch.'); manual = true; }
            if (number(o.stock) > 0 && !remaining.length) { warnings.add('Stok legacy tanpa batch; kedaluwarsa tidak diketahui.'); manual = true; }
            if (remaining.some(b => !b.expiry_date)) { warnings.add('Ada batch tanpa tanggal kedaluwarsa.'); manual = true; }
            if (number(o.stock) < 0 || expired > number(o.stock) || allBatches.some(b => number(b.quantity_remaining) < 0)) { warnings.add('Kuantitas stok atau batch tidak konsisten.'); manual = true; }
            if (expired) warnings.add(`${expired} ${o.unit || 'unit'} dalam batch sudah kedaluwarsa; dikeluarkan dari stok layak analisis.`);
            const expiring = remaining.filter(b => b.expiry_date && b.expiry_date >= asOf && b.expiry_date <= shift(asOf, 60));
            if (expiring.length) warnings.add('Ada batch mendekati kedaluwarsa dalam 60 hari; periksa jumlah sebelum order.');
            const clinic = emptyMetric(), external = emptyMetric(), transactions = [];
            for (const [k, group] of groups) {
                if (Number(group[0].obat_id) !== Number(o.id)) continue;
                const recent = group.filter(m => m.date >= start90 && m.date < asOf);
                if (!recent.length) continue;
                const source = sourceMap.get(k);
                const total = -group.filter(m => m.movement_type === 'sale').reduce((sum, m) => sum + number(m.quantity), 0);
                let issue = null;
                if (!TYPES.has(group[0].reference_type)) issue = 'Kanal mutasi belum dikenali.';
                else if (!source) issue = 'Referensi atau item transaksi sumber tidak ditemukan.';
                else if (number(source.is_test)) issue = 'Mutasi transaksi tes dikecualikan.';
                else if (source.status === 'draft') issue = 'Mutasi transaksi draft dikecualikan.';
                else if (source.status === 'cancelled') issue = 'Ada mutasi transaksi dibatalkan.';
                else if (!(group[0].reference_type === 'obat_sale' ? ['paid', 'payment_pending', 'confirmed'] : ['paid', 'confirmed']).includes(source.status)) issue = 'Status transaksi belum mendukung pengeluaran stok.';
                else if (group.some(m => m.movement_type === 'return')) issue = 'Ada retur; verifikasi kuantitas permintaan secara manual.';
                else if (group.some(m => m.movement_type === 'sale' && number(m.quantity) >= 0) || total !== number(source.quantity)) issue = 'Kuantitas mutasi berbeda dari item transaksi sumber.';
                if (issue) { warnings.add(issue); manual = true; }
                const metric = group[0].reference_type === 'obat_sale' ? external : clinic;
                const sales = recent.filter(m => m.movement_type === 'sale');
                const qty90 = -sales.reduce((sum, m) => sum + number(m.quantity), 0);
                const sales30 = sales.filter(m => m.date >= start30);
                if (!issue) {
                    metric.units90 += qty90; metric.transactions90 += sales.length ? 1 : 0;
                    metric.units30 -= sales30.reduce((sum, m) => sum + number(m.quantity), 0);
                    metric.transactions30 += sales30.length ? 1 : 0;
                }
                transactions.push({ reference_type: group[0].reference_type, reference_id: group[0].reference_id, date: recent.map(m => m.date).sort().pop(), quantity: qty90, status: source?.status || 'missing', valid: !issue });
            }
            const daily30 = (clinic.units30 + external.units30) / 30, daily90 = (clinic.units90 + external.units90) / 90;
            const daily = Math.max(daily30, daily90);
            if (!daily) { warnings.add('Tidak ada pemakaian valid pada periode analisis.'); manual = true; }
            const costs = new Map();
            for (const b of [...allBatches].sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)) || number(b.id) - number(a.id))) {
                if (b.supplier_id && number(b.cost_price) > 0 && b.purchase_date <= asOf && !costs.has(number(b.supplier_id))) costs.set(number(b.supplier_id), { supplier_id: number(b.supplier_id), cost_price: number(b.cost_price), purchase_date: date(b.purchase_date) });
            }
            const r = {
                obat_id: Number(o.id), code: o.code, name: o.name, unit: o.unit || 'unit', as_of: asOf,
                min_stock: Math.max(0, number(o.min_stock)), stock: number(o.stock), expired_stock: expired, usable_stock: Math.max(0, number(o.stock) - expired), batch_stock: batchStock,
                batches: remaining, oldest_batch: remaining[0] || null, expiring_batches: expiring,
                history_start: observedStart, history_limited: limited, clinic, external, daily_demand: daily,
                trend_percent: daily90 > 0 ? (daily30 / daily90 - 1) * 100 : null,
                warnings: [...warnings], manual_review: manual, transactions: transactions.sort((a, b) => b.date.localeCompare(a.date) || String(a.reference_type).localeCompare(String(b.reference_type)) || number(a.reference_id) - number(b.reference_id)),
                supplier_costs: [...costs.values()].sort((a, b) => a.supplier_id - b.supplier_id), default_cost_price: Math.max(0, number(o.default_cost_price)),
                active_drafts: activeDrafts.filter(d => Number(d.obat_id) === Number(o.id)).map(d => ({ id: d.id, supplier_id: d.supplier_id }))
            };
            return this.forSupplier(r, o.default_supplier_id, suppliers);
        });
        const frequencies = items.map(r => r.clinic.transactions90 + r.external.transactions90).filter(n => n > 0).sort((a, b) => b - a);
        const cutoff = frequencies.length ? frequencies[Math.ceil(frequencies.length * 0.2) - 1] : Infinity;
        for (const r of items) r.fast_moving = r.clinic.transactions90 + r.external.transactions90 >= cutoff;
        const priorities = { urgent: 0, order: 1, enough: 2, manual: 3 };
        return items.sort((a, b) => priorities[a.priority] - priorities[b.priority] || (a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity) || a.name.localeCompare(b.name));
    }

    static async generate({ supplierId = null, now = new Date(), connection = null } = {}) {
        const own = !connection;
        const cx = connection || await require('../db').getConnection();
        try {
            if (own) { await cx.query('SET TRANSACTION READ ONLY'); await cx.beginTransaction(); }
            const { asOf } = this.periods(now);
            const [obat] = await cx.query("SELECT id,code,name,unit,stock,min_stock,default_supplier_id,default_cost_price,DATE_FORMAT(created_at,'%Y-%m-%d') created_at FROM obat WHERE is_active=1 ORDER BY id");
            const [batches] = await cx.query("SELECT b.id,b.obat_id,b.supplier_id,b.batch_number,DATE_FORMAT(b.purchase_date,'%Y-%m-%d') purchase_date,DATE_FORMAT(b.expiry_date,'%Y-%m-%d') expiry_date,b.quantity_remaining,b.cost_price FROM obat_batches b JOIN obat o ON o.id=b.obat_id WHERE o.is_active=1 ORDER BY b.id");
            // Preserve all fragments for source-total reconciliation, including fragments outside the display window.
            const [movements] = await cx.query("SELECT sm.obat_id,sm.reference_type,sm.reference_id,sm.movement_type,sm.quantity,DATE_FORMAT(sm.created_at,'%Y-%m-%d') date FROM stock_movements sm JOIN obat o ON o.id=sm.obat_id WHERE o.is_active=1 AND sm.movement_type IN ('sale','return') ORDER BY sm.id");
            const [[history]] = await cx.query("SELECT DATE_FORMAT(MIN(created_at),'%Y-%m-%d') first_date FROM stock_movements");
            const [suppliers] = await cx.query('SELECT s.id,s.name,COALESCE(p.lead_days,7) lead_days,COALESCE(p.safety_days,7) safety_days,COALESCE(p.version,0) version FROM suppliers s LEFT JOIN order_supplier_settings p ON p.supplier_id=s.id WHERE s.is_active=1 ORDER BY s.id');
            const [activeDrafts] = await cx.query("SELECT i.obat_id,d.id,d.supplier_id FROM order_drafts d JOIN order_draft_items i ON i.draft_id=d.id WHERE d.status='draft' ORDER BY d.id");
            const [external] = await cx.query("SELECT 'obat_sale' reference_type,s.id reference_id,i.obat_id,i.quantity,s.status,(COALESCE(s.is_test,0)=1 OR LOWER(TRIM(s.patient_name)) REGEXP '^tes(t)?$') is_test FROM obat_sales s JOIN obat_sale_items i ON i.sale_id=s.id ORDER BY i.id");
            const [legacy] = await cx.query("SELECT 'billing' reference_type,b.id reference_id,i.item_code,i.quantity,b.payment_status status,(LOWER(TRIM(p.full_name)) REGEXP '^tes(t)?$') is_test FROM billings b JOIN billing_items i ON i.billing_id=b.id LEFT JOIN patients p ON p.id=b.patient_id WHERE i.item_type='medication' ORDER BY i.id");
            const [clinic] = await cx.query("SELECT 'sunday_clinic_billing' reference_type,b.id reference_id,i.item_code,i.item_data,i.quantity,b.status,(LOWER(TRIM(p.full_name)) REGEXP '^tes(t)?$') is_test FROM sunday_clinic_billings b JOIN sunday_clinic_billing_items i ON i.billing_id=b.id LEFT JOIN patients p ON p.id=b.patient_id WHERE i.item_type='obat' ORDER BY i.id");
            const [additional] = await cx.query("SELECT 'sunday_clinic_additional_billing' reference_type,b.id reference_id,i.item_code,i.item_data,i.quantity,b.status,(LOWER(TRIM(p.full_name)) REGEXP '^tes(t)?$') is_test FROM sunday_clinic_additional_billings b JOIN sunday_clinic_additional_billing_items i ON i.additional_billing_id=b.id LEFT JOIN patients p ON p.id=b.patient_id WHERE i.item_type='obat' ORDER BY i.id");
            const byCode = new Map(obat.map(o => [o.code, o.id])), byId = new Set(obat.map(o => Number(o.id)));
            const mapped = [...legacy, ...clinic, ...additional].map(i => {
                let data = {}; try { data = JSON.parse(i.item_data || '{}') || {}; } catch (_) { /* Invalid data stays unmatched if code cannot resolve. */ }
                const id = number(data.obatId) || byCode.get(i.item_code) || (/^\d+$/.test(i.item_code || '') && byId.has(Number(i.item_code)) ? Number(i.item_code) : null);
                return { reference_type: i.reference_type, reference_id: i.reference_id, obat_id: id, status: i.status, quantity: i.quantity, is_test: i.is_test };
            });
            let items = this.analyze({ obat, batches, movements, sources: [...external, ...mapped], historyStart: history.first_date, suppliers, activeDrafts, asOf });
            if (supplierId !== null) {
                if (!suppliers.some(s => Number(s.id) === Number(supplierId))) { const err = new Error('Supplier aktif tidak ditemukan.'); err.statusCode = 400; throw err; }
                items = items.map(r => this.forSupplier(r, supplierId, suppliers));
            }
            if (own) await cx.commit();
            return { as_of: asOf, generated_at: now.toISOString(), parameters: { target_days: 30, periods: [30, 90] }, suppliers, items };
        } catch (error) {
            if (own) await cx.rollback();
            throw error;
        } finally { if (own) cx.release(); }
    }
}

module.exports = OrderRecommendationService;
