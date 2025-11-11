/**
 * Request Context Middleware
 * Adds unique request IDs and correlation tracking for distributed tracing
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Generate unique request ID for tracing
 */
const requestContextMiddleware = (req, res, next) => {
    // Generate unique request ID
    const requestId = req.headers['x-request-id'] || uuidv4();
    
    // Get correlation ID from upstream services (or create new one)
    const correlationId = req.headers['x-correlation-id'] || requestId;
    
    // Get trace ID for distributed tracing
    const traceId = req.headers['x-trace-id'] || uuidv4();
    
    // Store in request object
    req.context = {
        requestId,
        correlationId,
        traceId,
        startTime: Date.now(),
        userId: req.user?.id || null,
        sessionId: req.sessionID || null
    };
    
    // Add to response headers
    res.set('X-Request-ID', requestId);
    res.set('X-Correlation-ID', correlationId);
    res.set('X-Trace-ID', traceId);
    
    // Log request start
    const logContext = {
        requestId,
        correlationId,
        traceId,
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        userId: req.user?.id || null
    };
    
    logger.debug('Request started', logContext);
    
    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - req.context.startTime;
        
        logger.debug('Request completed', {
            ...logContext,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('content-length') || 'unknown'
        });
    });
    
    next();
};

/**
 * Middleware to inject request context into error objects
 */
const contextualizeError = (err, req, res, next) => {
    if (req.context) {
        err.requestId = req.context.requestId;
        err.correlationId = req.context.correlationId;
        err.traceId = req.context.traceId;
    }
    next();
};

/**
 * Get current request context (for use in services/utils)
 */
const getContext = (req) => {
    return req.context || {
        requestId: 'unknown',
        correlationId: 'unknown',
        traceId: 'unknown'
    };
};

module.exports = {
    requestContextMiddleware,
    contextualizeError,
    getContext
};
