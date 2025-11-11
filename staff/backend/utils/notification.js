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
            // Format phone number
            const formattedTo = to.startsWith('+') ? to : `+62${to.replace(/^0/, '')}`;
            
            const result = await this.twilioClient.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
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
     * Send appointment reminder
     */
    async sendAppointmentReminder(appointment) {
        const { patient_name, appointment_date, phone } = appointment;
        const date = new Date(appointment_date);
        const dateStr = date.toLocaleDateString('id-ID', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        const message = `Halo ${patient_name},\n\nIni pengingat untuk janji temu Anda di Klinik Dr. Dibya:\n\nTanggal: ${dateStr}\nWaktu: Sesuai jadwal\n\nMohon datang 10 menit lebih awal.\n\nTerima kasih,\nKlinik Dr. Dibya`;
        
        // Send via WhatsApp if phone available
        if (phone) {
            await this.sendWhatsApp(phone, message);
        }
        
        logger.info('Appointment reminder sent', { patientName: patient_name, appointmentDate: appointment_date });
    }
    
    /**
     * Send low stock alert
     */
    async sendLowStockAlert(items) {
        const subject = '⚠️ Peringatan Stok Obat Rendah';
        
        let text = 'Obat-obatan berikut memiliki stok rendah:\n\n';
        let html = '<h2>Peringatan Stok Obat Rendah</h2><table border="1" cellpadding="10"><tr><th>Nama Obat</th><th>Stok Saat Ini</th><th>Stok Minimum</th></tr>';
        
        items.forEach(item => {
            text += `- ${item.name}: ${item.stock} ${item.unit} (min: ${item.min_stock})\n`;
            html += `<tr><td>${item.name}</td><td>${item.stock} ${item.unit}</td><td>${item.min_stock}</td></tr>`;
        });
        
        html += '</table><p>Mohon segera lakukan pemesanan ulang.</p>';
        
        // Send to admin email
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
            await this.sendEmail({
                to: adminEmail,
                subject,
                text,
                html
            });
        }
        
        logger.info('Low stock alert sent', { itemCount: items.length });
    }
    
    /**
     * Send visit summary to patient
     */
    async sendVisitSummary(visit, patient) {
        const subject = 'Ringkasan Kunjungan - Klinik Dr. Dibya';
        const visitDate = new Date(visit.visit_date).toLocaleDateString('id-ID');
        
        const html = `
            <h2>Ringkasan Kunjungan Anda</h2>
            <p>Halo ${patient.full_name},</p>
            <p>Terima kasih telah mengunjungi Klinik Dr. Dibya.</p>
            
            <h3>Detail Kunjungan:</h3>
            <ul>
                <li><strong>Tanggal:</strong> ${visitDate}</li>
                <li><strong>Dokter:</strong> ${visit.doctor_name || 'Dr. Dibya'}</li>
                <li><strong>Keluhan:</strong> ${visit.complaint || '-'}</li>
                <li><strong>Diagnosis:</strong> ${visit.diagnosis || '-'}</li>
            </ul>
            
            <p>Jika ada pertanyaan, silakan hubungi kami.</p>
            
            <p>Salam sehat,<br>
            <strong>Klinik Dr. Dibya</strong></p>
        `;
        
        const text = `Ringkasan Kunjungan\n\nTanggal: ${visitDate}\nDokter: ${visit.doctor_name}\nKeluhan: ${visit.complaint}\nDiagnosis: ${visit.diagnosis}`;
        
        // Send email if available
        // Note: Would need to add email field to patients table
        
        // Send WhatsApp if phone available
        if (patient.whatsapp) {
            const whatsappMsg = `Halo ${patient.full_name},\n\nTerima kasih telah berkunjung ke Klinik Dr. Dibya pada ${visitDate}.\n\nDokter: ${visit.doctor_name}\nDiagnosis: ${visit.diagnosis}\n\nSemoga lekas sembuh!`;
            await this.sendWhatsApp(patient.whatsapp, whatsappMsg);
        }
        
        logger.info('Visit summary sent', { patientId: patient.id, visitId: visit.id });
    }
    
    /**
     * Send OTP code
     */
    async sendOTP(phone, code) {
        const message = `Kode verifikasi Klinik Dr. Dibya Anda adalah: ${code}\n\nKode berlaku selama 5 menit.\nJangan bagikan kode ini kepada siapa pun.`;
        
        return await this.sendSMS(phone, message);
    }
    
    /**
     * Test email configuration
     */
    async testEmail(to) {
        return await this.sendEmail({
            to,
            subject: 'Test Email - Klinik Dr. Dibya',
            text: 'Ini adalah email test dari sistem Klinik Dr. Dibya.',
            html: '<h2>Test Email</h2><p>Sistem email berhasil dikonfigurasi!</p>'
        });
    }
    
    /**
     * Test WhatsApp configuration
     */
    async testWhatsApp(to) {
        return await this.sendWhatsApp(to, 'Test pesan dari Klinik Dr. Dibya. Sistem WhatsApp berhasil dikonfigurasi!');
    }
}

module.exports = new NotificationService();
