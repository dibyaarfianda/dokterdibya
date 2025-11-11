/**
 * Request logging middleware using morgan
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

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

// Skip logging for health check endpoint in production
const skip = (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return req.originalUrl === '/api/health';
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
        if (duration > 1000) {
            logger.warn('Slow request detected', {
                method: req.method,
                url: req.originalUrl,
                duration: `${duration}ms`,
                userId: req.user?.id,
                statusCode: res.statusCode
            });
        }
        
        // Log errors
        if (res.statusCode >= 400) {
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
