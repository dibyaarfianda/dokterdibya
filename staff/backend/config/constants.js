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

// Error Messages (Bahasa Indonesia for patient-facing)
const ERROR_MESSAGES = {
    INVALID_CREDENTIALS: 'Salah email/password. Mohon periksa kembali email atau password Anda',
    MISSING_FIELDS: 'Data tidak lengkap. Mohon isi semua field yang diperlukan',
    UNAUTHORIZED: 'Sesi telah berakhir. Silakan login kembali',
    FORBIDDEN: 'Anda tidak memiliki akses untuk melakukan ini',
    NOT_FOUND: 'Data tidak ditemukan',
    DUPLICATE_ENTRY: 'Data sudah ada',
    INTERNAL_ERROR: 'Terjadi kesalahan. Silakan coba lagi nanti',
    TOKEN_EXPIRED: 'Sesi telah berakhir. Silakan login kembali',
    INVALID_TOKEN: 'Token tidak valid. Silakan login kembali',
    MISSING_AUTH_HEADER: 'Silakan login terlebih dahulu',
    INVALID_CURRENT_PASSWORD: 'Password saat ini salah',
    PASSWORD_MISMATCH: 'Konfirmasi password tidak cocok',
    ACCOUNT_LOCKED: 'Akun terkunci sementara. Coba lagi dalam 15 menit',
    EMAIL_NOT_FOUND: 'Email tidak terdaftar',
    PHONE_NOT_FOUND: 'Nomor telepon tidak terdaftar'
};

// Success Messages (Bahasa Indonesia)
const SUCCESS_MESSAGES = {
    LOGIN_SUCCESS: 'Login berhasil',
    LOGOUT_SUCCESS: 'Logout berhasil',
    CREATED: 'Data berhasil disimpan',
    UPDATED: 'Data berhasil diupdate',
    DELETED: 'Data berhasil dihapus',
    PASSWORD_CHANGED: 'Password berhasil diubah'
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
