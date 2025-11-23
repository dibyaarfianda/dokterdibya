/**
 * PDF Generator for Billing Documents
 * Generates Invoice and Etiket (Label) PDFs
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
    constructor() {
        this.invoicesDir = path.join(__dirname, '../../../database/invoices');
        this.ensureDirectoryExists();
    }

    ensureDirectoryExists() {
        if (!fs.existsSync(this.invoicesDir)) {
            fs.mkdirSync(this.invoicesDir, { recursive: true });
        }
    }

    /**
     * Generate Invoice PDF
     */
    async generateInvoice(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const filename = `${recordData.mrId}inv.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                // Header
                doc.fontSize(20)
                   .font('Helvetica-Bold')
                   .text('KLINIK PRIVAT MINGGU', { align: 'center' });
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .text('dr. Dibya Arfianda, SpOG, M.Ked.Klin.', { align: 'center' });
                
                doc.fontSize(10)
                   .text('Jl. Contoh No. 123, Jakarta', { align: 'center' })
                   .text('Telp: (021) 1234-5678', { align: 'center' })
                   .moveDown(2);

                // Invoice Title
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .text('INVOICE', { align: 'center' })
                   .moveDown();

                // Invoice Details
                doc.fontSize(10)
                   .font('Helvetica');
                
                const detailsY = doc.y;
                doc.text(`No. Invoice: ${recordData.mrId}`, 50, detailsY);
                doc.text(`Tanggal: ${new Date(billingData.confirmed_at || Date.now()).toLocaleDateString('id-ID')}`, 350, detailsY);
                doc.moveDown();

                // Patient Info
                doc.text(`Nama Pasien: ${patientData.fullName || patientData.full_name || '-'}`);
                doc.text(`Tanggal Lahir: ${patientData.birthDate || patientData.birth_date || '-'}`);
                doc.text(`No. Telp: ${patientData.phone || '-'}`);
                doc.moveDown(2);

                // Table Header
                const tableTop = doc.y;
                const col1 = 50;
                const col2 = 250;
                const col3 = 350;
                const col4 = 450;

                doc.font('Helvetica-Bold');
                doc.text('Item', col1, tableTop);
                doc.text('Qty', col2, tableTop);
                doc.text('Harga', col3, tableTop);
                doc.text('Subtotal', col4, tableTop);
                
                doc.moveTo(50, tableTop + 15)
                   .lineTo(550, tableTop + 15)
                   .stroke();

                // Table Content
                doc.font('Helvetica');
                let yPosition = tableTop + 25;
                let subtotal = 0;

                (billingData.items || []).forEach((item, index) => {
                    const itemTotal = (item.quantity || 1) * (item.price || 0);
                    subtotal += itemTotal;

                    if (yPosition > 700) {
                        doc.addPage();
                        yPosition = 50;
                    }

                    doc.text(item.item_name || item.description || '-', col1, yPosition, { width: 180 });
                    doc.text(String(item.quantity || 1), col2, yPosition);
                    doc.text(this.formatRupiah(item.price || 0), col3, yPosition);
                    doc.text(this.formatRupiah(itemTotal), col4, yPosition);
                    yPosition += 20;
                });

                // Total
                yPosition += 10;
                doc.moveTo(50, yPosition)
                   .lineTo(550, yPosition)
                   .stroke();
                
                yPosition += 15;
                doc.font('Helvetica-Bold')
                   .fontSize(12)
                   .text('TOTAL', col3, yPosition);
                doc.text(this.formatRupiah(subtotal), col4, yPosition);

                // Footer
                doc.fontSize(10)
                   .font('Helvetica')
                   .moveDown(3)
                   .text(`Dikonfirmasi oleh: ${billingData.confirmed_by || 'Dokter'}`, { align: 'left' })
                   .text(`Tanggal Konfirmasi: ${new Date(billingData.confirmed_at || Date.now()).toLocaleDateString('id-ID')}`, { align: 'left' });

                doc.end();

                stream.on('finish', () => {
                    resolve({ filepath, filename });
                });

                stream.on('error', reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate Etiket (Label) PDF
     */
    async generateEtiket(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: [288, 432], margin: 20 }); // 10x15cm label
                const filename = `${recordData.mrId}e.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                // Clinic Name
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('KLINIK PRIVAT MINGGU', { align: 'center' });
                
                doc.fontSize(10)
                   .font('Helvetica')
                   .text('dr. Dibya Arfianda, SpOG, M.Ked.Klin.', { align: 'center' })
                   .moveDown(2);

                // MR Number
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text(`No. RM: ${recordData.mrId}`, { align: 'center' })
                   .moveDown();

                // Patient Info
                doc.fontSize(10)
                   .font('Helvetica');
                
                doc.text(`Nama: ${patientData.fullName || patientData.full_name || '-'}`);
                doc.text(`Tgl Lahir: ${patientData.birthDate || patientData.birth_date || '-'}`);
                doc.text(`Telp: ${patientData.phone || '-'}`);
                doc.moveDown();

                // Date
                doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`);
                doc.moveDown(2);

                // Items (simplified)
                doc.fontSize(9)
                   .font('Helvetica-Bold')
                   .text('LAYANAN:', { underline: true });
                
                doc.font('Helvetica');
                (billingData.items || []).slice(0, 10).forEach((item) => {
                    doc.fontSize(8)
                       .text(`• ${item.item_name || item.description}`);
                });

                // Total
                doc.moveDown();
                const subtotal = (billingData.items || []).reduce((sum, item) => {
                    return sum + ((item.quantity || 1) * (item.price || 0));
                }, 0);

                doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .text(`Total: ${this.formatRupiah(subtotal)}`);

                doc.end();

                stream.on('finish', () => {
                    resolve({ filepath, filename });
                });

                stream.on('error', reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Format number to Rupiah
     */
    formatRupiah(amount) {
        return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
    }
}

module.exports = new PDFGenerator();
