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
    useV3PaymentRequests: process.env.XENDIT_USE_V3_PAYMENT_REQUESTS === 'true',
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
    const safeMrId = String(mrId || 'MR')
        .trim()
        .replace(/[^A-Za-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30) || 'MR';
    return `DIBYA-${safeMrId}-${timestamp}`;
}

function buildDescription(mrId, patientName) {
    const name = String(patientName || 'Pasien').trim();
    const base = `Pembayaran ${mrId} - ${name}`.trim();
    return base.substring(0, 100);
}

/**
 * Create QRIS Payment via v3 Payment Requests API
 * Uses POST /v3/payment_requests with QRIS payment method
 * @param {Object} params
 * @param {number} params.amount - Payment amount in IDR
 * @param {string} params.mrId - Medical record ID
 * @param {string} params.patientName - Patient name
 * @param {number} [params.expiryMinutes] - Expiry in minutes
 * @returns {Promise<Object>} Payment request result mapped to standard shape
 */
async function createPaymentRequestV3({ amount, mrId, patientName, expiryMinutes }) {
    const api = getAxiosInstance();
    const referenceId = generateReferenceId(mrId);
    const expiry = expiryMinutes || XENDIT_CONFIG.qrisExpiryMinutes;

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiry);

    const payload = {
        amount: Math.round(amount),
        currency: 'IDR',
        reference_id: referenceId,
        description: buildDescription(mrId, patientName),
        payment_method: {
            type: 'QR_CODE',
            reusability: 'ONE_TIME_USE',
            qr_code: {
                channel_code: 'QRIS'
            }
        },
        metadata: {
            mr_id: String(mrId || ''),
            patient_name: String(patientName || 'Pasien').trim(),
            api_version: 'v3'
        }
    };

    logger.info('[Xendit-v3] Creating QRIS payment request', { mrId, amount, referenceId });

    try {
        const response = await api.post('/payment_requests', payload);
        const data = response.data;

        logger.info('[Xendit-v3] Payment request created', {
            mrId,
            id: data.id,
            status: data.status,
            referenceId
        });

        // Extract QR data from payment_requests response
        // Response may have actions[] with qr_checkout_string, or payment_method.qr_code.channel_properties.qr_string
        const qrAction = data.actions?.find(a => a.action === 'PRESENT_TO_CUSTOMER' || a.qr_checkout_string);
        const qrString = qrAction?.qr_checkout_string ||
                         data.payment_method?.qr_code?.channel_properties?.qr_string ||
                         null;

        return {
            success: true,
            xendit_id: data.id,
            reference_id: referenceId,
            qris_string: qrString,
            qris_url: null, // v3 doesn't provide hosted QR image
            amount: data.amount,
            expires_at: expiresAt,
            expires_in_seconds: expiry * 60,
            api_version: 'v3',
            raw_response: data
        };

    } catch (error) {
        const xenditErr = error.response?.data;
        logger.error('[Xendit-v3] Failed to create payment request', {
            mrId,
            status: error.response?.status,
            xenditError: xenditErr,
            payload: { reference_id: referenceId, amount: Math.round(amount) }
        });

        let msg = 'Gagal membuat pembayaran QRIS (v3)';
        if (xenditErr?.errors?.length) {
            msg = xenditErr.errors.map(e => e.message || e.field || JSON.stringify(e)).join('; ');
        } else if (xenditErr?.message) {
            msg = xenditErr.message;
        } else if (error.message) {
            msg = error.message;
        }
        throw new Error(msg);
    }
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

    // Use v3 Payment Requests API if enabled
    if (XENDIT_CONFIG.useV3PaymentRequests) {
        logger.info('[Xendit] Using v3 Payment Requests API for QRIS');
        return createPaymentRequestV3({ amount, mrId, patientName, expiryMinutes });
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
            external_id: referenceId,
            reference_id: referenceId,
            type: 'DYNAMIC',
            currency: 'IDR',
            amount: Math.round(amount), // Xendit requires integer
            callback_url: 'https://dokterdibya.com/api/webhooks/xendit/payment',
            expires_at: expiresAt.toISOString(),
            description: buildDescription(mrId, patientName),
            metadata: {
                mr_id: mrId,
                patient_name: String(patientName || 'Pasien').trim()
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
        const xenditErr = error.response?.data;
        logger.error('[Xendit] Failed to create QRIS', {
            mrId,
            status: error.response?.status,
            xenditError: xenditErr,
            payload: { reference_id: referenceId, amount: Math.round(amount) }
        });

        // Surface specific Xendit validation errors
        let msg = 'Gagal membuat pembayaran QRIS';
        if (xenditErr?.errors?.length) {
            msg = xenditErr.errors.map(e => e.message || e.field || JSON.stringify(e)).join('; ');
        } else if (xenditErr?.message) {
            msg = xenditErr.message;
        } else if (error.message) {
            msg = error.message;
        }
        throw new Error(msg);
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

        const vaPayload = {
            external_id: referenceId,
            bank_code: normalizedBankCode,
            name: String(customerName || 'Pasien').trim().substring(0, 50), // Max 50 chars
            expected_amount: Math.round(amount),
            is_closed: true, // Closed VA - exact amount required
            is_single_use: true,
            expiration_date: expiresAt.toISOString()
            // description removed: not supported by BNI and some banks
        };

        const response = await api.post('/callback_virtual_accounts', vaPayload);

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
        const xenditErr = error.response?.data;
        logger.error('[Xendit] Failed to create VA', {
            mrId,
            bankCode: normalizedBankCode,
            status: error.response?.status,
            xenditError: xenditErr,
            payload: { external_id: referenceId, bank_code: normalizedBankCode, expected_amount: Math.round(amount) }
        });

        // Surface specific Xendit errors
        let msg = 'Gagal membuat Virtual Account';
        if (xenditErr?.error_code === 'BANK_NOT_ACTIVATED_ERROR') {
            msg = `Bank ${normalizedBankCode} belum diaktifkan. Silakan pilih bank lain.`;
        } else if (xenditErr?.errors?.length) {
            msg = xenditErr.errors.map(e => e.message).join('; ');
        } else if (xenditErr?.message) {
            msg = xenditErr.message;
        } else if (error.message) {
            msg = error.message;
        }
        throw new Error(msg);
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

        // v3 payment requests have IDs starting with 'pr_' or 'pr-'
        const isV3 = xenditId.startsWith('pr_') || xenditId.startsWith('pr-');

        if (isV3) {
            response = await api.get(`/payment_requests/${xenditId}`);
            const data = response.data;

            // Map v3 statuses to our standard statuses
            let status = 'pending';
            if (data.status === 'SUCCEEDED') {
                status = 'paid';
            } else if (data.status === 'FAILED') {
                status = 'failed';
            } else if (data.status === 'EXPIRED' || data.status === 'VOIDED') {
                status = 'expired';
            }
            // PENDING, REQUIRES_ACTION, AWAITING_CAPTURE remain 'pending'

            return {
                success: true,
                xendit_id: xenditId,
                status: status,
                amount: data.amount,
                paid_amount: status === 'paid' ? data.amount : 0,
                paid_at: data.updated || null,
                api_version: 'v3',
                raw_response: data
            };
        }

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
    // v3 Payment Request webhook (event: payment.succeeded, payment.failed, etc.)
    if (payload.data?.payment_request_id || payload.data?.payment_method?.type === 'QR_CODE') {
        const data = payload.data || {};
        const isQris = data.payment_method?.type === 'QR_CODE' ||
                       data.payment_method?.qr_code?.channel_code === 'QRIS';

        let status = 'pending';
        if (payload.event === 'payment.succeeded' || data.status === 'SUCCEEDED') {
            status = 'paid';
        } else if (payload.event === 'payment.failed' || data.status === 'FAILED') {
            status = 'failed';
        } else if (data.status === 'EXPIRED' || data.status === 'VOIDED') {
            status = 'expired';
        }

        return {
            type: isQris ? 'qris' : 'v3_payment',
            event: payload.event || 'payment.succeeded',
            xendit_id: data.payment_request_id || data.id,
            reference_id: data.reference_id,
            amount: data.amount,
            paid_at: data.updated || data.created || new Date().toISOString(),
            status: status,
            api_version: 'v3'
        };
    }

    // QRIS webhook (legacy /qr_codes)
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
        // BCA not activated in Xendit dashboard - uncomment when activated
        // {
        //     code: 'va_bca',
        //     name: 'Virtual Account BCA',
        //     description: 'Transfer via Bank Central Asia',
        //     icon: 'fas fa-university',
        //     bank_code: 'BCA',
        //     expiry_hours: XENDIT_CONFIG.vaExpiryHours
        // },
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
    createPaymentRequestV3,
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
