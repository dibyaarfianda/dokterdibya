/**
 * Subscriptions Route - Tanya dr. Dibya Premium
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

const TIER_CONFIG = {
    'first_class': { name: 'Premium First-Class', questions_per_week: 3, price: 50000, description: '3 pertanyaan per minggu' },
    'executive': { name: 'Premium Executive-Class', questions_per_week: 5, price: 100000, description: '5 pertanyaan per minggu', popular: true },
    'vip': { name: 'Premium VIP', questions_per_week: 10, price: 200000, description: '10 pertanyaan per minggu + Bonus fitur eksklusif' }
};

const PAYMENT_METHOD_LABELS = {
    'ovo': 'OVO', 'gopay': 'GoPay', 'bank_transfer_bca': 'Transfer Bank BCA', 'credit_card': 'Kartu Kredit'
};

function generateOrderId(patientId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'SUB-' + patientId.substring(0, 8) + '-' + timestamp + '-' + random;
}

function calculateNextBillingDate(billingDay) {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    if (nextMonth.getDate() !== billingDay) nextMonth.setDate(0);
    return nextMonth.toISOString().split('T')[0];
}

router.get('/tiers', verifyPatientToken, async (req, res) => {
    try {
        const tiers = Object.entries(TIER_CONFIG).map(([key, config]) => ({ tier: key, ...config }));
        res.json({ success: true, tiers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/my', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient.id;
        const [subscriptions] = await db.query('SELECT * FROM tanya_subscriptions WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1', [patientId]);
        const subscription = subscriptions[0] || null;
        const [payments] = await db.query('SELECT * FROM tanya_payments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 10', [patientId]);
        if (subscription && subscription.tier !== 'free') subscription.tier_config = TIER_CONFIG[subscription.tier];
        res.json({ success: true, subscription, payments, payment_methods: PAYMENT_METHOD_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/subscribe', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient.id;
        const { tier, payment_method } = req.body;
        if (!TIER_CONFIG[tier]) return res.status(400).json({ success: false, message: 'Paket langganan tidak valid' });
        if (!['ovo', 'gopay', 'bank_transfer_bca', 'credit_card'].includes(payment_method)) return res.status(400).json({ success: false, message: 'Metode pembayaran tidak valid' });

        const tierConfig = TIER_CONFIG[tier];
        const billingDay = new Date().getDate();
        const nextBillingDate = calculateNextBillingDate(billingDay);

        const [existing] = await db.query('SELECT id FROM tanya_subscriptions WHERE patient_id = ? AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())', [patientId]);
        let subscriptionId;

        if (existing.length > 0) {
            subscriptionId = existing[0].id;
        } else {
            const [result] = await db.query('INSERT INTO tanya_subscriptions (patient_id, tier, questions_per_week, price_monthly, billing_day, next_billing_date, is_active, auto_renew, last_payment_method) VALUES (?, ?, ?, ?, ?, ?, FALSE, TRUE, ?)', [patientId, tier, tierConfig.questions_per_week, tierConfig.price, billingDay, nextBillingDate, payment_method]);
            subscriptionId = result.insertId;
        }

        const orderId = generateOrderId(patientId);
        const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        let paymentData = { order_id: orderId, amount: tierConfig.price, payment_method, expired_at: expiredAt };

        if (payment_method === 'bank_transfer_bca') {
            paymentData.va_number = '8277' + patientId.replace(/\D/g, '').substring(0, 10).padEnd(10, '0');
        }

        await db.query('INSERT INTO tanya_payments (subscription_id, patient_id, order_id, amount, payment_method, payment_status, va_number, expired_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [subscriptionId, patientId, orderId, tierConfig.price, payment_method, 'pending', paymentData.va_number || null, expiredAt]);

        let paymentInstructions = '';
        if (payment_method === 'bank_transfer_bca') {
            paymentInstructions = '1. Buka aplikasi m-BCA atau BCA Mobile\n2. Pilih Transfer > BCA Virtual Account\n3. Masukkan nomor VA: ' + paymentData.va_number + '\n4. Konfirmasi jumlah Rp ' + tierConfig.price.toLocaleString('id-ID') + ' dan bayar';
        } else if (payment_method === 'gopay') {
            paymentInstructions = 'Anda akan diarahkan ke aplikasi GoPay untuk menyelesaikan pembayaran.';
        } else if (payment_method === 'ovo') {
            paymentInstructions = 'Anda akan menerima notifikasi di aplikasi OVO untuk menyelesaikan pembayaran.';
        } else if (payment_method === 'credit_card') {
            paymentInstructions = 'Anda akan diarahkan ke halaman pembayaran kartu kredit yang aman.';
        }

        res.json({ success: true, message: 'Silakan selesaikan pembayaran', payment: { ...paymentData, tier, tier_name: tierConfig.name, instructions: paymentInstructions, expired_at_formatted: expiredAt.toLocaleString('id-ID') } });
    } catch (error) {
        console.error('Error subscribing:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/payment/:orderId', verifyPatientToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const [payments] = await db.query('SELECT tp.*, ts.tier, ts.questions_per_week FROM tanya_payments tp JOIN tanya_subscriptions ts ON tp.subscription_id = ts.id WHERE tp.order_id = ? AND tp.patient_id = ?', [orderId, req.patient.id]);
        if (payments.length === 0) return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
        const payment = payments[0];
        if (payment.tier && TIER_CONFIG[payment.tier]) payment.tier_config = TIER_CONFIG[payment.tier];
        res.json({ success: true, payment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/payments', verifyPatientToken, async (req, res) => {
    try {
        const [payments] = await db.query('SELECT tp.*, ts.tier FROM tanya_payments tp JOIN tanya_subscriptions ts ON tp.subscription_id = ts.id WHERE tp.patient_id = ? ORDER BY tp.created_at DESC', [req.patient.id]);
        for (const p of payments) {
            if (p.tier && TIER_CONFIG[p.tier]) p.tier_name = TIER_CONFIG[p.tier].name;
            p.payment_method_label = PAYMENT_METHOD_LABELS[p.payment_method];
        }
        res.json({ success: true, payments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/cancel', verifyPatientToken, async (req, res) => {
    try {
        const [result] = await db.query('UPDATE tanya_subscriptions SET auto_renew = FALSE WHERE patient_id = ? AND is_active = TRUE', [req.patient.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Tidak ada langganan aktif' });
        res.json({ success: true, message: 'Perpanjangan otomatis telah dibatalkan. Langganan Anda tetap aktif sampai tanggal berakhir.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/webhook', async (req, res) => {
    try {
        const { order_id, transaction_status, fraud_status, transaction_id, status_code } = req.body;
        console.log('Webhook:', { order_id, transaction_status, fraud_status });
        const [payments] = await db.query('SELECT tp.*, ts.patient_id, ts.tier, ts.questions_per_week, ts.billing_day FROM tanya_payments tp JOIN tanya_subscriptions ts ON tp.subscription_id = ts.id WHERE tp.order_id = ?', [order_id]);
        if (payments.length === 0) return res.status(404).json({ error: 'Payment not found' });
        const payment = payments[0];

        if ((transaction_status === 'capture' || transaction_status === 'settlement') && (fraud_status === 'accept' || !fraud_status)) {
            await handlePaymentSuccess(payment, transaction_id, status_code);
        } else if (transaction_status === 'expire') {
            await db.query('UPDATE tanya_payments SET payment_status = ? WHERE id = ?', ['expired', payment.id]);
        } else if (transaction_status === 'cancel' || transaction_status === 'deny') {
            await db.query('UPDATE tanya_payments SET payment_status = ? WHERE id = ?', ['failed', payment.id]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function handlePaymentSuccess(payment, transactionId, statusCode) {
    await db.query('UPDATE tanya_payments SET payment_status = ?, paid_at = NOW(), midtrans_transaction_id = ?, midtrans_status_code = ? WHERE id = ?', ['paid', transactionId, statusCode, payment.id]);
    const newExpiryDate = new Date(); newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
    const nextBillingDate = calculateNextBillingDate(payment.billing_day);
    await db.query('UPDATE tanya_subscriptions SET is_active = TRUE, tier = ?, questions_per_week = ?, expires_at = ?, next_billing_date = ? WHERE id = ?', [payment.tier, payment.questions_per_week, newExpiryDate, nextBillingDate, payment.subscription_id]);
    await db.query('INSERT INTO patient_notifications (patient_id, type, title, message, data, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [payment.patient_id, 'payment_success', 'Pembayaran Berhasil', 'Langganan Premium Anda telah aktif!', JSON.stringify({ orderId: payment.order_id, tier: payment.tier })]);
}

router.post('/simulate-payment', verifyPatientToken, async (req, res) => {
    try {
        const { order_id } = req.body;
        const [payments] = await db.query('SELECT tp.*, ts.tier, ts.questions_per_week, ts.billing_day FROM tanya_payments tp JOIN tanya_subscriptions ts ON tp.subscription_id = ts.id WHERE tp.order_id = ? AND tp.patient_id = ? AND tp.payment_status = ?', [order_id, req.patient.id, 'pending']);
        if (payments.length === 0) return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan atau sudah diproses' });
        await handlePaymentSuccess(payments[0], 'SIMULATED-' + Date.now(), '200');
        res.json({ success: true, message: 'Pembayaran berhasil (simulasi)' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
