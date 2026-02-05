/**
 * Xendit Payment Gateway Utility
 * Handles QRIS and Virtual Account payments
 */

const axios = require('axios');
const logger = require('./logger');

// Xendit Configuration
const XENDIT_CONFIG = {
    secretKey: process.env.XENDIT_SECRET_KEY,
    webhookToken: process.env.XENDIT_WEBHOOK_TOKEN,
    isProduction: process.env.XENDIT_PRODUCTION === 'true',
    baseUrl: 'https://api.xendit.co',
    qrisExpiryMinutes: parseInt(process.env.XENDIT_QRIS_EXPIRY_MINUTES || '30'),
    vaExpiryHours: parseInt(process.env.XENDIT_VA_EXPIRY_HOURS || '24'),

    // VA Bank Codes
    vaBanks: {
        'va_bca': 'BCA',
        'va_bni': 'BNI',
        'va_bri': 'BRI',
        'va_mandiri': 'MANDIRI'
    },

    // Bank display names
    bankNames: {
        'BCA': 'Bank Central Asia',
        'BNI': 'Bank Negara Indonesia',
        'BRI': 'Bank Rakyat Indonesia',
        'MANDIRI': 'Bank Mandiri'
    }
};

/**
 * Check if Xendit is configured
 */
function isConfigured() {
    return !!(XENDIT_CONFIG.secretKey && XENDIT_CONFIG.secretKey !== 'xnd_development_REPLACE_WITH_YOUR_KEY');
}

/**
 * Get Axios instance with Xendit auth
 */
function getAxiosInstance() {
    return axios.create({
        baseURL: XENDIT_CONFIG.baseUrl,
        auth: {
            username: XENDIT_CONFIG.secretKey,
            password: ''
        },
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 30000
    });
}

/**
 * Generate unique reference ID
 * @param {string} mrId - Medical record ID
 * @returns {string} Reference ID
 */
function generateReferenceId(mrId) {
    const timestamp = Date.now();
    return `DIBYA-${mrId}-${timestamp}`;
}

/**
 * Create QRIS Payment
 * @param {Object} params
 * @param {number} params.amount - Payment amount in IDR
 * @param {string} params.mrId - Medical record ID
 * @param {string} params.patientName - Patient name for description
 * @param {number} [params.expiryMinutes] - Expiry in minutes (default from config)
 * @returns {Promise<Object>} QRIS payment details
 */
async function createQRISPayment({ amount, mrId, patientName, expiryMinutes }) {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi. Silakan set XENDIT_SECRET_KEY di .env');
    }

    const api = getAxiosInstance();
    const referenceId = generateReferenceId(mrId);
    const expiry = expiryMinutes || XENDIT_CONFIG.qrisExpiryMinutes;

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiry);

    try {
        logger.info('[Xendit] Creating QRIS payment', { mrId, amount, referenceId });

        const response = await api.post('/qr_codes', {
            reference_id: referenceId,
            type: 'DYNAMIC',
            currency: 'IDR',
            amount: Math.round(amount), // Xendit requires integer
            expires_at: expiresAt.toISOString(),
            description: `Pembayaran ${mrId} - ${patientName}`,
            metadata: {
                mr_id: mrId,
                patient_name: patientName
            }
        });

        logger.info('[Xendit] QRIS created successfully', {
            mrId,
            xenditId: response.data.id,
            referenceId
        });

        return {
            success: true,
            xendit_id: response.data.id,
            reference_id: referenceId,
            qris_string: response.data.qr_string,
            qris_url: response.data.image_url || null, // Xendit may provide hosted image
            amount: response.data.amount,
            expires_at: expiresAt,
            expires_in_seconds: expiry * 60,
            raw_response: response.data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to create QRIS', {
            mrId,
            error: error.response?.data || error.message
        });

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            'Gagal membuat pembayaran QRIS'
        );
    }
}

/**
 * Create Virtual Account Payment
 * @param {Object} params
 * @param {number} params.amount - Payment amount in IDR
 * @param {string} params.mrId - Medical record ID
 * @param {string} params.bankCode - Bank code (BCA, BNI, BRI, MANDIRI)
 * @param {string} params.customerName - Customer/Patient name
 * @param {number} [params.expiryHours] - Expiry in hours (default from config)
 * @returns {Promise<Object>} VA payment details
 */
async function createVAPayment({ amount, mrId, bankCode, customerName, expiryHours }) {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi. Silakan set XENDIT_SECRET_KEY di .env');
    }

    const api = getAxiosInstance();
    const referenceId = generateReferenceId(mrId);
    const expiry = expiryHours || XENDIT_CONFIG.vaExpiryHours;

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiry);

    // Normalize bank code
    const normalizedBankCode = bankCode.toUpperCase().replace('VA_', '');

    try {
        logger.info('[Xendit] Creating VA payment', { mrId, amount, bankCode: normalizedBankCode, referenceId });

        const response = await api.post('/callback_virtual_accounts', {
            external_id: referenceId,
            bank_code: normalizedBankCode,
            name: customerName.substring(0, 50), // Max 50 chars
            expected_amount: Math.round(amount),
            is_closed: true, // Closed VA - exact amount required
            is_single_use: true,
            expiration_date: expiresAt.toISOString(),
            description: `Pembayaran ${mrId}`
        });

        logger.info('[Xendit] VA created successfully', {
            mrId,
            xenditId: response.data.id,
            vaNumber: response.data.account_number,
            bankCode: normalizedBankCode
        });

        return {
            success: true,
            xendit_id: response.data.id,
            reference_id: referenceId,
            va_number: response.data.account_number,
            va_bank_code: normalizedBankCode,
            va_bank_name: XENDIT_CONFIG.bankNames[normalizedBankCode] || normalizedBankCode,
            amount: response.data.expected_amount,
            expires_at: expiresAt,
            expires_in_seconds: expiry * 3600,
            raw_response: response.data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to create VA', {
            mrId,
            bankCode: normalizedBankCode,
            error: error.response?.data || error.message
        });

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            'Gagal membuat Virtual Account'
        );
    }
}

/**
 * Get payment status from Xendit
 * @param {string} xenditId - Xendit payment ID
 * @param {string} type - Payment type ('qris' or 'va')
 * @returns {Promise<Object>} Payment status
 */
async function getPaymentStatus(xenditId, type = 'qris') {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi');
    }

    const api = getAxiosInstance();

    try {
        let response;

        if (type === 'qris') {
            response = await api.get(`/qr_codes/${xenditId}`);
        } else {
            response = await api.get(`/callback_virtual_accounts/${xenditId}`);
        }

        const data = response.data;

        // Determine status
        let status = 'pending';
        if (data.status === 'COMPLETED' || data.status === 'ACTIVE') {
            // For QRIS, COMPLETED means paid
            // For VA, we need to check if payment was received
            status = type === 'qris' && data.status === 'COMPLETED' ? 'paid' : 'pending';
        } else if (data.status === 'EXPIRED') {
            status = 'expired';
        } else if (data.status === 'INACTIVE') {
            status = 'cancelled';
        }

        return {
            success: true,
            xendit_id: xenditId,
            status: status,
            amount: data.amount || data.expected_amount,
            paid_amount: data.paid_amount || 0,
            paid_at: data.paid_at || null,
            raw_response: data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to get payment status', {
            xenditId,
            type,
            error: error.response?.data || error.message
        });

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            'Gagal mengecek status pembayaran'
        );
    }
}

/**
 * Verify webhook callback token
 * @param {string} callbackToken - Token from x-callback-token header
 * @returns {boolean} True if valid
 */
function verifyWebhookSignature(callbackToken) {
    if (!XENDIT_CONFIG.webhookToken) {
        logger.warn('[Xendit] Webhook token not configured');
        return false;
    }

    const isValid = callbackToken === XENDIT_CONFIG.webhookToken;

    if (!isValid) {
        logger.warn('[Xendit] Invalid webhook token received');
    }

    return isValid;
}

/**
 * Parse webhook payload and determine payment type
 * @param {Object} payload - Webhook payload
 * @returns {Object} Parsed webhook data
 */
function parseWebhookPayload(payload) {
    // QRIS webhook
    if (payload.qr_code || payload.type === 'QR_CODE') {
        return {
            type: 'qris',
            event: payload.event || 'payment.paid',
            xendit_id: payload.qr_code?.id || payload.id,
            reference_id: payload.qr_code?.reference_id || payload.reference_id,
            amount: payload.amount,
            paid_at: payload.created || new Date().toISOString(),
            status: 'paid'
        };
    }

    // VA webhook (FVA Paid callback)
    if (payload.callback_virtual_account_id || payload.bank_code) {
        return {
            type: 'va',
            event: 'payment.paid',
            xendit_id: payload.callback_virtual_account_id || payload.id,
            reference_id: payload.external_id,
            amount: payload.amount,
            paid_at: payload.transaction_timestamp || new Date().toISOString(),
            status: 'paid',
            va_number: payload.account_number,
            bank_code: payload.bank_code
        };
    }

    // Credit Card webhook
    if (payload.credit_card_charge_id || payload.card_brand || payload.masked_card_number) {
        const status = payload.status?.toLowerCase();
        return {
            type: 'credit_card',
            event: payload.event || 'credit_card.charge',
            xendit_id: payload.credit_card_charge_id || payload.id,
            reference_id: payload.external_id,
            amount: payload.capture_amount || payload.authorized_amount || payload.amount,
            paid_at: status === 'captured' ? (payload.created || new Date().toISOString()) : null,
            status: status === 'captured' ? 'paid' : status,
            card_brand: payload.card_brand,
            masked_card_number: payload.masked_card_number
        };
    }

    // Generic payment webhook
    return {
        type: 'unknown',
        event: payload.event || 'unknown',
        xendit_id: payload.id,
        reference_id: payload.external_id || payload.reference_id,
        amount: payload.amount,
        status: payload.status?.toLowerCase() || 'unknown',
        raw: payload
    };
}

/**
 * Get supported payment methods
 * @returns {Array} List of supported payment methods
 */
function getSupportedMethods() {
    return [
        {
            code: 'qris',
            name: 'QRIS',
            description: 'Scan QR dengan e-wallet atau m-banking',
            icon: 'fas fa-qrcode',
            expiry_minutes: XENDIT_CONFIG.qrisExpiryMinutes
        },
        {
            code: 'va_bca',
            name: 'Virtual Account BCA',
            description: 'Transfer via Bank Central Asia',
            icon: 'fas fa-university',
            bank_code: 'BCA',
            expiry_hours: XENDIT_CONFIG.vaExpiryHours
        },
        {
            code: 'va_bni',
            name: 'Virtual Account BNI',
            description: 'Transfer via Bank Negara Indonesia',
            icon: 'fas fa-university',
            bank_code: 'BNI',
            expiry_hours: XENDIT_CONFIG.vaExpiryHours
        },
        {
            code: 'va_bri',
            name: 'Virtual Account BRI',
            description: 'Transfer via Bank Rakyat Indonesia',
            icon: 'fas fa-university',
            bank_code: 'BRI',
            expiry_hours: XENDIT_CONFIG.vaExpiryHours
        },
        {
            code: 'va_mandiri',
            name: 'Virtual Account Mandiri',
            description: 'Transfer via Bank Mandiri',
            icon: 'fas fa-university',
            bank_code: 'MANDIRI',
            expiry_hours: XENDIT_CONFIG.vaExpiryHours
        },
        {
            code: 'credit_card',
            name: 'Kartu Kredit/Debit',
            description: 'Visa, Mastercard, JCB',
            icon: 'fas fa-credit-card',
            supports_3ds: true
        }
    ];
}

/**
 * Get Xendit public key for frontend tokenization
 * @returns {string} Public key
 */
function getPublicKey() {
    return process.env.XENDIT_PUBLIC_KEY || '';
}

/**
 * Create Credit Card Charge
 * @param {Object} params
 * @param {string} params.tokenId - Token from Xendit.js tokenization
 * @param {string} params.authId - Authentication ID (for 3DS)
 * @param {number} params.amount - Payment amount in IDR
 * @param {string} params.mrId - Medical record ID
 * @param {string} params.patientName - Patient name
 * @returns {Promise<Object>} Charge result
 */
async function createCreditCardCharge({ tokenId, authId, amount, mrId, patientName }) {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi');
    }

    const api = getAxiosInstance();
    const referenceId = generateReferenceId(mrId);

    try {
        logger.info('[Xendit] Creating credit card charge', { mrId, amount, referenceId });

        const chargeData = {
            token_id: tokenId,
            external_id: referenceId,
            amount: Math.round(amount),
            capture: true, // Capture immediately
            description: `Pembayaran ${mrId} - ${patientName}`,
            metadata: {
                mr_id: mrId,
                patient_name: patientName
            }
        };

        // Add authentication_id if 3DS was performed
        if (authId) {
            chargeData.authentication_id = authId;
        }

        const response = await api.post('/credit_card_charges', chargeData);

        logger.info('[Xendit] Credit card charge created', {
            mrId,
            chargeId: response.data.id,
            status: response.data.status
        });

        return {
            success: true,
            xendit_id: response.data.id,
            reference_id: referenceId,
            status: response.data.status.toLowerCase(),
            amount: response.data.capture_amount || response.data.authorized_amount,
            card_brand: response.data.card_brand,
            masked_card_number: response.data.masked_card_number,
            charge_type: response.data.charge_type,
            paid_at: response.data.status === 'CAPTURED' ? new Date().toISOString() : null,
            raw_response: response.data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to create credit card charge', {
            mrId,
            error: error.response?.data || error.message
        });

        // Parse specific error messages
        const errorData = error.response?.data;
        let errorMessage = 'Gagal memproses pembayaran kartu';

        if (errorData?.error_code) {
            switch (errorData.error_code) {
                case 'CARD_DECLINED':
                    errorMessage = 'Kartu ditolak. Silakan gunakan kartu lain.';
                    break;
                case 'INSUFFICIENT_BALANCE':
                    errorMessage = 'Saldo tidak mencukupi.';
                    break;
                case 'INVALID_CVN':
                    errorMessage = 'CVV/CVC tidak valid.';
                    break;
                case 'EXPIRED_CARD':
                    errorMessage = 'Kartu sudah kadaluarsa.';
                    break;
                case 'PROCESSOR_ERROR':
                    errorMessage = 'Gangguan sistem bank. Silakan coba lagi.';
                    break;
                default:
                    errorMessage = errorData.message || errorMessage;
            }
        }

        throw new Error(errorMessage);
    }
}

/**
 * Create 3DS Authentication for Credit Card
 * @param {Object} params
 * @param {string} params.tokenId - Token from Xendit.js
 * @param {number} params.amount - Payment amount
 * @param {string} params.mrId - Medical record ID
 * @returns {Promise<Object>} Authentication result
 */
async function create3DSAuthentication({ tokenId, amount, mrId }) {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi');
    }

    const api = getAxiosInstance();
    const referenceId = generateReferenceId(mrId);

    try {
        logger.info('[Xendit] Creating 3DS authentication', { mrId, amount });

        const response = await api.post('/credit_card_charges/authenticate', {
            token_id: tokenId,
            external_id: referenceId,
            amount: Math.round(amount)
        });

        return {
            success: true,
            authentication_id: response.data.id,
            status: response.data.status,
            payer_authentication_url: response.data.payer_authentication_url,
            raw_response: response.data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to create 3DS authentication', {
            mrId,
            error: error.response?.data || error.message
        });

        throw new Error(
            error.response?.data?.message ||
            'Gagal memulai autentikasi 3DS'
        );
    }
}

/**
 * Get Credit Card Charge Status
 * @param {string} chargeId - Xendit charge ID
 * @returns {Promise<Object>} Charge status
 */
async function getCreditCardChargeStatus(chargeId) {
    if (!isConfigured()) {
        throw new Error('Xendit tidak dikonfigurasi');
    }

    const api = getAxiosInstance();

    try {
        const response = await api.get(`/credit_card_charges/${chargeId}`);

        return {
            success: true,
            xendit_id: chargeId,
            status: response.data.status.toLowerCase(),
            amount: response.data.capture_amount,
            card_brand: response.data.card_brand,
            masked_card_number: response.data.masked_card_number,
            raw_response: response.data
        };

    } catch (error) {
        logger.error('[Xendit] Failed to get charge status', {
            chargeId,
            error: error.response?.data || error.message
        });

        throw new Error('Gagal mengecek status pembayaran');
    }
}

module.exports = {
    isConfigured,
    createQRISPayment,
    createVAPayment,
    getPaymentStatus,
    verifyWebhookSignature,
    parseWebhookPayload,
    getSupportedMethods,
    getPublicKey,
    createCreditCardCharge,
    create3DSAuthentication,
    getCreditCardChargeStatus,
    XENDIT_CONFIG
};
