const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const {
  normalizeMedicalRecordNumber,
  cleanForStorage,
  buildTimeline,
  buildResumeText,
  buildDocxFromTemplate,
} = require('../../services/GambiranResumeArtifacts');
const {
  convertToJpegs,
  withTimeout,
  PDFJS_STANDARD_FONT_DATA_PATH,
  PDFJS_STANDARD_FONT_DATA_URL,
} = require('../../services/GambiranResumeMedia');

const templatePath = path.join(__dirname, '../../templates/gambiran-resume-legal-memorandum.docx');

function makePdf() {
  return new Promise(resolve => {
    const document = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(18).text('Dokumen penunjang sintetis');
    document.end();
  });
}

describe('GambiranResumeArtifacts', () => {
  test('normalizes formatted RM for Medify while retaining canonical display', () => {
    expect(normalizeMedicalRecordNumber('00-00-12-34-56')).toEqual({
      input: '00-00-12-34-56', digits: '123456', display: '00-00-12-34-56',
    });
    expect(normalizeMedicalRecordNumber('123456').display).toBe('00-00-12-34-56');
    expect(() => normalizeMedicalRecordNumber('Nama Pasien')).toThrow('hanya menerima Nomor RM');
  });

  test('removes credentials recursively before snapshots are persisted', () => {
    expect(cleanForStorage({ patient: { name: 'Pasien Uji', token: 'secret' }, cppt: [{ plan: 'Pantau', cookie: 'x' }] }))
      .toEqual({ patient: { name: 'Pasien Uji' }, cppt: [{ plan: 'Pantau' }] });
  });

  test('sorts all clinical entries chronologically and leaves undated entries last', () => {
    const timeline = buildTimeline({
      encounters: [{
        case_id: 'med-test-1',
        operations: [{ id: 'op-1', tanggal: '02/08/2026 10:00', tindakan: 'Operasi sintetis' }],
        cppt: [
          { id: 'cppt-2', created_at: '2026-08-02 09:00:00', assessment: 'Stabil' },
          { id: 'cppt-1', created_at: '2026-08-01 08:00:00', assessment: 'Masuk' },
          { id: 'cppt-undated', assessment: 'Waktu belum dicatat' },
        ],
      }],
    });
    expect(timeline.map(item => item.id)).toEqual(['cppt-1', 'cppt-2', 'op-1', 'cppt-undated']);
    expect(timeline[0].occurred_at).toBe('2026-08-01T01:00:00.000Z');
    expect(timeline[3].occurred_at).toBeNull();
  });

  test('creates deterministic TXT and a valid DOCX cloned from the retained template', () => {
    const medicalRecord = normalizeMedicalRecordNumber('123456');
    const snapshot = {
      patient: { name: 'PASIEN SINTETIS', sex: 'Perempuan' },
      encounters: [{ case_id: 'med-test-1', type: 'Rawat Inap', admission_at: '2026-08-01 08:00:00' }],
      cppt: [{ id: 'cppt-1', created_at: '2026-08-01 09:00:00', assessment: 'Data uji' }],
      warnings: [],
    };
    const timeline = buildTimeline(snapshot);
    const text = buildResumeText({ snapshot, medicalRecord, timeline, files: [] });
    expect(text).toContain('RESUME MEDIS LONGITUDINAL');
    expect(text).toContain('## PERJALANAN KLINIS KRONOLOGIS');
    expect(text).toContain('Data uji');
    const docx = buildDocxFromTemplate(templatePath, text);
    const zip = new AdmZip(docx);
    const documentXml = zip.readAsText('word/document.xml');
    const headerXml = zip.readAsText('word/header1.xml');
    expect(documentXml).toContain('RESUME MEDIS LONGITUDINAL');
    expect(documentXml).toContain('PASIEN SINTETIS');
    expect(headerXml).toContain('RAHASIA MEDIS - AKSES TERBATAS');
    expect(zip.getEntry('word/fonts/Garamond-regular.ttf')).toBeTruthy();
  });

  test('converts image originals and every PDF page to JPEG', async () => {
    expect(fs.statSync(PDFJS_STANDARD_FONT_DATA_PATH).isDirectory()).toBe(true);
    expect(PDFJS_STANDARD_FONT_DATA_URL.endsWith('/')).toBe(true);
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#663399' } }).png().toBuffer();
    const imagePages = await convertToJpegs(png, 'image/png', 'foto.png');
    expect(imagePages).toHaveLength(1);
    expect(imagePages[0].buffer.subarray(0, 2).toString('hex')).toBe('ffd8');

    const pdf = await makePdf();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gambiran-resume-pdf-'));
    const pdfPath = path.join(tempDir, 'hasil.pdf');
    fs.writeFileSync(pdfPath, pdf);
    const mediaPath = path.join(__dirname, '../../services/GambiranResumeMedia.js');
    const script = `const fs=require('fs'); const media=require(process.argv[1]); (async()=>{ const pdf=fs.readFileSync(process.argv[2]); const streamed=[]; const retained=await media.convertToJpegs(pdf,'application/pdf','hasil.pdf',{isolatePdf:true,onPage:async item=>streamed.push({page:item.page,magic:item.buffer.subarray(0,2).toString('hex')})}); process.stdout.write(JSON.stringify({retained:retained.length,streamed})); })().catch(error=>{console.error(error);process.exit(1)});`;
    const child = spawnSync(process.execPath, ['-e', script, mediaPath, pdfPath], { encoding: 'utf8' });
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      retained: 0,
      streamed: [{ page: 1, magic: 'ffd8' }],
    });
  });

  test('stops a stalled PDF operation and calls its cancellation hook', async () => {
    let cancelled = false;
    await expect(withTimeout(new Promise(() => {}), 10, 'render timeout', () => { cancelled = true; }))
      .rejects.toThrow('render timeout');
    expect(cancelled).toBe(true);
  });
});
