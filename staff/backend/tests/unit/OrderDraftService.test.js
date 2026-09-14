const fs = require('fs');
const path = require('path');
const modulePath = path.join(__dirname, '../../services/OrderDraftService.js');
const Service = fs.existsSync(modulePath) ? require(modulePath) : {};
test('rejects empty and duplicate selections and unsafe quantities', () => {
 expect(typeof Service.normalize).toBe('function');
 for (const items of [[],[{obat_id:1,supplier_id:1,quantity:0}], [{obat_id:1,supplier_id:1,quantity:1},{obat_id:1,supplier_id:2,quantity:1}]]) expect(() => Service.normalize({items})).toThrow();
});
test('normalizes selection while retaining deliberate human quantity and caps notes', () => {
 expect(typeof Service.normalize).toBe('function');
 expect(Service.normalize({notes:' hello ',items:[{obat_id:1,supplier_id:2,quantity:17,analysis_fingerprint:'abc',notes:' note '}]})).toEqual({notes:'hello',items:[{obat_id:1,supplier_id:2,quantity:17,analysis_fingerprint:'abc',notes:'note'}]});
 expect(() => Service.normalize({notes:'x'.repeat(2001),items:[{obat_id:1,supplier_id:2,quantity:1}]})).toThrow();
});
test('payload hash ignores object key order, but changes with quantity', () => {
 expect(typeof Service.hash).toBe('function');
 expect(Service.hash({a:1,b:2})).toBe(Service.hash({b:2,a:1}));
 expect(Service.hash({quantity:1})).not.toBe(Service.hash({quantity:2}));
});
test('fresh evidence conflict includes selected supplier analysis and makes no writes', async () => {
 expect(typeof Service).toBe('function');
 const connection={query:jest.fn()};
 const svc=new Service({recommendations:{generate:async()=>({items:[{obat_id:1}],suppliers:[{id:2}]}),forSupplier:()=>({obat_id:1,supplier_id:2,analysis_fingerprint:'new'})}});
 await expect(svc.analyze(connection,[{obat_id:1,supplier_id:2,quantity:17,analysis_fingerprint:'old'}])).rejects.toMatchObject({status:409,code:'ANALYSIS_CHANGED',data:{items:[{obat_id:1,supplier_id:2,analysis_fingerprint:'new'}]}});
 expect(connection.query).not.toHaveBeenCalled();
});
test('transaction rolls back on error and releases connection', async () => {
 expect(typeof Service).toBe('function');
 const c={beginTransaction:jest.fn(),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
 const svc=new Service({db:{getConnection:async()=>c}});
 await expect(svc.transaction(async()=>{throw new Error('failure');})).rejects.toThrow('failure');
 expect(c.rollback).toHaveBeenCalled();expect(c.commit).not.toHaveBeenCalled();expect(c.release).toHaveBeenCalled();
});
function connection(handler) {return {query:jest.fn(handler),beginTransaction:jest.fn(),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};}
const selection={obat_id:1,supplier_id:2,quantity:17,analysis_fingerprint:'current'};
const payload={request_key:'00000000-0000-0000-0000-000000000001',items:[selection]};
test('same request replay returns original drafts without analyzing or inserting a draft',async()=>{
 const result={drafts:[{id:'existing',supplier_id:2}],replayed:false};
 const c=connection(async sql=>sql.startsWith('SELECT payload_hash')?[[{payload_hash:Service.hash(Service.normalize(payload)),result_json:JSON.stringify(result)}]]:[{}]);
 const recommendations={generate:jest.fn()};const svc=new Service({db:{getConnection:async()=>c},recommendations});
 await expect(svc.create(payload,'staff')).resolves.toEqual({...result,replayed:true});
 expect(recommendations.generate).not.toHaveBeenCalled();expect(c.commit).toHaveBeenCalled();
 expect(c.query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO order_drafts '))).toBe(false);
});
test('different contents under same request key rejects and rolls back',async()=>{
 const c=connection(async sql=>sql.startsWith('SELECT payload_hash')?[[{payload_hash:'different',result_json:null}]]:[{}]);
 const svc=new Service({db:{getConnection:async()=>c}});
 await expect(svc.create(payload,'staff')).rejects.toMatchObject({status:409,code:'IDEMPOTENCY_CONFLICT'});
 expect(c.rollback).toHaveBeenCalled();expect(c.commit).not.toHaveBeenCalled();
});
test('create groups by supplier preserving edited quantity, evidence and audit without stock writes',async()=>{
 const body={...payload,items:[selection,{...selection,obat_id:3,supplier_id:4,quantity:9}]};
 const c=connection(async sql=>sql.startsWith('SELECT payload_hash')?[[{payload_hash:Service.hash(Service.normalize(body)),result_json:null}]]:[{}]);
 const recommendations={generate:async()=>({generated_at:'2026-09-14T09:00:00.000Z',parameters:{target_days:30,periods:[30,90]},items:[{obat_id:1},{obat_id:3}],suppliers:[{id:2},{id:4}]}),forSupplier:(item,id)=>({...item,supplier_id:id,supplier_name:'Supplier '+id,analysis_fingerprint:'current',recommended_quantity:5,estimated_unit_cost:null,cost_source:'unknown'})};
 const svc=new Service({db:{getConnection:async()=>c},recommendations});const result=await svc.create(body,'staff');
 expect(result.drafts.map(d=>d.supplier_id)).toEqual([2,4]);
 const persisted=c.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO order_draft_items')).map(([,params])=>JSON.parse(params[2]));
 expect(persisted.map(i=>i.quantity)).toEqual([17,9]);expect(persisted.every(i=>i.analysis.analysis_fingerprint==='current')).toBe(true);
 expect(persisted[0].analysis).toMatchObject({generated_at:'2026-09-14T09:00:00.000Z',parameters:{target_days:30,periods:[30,90]}});
 expect(c.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO order_draft_audit'))).toHaveLength(2);
 expect(c.query.mock.calls.some(([sql])=>/^(UPDATE|INSERT INTO|DELETE FROM) (obat|obat_batches|stock_movements)\b/.test(sql))).toBe(false);
});
test('stale and archived drafts cannot be edited',async()=>{
 for(const row of [{version:2,status:'draft'},{version:1,status:'archived'}]) {
  const c=connection(async()=>[[row]]);const svc=new Service({});
  await expect(svc.lock(c,'id',1)).rejects.toMatchObject({status:409,code:'VERSION_CONFLICT'});
 }
});
test('Excel exports saved values as literal strings and preserves unknown cost',async()=>{
 const svc=new Service({});svc.detail=async()=>({id:'saved',supplier_name:'=1+1',status:'draft',notes:'note',items:[{code:'=CMD()',name:'Medicine',unit:'tablet',quantity:17,recommended_quantity:5,estimated_unit_cost:null,cost_source:'unknown',notes:'<note>'}]});
 const buffer=await svc.export('saved');const ExcelJS=require('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);
 const sheet=workbook.getWorksheet('Draft Order');expect(sheet.getCell('B2').value).toBe('=1+1');expect(sheet.getCell('A7').value).toBe('=CMD()');expect(sheet.getCell('D7').value).toBe(17);expect(sheet.getCell('F7').value).toBe('Belum diketahui');expect(sheet.getCell('G7').value).toBe('Belum diketahui');expect(sheet.getCell('H7').value).toBe('Belum diketahui');
});
test('external detail reads share one explicit read-only repeatable snapshot and release it',async()=>{
 const c=connection(async sql=>{
  if(sql.startsWith('SELECT * FROM order_drafts'))return [[{id:'saved',version:1}]];
  if(sql.startsWith('SELECT item_json'))return [[{item_json:JSON.stringify({quantity:17})}]];
  if(sql.startsWith('SELECT action'))return [[{action:'created'}]];
  return [{}];
 });
 const db={getConnection:jest.fn(async()=>c),query:jest.fn(()=>{throw new Error('Reads must use connection');})};
 const svc=new Service({db});const result=await svc.detail('saved');
 expect(result).toMatchObject({version:1,items:[{quantity:17}],audit:[{action:'created'}]});
 expect(c.query.mock.calls.slice(0,2).map(([sql])=>sql)).toEqual(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY']);
 expect(c.commit).toHaveBeenCalled();expect(c.release).toHaveBeenCalled();expect(db.query).not.toHaveBeenCalled();
});
