const express = require('express');

const finiteNumber = value => Number.isFinite(value) && value >= 0 ? value : null;
const percentile = value => ({
    count: finiteNumber(value?.count),
    p75: finiteNumber(value?.p75),
    p95: finiteNumber(value?.p95)
});

function createCiPerformanceRouter({ verifier, getMetrics, getRumSummary }) {
    const router = express.Router();

    router.get('/performance-summary', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.get('Authorization') || '');
        if (!match) return res.status(401).json({ success: false, code: 'CI_AUTH_INVALID' });
        try {
            await verifier.verify(match[1]);
        } catch (_) {
            return res.status(401).json({ success: false, code: 'CI_AUTH_INVALID' });
        }

        try {
            const metrics = getMetrics();
            const rum = getRumSummary();
            const endpoints = metrics?.performance?.endpoints || {};
            const endpoint = key => ({
                count: finiteNumber(endpoints[key]?.count),
                p95Ms: finiteNumber(endpoints[key]?.p95Ms)
            });
            return res.json({
                success: true,
                data: {
                    requests: {
                        total: finiteNumber(metrics?.requests?.total),
                        serverErrors: finiteNumber(metrics?.errors?.byType?.server) ?? 0
                    },
                    latency: {
                        p95Ms: finiteNumber(metrics?.performance?.p95Ms),
                        p99Ms: finiteNumber(metrics?.performance?.p99Ms)
                    },
                    api: {
                        patients: endpoint('GET /api/patients'),
                        dashboardStats: endpoint('GET /api/dashboard-stats'),
                        notificationsCount: endpoint('GET /api/notifications/count')
                    },
                    rum: {
                        cachedActivation: percentile(rum?.webVitals?.cachedActivation?.byPage?.dashboard),
                        LCP: percentile(rum?.webVitals?.LCP?.overall)
                    }
                }
            });
        } catch (_) {
            return res.status(503).json({ success: false, code: 'CI_METRICS_UNAVAILABLE' });
        }
    });

    return router;
}

module.exports = { createCiPerformanceRouter };
