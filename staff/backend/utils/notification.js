/**
 * Notification Service
 * Email and WhatsApp notification system
 */

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('./logger');
const EmailTemplateService = require('../services/EmailTemplateService');

class NotificationService {
    constructor() {
        // Email configuration
        this.emailEnabled = process.env.EMAIL_ENABLED === 'true';
        this.emailTransporter = null;
        this.emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
        this.emailPort = parseInt(process.env.EMAIL_PORT, 10) || 587;
        this.emailSecure = process.env.EMAIL_SECURE === 'true';
        this.emailFromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
        this.emailReplyTo = process.env.EMAIL_REPLY_TO || null;

        if (this.emailEnabled) {
            const transportConfig = {
                host: this.emailHost,
                port: this.emailPort,
                secure: this.emailSecure,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            };

            if (process.env.EMAIL_TLS_REJECT_UNAUTHORIZED === 'false') {
                transportConfig.tls = { rejectUnauthorized: false };
            }

            this.emailTransporter = nodemailer.createTransport(transportConfig);

            logger.info('SMTP transporter configured', {
                host: this.emailHost,
                port: this.emailPort,
                secure: this.emailSecure,
                user: process.env.EMAIL_USER,
                from: this.emailFromAddress
            });

            this.emailTransporter.verify().then(() => {
                logger.info('SMTP transporter verification succeeded', {
                    host: this.emailHost,
                    user: process.env.EMAIL_USER
                });
            }).catch(error => {
                logger.error('SMTP transporter verification failed', {
                    host: this.emailHost,
                    user: process.env.EMAIL_USER,
                    error: error.message
                });
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

        // Simple in-memory cache for templates
        this.templateCache = new Map();
        this.senderCache = { value: null, expiresAt: 0 };
        this.cacheTtlMs = 5 * 60 * 1000; // 5 minutes
    }

    invalidateTemplateCache() {
        this.templateCache.clear();
        this.senderCache = { value: null, expiresAt: 0 };
    }

    buildFrontendUrl(pathFragment = '') {
        const base = (process.env.FRONTEND_URL || 'https://dokterdibya.com').replace(/\/$/, '');
        const normalizedPath = pathFragment ? (pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`) : '';
        return `${base}${normalizedPath}`;
    }

    createPlaceholderValue(value) {
        if (value == null) {
            return { text: '', html: '' };
        }

        if (typeof value === 'object' && (value.text != null || value.html != null)) {
            return {
                text: value.text != null ? String(value.text) : value.html != null ? String(value.html) : '',
                html: value.html != null ? String(value.html) : value.text != null ? String(value.text) : ''
            };
        }

        return { text: String(value), html: String(value) };
    }

    convertCustomPlaceholders(custom = {}) {
        const result = {};
        Object.entries(custom || {}).forEach(([key, value]) => {
            if (value == null) {
                return;
            }

            if (typeof value === 'object' && (value.text != null || value.html != null)) {
                result[key] = this.createPlaceholderValue(value);
                return;
            }

            if (typeof value === 'string' && (key.endsWith('_link') || key.endsWith('_url'))) {
                result[key] = {
                    text: value,
                    html: `<a href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>`
                };
                return;
            }

            result[key] = this.createPlaceholderValue(value);
        });
        return result;
    }

    async buildPlaceholderMap(custom = {}) {
        const clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        const senderName = await this.getSenderName();

        const basePlaceholders = {
            clinic_name: this.createPlaceholderValue(clinicName),
            sender_name: this.createPlaceholderValue(senderName)
        };

        return {
            ...basePlaceholders,
            ...this.convertCustomPlaceholders(custom)
        };
    }

    applyTemplate(template, placeholders, variant = 'text') {
        if (!template) {
            return '';
        }

        return template.replace(/\{([\w.]+)\}/g, (_, key) => {
            const value = placeholders[key];
            if (!value) {
                return '';
            }

            if (typeof value === 'string') {
                return value;
            }

            if (typeof value === 'object') {
                return value[variant] ?? value.text ?? value.html ?? '';
            }

            return '';
        });
    }

    formatHtmlBody(content) {
        const normalized = (content || '').replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');
        const htmlLines = lines.map(line => {
            if (!line.trim()) {
                return '<br>';
            }
            return line.replace(/ {2}/g, '&nbsp;&nbsp;');
        });

        return `<div style="font-family: Arial, sans-serif; line-height: 1.6; white-space: normal;">${htmlLines.join('<br>')}</div>`;
    }

    async getSenderProfile(force = false) {
        const now = Date.now();
        if (!force && this.senderCache.value && this.senderCache.expiresAt > now) {
            return this.senderCache.value;
        }

        const profile = await EmailTemplateService.getSenderProfile();
        this.senderCache = {
            value: profile,
            expiresAt: now + this.cacheTtlMs
        };

        return profile;
    }

    async getSenderName(force = false) {
        const profile = await this.getSenderProfile(force);
        return profile.senderName;
    }

    async getReplyTo(force = false) {
        const profile = await this.getSenderProfile(force);
        return profile.replyTo;
    }

    async getTemplate(templateKey, force = false) {
        const now = Date.now();
        const cached = this.templateCache.get(templateKey);
        if (!force && cached && cached.expiresAt > now) {
            return cached.value;
        }

        const template = await EmailTemplateService.getTemplate(templateKey);
        this.templateCache.set(templateKey, {
            value: template,
            expiresAt: now + this.cacheTtlMs
        });

        return template;
    }

    async renderTemplate(templateKey, placeholders = {}, overrides = {}) {
        const template = await this.getTemplate(templateKey);
        const placeholderMap = await this.buildPlaceholderMap(placeholders);

        const subjectTemplate = overrides.subject || template.subject;
        const bodyTemplate = overrides.body || template.body;

        const subject = this.applyTemplate(subjectTemplate, placeholderMap, 'text').trim();
        const textBody = this.applyTemplate(bodyTemplate, placeholderMap, 'text');
        const htmlRaw = this.applyTemplate(bodyTemplate, placeholderMap, 'html');
        const htmlBody = this.formatHtmlBody(htmlRaw);

        return {
            subject,
            text: textBody,
            html: htmlBody,
            senderName: placeholderMap.sender_name?.text || (await this.getSenderName())
        };
    }

    /**
     * Send email notification
     */
    async sendEmail({ to, subject, text, html, senderName }) {
        if (!this.emailEnabled) {
            logger.warn('Email notifications disabled');
            return { success: false, message: 'Email disabled' };
        }

        const resolvedSender = senderName || await this.getSenderName();
        const replyTo = (await this.getReplyTo()) || this.emailReplyTo;
        const fromAddress = this.emailFromAddress || process.env.EMAIL_USER;

        try {
            const info = await this.emailTransporter.sendMail({
                from: `"${resolvedSender || process.env.CLINIC_NAME || 'Klinik Dr. Dibya'}" <${fromAddress}>`,
                to,
                subject,
                text,
                html,
                replyTo: replyTo || undefined
            });

            logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error('Failed to send email', { to, subject, error: error.message });
            return { success: false, error: error.message };
        }
    }

    async sendTemplateEmail(templateKey, { to, placeholders = {}, overrides = {} } = {}) {
        if (!to) {
            throw new Error('Target email address is required');
        }

        const rendered = await this.renderTemplate(templateKey, placeholders, overrides);
        return this.sendEmail({
            to,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            senderName: rendered.senderName
        });
    }

    buildVerificationLink({ token, email }) {
        const base = this.buildFrontendUrl('verify-email.html');
        const params = new URLSearchParams({ token });
        if (email) {
            params.set('email', email);
        }
        return `${base}?${params.toString()}`;
    }

    buildResetLink({ token, email }) {
        const base = this.buildFrontendUrl('reset-password.html');
        const params = new URLSearchParams({ token });
        if (email) {
            params.set('email', email);
        }
        return `${base}?${params.toString()}`;
    }

    async sendVerificationEmail({ to, userName, email, verificationCode, verificationLink } = {}) {
        if (!to) {
            throw new Error('Target email address is required');
        }

        if (!verificationCode) {
            throw new Error('Verification code is required');
        }

        const link = verificationLink || this.buildVerificationLink({ token: verificationCode, email });

        return this.sendTemplateEmail(EmailTemplateService.TEMPLATE_KEYS.VERIFICATION, {
            to,
            placeholders: {
                user_name: userName || email || 'Pengguna',
                verification_code: verificationCode,
                verification_link: link
            }
        });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(to, token, options = {}) {
        if (!to) {
            throw new Error('Target email address is required');
        }

        if (!token) {
            throw new Error('Reset token is required');
        }

        const resetLink = options.resetLink || this.buildResetLink({ token, email: options.email || to });
        const name = options.patientName || options.userName || options.fullName || '';

        return this.sendTemplateEmail(EmailTemplateService.TEMPLATE_KEYS.PASSWORD_RESET, {
            to,
            placeholders: {
                user_name: name || to,
                reset_code: token,
                reset_link: resetLink
            }
        });
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
        if (!this.whatsappEnabled) {
            logger.warn('SMS notifications disabled');
            return { success: false, message: 'SMS disabled' };
        }

        try {
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

    async testEmail(to) {
        const clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        const subject = `Test Email - ${clinicName}`;
        const text = 'Ini adalah email percobaan untuk memastikan konfigurasi SMTP bekerja.';
        const html = this.formatHtmlBody(text);
        return this.sendEmail({ to, subject, text, html });
    }

    async testWhatsApp(phone) {
        return this.sendWhatsApp(phone, 'Ini adalah pesan percobaan untuk memastikan konfigurasi WhatsApp berjalan.');
    }

    async sendAppointmentReminder(appointment = {}) {
        if (!appointment.patient_email) {
            logger.warn('Cannot send appointment reminder without patient email', { appointmentId: appointment.id });
            return { success: false, message: 'Missing patient email' };
        }

        const clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        const patientName = appointment.patient_name || appointment.name || 'Pasien';

        let scheduleInfo = 'jadwal Anda';
        if (appointment.appointment_date) {
            const date = new Date(appointment.appointment_date);
            scheduleInfo = date.toLocaleString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        const subject = `Pengingat Janji Temu ${clinicName}`;
        const text = `Halo ${patientName},\n\nIni adalah pengingat janji temu Anda pada ${scheduleInfo}.\n\nTerima kasih,\n${clinicName}`;
        const html = this.formatHtmlBody(text);

        return this.sendEmail({
            to: appointment.patient_email,
            subject,
            text,
            html
        });
    }

    async sendLowStockAlert(items = []) {
        if (items.length === 0) {
            return { success: false, message: 'No low stock items' };
        }

        const clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        const subject = `Peringatan Stok Rendah - ${clinicName}`;

        const lines = items.map(item => `- ${item.name || item.item_name || 'Item'} (Sisa: ${item.stock || item.remaining || 0})`);
        const text = `Berikut daftar stok yang menipis:\n\n${lines.join('\n')}\n\nSegera lakukan restock.`;
        const html = this.formatHtmlBody(text);

        const targetEmail = process.env.INVENTORY_ALERT_EMAIL || process.env.EMAIL_USER;
        if (!targetEmail) {
            logger.warn('No target email configured for low stock alert');
            return { success: false, message: 'No target email configured' };
        }

        return this.sendEmail({ to: targetEmail, subject, text, html });
    }

    async sendVisitSummary(visit = {}, patient = {}) {
        if (!patient.email) {
            logger.warn('Cannot send visit summary without patient email', { visitId: visit.id, patientId: patient.id });
            return { success: false, message: 'Missing patient email' };
        }

        const clinicName = process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
        const subject = `Ringkasan Kunjungan - ${clinicName}`;

        const visitDate = visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'kunjungan terbaru Anda';

        const text = `Halo ${patient.full_name || patient.name || 'Pasien'},\n\nTerima kasih telah berkunjung pada ${visitDate}.\nJika Anda memiliki pertanyaan lebih lanjut, silakan hubungi kami.\n\nSalam,\n${clinicName}`;
        const html = this.formatHtmlBody(text);

        return this.sendEmail({ to: patient.email, subject, text, html });
    }
}

module.exports = new NotificationService();
