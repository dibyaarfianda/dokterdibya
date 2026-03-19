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
            enabled: process.env.FONNTE_ENABLED === 'true' && !!process.env.FONNTE_TOKEN,
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
            : `${this.baseUrl}/patient-menu.html`;

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

    // =====================================================
    // SURGERY-SPECIFIC MESSAGES
    // =====================================================

    static LOCATION_NAMES = {
        klinik_private: 'Klinik Privat',
        rsia_melinda: 'RSIA Melinda',
        rsud_gambiran: 'RSUD Gambiran',
        rs_bhayangkara: 'RS Bhayangkara'
    };

    /**
     * Send surgery confirmation to patient.
     * Returns result or safe fallback if not configured.
     */
    async sendSurgeryConfirmation(surgery, phone) {
        const locName = WhatsAppService.LOCATION_NAMES[surgery.location] || surgery.location;
        const dateObj = new Date(surgery.surgery_date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = surgery.surgery_time ? surgery.surgery_time.substring(0, 5) : '';

        const message = `Yth. ${surgery.patient_name},\n\n` +
            `Jadwal operasi Anda telah *dikonfirmasi*:\n\n` +
            `Tanggal: ${dateStr}\n` +
            (timeStr ? `Jam: ${timeStr} WIB\n` : '') +
            `Lokasi: ${locName}\n\n` +
            (surgery.npo_status ? `Catatan puasa: ${surgery.npo_status}\n\n` : '') +
            `Mohon hadir 1 jam sebelum jadwal operasi.\n\n` +
            `_${this.clinicName}_`;

        return this.sendViaFonnte(phone, message);
    }

    /**
     * Send surgery reminder (day before) to patient.
     */
    async sendSurgeryReminder(surgery, phone) {
        const locName = WhatsAppService.LOCATION_NAMES[surgery.location] || surgery.location;
        const timeStr = surgery.surgery_time ? surgery.surgery_time.substring(0, 5) : '';

        const message = `Yth. ${surgery.patient_name},\n\n` +
            `Pengingat: Anda memiliki jadwal operasi *besok*.\n\n` +
            (timeStr ? `Jam: ${timeStr} WIB\n` : '') +
            `Lokasi: ${locName}\n\n` +
            (surgery.npo_status ? `*Penting - Puasa:* ${surgery.npo_status}\n\n` : '') +
            `Mohon hadir 1 jam sebelum jadwal.\n\n` +
            `_${this.clinicName}_`;

        return this.sendViaFonnte(phone, message);
    }
}

module.exports = new WhatsAppService();
