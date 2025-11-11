/**
 * Constants for the application
 * Centralized location for magic numbers, strings, and configuration
 */

// HTTP Status Codes
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500
};

// Error Messages
const ERROR_MESSAGES = {
    INVALID_CREDENTIALS: 'Invalid credentials',
    MISSING_FIELDS: 'Missing required fields',
    UNAUTHORIZED: 'Authorization required',
    FORBIDDEN: 'Insufficient permissions',
    NOT_FOUND: 'Resource not found',
    DUPLICATE_ENTRY: 'Resource already exists',
    INTERNAL_ERROR: 'Something went wrong. Please try again later.',
    TOKEN_EXPIRED: 'Token has expired',
    INVALID_TOKEN: 'Invalid token',
    MISSING_AUTH_HEADER: 'Missing authorization header'
};

// Success Messages
const SUCCESS_MESSAGES = {
    LOGIN_SUCCESS: 'Login successful',
    LOGOUT_SUCCESS: 'Logout successful',
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    PASSWORD_CHANGED: 'Password changed successfully'
};

// Validation Rules
const VALIDATION_RULES = {
    PASSWORD_MIN_LENGTH: 6,
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    PATIENT_ID_MAX_LENGTH: 50,
    PHONE_PATTERN: /^[0-9+\-\s()]+$/,
    EMAIL_MAX_LENGTH: 255,
    MESSAGE_MAX_LENGTH: 1000,
    ALLERGY_MAX_LENGTH: 500,
    MEDICAL_HISTORY_MAX_LENGTH: 1000
};

// Database
const DB_CONFIG = {
    CONNECTION_LIMIT: 10,
    QUEUE_LIMIT: 0,
    CONNECT_TIMEOUT: 10000
};

// Rate Limiting
const RATE_LIMIT_CONFIG = {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100,
    MESSAGE: 'Too many requests from this IP, please try again later.'
};

// JWT
const JWT_CONFIG = {
    DEFAULT_EXPIRY: '7d',
    ALGORITHM: 'HS256'
};

// Pagination
const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100
};

// File Upload
const FILE_UPLOAD = {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword']
};

module.exports = {
    HTTP_STATUS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    VALIDATION_RULES,
    DB_CONFIG,
    RATE_LIMIT_CONFIG,
    JWT_CONFIG,
    PAGINATION,
    FILE_UPLOAD
};
