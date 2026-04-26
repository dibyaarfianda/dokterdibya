/**
 * Request logging middleware using morgan
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

const toClampedRate = (rawValue, fallback) => {
    const parsed = Number.parseFloat(rawValue);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
};

const ENABLE_HTTP_ACCESS_LOGS = process.env.ENABLE_HTTP_ACCESS_LOGS === 'true' || !isProduction;
const REQUEST_LOG_SAMPLE_RATE = toClampedRate(
    process.env.REQUEST_LOG_SAMPLE_RATE || (isProduction ? '0.15' : '1'),
    isProduction ? 0.15 : 1
);
const SLOW_REQUEST_THRESHOLD_MS = Number.parseInt(
    process.env.SLOW_REQUEST_THRESHOLD_MS || (isProduction ? '1500' : '1000'),
    10
);
const ERROR_LOG_STATUS_MIN = Number.parseInt(
    process.env.ERROR_LOG_STATUS_MIN || (isProduction ? '500' : '400'),
    10
);

// Custom token for user ID
morgan.token('user-id', (req) => {
    return req.user?.id || 'anonymous';
});

// Custom token for response time in ms
morgan.token('response-time-ms', (req, res) => {
    if (!req._startAt || !res._startAt) {
        return '';
    }
    
    const ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
               (res._startAt[1] - req._startAt[1]) * 1e-6;
    
    return ms.toFixed(3);
});

// Custom format
const customFormat = ':remote-addr - :user-id ":method :url" :status :res[content-length] - :response-time-ms ms';

// Create stream object with write function
const stream = {
    write: (message) => {
        // Remove trailing newline
        logger.http(message.trim());
    }
};

// Skip logging for high-frequency/noisy endpoints in production
const SKIP_PATHS = ['/api/health', '/api/rum', '/api/notifications/count', '/api/notifications/badge-counts'];
const skip = (req, res) => {
    if (!ENABLE_HTTP_ACCESS_LOGS) {
        return true;
    }

    if (isProduction) {
        if (req.method === 'OPTIONS') {
            return true;
        }

        if (!req.originalUrl?.startsWith('/api/')) {
            return true;
        }

        if (SKIP_PATHS.some(p => req.originalUrl.startsWith(p))) {
            return true;
        }

        // Always keep 5xx request logs, sample other API traffic.
        if (res.statusCode >= 500) {
            return false;
        }

        return Math.random() > REQUEST_LOG_SAMPLE_RATE;
    }

    return false;
};

// Morgan middleware
const requestLogger = morgan(customFormat, { stream, skip });

// Request performance logger
const performanceLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // Log slow requests (> 1 second)
        if (duration > SLOW_REQUEST_THRESHOLD_MS) {
            logger.warn('Slow request detected', {
                method: req.method,
                url: req.originalUrl,
                duration: `${duration}ms`,
                userId: req.user?.id,
                statusCode: res.statusCode
            });
        }
        
        // Keep 4xx out of error logs in production by default.
        if (res.statusCode >= ERROR_LOG_STATUS_MIN) {
            logger.error('Request error', {
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                userId: req.user?.id
            });
        }
    });
    
    next();
};

module.exports = {
    requestLogger,
    performanceLogger
};
