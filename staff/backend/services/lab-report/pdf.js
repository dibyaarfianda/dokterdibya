'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const { flag } = require('./domain');
const assets = path.resolve(__dirname, '../../../public/images/laboratorium');
const navy = '#193D60'; const teal = '#268477'; const gray = '#64748B';
const printable = value => String(value ?? '').replace(/[–—−]/g, '-').replace(/→/g, ' -> ').replace(/\u00a0/g, ' ');
const displayDate = value => value ? String(value).replace('T', ' ') + (String(value).includes('T') ? ' WIB' : '') : '-';
function comparisonCells(p) {
    return [p.name, p.previous ? `${p.previous.raw_value} ${p.previous.unit || ''}`.trim() : '-', `${p.raw_value} ${p.unit || ''}`.trim(),
        p.delta === null ? '-' : `${p.delta > 0 ? '+' : ''}${p.delta}`, flag(p)];
}

async function renderLabPdf({ data, patient, labNumber = '', version = 1, draft = true, comparison = null }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 36, left: 38, right: 38, bottom: 48 }, bufferPages: true,
            info: { Title: comparison ? 'Komparasi Hasil Laboratorium' : 'Hasil Laboratorium', Author: 'dr. Dibya Private Clinic' } });
        const chunks = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        const left = 38; const width = doc.page.width - 76; let y;
        const write = (value, x, top, options = {}) => doc.text(printable(value), x, top, { lineBreak: false, ...options });
        function header(continued = false) {
            doc.image(path.join(assets, 'dpc-lab-logo.png'), left, 28, { fit: [268, 82] });
            doc.image(path.join(assets, 'melinda.png'), 363, 31, { fit: [35, 38] });
            doc.font('Helvetica').fontSize(6.5).fillColor(gray);
            write('Supported by', 348, 74, { width: 65, align: 'center' });
            write('RSIA Melinda', 348, 84, { width: 65, align: 'center' });
            doc.image(path.join(assets, 'sw-healthcare.jpg'), 464, 26, { fit: [77, 77] });
            doc.fillColor(teal).rect(left, 115, width, 3).fill();
            doc.fillColor(navy).font('Helvetica-Bold').fontSize(16);
            write(comparison ? 'KOMPARASI HASIL LABORATORIUM' : 'HASIL LABORATORIUM', left, 132);
            doc.font('Helvetica').fontSize(8).fillColor(gray);
            write(`${labNumber || 'Belum diterbitkan'}  |  Revisi ${version}${continued ? '  |  Lanjutan' : ''}`, left, 156);
            if (draft) {
                doc.roundedRect(482, 131, 73, 24, 6).fill('#FFF0D1');
                doc.fillColor('#8D6217').font('Helvetica-Bold').fontSize(9); write('DRAF', 487, 139, { width: 63, align: 'center' });
            }
            const patientRows = [['Pasien', patient.name || '-', 'ID Pasien / DRD', `${patient.patient_id} / ${patient.mr_id}`],
                ['Tanggal lahir', patient.birth_date || '-', 'Pemeriksaan', displayDate(data.examined_at)],
                ['Dokter', data.doctor || '-', 'Waktu permintaan', data.request_time || '-']];
            y = 180;
            patientRows.forEach(row => {
                doc.font('Helvetica').fontSize(7).fillColor(gray); write(row[0].toUpperCase(), left, y); write(row[2].toUpperCase(), 318, y);
                doc.font('Helvetica-Bold').fontSize(9).fillColor(navy);
                const a = printable(row[1]); const b = printable(row[3]);
                const h = Math.max(doc.heightOfString(a, { width: 258 }), doc.heightOfString(b, { width: 235 }), 12);
                write(a, left, y + 12, { width: 258, lineBreak: true }); write(b, 318, y + 12, { width: 235, lineBreak: true }); y += h + 27;
            });
            doc.font('Helvetica').fontSize(7.5).fillColor(gray);
            write('Jl. Balowerti 2 No. 59, Kediri, Jawa Timur', left, y); y += 25;
            if (comparison) {
                write(`Pembanding: ${displayDate(comparison.previous.examined_at)}  |  ${comparison.previous.lab_number}`, left, y, { width, lineBreak: true }); y += 28;
            }
        }
        const columns = comparison ? [38, 208, 312, 416, 506] : [38, 238, 314, 414, 504];
        const widths = comparison ? [165, 99, 99, 85, 47] : [195, 71, 95, 85, 49];
        const titles = comparison ? ['PEMERIKSAAN', 'TERDAHULU', 'SEKARANG', 'SELISIH', 'H/L'] : ['PEMERIKSAAN', 'HASIL', 'RUJUKAN', 'SATUAN', 'H/L'];
        function tableHeader() {
            doc.roundedRect(left, y, width, 28, 4).fill(navy);
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
            titles.forEach((title, i) => write(title, columns[i] + 6, y + 10)); y += 35;
        }
        function ensureSpace(height) { if (y + height > doc.page.height - 85) { doc.addPage(); header(true); tableHeader(); } }
        try {
            header(); tableHeader(); let panel = '';
            const rows = comparison ? comparison.rows : data.parameters;
            rows.forEach((p, index) => {
                if (p.panel !== panel) {
                    ensureSpace(64); panel = p.panel;
                    doc.font('Helvetica-Bold').fontSize(8).fillColor(teal); write(panel || 'Pemeriksaan', left + 6, y + 7); y += 24;
                }
                const values = comparison ? comparisonCells(p)
                    : [p.name, p.raw_value || '-', p.reference || 'Tidak dicantumkan', p.unit || '-', flag(p)];
                doc.font('Helvetica').fontSize(8);
                const height = Math.max(27, ...values.map((v, i) => doc.heightOfString(printable(v), { width: widths[i] - 12 }) + 16));
                const note = [p.reference_context, p.note].filter(Boolean).join(' | ');
                const noteHeight = note ? doc.heightOfString(printable(note), { width: width - 20 }) + 8 : 0;
                ensureSpace(height + noteHeight);
                if (index % 2 === 0) doc.rect(left, y, width, height + noteHeight).fill('#F3F7F9');
                values.forEach((value, i) => {
                    doc.font(i === 1 || (comparison && i === 2) ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(i === values.length - 1 && value ? '#B34739' : navy);
                    write(value, columns[i] + 6, y + 8, { width: widths[i] - 12, lineBreak: true });
                });
                if (note) { doc.font('Helvetica').fontSize(7).fillColor(gray); write(note, left + 9, y + height, { width: width - 18, lineBreak: true }); }
                y += height + noteHeight + 2;
            });
            if (data.notes) {
                const noteHeight = doc.font('Helvetica').fontSize(8).heightOfString(printable(data.notes), { width });
                ensureSpace(noteHeight + 42); y += 15;
                doc.font('Helvetica-Bold').fontSize(8).fillColor(navy); write('CATATAN', left, y); y += 16;
                doc.font('Helvetica').fontSize(8).fillColor(gray); write(data.notes, left, y, { width, lineBreak: true }); y += noteHeight + 15;
            }
            ensureSpace(132); y += 18;
            doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#DCE5EC').stroke(); y += 14;
            doc.font('Helvetica').fontSize(7).fillColor(gray);
            write('H = di atas rujukan  |  L = di bawah rujukan', left, y);
            write('Petugas Laboratorium', 350, y, { width: 204, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(9).fillColor(navy); write(data.technician, 350, y + 55, { width: 204, align: 'center' });
            doc.font('Helvetica').fontSize(7).fillColor(gray); write(`SIP: ${data.license}`, 350, y + 70, { width: 204, align: 'center' });
            write('Hasil dinilai bersama data klinis oleh dokter yang merawat.', left, y + 94, { width, lineBreak: true });
            const range = doc.bufferedPageRange();
            for (let i = 0; i < range.count; i++) {
                doc.switchToPage(i); doc.font('Helvetica').fontSize(6.5).fillColor(gray);
                write(`dr. Dibya Private Clinic  |  Dicetak ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`, left, doc.page.height - 62);
                write(`${i + 1} / ${range.count}`, 505, doc.page.height - 62, { width: 50, align: 'right' });
            }
            doc.end();
        } catch (error) { doc.destroy(); reject(error); }
    });
}
module.exports = { renderLabPdf, comparisonCells };
