const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Aura scientific schedule access', () => {
  test('grants Aura scientific schedule access without granting private schedule access', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const access = readRepoFile('docboard', 'src', 'utils', 'access.js');
    const app = readRepoFile('docboard', 'src', 'app.jsx');

    expect(route).toContain("SCIENTIFIC_SCHEDULE_ALLOWED_EMAILS = ['nanda.arfianda@gmail.com', 'auranurin56@gmail.com']");
    expect(route).toContain("if (source.space === 'ilmiah') return !canAccessScientificSchedule(user);");
    expect(route).toContain("if (source.space === 'pribadi') return !canViewRestrictedDocBoard(user);");
    expect(access).toContain("export const AURA_EMAIL = 'auranurin56@gmail.com';");
    expect(access).toContain('export function canAccessScientificSchedule');
    expect(app).toContain('<ScientificScheduleRoute path="/docboard/scientific" space="ilmiah" />');
  });

  test('does not fall back to a local schedule for authorization failures', () => {
    const api = readRepoFile('docboard', 'src', 'services', 'api.js');

    expect(api).toContain('function isNetworkError(error)');
    expect(api).toContain('if (!isNetworkError(err)) throw err;');
  });

  test('filters the calendar independently for scientific and private schedules', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');
    const service = readRepoFile('staff', 'backend', 'services', 'DocBoardService.js');

    expect(route).toContain('excludeScientific: !canAccessScientificSchedule(req.user)');
    expect(route).toContain('excludePrivate: !canViewRestrictedDocBoard(req.user)');
    expect(service).toContain('if (filters.excludeScientific)');
    expect(service).toContain("params.push('ilmiah');");
    expect(service).toContain("params.push('pribadi');");
  });

  test('shares scientific and procedure schedules across users while keeping private schedules owner-only', () => {
    const service = readRepoFile('staff', 'backend', 'services', 'DocBoardService.js');

    expect(service).toContain("(space IN ('ilmiah', 'tindakan') OR (space = 'pribadi' AND user_id = ?))");
    expect(service).toContain("(s.space IN ('ilmiah', 'tindakan') OR (s.space = 'pribadi' AND s.user_id = ?))");
    expect(service).toContain("WHERE id = ?\n         AND (space IN ('ilmiah', 'tindakan') OR (space = 'pribadi' AND user_id = ?))");
  });
});
