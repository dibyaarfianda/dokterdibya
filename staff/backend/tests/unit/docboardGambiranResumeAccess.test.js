const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('DocBoard Gambiran longitudinal resume contract', () => {
  test('uses the existing Nanda-only backend and frontend guards', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const app = readRepoFile('docboard', 'src', 'app.jsx');
    expect(route).toContain("router.use('/gambiran-resumes'");
    expect(route).toContain('if (!canViewRestrictedDocBoard(req.user)) return restrictedDocBoardForbidden(res);');
    expect(app).toContain('<NandaOnlyRoute path="/docboard/gambiran-resumes" component={GambiranResumeList} />');
    expect(app).toContain('<NandaOnlyRoute path="/docboard/gambiran-resumes/:id" component={GambiranResumeDetail} />');
  });

  test('exposes asynchronous RM-only APIs with no-store responses', () => {
    const parentRoute = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const route = readRepoFile('staff', 'backend', 'routes', 'gambiran-resumes.js');
    const api = readRepoFile('docboard', 'src', 'services', 'api.js');
    const noStoreIndex = parentRoute.indexOf("router.use('/gambiran-resumes', (req, res, next) => {\n  res.setHeader('Cache-Control'");
    const authIndex = parentRoute.indexOf('router.use(verifyStaffToken);');
    expect(noStoreIndex).toBeGreaterThan(-1);
    expect(noStoreIndex).toBeLessThan(authIndex);
    expect(route).toContain('req.body?.medical_record_number');
    expect(route).toContain('res.status(202)');
    expect(route).toContain("Cache-Control', 'no-store, no-cache");
    expect(api).toContain('createGambiranResume(medicalRecordNumber)');
    expect(api).toContain('getGambiranResumeFileDownload(id, fileId');
    expect(api).toContain('getGambiranResumeArtifactDownload(id, kind)');
  });

  test('documents recursive discovery across both Medify history pages', () => {
    const contract = readRepoFile('docs', 'comm-gambiran-resume-contract.md');
    expect(contract).toContain('/rawatjalan/histori-transaksi');
    expect(contract).toContain('/rawatinap/histori-transaksi');
    expect(contract).toContain('recursively add unseen `case_id`');
    expect(contract).toContain('COMM must never search by patient name');
  });

  test('keeps originals, JPEG derivatives, and legal-memorandum template artifacts', () => {
    const service = readRepoFile('staff', 'backend', 'services', 'GambiranResumeService.js');
    const artifacts = readRepoFile('staff', 'backend', 'services', 'GambiranResumeArtifacts.js');
    expect(service).toContain('gambiran-resumes/${mr.digits}/${id}');
    expect(service).toContain('/originals/');
    expect(service).toContain('/jpg/');
    expect(artifacts).toContain('RESUME MEDIS LONGITUDINAL');
    expect(fs.existsSync(path.join(repoRoot, 'staff', 'backend', 'templates', 'gambiran-resume-legal-memorandum.docx'))).toBe(true);
  });
});
