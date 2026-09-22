const fs = require('fs');
const vm = require('vm');
const express = require('express');
const request = require('supertest');
const { ROLE_IDS } = require('../../constants/roles');
const source = fs.readFileSync(require.resolve('../../services/sunday-clinic/shared'), 'utf8');
const normalize = vm.runInNewContext('(' + source.slice(source.indexOf('function normalizePrescriptionTemplateItems'), source.indexOf('function getPrescriptionTemplateActor')) + ')');
jest.mock('../../services/sunday-clinic/shared', () => ({ db: { query: jest.fn() }, parsePrescriptionTemplateItems: x => x, normalizePrescriptionTemplateItems: x => x, getPrescriptionTemplateActor: () => 'Doctor' }));
jest.mock('../../middleware/auth', () => {
 const actual = jest.requireActual('../../middleware/auth');
 const authenticate = (req, res, next) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = JSON.parse(req.headers.authorization); next();
 };
 return { ...actual, verifyToken: authenticate, verifyStaffToken: (req,res,next) => authenticate(req,res,() => req.user.user_type === 'patient' ? res.sendStatus(403) : next()) };
});
const db = require('../../services/sunday-clinic/shared').db;
const app = express(); app.use(express.json()); app.use(require('../../routes/sunday-clinic/prescription'));
const item = { obatId: 7, name: 'Obat', quantity: 30, unit: 'tablet', caraPakai: '', latinSig: '' };
test.each([0,-1,'',null,'bad',Infinity])('rejects invalid quantity %s rather than silently replacing', quantity => { expect(normalize([{...item, quantity}])).toBeNull(); });
test('rejects empty unit and partially invalid lists', () => { expect(normalize([{...item, unit:''}])).toBeNull(); expect(normalize([item,{...item,name:''}])).toBeNull(); });
test('preserves quantity above 12 and intentional empty instructions', () => { expect(JSON.stringify(normalize([item]))).toBe(JSON.stringify([item])); });
test.each(['post','put','delete'])('only doctor may %s templates', async method => {
 db.query.mockResolvedValue([{affectedRows:1,insertId:99}]);
 const path = '/prescription-templates' + (method === 'post' ? '' : '/7');
 for (const actor of [{role_id:ROLE_IDS.ADMIN},{role_id:ROLE_IDS.ADMIN,role:'dokter',is_superadmin:true},{role_id:ROLE_IDS.BIDAN},{role_id:ROLE_IDS.DOKTER,user_type:'patient'}]) {
  const result = await request(app)[method](path).set('Authorization',JSON.stringify(actor)).send({name:'T',items:[item]});
  expect(result.status).toBe(403);
 }
 expect((await request(app)[method](path).send({})).status).toBe(401);
 expect((await request(app)[method](path).set('Authorization',JSON.stringify({role_id:ROLE_IDS.DOKTER})).send({name:'T',items:[item]})).status).toBe(method === 'post' ? 201 : 200);
});
test('staff can still read templates', async () => { db.query.mockResolvedValue([[{id:7,name:'T',items:[item]}]]); expect((await request(app).get('/prescription-templates').set('Authorization',JSON.stringify({role_id:ROLE_IDS.BIDAN}))).status).toBe(200); });
