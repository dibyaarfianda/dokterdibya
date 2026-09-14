const { createHash, randomUUID } = require('crypto');
const fail = (status, message, code, data) => Object.assign(new Error(message), { status, code, data });
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const text = (value, max = 2000) => {
    if (value != null && typeof value !== 'string') throw fail(400, 'Catatan harus berupa teks');
    const result = (value || '').trim();
    if (result.length > max) throw fail(400, `Teks maksimal ${max} karakter`);
    return result;
};
const integer = (value, min = 1, max = 1000000) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw fail(400, 'Nilai bilangan tidak valid');
    return value;
};
class OrderDraftService {
    constructor({ db, recommendations } = {}) { this._db = db; this._recommendations = recommendations; }
    get db() { return this._db || require('../db'); }
    get recommendations() { return this._recommendations || require('./OrderRecommendationService'); }
    static hash(value) {
        const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
        return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
    }
    static normalize(body) {
        if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 500) throw fail(400, 'Pilih 1 sampai 500 obat');
        const seen = new Set();
        return { notes: text(body.notes), items: body.items.map(i => {
            if (!i || typeof i !== 'object') throw fail(400, 'Item tidak valid');
            const obat_id = integer(i.obat_id), supplier_id = integer(i.supplier_id);
            if (seen.has(obat_id)) throw fail(400, 'Obat duplikat');
            seen.add(obat_id);
            const analysis_fingerprint = text(i.analysis_fingerprint, 128);
            if (!analysis_fingerprint) throw fail(400, 'Analisis diperlukan');
            return { obat_id, supplier_id, quantity: integer(i.quantity), notes: text(i.notes), analysis_fingerprint };
        }) };
    }
    async transaction(fn) {
        const c = await this.db.getConnection();
        try { await c.beginTransaction(); const result = await fn(c); await c.commit(); return result; }
        catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }
    async analyze(c, items) {
        const data = await this.recommendations.generate({ connection: c });
        const fresh = items.map(selection => {
            const item = data.items.find(i => Number(i.obat_id) === selection.obat_id);
            if (!item || !data.suppliers.some(s => Number(s.id) === selection.supplier_id)) throw fail(400, 'Obat atau supplier tidak aktif');
            return this.recommendations.forSupplier(item, selection.supplier_id, data.suppliers);
        });
        if (fresh.some((item, index) => item.analysis_fingerprint !== items[index].analysis_fingerprint)) throw fail(409, 'Analisis berubah. Tinjau rekomendasi terbaru lalu simpan kembali.', 'ANALYSIS_CHANGED', { items: fresh });
        return items.map((selection, index) => {
            const a = fresh[index];
            return { obat_id: selection.obat_id, code: a.code, name: a.name, unit: a.unit, quantity: selection.quantity,
                recommended_quantity: a.recommended_quantity, estimated_unit_cost: a.estimated_unit_cost,
                cost_source: a.cost_source, notes: selection.notes, analysis: { ...a, generated_at: data.generated_at, parameters: data.parameters } };
        });
    }
    async audit(c, id, action, actor, snapshot) {
        await c.query('INSERT INTO order_draft_audit (draft_id,action,actor,snapshot_json) VALUES (?,?,?,?)', [id, action, actor, JSON.stringify(snapshot)]);
    }
    async writeItems(c, id, items) {
        await c.query('DELETE FROM order_draft_items WHERE draft_id=?', [id]);
        for (const item of items) await c.query('INSERT INTO order_draft_items (draft_id,obat_id,item_json) VALUES (?,?,?)', [id, item.obat_id, JSON.stringify(item)]);
    }
    async create(body, actor) {
        const normalized = OrderDraftService.normalize(body);
        const key = text(body.request_key, 36);
        if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) throw fail(400, 'request_key harus UUID');
        const hash = OrderDraftService.hash(normalized);
        return this.transaction(async c => {
            // Unique-key insertion serializes simultaneous retries before the locking read.
            await c.query('INSERT INTO order_draft_requests (actor,request_key,payload_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE request_key=request_key', [actor, key, hash]);
            const [[request]] = await c.query('SELECT payload_hash,result_json FROM order_draft_requests WHERE actor=? AND request_key=? FOR UPDATE', [actor,key]);
            if (request.payload_hash !== hash) throw fail(409, 'request_key telah digunakan dengan isi berbeda', 'IDEMPOTENCY_CONFLICT');
            if (request.result_json) return { ...json(request.result_json), replayed: true };
            const items = await this.analyze(c, normalized.items);
            const groups = new Map();
            for (const item of items) { const sid = Number(item.analysis.supplier_id); if (!groups.has(sid)) groups.set(sid, []); groups.get(sid).push(item); }
            const drafts = [];
            for (const [supplierId, group] of groups) {
                const id = randomUUID();
                await c.query('INSERT INTO order_drafts (id,supplier_id,supplier_name,notes,created_by) VALUES (?,?,?,?,?)', [id,supplierId,group[0].analysis.supplier_name,normalized.notes,actor]);
                await this.writeItems(c,id,group);
                await this.audit(c,id,'created',actor,{supplier_id:supplierId,notes:normalized.notes,items:group,version:1});
                drafts.push({id,supplier_id:supplierId});
            }
            const result = {drafts,replayed:false};
            await c.query('UPDATE order_draft_requests SET result_json=? WHERE actor=? AND request_key=?', [JSON.stringify(result),actor,key]);
            return result;
        });
    }
    async list(status = 'draft') {
        if (!['draft','archived'].includes(status)) throw fail(400, 'Status tidak valid');
        const [rows] = await this.db.query('SELECT d.*, (SELECT COUNT(*) FROM order_draft_items i WHERE i.draft_id=d.id) AS item_count FROM order_drafts d WHERE status=? ORDER BY updated_at DESC,id', [status]);
        return rows;
    }
    async detail(id, c = null) {
        if (!c) {
            const connection = await this.db.getConnection();
            try {
                await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
                await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
                const result = await this.detail(id, connection);
                await connection.commit();
                return result;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        }
        const [[header]] = await c.query('SELECT * FROM order_drafts WHERE id=?', [id]);
        if (!header) throw fail(404, 'Draft tidak ditemukan');
        const [items] = await c.query('SELECT item_json FROM order_draft_items WHERE draft_id=? ORDER BY obat_id', [id]);
        const [audit] = await c.query('SELECT action,actor,created_at FROM order_draft_audit WHERE draft_id=? ORDER BY id', [id]);
        return {...header, items:items.map(i=>json(i.item_json)),audit};
    }
    async lock(c,id,version) {
        integer(version,1);
        const [[row]] = await c.query('SELECT * FROM order_drafts WHERE id=? FOR UPDATE',[id]);
        if (!row) throw fail(404,'Draft tidak ditemukan');
        if (Number(row.version)!==version || row.status!=='draft') throw fail(409,'Draft telah berubah atau diarsipkan','VERSION_CONFLICT');
        return row;
    }
    async update(id,body,actor) {
        const normalized=OrderDraftService.normalize(body);
        return this.transaction(async c=>{
            const header=await this.lock(c,id,body.version);
            if(normalized.items.some(i=>i.supplier_id!==Number(header.supplier_id))) throw fail(400,'Supplier harus sama dengan draft');
            const items=await this.analyze(c,normalized.items);
            await c.query('UPDATE order_drafts SET notes=?,version=version+1 WHERE id=?',[normalized.notes,id]);
            await this.writeItems(c,id,items);
            await this.audit(c,id,'updated',actor,{notes:normalized.notes,items,version:body.version+1});
            return this.detail(id,c);
        });
    }
    async archive(id,body,actor) {
        return this.transaction(async c=>{
            await this.lock(c,id,body.version);
            const snapshot=await this.detail(id,c);
            await c.query("UPDATE order_drafts SET status='archived',version=version+1 WHERE id=?",[id]);
            await this.audit(c,id,'archived',actor,snapshot);
            return {id,status:'archived',version:body.version+1};
        });
    }
    async settings(c=this.db) {
        const [rows]=await c.query('SELECT s.id,s.name,COALESCE(o.lead_days,7) AS lead_days,COALESCE(o.safety_days,7) AS safety_days,COALESCE(o.version,0) AS version FROM suppliers s LEFT JOIN order_supplier_settings o ON o.supplier_id=s.id WHERE s.is_active=1 ORDER BY s.name');
        return rows;
    }
    async saveSettings(id,body,actor) {
        integer(id);integer(body.lead_days,0,365);integer(body.safety_days,0,365);integer(body.version,0);
        return this.transaction(async c=>{
            const [[supplier]]=await c.query('SELECT id,name FROM suppliers WHERE id=? AND is_active=1 FOR UPDATE',[id]);
            if(!supplier) throw fail(400,'Supplier tidak aktif');
            await c.query('INSERT INTO order_supplier_settings (supplier_id) VALUES (?) ON DUPLICATE KEY UPDATE supplier_id=supplier_id',[id]);
            const [[previous]]=await c.query('SELECT * FROM order_supplier_settings WHERE supplier_id=? FOR UPDATE',[id]);
            if(Number(previous.version)!==body.version) throw fail(409,'Pengaturan telah berubah','VERSION_CONFLICT');
            await c.query('UPDATE order_supplier_settings SET lead_days=?,safety_days=?,version=version+1 WHERE supplier_id=?',[body.lead_days,body.safety_days,id]);
            const result={id,name:supplier.name,lead_days:body.lead_days,safety_days:body.safety_days,version:body.version+1};
            await this.audit(c,null,'settings_updated',actor,{before:previous,after:result});
            return result;
        });
    }
    async export(id) {
        const draft=await this.detail(id);
        const ExcelJS=require('exceljs');
        const workbook=new ExcelJS.Workbook();
        const sheet=workbook.addWorksheet('Draft Order');
        sheet.addRow(['DRAFT ORDER - belum pembelian']);
        sheet.addRow(['Supplier',draft.supplier_name]);sheet.addRow(['ID',draft.id]);sheet.addRow(['Status',draft.status]);sheet.addRow(['Catatan',draft.notes]);
        sheet.addRow(['Kode','Obat','Satuan','Jumlah','Rekomendasi','Estimasi harga','Estimasi total','Sumber harga','Catatan']);
        const costLabels = { supplier_purchase: 'Pembelian dari supplier', default_estimate: 'Estimasi harga dasar', unknown: 'Belum diketahui' };
        for(const item of draft.items) sheet.addRow([String(item.code||''),String(item.name||''),String(item.unit||''),item.quantity,item.recommended_quantity,item.estimated_unit_cost==null?'Belum diketahui':item.estimated_unit_cost,item.estimated_unit_cost==null?'Belum diketahui':item.estimated_unit_cost*item.quantity,costLabels[item.cost_source]||'Belum diketahui',item.notes]);
        sheet.columns.forEach(c=>{c.width=22;});sheet.getRow(6).font={bold:true};
        return workbook.xlsx.writeBuffer();
    }
}
module.exports=OrderDraftService;
