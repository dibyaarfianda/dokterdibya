// Integration test against a disposable, explicitly named QA schema. Never target production.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('crypto');
const mysql = require('mysql2/promise');
const Recommendation = require('../services/OrderRecommendationService');
const Draft = require('../services/OrderDraftService');
const schema = process.env.ORDER_QA_DB;
if (!/^codex_order_qa_\d{8}$/.test(schema || '')) throw new Error('ORDER_QA_DB must name an isolated codex_order_qa_YYYYMMDD schema');
const pool = mysql.createPool({ user: 'root', socketPath: '/run/mysqld/mysqld.sock', database: schema, timezone: '+07:00', connectionLimit: 5 });
const service = new Draft({ db: pool, recommendations: Recommendation });
async function analysis() {
    const c = await pool.getConnection();
    try { await c.beginTransaction(); const result = await Recommendation.generate({ connection: c }); await c.commit(); return result; }
    catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
async function stockHash() {
    const [rows] = await pool.query('SELECT id,stock FROM obat ORDER BY id');
    const [batches] = await pool.query('SELECT id,quantity_remaining FROM obat_batches ORDER BY id');
    const [[movements]] = await pool.query('SELECT COUNT(*) n,SUM(quantity) qty FROM stock_movements');
    return createHash('sha256').update(JSON.stringify([rows,batches,movements])).digest('hex');
}
(async () => {
    const before = await stockHash();
    const a = await analysis();
    assert(a.items.length > 0 && a.suppliers.length > 0);
    const supplier = a.suppliers[0];
    const r = Recommendation.forSupplier(a.items[0], supplier.id, a.suppliers);
    assert.equal(Recommendation.forSupplier(r, supplier.id, a.suppliers).analysis_fingerprint, r.analysis_fingerprint, 'supplier hash stable on repeated normalization');
    const body = { request_key: randomUUID(), notes: 'QA isolated order test', items: [{ obat_id: r.obat_id, supplier_id: supplier.id, quantity: 19, analysis_fingerprint: r.analysis_fingerprint }] };
    const parallel = await Promise.all([service.create(body,'qa-operator'),service.create(body,'qa-operator')]);
    assert.equal(parallel[0].drafts[0].id, parallel[1].drafts[0].id);
    assert.equal(parallel.filter(p => p.replayed).length, 1);
    await assert.rejects(service.create({...body,notes:'different'},'qa-operator'), e => e.code === 'IDEMPOTENCY_CONFLICT');
    const id = parallel[0].drafts[0].id;
    const detail = await service.detail(id);
    assert.equal(detail.items[0].quantity,19);
    assert.equal(detail.audit.length,1);
    const choices = {...body,version:1,items:[{...body.items[0],quantity:21}]};
    const edits = await Promise.allSettled([service.update(id,choices,'qa-editor'),service.update(id,choices,'qa-editor')]);
    assert.equal(edits.filter(e => e.status === 'fulfilled').length,1);
    assert.equal(edits.find(e=>e.status==='rejected').reason.code,'VERSION_CONFLICT');
    const settings = await Promise.allSettled([service.saveSettings(Number(supplier.id),{lead_days:14,safety_days:7,version:0},'qa-editor'),service.saveSettings(Number(supplier.id),{lead_days:21,safety_days:7,version:0},'qa-editor')]);
    assert.equal(settings.filter(e=>e.status==='fulfilled').length,1);
    assert.equal(settings.find(e=>e.status==='rejected').reason.code,'VERSION_CONFLICT');
    await assert.rejects(service.create({...body,request_key:randomUUID()},'qa-operator'),e=>e.code==='ANALYSIS_CHANGED' && e.data.items[0].obat_id === r.obat_id);
    const bytes = await service.export(id);
    const book = new (require('exceljs').Workbook)(); await book.xlsx.load(bytes);
    assert.equal(book.worksheets[0].getCell('D7').value,21);
    await service.archive(id,{version:2},'qa-editor');
    assert.equal((await service.detail(id)).status,'archived');
    assert.equal((await service.list('draft')).length,0);
    assert.equal(await stockHash(),before,'Order lifecycle must not mutate inventory');
    console.log(JSON.stringify({success:true,medications:a.items.length,priorities:a.items.reduce((s,i)=>(s[i.priority]=(s[i.priority]||0)+1,s),{}),fast_moving:a.items.filter(i=>i.fast_moving).length,external_units90:a.items.reduce((s,i)=>s+i.external.units90,0),clinic_units90:a.items.reduce((s,i)=>s+i.clinic.units90,0),checks:['concurrent idempotency','payload mismatch','detail/audit','concurrent optimistic edit','concurrent settings','fresh evidence conflict','Excel roundtrip','archive','stock unchanged']},null,2));
})().catch(e => { console.error(e.stack); process.exitCode=1; }).finally(()=>pool.end());
