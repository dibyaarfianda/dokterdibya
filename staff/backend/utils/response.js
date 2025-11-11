/**
 * Response utility for consistent API responses
 */

const { HTTP_STATUS } = require('../config/constants');

/**
 * Send success response
 */
const sendSuccess = (res, data, message = 'Success', statusCode = HTTP_STATUS.OK) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

/**
 * Send error response
 */
const sendError = (res, message = 'Error', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) => {
    const response = {
        success: false,
        message,
        timestamp: new Date().toISOString()
    };
    
    if (errors) {
        response.errors = errors;
    }
    
    return res.status(statusCode).json(response);
};

/**
 * Send created response
 */
const sendCreated = (res, data, message = 'Resource created successfully') => {
    return sendSuccess(res, data, message, HTTP_STATUS.CREATED);
};

/**
 * Send paginated response
 */
const sendPaginated = (res, data, pagination, message = 'Success') => {
    return res.status(HTTP_STATUS.OK).json({
        success: true,
        message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: Math.ceil(pagination.total / pagination.limit)
        },
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    sendSuccess,
    sendError,
    sendCreated,
    sendPaginated
};
