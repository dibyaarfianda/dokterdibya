/**
 * PDF Service
 * Generate professional medical receipts and reports
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PDFService {
    constructor() {
        this.outputDir = path.join(__dirname, '../../pdf-output');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
    
    /**
     * Generate visit receipt
     */
    async generateVisitReceipt(visit, patient, items = []) {
        return new Promise(async (resolve, reject) => {
            try {
                const filename = `receipt_${visit.id}_${Date.now()}.pdf`;
                const filepath = path.join(this.outputDir, filename);
                
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const writeStream = fs.createWriteStream(filepath);
                
                doc.pipe(writeStream);
                
                // Header
                doc.fontSize(20).font('Helvetica-Bold')
                   .text('KLINIK DR. DIBYA', { align: 'center' });
                
                doc.fontSize(10).font('Helvetica')
                   .text(process.env.CLINIC_ADDRESS || 'Jl. Kesehatan No. 123', { align: 'center' })
                   .text(process.env.CLINIC_PHONE || 'Telp: (021) 12345678', { align: 'center' })
                   .moveDown();
                
                doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown();
                
                // Receipt title
                doc.fontSize(16).font('Helvetica-Bold')
                   .text('KWITANSI PEMBAYARAN', { align: 'center' });
                doc.moveDown();
                
                // Receipt info
                const visitDate = new Date(visit.visit_date);
                doc.fontSize(10).font('Helvetica');
                
                doc.text(`No. Kwitansi: ${String(visit.id).padStart(6, '0')}`, 50, doc.y);
                doc.text(`Tanggal: ${visitDate.toLocaleDateString('id-ID')}`, 350, doc.y - 12);
                doc.moveDown();
                
                // Patient info
                doc.fontSize(12).font('Helvetica-Bold').text('Informasi Pasien:');
                doc.fontSize(10).font('Helvetica');
                doc.text(`Nama: ${patient.full_name}`);
                doc.text(`ID Pasien: ${patient.id}`);
                if (patient.age) doc.text(`Usia: ${patient.age} tahun`);
                doc.moveDown();
                
                // Visit info
                doc.fontSize(12).font('Helvetica-Bold').text('Detail Kunjungan:');
                doc.fontSize(10).font('Helvetica');
                doc.text(`Dokter: ${visit.doctor_name || 'Dr. Dibya'}`);
                if (visit.complaint) doc.text(`Keluhan: ${visit.complaint}`);
                if (visit.diagnosis) doc.text(`Diagnosis: ${visit.diagnosis}`);
                doc.moveDown();
                
                // Items table
                if (items.length > 0) {
                    doc.fontSize(12).font('Helvetica-Bold').text('Rincian Biaya:');
                    doc.moveDown(0.5);
                    
                    // Table header
                    const tableTop = doc.y;
                    const col1 = 50;
                    const col2 = 300;
                    const col3 = 400;
                    const col4 = 480;
                    
                    doc.fontSize(10).font('Helvetica-Bold');
                    doc.text('Item', col1, tableTop);
                    doc.text('Qty', col2, tableTop);
                    doc.text('Harga', col3, tableTop);
                    doc.text('Total', col4, tableTop);
                    
                    doc.moveTo(col1, tableTop + 15).lineTo(545, tableTop + 15).stroke();
                    
                    // Table rows
                    let y = tableTop + 20;
                    let grandTotal = 0;
                    
                    doc.font('Helvetica');
                    items.forEach(item => {
                        const total = item.quantity * item.price;
                        grandTotal += total;
                        
                        doc.text(item.name, col1, y, { width: 240 });
                        doc.text(item.quantity.toString(), col2, y);
                        doc.text(this.formatCurrency(item.price), col3, y);
                        doc.text(this.formatCurrency(total), col4, y);
                        
                        y += 20;
                    });
                    
                    // Total line
                    doc.moveTo(col1, y).lineTo(545, y).stroke();
                    y += 10;
                    
                    doc.fontSize(12).font('Helvetica-Bold');
                    doc.text('TOTAL:', col3, y);
                    doc.text(this.formatCurrency(grandTotal), col4, y);
                    
                    doc.moveDown(2);
                }
                
                // QR Code for verification
                const qrData = `RECEIPT:${visit.id}:${patient.id}:${Date.now()}`;
                const qrImage = await QRCode.toDataURL(qrData);
                const qrBuffer = Buffer.from(qrImage.split(',')[1], 'base64');
                
                doc.image(qrBuffer, 470, doc.y, { width: 70 });
                
                // Footer
                doc.fontSize(9).font('Helvetica');
                doc.text('Terima kasih atas kunjungan Anda', 50, doc.y + 20);
                doc.fontSize(8).text('Dokumen ini sah tanpa tanda tangan dan stempel', 50, doc.y + 5, { 
                    align: 'center', 
                    width: 420 
                });
                
                doc.end();
                
                writeStream.on('finish', () => {
                    logger.info('PDF receipt generated', { filename, visitId: visit.id });
                    resolve({ success: true, filename, filepath });
                });
                
                writeStream.on('error', (error) => {
                    logger.error('PDF generation failed', { error: error.message });
                    reject(error);
                });
                
            } catch (error) {
                logger.error('PDF generation error', { error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * Generate patient medical report
     */
    async generateMedicalReport(patient, visits) {
        return new Promise(async (resolve, reject) => {
            try {
                const filename = `report_${patient.id}_${Date.now()}.pdf`;
                const filepath = path.join(this.outputDir, filename);
                
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const writeStream = fs.createWriteStream(filepath);
                
                doc.pipe(writeStream);
                
                // Header
                doc.fontSize(20).font('Helvetica-Bold')
                   .text('KLINIK DR. DIBYA', { align: 'center' });
                doc.fontSize(10).font('Helvetica')
                   .text('Riwayat Medis Pasien', { align: 'center' })
                   .moveDown();
                
                doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown();
                
                // Patient info
                doc.fontSize(14).font('Helvetica-Bold').text('Data Pasien:');
                doc.fontSize(11).font('Helvetica');
                doc.text(`Nama: ${patient.full_name}`);
                doc.text(`ID Pasien: ${patient.id}`);
                if (patient.birth_date) {
                    doc.text(`Tanggal Lahir: ${new Date(patient.birth_date).toLocaleDateString('id-ID')}`);
                }
                if (patient.age) doc.text(`Usia: ${patient.age} tahun`);
                if (patient.whatsapp) doc.text(`WhatsApp: ${patient.whatsapp}`);
                if (patient.allergy) doc.text(`Alergi: ${patient.allergy}`);
                if (patient.medical_history) doc.text(`Riwayat Penyakit: ${patient.medical_history}`);
                doc.moveDown();
                
                // Visit history
                doc.fontSize(14).font('Helvetica-Bold').text('Riwayat Kunjungan:');
                doc.moveDown(0.5);
                
                if (visits.length === 0) {
                    doc.fontSize(10).font('Helvetica').text('Belum ada riwayat kunjungan');
                } else {
                    visits.forEach((visit, index) => {
                        const visitDate = new Date(visit.visit_date);
                        
                        doc.fontSize(11).font('Helvetica-Bold')
                           .text(`${index + 1}. ${visitDate.toLocaleDateString('id-ID')}`);
                        
                        doc.fontSize(10).font('Helvetica');
                        doc.text(`   Dokter: ${visit.doctor_name || 'Dr. Dibya'}`);
                        if (visit.complaint) doc.text(`   Keluhan: ${visit.complaint}`);
                        if (visit.diagnosis) doc.text(`   Diagnosis: ${visit.diagnosis}`);
                        if (visit.notes) doc.text(`   Catatan: ${visit.notes}`);
                        doc.moveDown(0.5);
                    });
                }
                
                // Footer
                doc.moveDown();
                doc.fontSize(9).font('Helvetica')
                   .text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
                
                doc.end();
                
                writeStream.on('finish', () => {
                    logger.info('PDF medical report generated', { filename, patientId: patient.id });
                    resolve({ success: true, filename, filepath });
                });
                
                writeStream.on('error', reject);
                
            } catch (error) {
                logger.error('PDF generation error', { error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * Format currency to Indonesian Rupiah
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }
    
    /**
     * Get PDF file
     */
    getPDFPath(filename) {
        return path.join(this.outputDir, filename);
    }
    
    /**
     * Delete old PDF files (cleanup)
     */
    async cleanupOldFiles(daysOld = 30) {
        const files = fs.readdirSync(this.outputDir);
        const now = Date.now();
        const maxAge = daysOld * 24 * 60 * 60 * 1000;
        
        let deletedCount = 0;
        
        files.forEach(file => {
            const filepath = path.join(this.outputDir, file);
            const stats = fs.statSync(filepath);
            
            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filepath);
                deletedCount++;
            }
        });
        
        logger.info(`Cleaned up ${deletedCount} old PDF files`);
        return deletedCount;
    }
}

module.exports = new PDFService();
