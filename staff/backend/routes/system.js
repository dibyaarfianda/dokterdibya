const express = require('express');

function createSystemRoutes({
    pool,
    getMetrics,
    resetMetrics,
    getRumSummary,
    getCacheStats,
    getCostSummary,
    getDbStats,
    getCoalesceStats,
    getPdfQueueStats,
    getEnrichmentStats,
    getSocketStats,
    verifyToken,
    requireSuperadmin
}) {
    const router = express.Router();

    router.get('/api/metrics', (req, res) => {
        const metrics = getMetrics();
        const socketStats = getSocketStats();
        metrics.rum = getRumSummary();
        metrics.cache = getCacheStats();
        metrics.db = getDbStats();
        metrics.cost = {
            ...getCostSummary(),
            socketEventsEmitted: socketStats.socketEventsEmitted,
            activeSocketConnections: socketStats.activeSocketConnections
        };
        metrics.coalescing = getCoalesceStats();
        metrics.pdfQueue = getPdfQueueStats();
        metrics.enrichment = getEnrichmentStats();
        metrics.cluster = {
            pid: process.pid,
            workerId: process.env.NODE_APP_INSTANCE || 0,
            uptime: Math.floor(process.uptime())
        };
        res.json(metrics);
    });

    router.post('/api/metrics/reset', verifyToken, requireSuperadmin, (req, res) => {
        resetMetrics();
        res.json({ success: true, message: 'Metrics reset successfully' });
    });

    router.get('/api/health', async (req, res) => {
        try {
            const startTime = Date.now();
            await pool.query('SELECT 1');
            const dbLatency = Date.now() - startTime;
            const metrics = getMetrics();

            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                database: {
                    status: 'connected',
                    latencyMs: dbLatency
                },
                system: metrics.system,
                uptime: Math.floor(process.uptime())
            });
        } catch (error) {
            res.status(500).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    return router;
}

module.exports = createSystemRoutes;
