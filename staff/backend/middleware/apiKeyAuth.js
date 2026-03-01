const logger = require('../utils/logger');

/**
 * API Key authentication middleware for service-to-service communication.
 * Validates X-API-Key header against configured keys.
 */
function apiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'Missing X-API-Key header'
        });
    }

    const commApiKey = process.env.COMM_API_KEY;
    if (!commApiKey) {
        logger.error('COMM_API_KEY not configured in environment');
        return res.status(500).json({
            success: false,
            message: 'API key authentication not configured'
        });
    }

    if (apiKey !== commApiKey) {
        logger.warn('Invalid API key attempt', {
            ip: req.ip,
            path: req.originalUrl
        });
        return res.status(403).json({
            success: false,
            message: 'Invalid API key'
        });
    }

    req.serviceClient = 'comm';
    next();
}

module.exports = apiKeyAuth;
