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
});
