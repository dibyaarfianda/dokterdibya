const request=require('supertest');
const express=require('express');
jest.mock('../../middleware/auth',()=>({verifyStaffToken:(req,res,next)=>req.headers.authorization?(req.user={id:'staff-1'},next()):res.status(401).end(), requirePermission:permission=>(req,res,next)=>req.headers['x-permission']===permission?next():res.status(403).end()}));
jest.mock('../../services/OrderDraftService',()=>jest.fn().mockImplementation(()=>({list:async()=>[{id:'draft'}]})));
test('draft routes require staff authentication and view permission',async()=>{
 const fs=require('fs');const file=require('path').join(__dirname,'../../routes/inventory-orders.js');
 expect(fs.existsSync(file)).toBe(true);
 const app=express();app.use('/api/inventory',require(file));
 expect((await request(app).get('/api/inventory/order-drafts')).status).toBe(401);
 expect((await request(app).get('/api/inventory/order-drafts').set('Authorization','staff')).status).toBe(403);
 const result=await request(app).get('/api/inventory/order-drafts').set('Authorization','staff').set('x-permission','obat_alkes.view');
 expect(result.status).toBe(200);expect(result.body).toEqual({success:true,data:[{id:'draft'}]});
});
jest.mock('../../services/OrderRecommendationService',()=>({generate:jest.fn()}));
jest.mock('../../utils/logger',()=>({error:jest.fn()}));
test('unrelated inventory paths fall through without adding order auth or cache behavior',async()=>{
 const app=express();app.use('/api/inventory',require('../../routes/inventory-orders'));app.post('/api/inventory/purchase',(req,res)=>res.json({legacy:true}));
 const result=await request(app).post('/api/inventory/purchase');expect(result.status).toBe(200);expect(result.body).toEqual({legacy:true});expect(result.headers['cache-control']).toBeUndefined();
});
test('statusCode validation errors are returned and unexpected errors are logged without source details',async()=>{
 const engine=require('../../services/OrderRecommendationService');const logger=require('../../utils/logger');
 const app=express();app.use('/api/inventory',require('../../routes/inventory-orders'));
 const get=()=>request(app).get('/api/inventory/order-recommendations?supplier_id=999').set('Authorization','staff').set('x-permission','obat_alkes.view');
 engine.generate.mockRejectedValueOnce(Object.assign(new Error('Supplier tidak aktif'),{statusCode:400}));
 const invalid=await get();expect(invalid.status).toBe(400);expect(invalid.body.message).toBe('Supplier tidak aktif');
 engine.generate.mockRejectedValueOnce(new Error('private clinical source details'));
 const failed=await get();expect(failed.status).toBe(500);expect(JSON.stringify(failed.body)).not.toContain('private');expect(logger.error).toHaveBeenCalled();expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
});
