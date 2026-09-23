const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../../db', () => ({ query: jest.fn() }));
const db = require('../../db');
const { ROLE_NAMES } = require('../../constants/roles');
const app = express();
app.use('/api/patient/estimasi-biaya', require('../../routes/patient-estimasi-biaya'));
const token = payload => 'Bearer ' + jwt.sign(payload, process.env.JWT_SECRET, {expiresIn:'5m'});
const patient = token({id:'patient-not-in-old-allowlist',user_type:'patient'});
const snapshot = () => ({version:2,aliases:{7:'Suplemen contoh'},trimesters:Object.fromEntries(['t1','t2','t3'].map(k=>[k,{template_id:8,template_name:'SECRET TEMPLATE',repeats:1,medications:[{obat_id:7,name:'SECRET MEDICINE',quantity:30,unit:'pcs',caraPakai:'SECRET SIG'}],services:[{tindakan_id:9,quantity:1,repeats:1}]}]))});
let saved, price;
beforeEach(()=>{saved=snapshot();price=1500;db.query.mockReset();db.query.mockImplementation(async(sql,params)=>{
 if(sql.includes('FROM settings'))return [[{setting_value:JSON.stringify(saved)}]];
 if(sql.includes('FROM obat'))return [[{id:7,name:'SECRET MEDICINE',price,unit:'pcs',is_active:1}]];
 if(sql.includes('FROM tindakan'))return [[{id:9,name:'USG',price:100000,category:'LAYANAN',is_active:1},{id:1,name:'Biaya Admin',price:15000,is_active:1},{id:3,name:'Buku Kontrol Obstetri',price:25000,is_active:1},{id:59,name:'Buku Kontrol Ginekologi',price:25000,is_active:1}]];
 if(sql.includes('FROM sunday_clinic_prescription_templates'))return [[{id:8,is_active:1}]];
 throw Error('Unexpected query');
});});
test('ordinary patients receive the shared sanitized medication and service contract from published settings',async()=>{
 const r=await request(app).get('/api/patient/estimasi-biaya').set('Authorization',patient);
 expect(r.status).toBe(200);expect(r.body.preview.configuration_ready).toBe(true);
 expect(r.body.preview.trimesters.t1.items.map(i=>i.label)).toEqual(['Suplemen contoh','USG']);
 expect(r.body.preview.mandatory_costs.admin.price).toBe(15000);
 expect(JSON.stringify(r.body)).not.toMatch(/SECRET|obat_id|template_name|caraPakai|latinSig/);
 expect(db.query.mock.calls[0][1]).toEqual(['pregnancy_cost_estimate_published_v2']);
 expect(db.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 expect(r.headers['cache-control']).toContain('no-store');
 price=2000;const updated=await request(app).get('/api/patient/estimasi-biaya').set('Authorization',patient);
 expect(updated.body.preview.trimesters.t1.items[0].price).toBe(2000);
});
test('anonymous and staff tokens are rejected',async()=>{
 expect((await request(app).get('/api/patient/estimasi-biaya')).status).toBe(401);
 expect((await request(app).get('/api/patient/estimasi-biaya').set('Authorization',token({id:'staff',role:ROLE_NAMES.DOKTER}))).status).toBe(403);
 expect(db.query).not.toHaveBeenCalled();
});
test('unpublished or malformed settings do not fall back to staff draft or expose errors',async()=>{
 for(const rows of [[],[{setting_value:'bad JSON SECRET'}]]){
 db.query.mockResolvedValueOnce([rows]);const r=await request(app).get('/api/patient/estimasi-biaya').set('Authorization',patient);
 expect(r.status).toBe(503);expect(JSON.stringify(r.body)).not.toContain('SECRET');
 }
});
test('database failure has a generic error and missing label never falls back to original medicine',async()=>{
 db.query.mockRejectedValueOnce(Error('SECRET SQL'));
 const failed=await request(app).get('/api/patient/estimasi-biaya').set('Authorization',patient);
 expect(failed.status).toBe(503);expect(JSON.stringify(failed.body)).not.toContain('SECRET');
 saved.aliases={};const r=await request(app).get('/api/patient/estimasi-biaya').set('Authorization',patient);
 expect(r.body.preview.total).toBeNull();expect(JSON.stringify(r.body)).not.toContain('SECRET');
});
