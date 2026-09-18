const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { MAX_FILE } = require('../services/ClinicHospitalMonitor');

// The factory is injectable so authorization/body limits are tested without a DB.
function createRouter(getService = require('../services/clinicMonitorRuntime').getService) {
    const router = express.Router();
    router.use(apiKeyAuth);
    router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
    const handle = fn => async (req, res) => {
        try { res.json({ success: true, data: await fn(getService(), req) }); }
        catch (error) {
            const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
            res.status(status).json({ success: false, code: status < 500 ? error.code : 'MONITOR_UNAVAILABLE', message: status < 500 ? error.code : 'Clinic monitor temporarily unavailable' });
        }
    };
    router.post('/hospital-observations', handle((s,r) => s.ingest(r.body)));
    router.get('/clinic-monitor', handle(s => s.dashboard()));
    router.get('/clinic-monitor/events/:id', handle((s,r) => s.eventDetails(r.params.id)));
    router.get('/clinic-monitor/patients/:id/archives', handle((s,r) => s.patientArchives(r.params.id)));
    router.post('/clinic-monitor/matches/:id', handle((s,r) => s.confirmMatch(r.params.id, r.body?.patient_id)));
    router.post('/clinic-monitor/telegram/pair', handle(s => s.pair()));
    router.post('/clinic-monitor/telegram/disconnect', handle(s => s.disconnect()));
    router.get('/clinic-monitor/archive-jobs', handle(s => s.archiveJobs()));
    router.post('/clinic-monitor/archive-jobs/:episodeId/files', express.raw({ type: 'application/octet-stream', limit: MAX_FILE }), handle((s,r) => s.uploadFile(r.params.episodeId, {
        source_id: r.query.source_id, category: r.query.category, filename: r.query.filename, mime_type: r.query.mime_type, sha256: r.get('X-Content-SHA256'), job_token: r.get('X-Clinic-Monitor-Job-Token')
    }, r.body)));
    router.post('/clinic-monitor/archive-jobs/:episodeId/result', handle((s,r) => s.archiveResult(r.params.episodeId, r.body)));
    router.post('/clinic-monitor/archive-jobs/:episodeId/retry', handle((s,r) => s.retryArchive(r.params.episodeId)));
    router.get('/clinic-monitor/archive-files/:id/download', handle((s,r) => s.download(r.params.id)));
    router.use((error, req, res, next) => {
        if (error.type === 'entity.too.large') return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE' });
        res.status(400).json({ success: false, code: 'INVALID_REQUEST' });
    });
    return router;
}
function createWebhookRouter(getService = require('../services/clinicMonitorRuntime').getService) {
    const router = express.Router();
    router.post('/', async (req,res) => {
        try { await getService().webhook(req.body, req.get('X-Telegram-Bot-Api-Secret-Token')); res.json({ success: true }); }
        catch (error) { res.status(error.status === 403 ? 403 : error.status === 400 ? 400 : 503).json({ success: false }); }
    });
    return router;
}
module.exports = { createRouter, createWebhookRouter };
