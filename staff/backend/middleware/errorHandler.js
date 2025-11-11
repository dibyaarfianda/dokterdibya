/**
 * Error Handler Middleware
 * Centralized error handling for consistent error responses
 */

const logger = require('../utils/logger');

// Error tracking (in production, use error tracking service like Sentry)
const errorMetrics = {
    total: 0,
    byCode: {},
    byType: {},
    recent: []
};

class AppError extends Error {
    constructor(message, statusCode, isOperational = true, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Async error wrapper to eliminate try-catch duplication
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Track error metrics
 */
const trackError = (err) => {
    errorMetrics.total++;
    
    const errorCode = err.code || err.name || 'UNKNOWN';
    errorMetrics.byCode[errorCode] = (errorMetrics.byCode[errorCode] || 0) + 1;
    
    const errorType = err.isOperational ? 'operational' : 'programming';
    errorMetrics.byType[errorType] = (errorMetrics.byType[errorType] || 0) + 1;
    
    // Keep last 100 errors
    errorMetrics.recent.push({
        timestamp: new Date(),
        message: err.message,
        code: errorCode,
        statusCode: err.statusCode,
        type: errorType
    });
    
    if (errorMetrics.recent.length > 100) {
        errorMetrics.recent.shift();
    }
};

/**
 * Global error handler middleware
 * Enhanced with tracking, correlation IDs, and better logging
 */
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    
    // Track error
    trackError(err);
    
    // Add request context to error
    if (req.context) {
        err.requestId = req.context.requestId;
        err.correlationId = req.context.correlationId;
        err.traceId = req.context.traceId;
    }
    
    const errorLog = {
        message: err.message,
        statusCode: err.statusCode,
        type: err.constructor.name,
        requestId: err.requestId || 'unknown',
        correlationId: err.correlationId || 'unknown',
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id || null
    };

    if (process.env.NODE_ENV === 'development') {
        // Development: Send detailed error
        logger.error('ERROR (Development)', {
            ...errorLog,
            stack: err.stack,
            code: err.code
        });
        
        res.status(err.statusCode).json({
            success: false,
            status: err.status,
            message: err.message,
            requestId: err.requestId,
            code: err.code,
            stack: err.stack,
            error: err
        });
    } else {
        // Production: Send sanitized error
        if (err.isOperational) {
            // Operational, trusted error: send message to client
            logger.warn('Operational error', errorLog);
            
            res.status(err.statusCode).json({
                success: false,
                message: err.message,
                requestId: err.requestId,
                code: err.code
            });
        } else {
            // Programming or unknown error: don't leak error details
            logger.error('Programming error', {
                ...errorLog,
                stack: err.stack,
                code: err.code
            });
            
            res.status(500).json({
                success: false,
                message: 'Something went wrong. Please try again later.',
                requestId: err.requestId
            });
        }
    }
};

/**
 * Handle specific error types
 */
const handleDatabaseError = (err) => {
    if (err.code === 'ER_DUP_ENTRY') {
        const field = err.sqlMessage?.match(/key '(.+?)'/)?.[1] || 'field';
        return new AppError(`Duplicate value for ${field}. Please use another value.`, 409, true, 'DUPLICATE_ENTRY');
    }
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return new AppError('Referenced record does not exist.', 400, true, 'NO_REFERENCED_ROW');
    }
    
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return new AppError('Cannot delete record as it is being used by other records.', 400, true, 'ROW_IS_REFERENCED');
    }
    
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        return new AppError('Database connection lost. Please try again.', 503, true, 'DB_CONNECTION_LOST');
    }
    
    if (err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
        return new AppError('Database connection error. Please try again.', 503, true, 'DB_FATAL_ERROR');
    }
    
    if (err.code === 'ER_QUERY_TIMEOUT') {
        return new AppError('Query timeout. Please try again.', 408, true, 'QUERY_TIMEOUT');
    }
    
    // Generic database error
    logger.error('Unhandled database error', { code: err.code, message: err.message });
    return new AppError('Database operation failed.', 500, false, 'DB_ERROR');
};

/**
 * Handle 404 - Route not found
 */
const notFoundHandler = (req, res, next) => {
    const err = new AppError(`Route ${req.originalUrl} not found`, 404, true, 'ROUTE_NOT_FOUND');
    next(err);
};

/**
 * Get error metrics
 */
const getErrorMetrics = () => {
    return {
        ...errorMetrics,
        timestamp: new Date()
    };
};

/**
 * Reset error metrics
 */
const resetErrorMetrics = () => {
    errorMetrics.total = 0;
    errorMetrics.byCode = {};
    errorMetrics.byType = {};
    errorMetrics.recent = [];
};

module.exports = {
    AppError,
    asyncHandler,
    errorHandler,
    handleDatabaseError,
    notFoundHandler,
    getErrorMetrics,
    resetErrorMetrics,
    trackError
};
