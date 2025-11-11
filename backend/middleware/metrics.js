/**
 * Performance Metrics Middleware
 * Tracks API performance, resource usage, and detailed analytics
 */

const os = require('os');
const logger = require('../utils/logger');

// Metrics storage (in production, use Redis or a proper metrics store)
const metrics = {
    requests: {
        total: 0,
        byEndpoint: {},
        byMethod: {},
        byStatus: {},
        byStatusCode: {}
    },
    responseTimes: {
        total: 0,
        count: 0,
        byEndpoint: {},
        all: [] // Track all response times for percentile calculation
    },
    errors: {
        total: 0,
        byType: {},
        byStatus: {}
    },
    system: {
        startTime: Date.now(),
        uptime: 0
    },
    users: {
        active: new Set(),
        total: 0
    },
    endpoints: {
        slowest: [],
        fastest: [],
        errorProne: []
    }
};

/**
 * Calculate percentile from sorted array
 */
const calculatePercentile = (arr, percentile) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
};

/**
 * Track request metrics
 */
const metricsMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    
    // Track active users
    if (req.user?.id) {
        metrics.users.active.add(req.user.id);
        metrics.users.total++;
    }
    
    // Track request count
    metrics.requests.total++;
    metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
        // Calculate response time
        const responseTime = Date.now() - startTime;
        
        // Track response time
        metrics.responseTimes.total += responseTime;
        metrics.responseTimes.count++;
        metrics.responseTimes.all.push(responseTime);
        
        // Keep only last 1000 response times for percentile calculation
        if (metrics.responseTimes.all.length > 1000) {
            metrics.responseTimes.all.shift();
        }
        
        // Initialize endpoint metrics if needed
        if (!metrics.responseTimes.byEndpoint[endpoint]) {
            metrics.responseTimes.byEndpoint[endpoint] = {
                total: 0,
                count: 0,
                min: Infinity,
                max: 0,
                times: []
            };
        }
        
        const endpointMetrics = metrics.responseTimes.byEndpoint[endpoint];
        endpointMetrics.total += responseTime;
        endpointMetrics.count++;
        endpointMetrics.min = Math.min(endpointMetrics.min, responseTime);
        endpointMetrics.max = Math.max(endpointMetrics.max, responseTime);
        endpointMetrics.times.push(responseTime);
        
        // Keep only last 100 times per endpoint
        if (endpointMetrics.times.length > 100) {
            endpointMetrics.times.shift();
        }
        
        // Track by endpoint
        if (!metrics.requests.byEndpoint[endpoint]) {
            metrics.requests.byEndpoint[endpoint] = 0;
        }
        metrics.requests.byEndpoint[endpoint]++;
        
        // Track by status code
        const statusCode = res.statusCode;
        metrics.requests.byStatusCode[statusCode] = (metrics.requests.byStatusCode[statusCode] || 0) + 1;
        
        // Track by status category
        const statusCategory = `${Math.floor(statusCode / 100)}xx`;
        metrics.requests.byStatus[statusCategory] = (metrics.requests.byStatus[statusCategory] || 0) + 1;
        
        // Track errors
        if (statusCode >= 400) {
            metrics.errors.total++;
            const errorType = statusCode >= 500 ? 'server' : 'client';
            metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
            metrics.errors.byStatus[statusCode] = (metrics.errors.byStatus[statusCode] || 0) + 1;
        }
        
        // Log slow requests
        if (responseTime > 1000) {
            logger.warn('Slow request detected', {
                endpoint,
                responseTime: `${responseTime}ms`,
                statusCode,
                userId: req.user?.id
            });
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

/**
 * Get current metrics with advanced analytics
 */
const getMetrics = () => {
    // Update system metrics
    metrics.system.uptime = Math.floor((Date.now() - metrics.system.startTime) / 1000);
    
    // Calculate averages
    const avgResponseTime = metrics.responseTimes.count > 0
        ? Math.round(metrics.responseTimes.total / metrics.responseTimes.count)
        : 0;
    
    // Calculate percentiles
    const p50 = calculatePercentile(metrics.responseTimes.all, 50);
    const p95 = calculatePercentile(metrics.responseTimes.all, 95);
    const p99 = calculatePercentile(metrics.responseTimes.all, 99);
    
    // Calculate endpoint statistics
    const endpointStats = {};
    const slowestEndpoints = [];
    const fastestEndpoints = [];
    
    Object.keys(metrics.responseTimes.byEndpoint).forEach(endpoint => {
        const data = metrics.responseTimes.byEndpoint[endpoint];
        const avg = Math.round(data.total / data.count);
        const p95Endpoint = calculatePercentile(data.times, 95);
        
        endpointStats[endpoint] = {
            count: data.count,
            avgMs: avg,
            minMs: data.min === Infinity ? 0 : data.min,
            maxMs: data.max,
            p95Ms: p95Endpoint,
            errorCount: metrics.requests.byEndpoint[endpoint] || 0
        };
        
        slowestEndpoints.push({ endpoint, avgMs: avg });
        fastestEndpoints.push({ endpoint, avgMs: avg });
    });
    
    slowestEndpoints.sort((a, b) => b.avgMs - a.avgMs);
    fastestEndpoints.sort((a, b) => a.avgMs - b.avgMs);
    
    // Get system info
    const systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        memoryUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        uptime: metrics.system.uptime,
        loadAverage: os.loadavg().map(v => Math.round(v * 100) / 100)
    };
    
    return {
        timestamp: new Date().toISOString(),
        requests: {
            total: metrics.requests.total,
            byMethod: metrics.requests.byMethod,
            byStatus: metrics.requests.byStatus,
            byStatusCode: metrics.requests.byStatusCode,
            topEndpoints: Object.entries(metrics.requests.byEndpoint)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([endpoint, count]) => ({ endpoint, count }))
        },
        performance: {
            avgResponseTimeMs: avgResponseTime,
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            slowestEndpoints: slowestEndpoints.slice(0, 5),
            fastestEndpoints: fastestEndpoints.slice(0, 5),
            endpoints: endpointStats
        },
        errors: {
            total: metrics.errors.total,
            errorRate: metrics.requests.total > 0
                ? Math.round((metrics.errors.total / metrics.requests.total) * 100 * 100) / 100
                : 0,
            byType: metrics.errors.byType,
            byStatus: metrics.errors.byStatus,
            topErrors: Object.entries(metrics.errors.byStatus)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([status, count]) => ({ statusCode: status, count }))
        },
        users: {
            active: metrics.users.active.size,
            total: metrics.users.total
        },
        system: systemInfo
    };
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
    metrics.requests = {
        total: 0,
        byEndpoint: {},
        byMethod: {},
        byStatus: {},
        byStatusCode: {}
    };
    metrics.responseTimes = {
        total: 0,
        count: 0,
        byEndpoint: {},
        all: []
    };
    metrics.errors = {
        total: 0,
        byType: {},
        byStatus: {}
    };
    metrics.users = {
        active: new Set(),
        total: 0
    };
    
    logger.info('Metrics reset');
};

/**
 * Log metrics summary
 */
const logMetricsSummary = () => {
    const metricsData = getMetrics();
    
    logger.info('Metrics Summary', {
        totalRequests: metricsData.requests.total,
        avgResponseTime: metricsData.performance.avgResponseTimeMs,
        p95ResponseTime: metricsData.performance.p95Ms,
        errorRate: metricsData.errors.errorRate,
        errorCount: metricsData.errors.total,
        activeUsers: metricsData.users.active,
        uptime: metricsData.system.uptime,
        memoryUsage: metricsData.system.memoryUsage,
        loadAverage: metricsData.system.loadAverage
    });
};

// Log metrics summary every 5 minutes in production
if (process.env.NODE_ENV === 'production') {
    setInterval(logMetricsSummary, 5 * 60 * 1000);
}

module.exports = {
    metricsMiddleware,
    getMetrics,
    resetMetrics
};
