const express = require('express');
const { verifyStaffToken, requirePermission } = require('../middleware/auth');
const OrderDraftService = require('../services/OrderDraftService');
const logger = require('../utils/logger');
const router = express.Router();
const service = new OrderDraftService();
const orderPaths = ['/order-recommendations', '/order-settings', '/order-drafts'];
router.use(orderPaths, verifyStaffToken, (req,res,next)=>{res.set('Cache-Control','no-store');next();});
const permit = action => requirePermission(`obat_alkes.${action}`);
const handle = fn => async (req,res) => {
    try { const data=await fn(req,res); if(!res.headersSent) res.json({success:true,data}); }
    catch(error) {
        const suppliedStatus = error.status || error.statusCode;
        const status = Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus < 600 ? suppliedStatus : 500;
        const expected = status < 500;
        // Do not log request bodies, query values, SQL, or source error messages.
        if (!expected) logger.error('Inventory order request failed', { operation: req.route?.path || 'unknown', method: req.method, status });
        res.status(status).json({success:false,message:expected?error.message:'Gagal memproses draft order',...(error.code&&expected?{code:error.code}:{}),...(error.data&&expected?{data:error.data}:{})});
    }
};
const actor = req => String(req.user.id);
router.get('/order-recommendations',permit('view'),handle(req=>{
    const supplierId=req.query.supplier_id==null?null:Number(req.query.supplier_id);
    if(supplierId!==null&&(!Number.isSafeInteger(supplierId)||supplierId<1)) throw Object.assign(new Error('Supplier tidak valid'),{status:400});
    return require('../services/OrderRecommendationService').generate({supplierId});
}));
router.get('/order-settings',permit('view'),handle(()=>service.settings()));
router.put('/order-settings/:supplierId',permit('edit'),handle(req=>service.saveSettings(Number(req.params.supplierId),req.body,actor(req))));
router.get('/order-drafts',permit('view'),handle(req=>service.list(req.query.status)));
router.post('/order-drafts',permit('create'),handle(req=>service.create(req.body,actor(req))));
router.get('/order-drafts/:id/export',permit('view'),handle(async(req,res)=>{
    const buffer=await service.export(req.params.id);
    res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition','attachment; filename="draft-order.xlsx"');res.send(Buffer.from(buffer));
}));
router.get('/order-drafts/:id',permit('view'),handle(req=>service.detail(req.params.id)));
router.put('/order-drafts/:id',permit('edit'),handle(req=>service.update(req.params.id,req.body,actor(req))));
router.post('/order-drafts/:id/archive',permit('edit'),handle(req=>service.archive(req.params.id,req.body,actor(req))));
module.exports=router;
