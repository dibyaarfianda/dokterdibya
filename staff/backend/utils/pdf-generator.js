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
     * Generate Invoice PDF (A6 Format - matching index-new.html)
     */
    async generateInvoice(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                // A6 format: 105mm x 148mm = 297.6 x 419.5 points
                const doc = new PDFDocument({ size: [297.6, 419.5], margin: 20 });
                const filename = `${recordData.mrId}inv.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                const pageWidth = doc.page.width;
                const leftMargin = 20;
                const rightMargin = 20;
                const rightEdge = pageWidth - rightMargin;
                const center = pageWidth / 2;
                let y = 25;

                // Header - Clinic Info
                doc.fontSize(8)
                   .font('Helvetica')
                   .text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', center, y, { align: 'center' });
                
                y += 12;
                doc.text('SIP: 503/0126/SIP-SIK/419.104/2024', center, y, { align: 'center' });
                
                y += 20;
                doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .text('Invoice Pembayaran', center, y, { align: 'center' });
                
                y += 6;
                doc.moveTo(leftMargin, y)
                   .lineTo(rightEdge, y)
                   .lineWidth(0.5)
                   .stroke();
                
                y += 18;

                // Patient Info and Date
                doc.fontSize(8)
                   .font('Helvetica');
                doc.text(`Nama Pasien: ${patientData.fullName || patientData.full_name || '-'}`, leftMargin, y);
                doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, rightEdge, y, { align: 'right' });
                
                y += 18;

                // Calculate totals
                const tindakanItems = (billingData.items || []).filter(item => 
                    item.item_type === 'tindakan' || item.item_type === 'konsultasi'
                );
                const obatItems = (billingData.items || []).filter(item => 
                    item.item_type === 'obat' || item.item_type === 'alkes'
                );
                
                const tindakanTotal = tindakanItems.reduce((sum, item) => 
                    sum + ((item.quantity || 1) * (item.price || 0)), 0
                );
                const obatTotal = obatItems.reduce((sum, item) => 
                    sum + ((item.quantity || 1) * (item.price || 0)), 0
                );

                // Tindakan Section
                if (tindakanItems.length > 0) {
                    y += 6;
                    doc.fontSize(10)
                       .font('Helvetica-Bold')
                       .text('Rincian Layanan & Tindakan', leftMargin, y);
                    
                    y += 15;
                    doc.fontSize(8)
                       .text('Deskripsi', leftMargin, y);
                    doc.text('Harga', rightEdge, y, { align: 'right' });
                    
                    y += 6;
                    doc.moveTo(leftMargin, y)
                       .lineTo(rightEdge, y)
                       .lineWidth(0.2)
                       .stroke();
                    
                    y += 12;
                    doc.font('Helvetica');

                    tindakanItems.forEach((item) => {
                        const itemName = item.item_name || item.description || '-';
                        doc.text(itemName, leftMargin, y, { width: 150 });
                        doc.text(this.formatRupiahSimple(item.price), rightEdge, y, { align: 'right' });
                        y += 14;
                    });

                    y += 6;
                    doc.font('Helvetica-Bold')
                       .text('Subtotal Tindakan', rightEdge - 60, y, { align: 'right' });
                    doc.text(this.formatRupiah(tindakanTotal), rightEdge, y, { align: 'right' });
                    y += 15;
                }

                // Obat Section
                if (obatItems.length > 0) {
                    y += 15;
                    doc.fontSize(10)
                       .font('Helvetica-Bold')
                       .text('Rincian Obat & Alkes', leftMargin, y);
                    
                    y += 15;
                    doc.fontSize(8);
                    const jmlCol = rightEdge - 90;
                    const hargaCol = rightEdge - 50;
                    
                    doc.text('Deskripsi', leftMargin, y);
                    doc.text('Jml', jmlCol, y, { align: 'center' });
                    doc.text('Harga', hargaCol, y, { align: 'right' });
                    doc.text('Subtotal', rightEdge, y, { align: 'right' });
                    
                    y += 6;
                    doc.moveTo(leftMargin, y)
                       .lineTo(rightEdge, y)
                       .lineWidth(0.2)
                       .stroke();
                    
                    y += 12;
                    doc.font('Helvetica');

                    obatItems.forEach((item) => {
                        const itemName = item.item_name || item.description || '-';
                        const itemSubtotal = (item.quantity || 1) * (item.price || 0);
                        
                        doc.text(itemName, leftMargin, y, { width: 110 });
                        doc.text(String(item.quantity || 1), jmlCol, y, { align: 'center' });
                        doc.text(this.formatRupiahSimple(item.price), hargaCol, y, { align: 'right' });
                        doc.text(this.formatRupiahSimple(itemSubtotal), rightEdge, y, { align: 'right' });
                        y += 14;
                    });

                    y += 6;
                    doc.font('Helvetica-Bold')
                       .text('Subtotal Obat & Alkes', rightEdge - 60, y, { align: 'right' });
                    doc.text(this.formatRupiah(obatTotal), rightEdge, y, { align: 'right' });
                    y += 15;
                }

                // Grand Total
                y += 15;
                doc.moveTo(leftMargin, y)
                   .lineTo(rightEdge, y)
                   .lineWidth(0.5)
                   .stroke();
                
                y += 15;
                doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .text('GRAND TOTAL', rightEdge - 80, y, { align: 'right' });
                doc.text(this.formatRupiah(tindakanTotal + obatTotal), rightEdge, y, { align: 'right' });
                
                y += 30;
                doc.fontSize(8)
                   .font('Helvetica')
                   .text(`Kasir: ${billingData.confirmed_by || 'Admin'}`, leftMargin, y);

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
     * Generate Etiket (Label) PDF (matching index-new.html format)
     * Multiple labels per page, drug-focused
     */
    async generateEtiket(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 15 });
                const filename = `${recordData.mrId}e.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                // Label dimensions (60mm x 40mm ≈ 170 x 113 points)
                const labelWidth = 170;
                const labelHeight = 113;
                const marginX = 15;
                const marginY = 15;
                const gapX = 15;
                const gapY = 15;
                const cols = 3;

                let currentX = marginX;
                let currentY = marginY;
                let col = 0;

                // Filter obat items for etiket
                const obatItems = (billingData.items || []).filter(item => 
                    item.item_type === 'obat' || item.item_type === 'alkes'
                );

                // If no obat, create one label with all items
                const itemsToPrint = obatItems.length > 0 ? obatItems : (billingData.items || []).slice(0, 5);

                itemsToPrint.forEach((item, index) => {
                    // Check if need new page
                    if (currentY + labelHeight > doc.page.height - marginY) {
                        doc.addPage();
                        currentX = marginX;
                        currentY = marginY;
                        col = 0;
                    }

                    // Draw label border
                    doc.rect(currentX, currentY, labelWidth, labelHeight).stroke();

                    let textY = currentY + 8;
                    const labelCenter = currentX + labelWidth / 2;

                    // Clinic header
                    doc.fontSize(8)
                       .font('Helvetica-Bold')
                       .text('Dr. Dibya Private Clinic', labelCenter, textY, { align: 'center' });
                    
                    textY += 10;
                    doc.fontSize(7)
                       .font('Helvetica')
                       .text('RSIA Melinda', labelCenter, textY, { align: 'center' });
                    
                    textY += 10;
                    doc.text('Jl. Balowerti 2 No. 59, Kediri', labelCenter, textY, { align: 'center' });
                    
                    textY += 10;
                    doc.text('SIPA: 503/0522/SIP-SIK/419.104/2024', labelCenter, textY, { align: 'center' });
                    
                    textY += 8;
                    doc.moveTo(currentX + 5, textY)
                       .lineTo(currentX + labelWidth - 5, textY)
                       .lineWidth(0.2)
                       .stroke();
                    
                    textY += 12;

                    // Patient info
                    doc.fontSize(8)
                       .font('Helvetica');
                    doc.text(`Pasien: ${patientData.fullName || patientData.full_name || '-'}`, 
                             currentX + 8, textY, { width: labelWidth - 50 });
                    doc.text(new Date().toLocaleDateString('id-ID'), 
                             currentX + labelWidth - 8, textY, { align: 'right' });
                    
                    textY += 12;

                    // Item name (drug name)
                    doc.fontSize(10)
                       .font('Helvetica-Bold');
                    const itemName = item.item_name || item.description || '-';
                    const itemLines = doc.heightOfString(itemName, { width: labelWidth - 16 });
                    doc.text(itemName, currentX + 8, textY, { width: labelWidth - 16 });
                    
                    textY += itemLines + 8;

                    // Usage instructions (if available in item_data)
                    doc.fontSize(9)
                       .font('Helvetica');
                    const caraPakai = item.item_data?.cara_pakai || item.item_data?.instruction || 
                                     `${item.quantity}x sehari`;
                    doc.text(caraPakai, currentX + 8, textY, { width: labelWidth - 16 });
                    
                    // Footer
                    doc.fontSize(7)
                       .font('Helvetica-Bold')
                       .text('Diminum sebelum/sesudah makan', 
                             currentX + 8, currentY + labelHeight - 10);

                    // Move to next position
                    col++;
                    if (col >= cols) {
                        col = 0;
                        currentX = marginX;
                        currentY += labelHeight + gapY;
                    } else {
                        currentX += labelWidth + gapX;
                    }
                });

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
