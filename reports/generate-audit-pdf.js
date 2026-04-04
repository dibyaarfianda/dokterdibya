const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function readTsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split('\t').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || '').trim();
    });
    return row;
  });
}

function addSectionTitle(doc, text) {
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(13).text(text);
  doc.moveDown(0.3);
}

function addKeyValue(doc, key, value) {
  doc.font('Helvetica-Bold').fontSize(10).text(`${key}: `, { continued: true });
  doc.font('Helvetica').fontSize(10).text(String(value));
}

function addRowBlock(doc, lines) {
  lines.forEach((line) => {
    doc.font('Helvetica').fontSize(10).text(line);
  });
  doc.moveDown(0.3);
}

function ensureSpace(doc, needed = 80) {
  if (doc.y > doc.page.height - needed) doc.addPage();
}

async function main() {
  const baseDir = __dirname;

  const oneMonthSummaryPath = path.join(baseDir, 'audit_1bulan_mismatch_summary_20260404.tsv');
  const janFebDetailPath = path.join(baseDir, 'audit_jan_feb_mismatch_detail_20260404.tsv');
  const oneMonthUnderPath = path.join(baseDir, 'audit_1bulan_kurang_deduksi_detail_20260404.tsv');

  const oneMonthSummary = readTsv(oneMonthSummaryPath);
  const janFebDetail = readTsv(janFebDetailPath);
  const oneMonthUnder = readTsv(oneMonthUnderPath);

  const outputPath = path.join(baseDir, 'laporan-audit-deduksi-obat-20260404.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const ws = fs.createWriteStream(outputPath);
  doc.pipe(ws);

  const generatedAt = new Date();
  const month1 = oneMonthSummary.filter((r) => r.source === 'obat_sales');
  const month2 = oneMonthSummary.filter((r) => r.source === 'sunday_clinic_billing');
  const janRows = janFebDetail.filter((r) => r.period === '2026-01');
  const febRows = janFebDetail.filter((r) => r.period === '2026-02');

  doc.font('Helvetica-Bold').fontSize(18).text('Laporan Audit Deduksi Obat', { align: 'center' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(11).text('Klinik Dokter Dibya', { align: 'center' });
  doc.font('Helvetica').fontSize(10).text(`Generated: ${generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`, { align: 'center' });
  doc.font('Helvetica').fontSize(10).text('Tanggal audit: 2026-04-04', { align: 'center' });

  addSectionTitle(doc, '1) Ringkasan Eksekutif');
  addKeyValue(doc, 'Audit 1 Bulan', 'Periode rolling 1 bulan dari tanggal audit (Mar-Apr 2026)');
  addKeyValue(doc, 'Audit Januari', '2026-01-01 s.d. 2026-01-31');
  addKeyValue(doc, 'Audit Februari', '2026-02-01 s.d. 2026-02-28');
  addKeyValue(doc, 'Total obat mismatch (audit 1 bulan)', oneMonthSummary.length);
  addKeyValue(doc, 'Total kasus kurang deduksi (audit 1 bulan)', oneMonthSummary.filter((r) => r.issue_type === 'kurang_deduksi').length);
  addKeyValue(doc, 'Total kasus Jan-Feb detail', janFebDetail.length);

  addSectionTitle(doc, '2) Audit 1 Bulan - Ringkasan Obat Bermasalah');
  doc.font('Helvetica').fontSize(9).text('Format: source | issue_type | obat | affected_lines | expected | deducted | gap');
  doc.moveDown(0.4);

  oneMonthSummary.forEach((r) => {
    ensureSpace(doc);
    addRowBlock(doc, [
      `${r.source} | ${r.issue_type} | ${r.obat_name}`,
      `affected_lines=${r.affected_lines} | expected=${r.expected_qty} | deducted=${r.deducted_qty} | gap=${r.gap_qty}`,
    ]);
  });

  addSectionTitle(doc, '3) Audit 1 Bulan - Detail Kurang Deduksi (Prioritas)');
  doc.font('Helvetica').fontSize(9).text('Format: waktu | source | ref | pasien | obat | expected | deducted | gap');
  doc.moveDown(0.4);

  oneMonthUnder.forEach((r) => {
    ensureSpace(doc);
    addRowBlock(doc, [
      `${r.tx_time} | ${r.source} | ${r.ref_no}`,
      `Pasien: ${r.patient_name}`,
      `${r.obat_name} | expected=${r.expected_qty} | deducted=${r.deducted_qty} | gap=${r.gap_qty}`,
    ]);
  });

  doc.addPage();
  addSectionTitle(doc, '4) Audit Januari 2026 - Detail Mismatch');
  if (janRows.length === 0) {
    doc.font('Helvetica').fontSize(10).text('Tidak ditemukan mismatch pada Januari 2026.');
  } else {
    janRows.forEach((r) => {
      ensureSpace(doc);
      addRowBlock(doc, [
        `${r.tx_time} | ${r.source} | ${r.ref_no}`,
        `Pasien: ${r.patient_name}`,
        `${r.obat_name} | expected=${r.expected_qty} | deducted=${r.deducted_qty} | gap=${r.gap_qty}`,
      ]);
    });
  }

  addSectionTitle(doc, '5) Audit Februari 2026 - Detail Mismatch');
  if (febRows.length === 0) {
    doc.font('Helvetica').fontSize(10).text('Tidak ditemukan mismatch pada Februari 2026.');
  } else {
    febRows.forEach((r) => {
      ensureSpace(doc);
      addRowBlock(doc, [
        `${r.tx_time} | ${r.source} | ${r.ref_no}`,
        `Pasien: ${r.patient_name}`,
        `${r.obat_name} | expected=${r.expected_qty} | deducted=${r.deducted_qty} | gap=${r.gap_qty}`,
      ]);
    });
  }

  addSectionTitle(doc, '6) Catatan Teknis');
  doc.font('Helvetica').fontSize(10).text('- Metode audit membandingkan quantity item transaksi vs total quantity sale pada stock_movements untuk reference terkait.');
  doc.font('Helvetica').fontSize(10).text('- Gap positif (expected > deducted) = kurang deduksi.');
  doc.font('Helvetica').fontSize(10).text('- Gap negatif (expected < deducted) = kelebihan deduksi.');
  doc.font('Helvetica').fontSize(10).text('- Laporan ini berbasis snapshot data pada saat query dijalankan.');

  doc.end();

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  console.log(`PDF generated: ${outputPath}`);
}

main().catch((err) => {
  console.error('Failed to generate PDF:', err.message);
  process.exit(1);
});