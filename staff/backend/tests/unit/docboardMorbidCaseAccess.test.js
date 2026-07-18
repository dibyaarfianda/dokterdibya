const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('DocBoard Morbid Case access', () => {
  test('uses the same restricted backend and frontend guards as Gambiran audit', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const app = readRepoFile('docboard', 'src', 'app.jsx');
    expect(route).toContain("router.use('/morbid-cases'");
    expect(route).toContain('if (!canViewRestrictedDocBoard(req.user)) return restrictedDocBoardForbidden(res);');
    expect(app).toContain('<NandaOnlyRoute path="/docboard/morbid-cases" component={MorbidCaseList} />');
    expect(app).toContain('<NandaOnlyRoute path="/docboard/morbid-cases/:id" component={MorbidCaseDetail} />');
  });

  test('keeps protected PDF downloads behind the DocBoard token bridge', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const api = readRepoFile('docboard', 'src', 'services', 'api.js');
    expect(route).toContain("if (req.query.token && !req.headers['authorization'])");
    expect(api).toContain('getMorbidCaseFileUrl(fileUrl)');
    expect(api).toContain('token=${encodeURIComponent(token)}');
  });

  test('shows only viewable PDF documents in the Penunjang tab', () => {
    const detail = readRepoFile('docboard', 'src', 'views', 'MorbidCaseDetail.jsx');
    expect(detail).toContain('(data.files || []).filter(file => file.url)');
    expect(detail).toContain('{files.length} dokumen PDF');
    expect(detail).not.toContain('byTransaction');
    expect(detail).not.toContain('`Transaksi ${key}`');
  });

  test('keeps Resume sections readable in a single column', () => {
    const styles = readRepoFile('docboard', 'src', 'index.css');
    expect(styles).toContain('.morbid-resume { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }');
    expect(styles).toContain('.morbid-resume .morbid-field-list > div');
    expect(styles).toContain('grid-template-columns: minmax(150px, 180px) minmax(0, 1fr);');
  });

  test('searches old Morbid Case candidates while the user types', () => {
    const list = readRepoFile('docboard', 'src', 'views', 'MorbidCaseList.jsx');
    expect(list).toContain('const candidateRequestId = useRef(0);');
    expect(list).toContain('[pickerOpen, candidateSearch]');
    expect(list).toContain('candidateSearch.trim() ? 300 : 0');
    expect(list).toContain('requestId !== candidateRequestId.current');
  });

  test('offers on-demand AI analysis and printable PDF layout', () => {
    const api = readRepoFile('docboard', 'src', 'services', 'api.js');
    const detail = readRepoFile('docboard', 'src', 'views', 'MorbidCaseDetail.jsx');
    const styles = readRepoFile('docboard', 'src', 'index.css');
    expect(api).toContain('analyzeMorbidCase(id)');
    expect(readRepoFile('staff', 'backend', 'routes', 'morbid-cases.js')).toContain('res.status(202)');
    expect(detail).toContain('Mulai Analisis AI');
    expect(detail).toContain('Cetak / Simpan sebagai PDF');
    expect(detail).toContain('<SeverityChart');
    expect(detail).toContain('<CriticalPointDiagram');
    expect(styles).toContain('@media print');
    expect(styles).toContain('body.morbid-ai-print');
  });
});
