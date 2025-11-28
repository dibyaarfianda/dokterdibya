const { body, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
}

/**
 * Validation rules for patient creation/update
 */
const validatePatient = [
    body('id')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Patient ID must be between 1 and 50 characters'),
    
    body('full_name')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    
    body('whatsapp')
        .optional()
        .trim(),
    
    body('birth_date')
        .optional()
        .trim(),
    
    body('allergy')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Allergy text must not exceed 500 characters'),
    
    body('medical_history')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Medical history must not exceed 1000 characters'),
    
    handleValidationErrors
];

/**
 * Validation rules for login
 */
const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .customSanitizer(value => value.toLowerCase()),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    
    handleValidationErrors
];

/**
 * Validation rules for password change
 */
const validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters'),

    handleValidationErrors
];

/**
 * Validation rules for obat (medication) - POST
 */
const validateObat = [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('Medication code is required')
        .isLength({ max: 50 })
        .withMessage('Code must not exceed 50 characters'),
    
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Medication name is required')
        .isLength({ max: 200 })
        .withMessage('Name must not exceed 200 characters'),
    
    body('category')
        .trim()
        .notEmpty()
        .withMessage('Category is required'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    
    body('min_stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Minimum stock must be a non-negative integer'),
    
    handleValidationErrors
];

/**
 * Validation rules for obat (medication) - PUT (code not required for updates)
 */
const validateObatUpdate = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Medication name is required')
        .isLength({ max: 200 })
        .withMessage('Name must not exceed 200 characters'),
    
    body('category')
        .trim()
        .notEmpty()
        .withMessage('Category is required'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    
    body('min_stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Minimum stock must be a non-negative integer'),
    
    handleValidationErrors
];

/**
 * Validation rules for tindakan (procedure)
 */
const validateTindakan = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Procedure name is required')
        .isLength({ max: 200 })
        .withMessage('Name must not exceed 200 characters'),
    
    body('category')
        .trim()
        .notEmpty()
        .withMessage('Category is required'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    handleValidationErrors
];

/**
 * Validation rules for chat message
 */
const validateChatMessage = [
    body('message')
        .trim()
        .notEmpty()
        .withMessage('Message cannot be empty')
        .isLength({ max: 1000 })
        .withMessage('Message must not exceed 1000 characters'),
    
    handleValidationErrors
];

module.exports = {
    validatePatient,
    validateLogin,
    validatePasswordChange,
    validateObat,
    validateObatUpdate,
    validateTindakan,
    validateChatMessage,
    handleValidationErrors
};
