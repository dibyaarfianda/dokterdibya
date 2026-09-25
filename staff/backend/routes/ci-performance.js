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
                count: finiteNumber(endpoints[key]?.sampleCount),
                p95Ms: finiteNumber(endpoints[key]?.p95Ms),
                windowSeconds: finiteNumber(endpoints[key]?.windowSeconds),
                windowStartedAtMs: finiteNumber(endpoints[key]?.windowStartedAtMs),
                windowEndedAtMs: finiteNumber(endpoints[key]?.windowEndedAtMs)
            });
            const requestWindow = metrics?.requests?.recent;
            const latencyWindow = metrics?.performance?.observation;
            const socketAuth = metrics?.socketAuth;
            return res.json({
                success: true,
                data: {
                    requests: {
                        total: finiteNumber(requestWindow?.total),
                        serverErrors: finiteNumber(requestWindow?.serverErrors),
                        windowSeconds: finiteNumber(requestWindow?.windowSeconds),
                        windowStartedAtMs: finiteNumber(requestWindow?.windowStartedAtMs),
                        windowEndedAtMs: finiteNumber(requestWindow?.windowEndedAtMs)
                    },
                    latency: {
                        p95Ms: finiteNumber(metrics?.performance?.p95Ms),
                        p99Ms: finiteNumber(metrics?.performance?.p99Ms),
                        sampleCount: finiteNumber(latencyWindow?.sampleCount),
                        windowSeconds: finiteNumber(latencyWindow?.windowSeconds),
                        windowStartedAtMs: finiteNumber(latencyWindow?.windowStartedAtMs),
                        windowEndedAtMs: finiteNumber(latencyWindow?.windowEndedAtMs)
                    },
                    api: {
                        patients: endpoint('GET /api/patients'),
                        dashboardStats: endpoint('GET /api/dashboard-stats'),
                        notificationsCount: endpoint('GET /api/notifications/count')
                    },
                    socketAuth: {
                        windowSeconds: finiteNumber(socketAuth?.windowSeconds),
                        windowStartedAtMs: finiteNumber(socketAuth?.windowStartedAtMs),
                        windowEndedAtMs: finiteNumber(socketAuth?.windowEndedAtMs),
                        attempts: finiteNumber(socketAuth?.attempts),
                        accepted: finiteNumber(socketAuth?.accepted),
                        rejected: finiteNumber(socketAuth?.rejected),
                        anonymousQuarantined: finiteNumber(socketAuth?.anonymousQuarantined),
                        expiredAfterConnect: finiteNumber(socketAuth?.expiredAfterConnect),
                        rejectedByCode: {
                            AUTH_MISSING: finiteNumber(socketAuth?.rejectedByCode?.AUTH_MISSING),
                            AUTH_INVALID: finiteNumber(socketAuth?.rejectedByCode?.AUTH_INVALID),
                            AUTH_EXPIRED: finiteNumber(socketAuth?.rejectedByCode?.AUTH_EXPIRED),
                            FORBIDDEN: finiteNumber(socketAuth?.rejectedByCode?.FORBIDDEN)
                        }
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
