/**
 * WhatsApp Service
 * Supports multiple methods:
 * 1. wa.me links (free, manual click)
 * 2. Fonnte API (automatic, requires API key)
 * 3. Twilio (automatic, requires account)
 */

const logger = require('../utils/logger');

class WhatsAppService {
    constructor() {
        this.fonnte = {
            enabled: !!process.env.FONNTE_TOKEN,
            token: process.env.FONNTE_TOKEN,
            apiUrl: 'https://api.fonnte.com/send'
        };

        this.twilio = {
            enabled: process.env.WHATSAPP_ENABLED === 'true',
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER
        };

        this.clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        this.baseUrl = process.env.FRONTEND_URL || 'https://dokterdibya.com';
    }

    /**
     * Format phone number to Indonesian format
     */
    formatPhoneNumber(phone) {
        if (!phone) return null;

        // Remove all non-digits
        let cleaned = phone.replace(/\D/g, '');

        // Handle various formats
        if (cleaned.startsWith('62')) {
            return cleaned;
        } else if (cleaned.startsWith('0')) {
            return '62' + cleaned.substring(1);
        } else if (cleaned.startsWith('8')) {
            return '62' + cleaned;
        }

        return cleaned;
    }

    /**
     * Generate wa.me link (click to open WhatsApp with pre-filled message)
     */
    generateWaLink(phone, message) {
        const formattedPhone = this.formatPhoneNumber(phone);
        if (!formattedPhone) return null;

        const encodedMessage = encodeURIComponent(message);
        return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    }

    /**
     * Generate document notification message
     */
    generateDocumentMessage(patientName, documents, portalUrl) {
        const docList = documents.map(d => `- ${d.title}`).join('\n');

        return `Halo ${patientName},

Dokter Anda telah mengirimkan dokumen medis:

${docList}

Silakan akses dokumen Anda di:
${portalUrl}

Terima kasih,
${this.clinicName}`;
    }

    /**
     * Send via Fonnte API (automatic)
     */
    async sendViaFonnte(phone, message) {
        if (!this.fonnte.enabled) {
            logger.warn('Fonnte not configured - FONNTE_TOKEN not set');
            return { success: false, method: 'fonnte', error: 'Fonnte not configured' };
        }

        try {
            const formattedPhone = this.formatPhoneNumber(phone);
            logger.info('Sending WhatsApp via Fonnte', {
                phone: formattedPhone,
                tokenPrefix: this.fonnte.token?.substring(0, 5) + '...'
            });

            const response = await fetch(this.fonnte.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': this.fonnte.token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    target: formattedPhone,
                    message: message,
                    countryCode: '62'
                })
            });

            const result = await response.json();
            logger.info('Fonnte API response', { status: result.status, reason: result.reason });

            if (result.status) {
                logger.info('WhatsApp sent via Fonnte successfully', { phone: formattedPhone, messageId: result.id });
                return { success: true, method: 'fonnte', messageId: result.id };
            } else {
                logger.warn('Fonnte API returned error', { reason: result.reason });
                throw new Error(result.reason || 'Fonnte API error');
            }
        } catch (error) {
            logger.error('Fonnte send failed', { phone, error: error.message });
            return { success: false, method: 'fonnte', error: error.message };
        }
    }

    /**
     * Send document notification to patient
     */
    async sendDocumentNotification({ phone, patientName, documents, shareToken }) {
        if (!phone) {
            return { success: false, error: 'Phone number required' };
        }

        // Generate portal URL
        const portalUrl = shareToken
            ? `${this.baseUrl}/shared-document/${shareToken}`
            : `${this.baseUrl}/patient-dashboard.html`;

        // Generate message
        const message = this.generateDocumentMessage(patientName, documents, portalUrl);

        // Try automatic sending first (Fonnte)
        if (this.fonnte.enabled) {
            const result = await this.sendViaFonnte(phone, message);
            if (result.success) {
                return result;
            }
        }

        // Fallback to wa.me link (manual)
        const waLink = this.generateWaLink(phone, message);

        return {
            success: true,
            method: 'manual',
            waLink,
            message,
            note: 'Klik link untuk membuka WhatsApp dan kirim pesan'
        };
    }

    /**
     * Check service status
     */
    getStatus() {
        return {
            fonnte: {
                enabled: this.fonnte.enabled,
                configured: !!this.fonnte.token
            },
            twilio: {
                enabled: this.twilio.enabled,
                configured: !!this.twilio.accountSid
            },
            fallback: 'wa.me links always available'
        };
    }
}

module.exports = new WhatsAppService();
