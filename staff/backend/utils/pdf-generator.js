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
        this.logoPath = path.join(__dirname, '../../public/images/logodpc.png');
        this.ensureDirectoryExists();
    }

    ensureDirectoryExists() {
        if (!fs.existsSync(this.invoicesDir)) {
            fs.mkdirSync(this.invoicesDir, { recursive: true });
        }
    }

    /**
     * Format date to European format (DD/MM/YYYY)
     */
    formatDateEuropean(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Generate Invoice PDF (A6 Format - matching screenshot format)
     */
    async generateInvoice(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                // A6 format: 105mm x 148mm = 297.6 x 419.5 points
                const doc = new PDFDocument({
                    size: 'A6',
                    margin: 15,
                    info: {
                        Title: `Invoice ${recordData.mrId}`,
                        Author: 'Dr. Dibya Private Clinic',
                        Subject: 'Invoice Pembayaran',
                        Creator: 'Sunday Clinic System'
                    }
                });
                const filename = `${recordData.mrId}inv.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                const pageWidth = doc.page.width;
                const leftMargin = 15;
                const rightMargin = 15;
                const rightEdge = pageWidth - rightMargin;
                const contentWidth = rightEdge - leftMargin;
                let y = 15;

                // Header - Clinic Name
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('Klinik Privat Dr. Dibya', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 18;
                doc.fontSize(7)
                   .font('Helvetica')
                   .text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', leftMargin, y, { width: contentWidth, align: 'center' });
                y += 10;
                doc.text('SIP: 503/0126/SIP-SIK/419.104/2024', leftMargin, y, { width: contentWidth, align: 'center' });

                // Invoice Title with underline
                y += 18;
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Invoice Pembayaran', leftMargin, y, { width: contentWidth, align: 'center' });
                y += 16;
                doc.moveTo(leftMargin, y).lineTo(rightEdge, y).lineWidth(0.5).stroke();

                // Patient Info and Date
                y += 15;
                doc.fontSize(8).font('Helvetica');
                doc.text(`Nama Pasien: ${patientData.fullName || patientData.full_name || '-'}`, leftMargin, y);
                doc.text(`Tanggal: ${this.formatDateEuropean()}`, leftMargin, y, { width: contentWidth, align: 'right' });

                // Separate items by type
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

                // Rincian Layanan & Tindakan
                if (tindakanItems.length > 0) {
                    y += 20;
                    doc.fontSize(9).font('Helvetica-Bold')
                       .text('Rincian Layanan & Tindakan', leftMargin, y);

                    y += 12;
                    doc.fontSize(8).font('Helvetica-Bold');
                    doc.text('Deskripsi', leftMargin, y);
                    doc.text('Harga', leftMargin, y, { width: contentWidth, align: 'right' });

                    y += 8;
                    doc.moveTo(leftMargin, y).lineTo(rightEdge, y).lineWidth(0.3).stroke();

                    y += 8;
                    doc.font('Helvetica');
                    tindakanItems.forEach((item) => {
                        const itemName = item.item_name || item.description || '-';
                        const price = (item.quantity || 1) * (item.price || 0);
                        doc.text(itemName, leftMargin, y, { width: contentWidth - 60 });
                        doc.text(this.formatRupiahSimple(price), leftMargin, y, { width: contentWidth, align: 'right' });
                        y += 12;
                    });

                    // Subtotal Tindakan
                    y += 5;
                    doc.font('Helvetica-Bold');
                    doc.text('Subtotal Tindakan', leftMargin + 80, y);
                    doc.text(this.formatRupiah(tindakanTotal), leftMargin, y, { width: contentWidth, align: 'right' });
                }

                // Rincian Obat & Alkes
                if (obatItems.length > 0) {
                    y += 20;
                    doc.fontSize(9).font('Helvetica-Bold')
                       .text('Rincian Obat & Alkes', leftMargin, y);

                    y += 12;
                    doc.fontSize(8).font('Helvetica-Bold');
                    // Column positions for obat table
                    const col1 = leftMargin;           // Deskripsi
                    const col2 = leftMargin + 100;     // Jml
                    const col3 = leftMargin + 130;     // Harga
                    const col4 = leftMargin + 190;     // Subtotal

                    doc.text('Deskripsi', col1, y);
                    doc.text('Jml', col2, y);
                    doc.text('Harga', col3, y);
                    doc.text('Subtotal', col4, y);

                    y += 8;
                    doc.moveTo(leftMargin, y).lineTo(rightEdge, y).lineWidth(0.3).stroke();

                    y += 8;
                    doc.font('Helvetica');
                    obatItems.forEach((item) => {
                        const itemName = item.item_name || item.description || '-';
                        const qty = item.quantity || 1;
                        const price = item.price || 0;
                        const subtotal = qty * price;

                        doc.text(itemName, col1, y, { width: 95 });
                        doc.text(String(qty), col2, y);
                        doc.text(this.formatRupiahSimple(price), col3, y);
                        doc.text(this.formatRupiahSimple(subtotal), col4, y);
                        y += 12;
                    });

                    // Subtotal Obat & Alkes
                    y += 5;
                    doc.font('Helvetica-Bold');
                    doc.text('Subtotal Obat & Alkes', leftMargin + 80, y);
                    doc.text(this.formatRupiah(obatTotal), leftMargin, y, { width: contentWidth, align: 'right' });
                }

                // Grand Total
                y += 18;
                doc.moveTo(leftMargin, y).lineTo(rightEdge, y).lineWidth(0.5).stroke();

                y += 12;
                doc.fontSize(11).font('Helvetica-Bold');
                doc.text('GRAND TOTAL', leftMargin + 50, y);
                doc.text(this.formatRupiah(tindakanTotal + obatTotal), leftMargin, y, { width: contentWidth, align: 'right' });

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
     * Generate Etiket (Label) PDF - 2 columns per page with colored text
     */
    async generateEtiket(billingData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 20 });
                const filename = `${recordData.mrId}e.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                // Label dimensions for 3-column layout
                const labelWidth = 180;
                const labelHeight = 130;
                const marginX = 15;
                const marginY = 15;
                const gapX = 12;
                const gapY = 12;
                const cols = 3;

                let currentX = marginX;
                let currentY = marginY;
                let col = 0;

                // Filter obat items with caraPakai (matching index-new.html logic)
                let drugsToPrint = (billingData.items || []).filter(item =>
                    item.item_type === 'obat' &&
                    (item.item_data?.caraPakai || item.item_data?.cara_pakai) &&
                    item.quantity > 0
                );

                // Fallback: print all obat items if none have caraPakai
                if (drugsToPrint.length === 0) {
                    drugsToPrint = (billingData.items || []).filter(item =>
                        item.item_type === 'obat' && item.quantity > 0
                    );
                }

                drugsToPrint.forEach((item, index) => {
                    // Check if need new page
                    if (currentY + labelHeight > doc.page.height - marginY) {
                        doc.addPage();
                        currentX = marginX;
                        currentY = marginY;
                        col = 0;
                    }

                    // Draw label border
                    doc.rect(currentX, currentY, labelWidth, labelHeight).stroke();

                    let textY = currentY + 10;

                    // Clinic header
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .text('Dr. Dibya Private Clinic', currentX + 5, textY, { width: labelWidth - 10, align: 'center' });

                    textY += 11;
                    doc.fontSize(7)
                       .font('Helvetica')
                       .text('RSIA Melinda', currentX + 5, textY, { width: labelWidth - 10, align: 'center' });

                    textY += 9;
                    doc.text('Jl. Balowerti 2 No. 59, Kediri', currentX + 5, textY, { width: labelWidth - 10, align: 'center' });

                    textY += 9;
                    doc.text('SIPA: 503/0522/SIP-SIK/419.104/2024', currentX + 5, textY, { width: labelWidth - 10, align: 'center' });

                    // Separator line
                    textY += 8;
                    doc.moveTo(currentX + 5, textY)
                       .lineTo(currentX + labelWidth - 5, textY)
                       .lineWidth(0.3)
                       .stroke();

                    textY += 8;

                    // Patient info line
                    doc.fontSize(7)
                       .font('Helvetica');
                    const patientName = patientData.fullName || patientData.full_name || '-';
                    doc.text(`Pasien: ${patientName}`, currentX + 5, textY, { width: labelWidth - 55 });
                    doc.text(this.formatDateEuropean(), currentX + labelWidth - 55, textY);

                    textY += 12;

                    // Drug name (bold)
                    doc.fontSize(10)
                       .font('Helvetica-Bold');
                    const itemName = item.item_name || item.description || '-';
                    doc.text(itemName, currentX + 5, textY, { width: labelWidth - 10 });

                    textY += 14;

                    // Dosage - format as "1x1" from caraPakai
                    doc.fontSize(9)
                       .font('Helvetica');
                    const caraPakai = item.item_data?.caraPakai || item.item_data?.cara_pakai || '1x1';
                    doc.text(caraPakai, currentX + 5, textY, { width: labelWidth - 10 });

                    // Footer
                    doc.fontSize(6)
                       .font('Helvetica-Bold')
                       .text('Diminum sebelum/sesudah makan',
                             currentX + 5, currentY + labelHeight - 14, { width: labelWidth - 10 });

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
     * Generate Tindakan Price List PDF (A4 Format)
     */
    async generateTindakanPriceList(tindakanData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 40,
                    info: {
                        Title: 'Daftar Harga Tindakan',
                        Author: 'Dr. Dibya Private Clinic',
                        Subject: 'Price List - Tindakan',
                        Creator: 'Sunday Clinic System'
                    }
                });

                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));

                const pageWidth = doc.page.width;
                const leftMargin = 40;
                const rightMargin = 40;
                const contentWidth = pageWidth - leftMargin - rightMargin;
                let y = 40;

                // Header
                doc.fontSize(18)
                   .font('Helvetica-Bold')
                   .text('DAFTAR HARGA TINDAKAN', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 25;
                doc.fontSize(12)
                   .font('Helvetica')
                   .text('Klinik Privat Dr. Dibya', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 16;
                doc.fontSize(9)
                   .text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 12;
                doc.text(`Berlaku: ${this.formatDateEuropean()}`, leftMargin, y, { width: contentWidth, align: 'center' });

                y += 25;
                doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(1).stroke();

                // Group by category
                const categories = {};
                tindakanData.forEach(item => {
                    const cat = item.category || 'LAINNYA';
                    if (!categories[cat]) categories[cat] = [];
                    categories[cat].push(item);
                });

                const categoryOrder = ['ADMINISTRATIF', 'LAYANAN', 'TINDAKAN MEDIS', 'KONTRASEPSI', 'VAKSINASI', 'LABORATORIUM', 'LAINNYA'];

                categoryOrder.forEach(category => {
                    if (!categories[category] || categories[category].length === 0) return;

                    // Check if need new page
                    if (y > doc.page.height - 100) {
                        doc.addPage();
                        y = 40;
                    }

                    y += 20;
                    doc.fontSize(11)
                       .font('Helvetica-Bold')
                       .fillColor('#1a56db')
                       .text(category, leftMargin, y);

                    doc.fillColor('#000000');

                    y += 18;

                    // Table header
                    doc.fontSize(9)
                       .font('Helvetica-Bold');
                    doc.text('No', leftMargin, y, { width: 25 });
                    doc.text('Kode', leftMargin + 25, y, { width: 60 });
                    doc.text('Nama Tindakan', leftMargin + 85, y, { width: 280 });
                    doc.text('Harga', leftMargin + 365, y, { width: 100, align: 'right' });

                    y += 12;
                    doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(0.5).stroke();

                    y += 8;
                    doc.font('Helvetica').fontSize(9);

                    categories[category].forEach((item, idx) => {
                        // Check if need new page
                        if (y > doc.page.height - 50) {
                            doc.addPage();
                            y = 40;
                        }

                        doc.text((idx + 1).toString(), leftMargin, y, { width: 25 });
                        doc.text(item.code || '-', leftMargin + 25, y, { width: 60 });
                        doc.text(item.name || '-', leftMargin + 85, y, { width: 280 });
                        doc.text(this.formatRupiah(item.price), leftMargin + 365, y, { width: 100, align: 'right' });
                        y += 14;
                    });
                });

                // Footer
                y = doc.page.height - 60;
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#666666')
                   .text('* Harga dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu', leftMargin, y, { width: contentWidth, align: 'center' });
                y += 12;
                doc.text('* Untuk informasi lebih lanjut hubungi: 0354-XXXXXXX', leftMargin, y, { width: contentWidth, align: 'center' });

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate Obat Price List PDF (A4 Format)
     */
    async generateObatPriceList(obatData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 40,
                    info: {
                        Title: 'Daftar Harga Obat',
                        Author: 'Dr. Dibya Private Clinic',
                        Subject: 'Price List - Obat',
                        Creator: 'Sunday Clinic System'
                    }
                });

                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));

                const pageWidth = doc.page.width;
                const leftMargin = 40;
                const rightMargin = 40;
                const contentWidth = pageWidth - leftMargin - rightMargin;
                let y = 40;

                // Header
                doc.fontSize(18)
                   .font('Helvetica-Bold')
                   .text('DAFTAR HARGA OBAT & ALKES', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 25;
                doc.fontSize(12)
                   .font('Helvetica')
                   .text('Klinik Privat Dr. Dibya', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 16;
                doc.fontSize(9)
                   .text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 12;
                doc.text(`Berlaku: ${this.formatDateEuropean()}`, leftMargin, y, { width: contentWidth, align: 'center' });

                y += 25;
                doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(1).stroke();

                // Group by category
                const categories = {};
                obatData.forEach(item => {
                    const cat = item.category || 'LAINNYA';
                    if (!categories[cat]) categories[cat] = [];
                    categories[cat].push(item);
                });

                const categoryOrder = ['OBAT-OBATAN', 'AMPUL & VIAL', 'ALKES', 'LAINNYA'];

                // Also include any categories not in the order
                Object.keys(categories).forEach(cat => {
                    if (!categoryOrder.includes(cat)) {
                        categoryOrder.push(cat);
                    }
                });

                categoryOrder.forEach(category => {
                    if (!categories[category] || categories[category].length === 0) return;

                    // Check if need new page
                    if (y > doc.page.height - 100) {
                        doc.addPage();
                        y = 40;
                    }

                    y += 20;
                    doc.fontSize(11)
                       .font('Helvetica-Bold')
                       .fillColor('#059669')
                       .text(category, leftMargin, y);

                    doc.fillColor('#000000');

                    y += 18;

                    // Table header
                    doc.fontSize(9)
                       .font('Helvetica-Bold');
                    doc.text('No', leftMargin, y, { width: 25 });
                    doc.text('Kode', leftMargin + 25, y, { width: 60 });
                    doc.text('Nama Obat', leftMargin + 85, y, { width: 220 });
                    doc.text('Satuan', leftMargin + 305, y, { width: 60 });
                    doc.text('Harga', leftMargin + 365, y, { width: 100, align: 'right' });

                    y += 12;
                    doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(0.5).stroke();

                    y += 8;
                    doc.font('Helvetica').fontSize(9);

                    categories[category].forEach((item, idx) => {
                        // Check if need new page
                        if (y > doc.page.height - 50) {
                            doc.addPage();
                            y = 40;
                        }

                        doc.text((idx + 1).toString(), leftMargin, y, { width: 25 });
                        doc.text(item.code || '-', leftMargin + 25, y, { width: 60 });
                        doc.text(item.name || '-', leftMargin + 85, y, { width: 220 });
                        doc.text(item.unit || '-', leftMargin + 305, y, { width: 60 });
                        doc.text(this.formatRupiah(item.price), leftMargin + 365, y, { width: 100, align: 'right' });
                        y += 14;
                    });
                });

                // Footer
                y = doc.page.height - 60;
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#666666')
                   .text('* Harga dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu', leftMargin, y, { width: contentWidth, align: 'center' });
                y += 12;
                doc.text('* Untuk informasi lebih lanjut hubungi: 0354-XXXXXXX', leftMargin, y, { width: contentWidth, align: 'center' });

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Sanitize text for PDF (replace unsupported Unicode with ASCII)
     */
    sanitizeTextForPdf(text) {
        if (!text) return '';
        return String(text)
            // Replace bullet points
            .replace(/•/g, '-')
            .replace(/●/g, '-')
            .replace(/○/g, '-')
            .replace(/◦/g, '-')
            .replace(/▪/g, '-')
            .replace(/▫/g, '-')
            // Replace quotes
            .replace(/[""]/g, '"')
            .replace(/['']/g, "'")
            // Replace dashes
            .replace(/[–—]/g, '-')
            // Replace ellipsis
            .replace(/…/g, '...')
            // Replace other special chars
            .replace(/×/g, 'x')
            .replace(/÷/g, '/')
            .replace(/≤/g, '<=')
            .replace(/≥/g, '>=')
            .replace(/±/g, '+/-')
            .replace(/°/g, ' derajat ')
            // Remove any remaining non-printable characters
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            // Trim each line
            .split('\n').map(line => line.trim()).join('\n');
    }

    /**
     * Generate Resume Medis PDF (A4 Format)
     */
    async generateResumeMedis(resumeData, patientData, recordData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 40,
                    info: {
                        Title: `Resume Medis - ${patientData.fullName || patientData.full_name || 'Pasien'}`,
                        Author: 'Dr. Dibya Private Clinic',
                        Subject: 'Resume Medis',
                        Creator: 'Sunday Clinic System'
                    }
                });

                const filename = `${recordData.mrId}_resume.pdf`;
                const filepath = path.join(this.invoicesDir, filename);
                const stream = fs.createWriteStream(filepath);

                doc.pipe(stream);

                const pageWidth = doc.page.width;
                const leftMargin = 40;
                const rightMargin = 40;
                const contentWidth = pageWidth - leftMargin - rightMargin;
                let y = 40;

                // Header - Clinic Name
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .text('Klinik Privat Dr. Dibya', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 20;
                doc.fontSize(9)
                   .font('Helvetica')
                   .text('RSIA Melinda - Jl. Balowerti 2 No. 59, Kediri', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 12;
                doc.text('SIP: 503/0126/SIP-SIK/419.104/2024', leftMargin, y, { width: contentWidth, align: 'center' });

                // Title
                y += 25;
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('RESUME MEDIS PASIEN', leftMargin, y, { width: contentWidth, align: 'center' });

                y += 20;
                doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(1).stroke();

                // Patient Info
                y += 15;
                doc.fontSize(10).font('Helvetica');
                const patientName = this.sanitizeTextForPdf(patientData.fullName || patientData.full_name || '-');
                doc.text(`Nama Pasien: ${patientName}`, leftMargin, y);
                doc.text(`Tanggal: ${this.formatDateEuropean()}`, leftMargin + 300, y);

                y += 14;
                doc.text(`No. MR: ${recordData.mrId || '-'}`, leftMargin, y);
                if (patientData.age) {
                    doc.text(`Usia: ${patientData.age} tahun`, leftMargin + 300, y);
                }

                y += 20;
                doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(0.5).stroke();

                // Resume Content
                y += 15;
                let resumeText = resumeData.resume || resumeData || '';

                // Sanitize the resume text
                resumeText = this.sanitizeTextForPdf(resumeText);

                if (resumeText) {
                    doc.fontSize(10).font('Helvetica');

                    // Split by lines and render
                    const lines = resumeText.split('\n');
                    for (const line of lines) {
                        // Skip empty lines but preserve some spacing
                        if (!line.trim()) {
                            y += 6;
                            continue;
                        }

                        // Check if need new page
                        if (y > doc.page.height - 80) {
                            doc.addPage();
                            y = 40;
                        }

                        // Check if it's a section header (Roman numerals or bold text)
                        if (line.match(/^[IVX]+\.\s/) || line.match(/^[A-Z][A-Z\s]+:$/)) {
                            doc.font('Helvetica-Bold');
                            y += 8; // Extra space before section
                        } else {
                            doc.font('Helvetica');
                        }

                        const textHeight = doc.heightOfString(line, { width: contentWidth });
                        doc.text(line, leftMargin, y, { width: contentWidth });
                        y += textHeight + 2;
                    }
                } else {
                    doc.text('Resume medis belum tersedia.', leftMargin, y);
                }

                // Footer with signature area - make sure we're on the last page
                if (y > doc.page.height - 120) {
                    doc.addPage();
                }
                y = doc.page.height - 100;
                doc.moveTo(leftMargin, y).lineTo(pageWidth - rightMargin, y).lineWidth(0.5).stroke();

                y += 15;
                doc.fontSize(9).font('Helvetica');
                doc.text(`Kediri, ${this.formatDateEuropean()}`, leftMargin + 350, y);

                y += 12;
                doc.text('Dokter Pemeriksa,', leftMargin + 350, y);

                y += 40;
                doc.font('Helvetica-Bold');
                doc.text('dr. Dibya Arfianda, Sp.OG', leftMargin + 350, y);

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
     * Format number to Rupiah with 'Rp' prefix
     */
    formatRupiah(amount) {
        return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
    }

    /**
     * Format number to Rupiah without 'Rp' prefix (for table columns)
     */
    formatRupiahSimple(amount) {
        return Math.round(amount || 0).toLocaleString('id-ID');
    }
}

module.exports = new PDFGenerator();
