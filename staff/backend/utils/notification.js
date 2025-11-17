/**
 * Notification Service
 * Email and WhatsApp notification system
 */

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('./logger');

class NotificationService {
    constructor() {
        // Email configuration
        this.emailEnabled = process.env.EMAIL_ENABLED === 'true';
        this.emailTransporter = null;
        
        if (this.emailEnabled) {
            this.emailTransporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.EMAIL_PORT) || 587,
                secure: process.env.EMAIL_SECURE === 'true',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });
        }
        
        // WhatsApp/SMS configuration (Twilio)
        this.whatsappEnabled = process.env.WHATSAPP_ENABLED === 'true';
        this.twilioClient = null;
        
        if (this.whatsappEnabled) {
            this.twilioClient = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
        }
    }
    
    /**
     * Send email notification
     */
    async sendEmail({ to, subject, text, html }) {
        if (!this.emailEnabled) {
            logger.warn('Email notifications disabled');
            return { success: false, message: 'Email disabled' };
        }
        
        try {
            const info = await this.emailTransporter.sendMail({
                from: `"${process.env.CLINIC_NAME || 'Klinik Dr. Dibya'}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                text,
                html
            });
            
            logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error('Failed to send email', { to, subject, error: error.message });
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Send WhatsApp message via Twilio
     */
    async sendWhatsApp(to, message) {
        if (!this.whatsappEnabled) {
            logger.warn('WhatsApp notifications disabled');
            return { success: false, message: 'WhatsApp disabled' };
        }
        
        try {
            // Format phone number for WhatsApp
            const formattedTo = to.startsWith('+') ? `whatsapp:${to}` : `whatsapp:+62${to.replace(/^0/, '')}`;
            const from = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
            
            const result = await this.twilioClient.messages.create({
                from,
                to: formattedTo,
                body: message
            });
            
            logger.info('WhatsApp sent successfully', { to, sid: result.sid });
            return { success: true, sid: result.sid };
        } catch (error) {
            logger.error('Failed to send WhatsApp', { to, error: error.message });
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Send SMS via Twilio
     */
    async sendSMS(to, message) {
        if (!this.whatsappEnabled) { // Use same config as WhatsApp
            logger.warn('SMS notifications disabled');
            return { success: false, message: 'SMS disabled' };
        }
        
        try {
            // Format phone number for SMS
            const formattedTo = to.startsWith('+') ? to : `+62${to.replace(/^0/, '')}`;
            
            const result = await this.twilioClient.messages.create({
                from: process.env.TWILIO_SMS_NUMBER,
                to: formattedTo,
                body: message
            });
            
            logger.info('SMS sent successfully', { to, sid: result.sid });
            return { success: true, sid: result.sid };
        } catch (error) {
            logger.error('Failed to send SMS', { to, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(to, token) {
        const resetLink = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;
        const subject = `Reset Password Anda untuk ${process.env.CLINIC_NAME}`;
        const text = `Anda meminta untuk mereset password Anda. Silakan gunakan token berikut untuk mereset password Anda: ${token}. Atau klik link ini: ${resetLink}`;
        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Reset Password untuk Akun ${process.env.CLINIC_NAME} Anda</h2>
                <p>Halo,</p>
                <p>Kami menerima permintaan untuk mereset password akun Anda. Silakan klik tombol di bawah ini untuk melanjutkan.</p>
                <p>Jika Anda tidak merasa meminta ini, Anda bisa mengabaikan email ini.</p>
                <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: #fff; background-color: #007bff; text-decoration: none; border-radius: 5px;">Reset Password Sekarang</a>
                <p style="font-size: 12px; color: #666;">Tombol ini akan kedaluwarsa dalam 1 jam.</p>
                <hr>
                <p style="font-size: 12px; color: #666;">Jika tombol di atas tidak berfungsi, silakan salin dan tempel URL berikut di browser Anda:</p>
                <p style="font-size: 12px; color: #666;"><a href="${resetLink}">${resetLink}</a></p>
                <hr>
                <p>Terima kasih,</p>
                <p>Tim ${process.env.CLINIC_NAME}</p>
            </div>
        `;

        return this.sendEmail({ to, subject, text, html });
    }
}

module.exports = new NotificationService();
