/**
 * Subscription Routes
 * Handles patient subscriptions with Midtrans payment gateway
 * Supports: GoPay, OVO
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Midtrans configuration - UPDATE THESE WITH YOUR KEYS
const MIDTRANS_CONFIG = {
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'YOUR_SERVER_KEY',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || 'YOUR_CLIENT_KEY',
    isProduction: process.env.MIDTRANS_PRODUCTION === 'true',
    get baseUrl() {
        return this.isProduction
            ? 'https://app.midtrans.com/snap/v1'
            : 'https://app.sandbox.midtrans.com/snap/v1';
    },
    get coreApiUrl() {
        return this.isProduction
            ? 'https://api.midtrans.com/v2'
            : 'https://api.sandbox.midtrans.com/v2';
    }
};

// Subscription plans
const PLANS = {
    gallery_kenangan: {
        monthly: {
            name: 'Gallery Kenangan - Bulanan',
            amount: 10000,
            duration_days: 30,
            features: [
                'Gallery 4D USG dengan tema cantik',
                '3 pilihan tema: Rose, Sage, Sky',
                'Background musik yang menenangkan',
                'Download & bagikan momen spesial',
                'Lightbox dengan zoom detail'
            ]
        }
    }
};

/**
 * GET /api/subscriptions/plans
 * Get available subscription plans
 */
router.get('/plans', (req, res) => {
    res.json({
        success: true,
        plans: PLANS
    });
});

/**
 * GET /api/subscriptions/status
 * Check current subscription status for logged-in patient
 */
router.get('/status', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Get active subscription
        const [subscriptions] = await db.query(`
            SELECT * FROM patient_subscriptions
            WHERE patient_id = ? AND status = 'active' AND end_date > NOW()
            ORDER BY end_date DESC
            LIMIT 1
        `, [patientId]);

        if (subscriptions.length === 0) {
            return res.json({
                success: true,
                hasSubscription: false,
                subscription: null
            });
        }

        res.json({
            success: true,
            hasSubscription: true,
            subscription: subscriptions[0]
        });

    } catch (error) {
        logger.error('Error checking subscription status:', error);
        res.status(500).json({ success: false, message: 'Failed to check subscription' });
    }
});

/**
 * POST /api/subscriptions/create
 * Create a new subscription and Midtrans transaction
 */
router.post('/create', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;
        const patientName = req.patient?.nama || req.patient?.name || 'Patient';
        const patientEmail = req.patient?.email || '';
        const patientPhone = req.patient?.no_hp || req.patient?.phone || '';

        const { feature = 'gallery_kenangan', plan_type = 'monthly' } = req.body;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Get plan details
        const plan = PLANS[feature]?.[plan_type];
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        // Check if already has active subscription
        const [existing] = await db.query(`
            SELECT * FROM patient_subscriptions
            WHERE patient_id = ? AND feature = ? AND status = 'active' AND end_date > NOW()
        `, [patientId, feature]);

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah memiliki langganan aktif',
                subscription: existing[0]
            });
        }

        // Generate unique order ID
        const orderId = `SUB-${patientId}-${Date.now()}`;

        // Create subscription record (pending)
        const [result] = await db.query(`
            INSERT INTO patient_subscriptions
            (patient_id, plan_type, feature, status, amount, order_id)
            VALUES (?, ?, ?, 'pending', ?, ?)
        `, [patientId, plan_type, feature, plan.amount, orderId]);

        // Create Midtrans Snap transaction
        const snapPayload = {
            transaction_details: {
                order_id: orderId,
                gross_amount: plan.amount
            },
            item_details: [{
                id: `${feature}_${plan_type}`,
                price: plan.amount,
                quantity: 1,
                name: plan.name
            }],
            customer_details: {
                first_name: patientName,
                email: patientEmail || `${patientId}@dokterdibya.com`,
                phone: patientPhone
            },
            enabled_payments: ['gopay', 'ovo', 'shopeepay', 'dana'],
            callbacks: {
                finish: `${process.env.APP_URL || 'https://dokterdibya.com'}/subscription-success.html`
            }
        };

        // Call Midtrans Snap API
        const auth = Buffer.from(MIDTRANS_CONFIG.serverKey + ':').toString('base64');

        const response = await fetch(`${MIDTRANS_CONFIG.baseUrl}/transactions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            body: JSON.stringify(snapPayload)
        });

        const snapResponse = await response.json();

        if (!response.ok || snapResponse.error_messages) {
            logger.error('Midtrans Snap error:', snapResponse);
            throw new Error(snapResponse.error_messages?.[0] || 'Failed to create payment');
        }

        logger.info('Subscription created', {
            orderId,
            patientId,
            snapToken: snapResponse.token?.substring(0, 20) + '...'
        });

        res.json({
            success: true,
            orderId,
            snapToken: snapResponse.token,
            redirectUrl: snapResponse.redirect_url,
            clientKey: MIDTRANS_CONFIG.clientKey,
            subscription: {
                id: result.insertId,
                plan: plan.name,
                amount: plan.amount,
                features: plan.features
            }
        });

    } catch (error) {
        logger.error('Error creating subscription:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create subscription'
        });
    }
});

/**
 * POST /api/subscriptions/notification
 * Midtrans webhook handler
 */
router.post('/notification', async (req, res) => {
    try {
        const notification = req.body;

        logger.info('Midtrans notification received:', {
            order_id: notification.order_id,
            transaction_status: notification.transaction_status,
            payment_type: notification.payment_type
        });

        // Verify signature
        const serverKey = MIDTRANS_CONFIG.serverKey;
        const signatureKey = crypto
            .createHash('sha512')
            .update(notification.order_id + notification.status_code + notification.gross_amount + serverKey)
            .digest('hex');

        if (notification.signature_key !== signatureKey) {
            logger.warn('Invalid Midtrans signature');
            return res.status(403).json({ success: false, message: 'Invalid signature' });
        }

        const orderId = notification.order_id;
        const transactionStatus = notification.transaction_status;
        const transactionId = notification.transaction_id;
        const paymentType = notification.payment_type;
        const grossAmount = parseFloat(notification.gross_amount);

        // Log payment
        await db.query(`
            INSERT INTO payment_logs
            (order_id, transaction_id, transaction_status, payment_type, gross_amount, raw_notification)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [orderId, transactionId, transactionStatus, paymentType, grossAmount, JSON.stringify(notification)]);

        // Get subscription
        const [subscriptions] = await db.query(
            'SELECT * FROM patient_subscriptions WHERE order_id = ?',
            [orderId]
        );

        if (subscriptions.length === 0) {
            logger.warn('Subscription not found for order:', orderId);
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        const subscription = subscriptions[0];

        // Handle transaction status
        let newStatus = subscription.status;
        let startDate = null;
        let endDate = null;

        if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
            // Payment successful
            newStatus = 'active';
            startDate = new Date();

            // Calculate end date based on plan
            const plan = PLANS[subscription.feature]?.[subscription.plan_type];
            if (plan) {
                endDate = new Date();
                endDate.setDate(endDate.getDate() + plan.duration_days);
            }

            // Update patient gallery access
            await db.query(`
                UPDATE patients
                SET gallery_access = 1, subscription_expires_at = ?
                WHERE id = ? OR patient_id = ?
            `, [endDate, subscription.patient_id, subscription.patient_id]);

            logger.info('Subscription activated:', { orderId, patientId: subscription.patient_id });

        } else if (transactionStatus === 'pending') {
            newStatus = 'pending';

        } else if (['deny', 'cancel', 'expire', 'failure'].includes(transactionStatus)) {
            newStatus = 'cancelled';
        }

        // Update subscription
        await db.query(`
            UPDATE patient_subscriptions
            SET status = ?,
                transaction_id = ?,
                payment_type = ?,
                transaction_status = ?,
                transaction_time = NOW(),
                start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date)
            WHERE order_id = ?
        `, [newStatus, transactionId, paymentType, transactionStatus, startDate, endDate, orderId]);

        // Link payment log to subscription
        await db.query(`
            UPDATE payment_logs
            SET subscription_id = ?
            WHERE order_id = ? AND subscription_id IS NULL
        `, [subscription.id, orderId]);

        res.json({ success: true });

    } catch (error) {
        logger.error('Error handling Midtrans notification:', error);
        res.status(500).json({ success: false, message: 'Internal error' });
    }
});

/**
 * GET /api/subscriptions/check/:orderId
 * Check payment status manually
 */
router.get('/check/:orderId', verifyPatientToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const patientId = req.patient?.patientId || req.patient?.id;

        // Verify ownership
        const [subscriptions] = await db.query(
            'SELECT * FROM patient_subscriptions WHERE order_id = ? AND patient_id = ?',
            [orderId, patientId]
        );

        if (subscriptions.length === 0) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }

        const subscription = subscriptions[0];

        // If already active, return immediately
        if (subscription.status === 'active') {
            return res.json({
                success: true,
                status: 'active',
                subscription
            });
        }

        // Check with Midtrans
        const auth = Buffer.from(MIDTRANS_CONFIG.serverKey + ':').toString('base64');

        const response = await fetch(`${MIDTRANS_CONFIG.coreApiUrl}/${orderId}/status`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Basic ${auth}`
            }
        });

        const statusResponse = await response.json();

        res.json({
            success: true,
            status: subscription.status,
            midtransStatus: statusResponse.transaction_status,
            subscription
        });

    } catch (error) {
        logger.error('Error checking payment status:', error);
        res.status(500).json({ success: false, message: 'Failed to check status' });
    }
});

/**
 * GET /api/subscriptions/history
 * Get subscription history for logged-in patient
 */
router.get('/history', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        const [subscriptions] = await db.query(`
            SELECT * FROM patient_subscriptions
            WHERE patient_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [patientId]);

        res.json({
            success: true,
            subscriptions
        });

    } catch (error) {
        logger.error('Error fetching subscription history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
});

module.exports = router;
