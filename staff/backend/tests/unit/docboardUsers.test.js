const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('DocBoard staff directory', () => {
  test('returns only minimal staff directory fields with an active status', () => {
    const route = readRepoFile('staff', 'backend', 'routes', 'docboard.js');

    expect(route).toContain("router.get('/users'");
    expect(route).toContain("WHERE u.user_type = 'staff'");
    expect(route).toContain('CASE WHEN u.is_active = 1 THEN TRUE ELSE FALSE END AS is_active');
    expect(route).toContain("res.setHeader('Cache-Control', 'no-store')");
    expect(route).not.toContain('password_hash');
  });

  test('adds the directory to the DocBoard route, menu, API, and view', () => {
    const app = readRepoFile('docboard', 'src', 'app.jsx');
    const settings = readRepoFile('docboard', 'src', 'views', 'Settings.jsx');
    const api = readRepoFile('docboard', 'src', 'services', 'api.js');
    const users = readRepoFile('docboard', 'src', 'views', 'Users.jsx');

    expect(app).toContain("import Users from './views/Users';");
    expect(app).toContain('<Users path="/docboard/users" />');
    expect(settings).toContain('title="Pengguna"');
    expect(settings).toContain("route('/docboard/users')");
    expect(api).toContain('getUsers()');
    expect(api).toContain("return request('/users');");
    expect(users).toContain('api.getUsers()');
    expect(users).toContain('Pengguna');
  });

  test('bumps the service worker and manifest cache version', () => {
    const serviceWorker = readRepoFile('docboard', 'public', 'sw.js');
    const index = readRepoFile('docboard', 'index.html');
    const main = readRepoFile('docboard', 'src', 'main.jsx');
    const server = readRepoFile('staff', 'backend', 'server.js');
    const staffMain = readRepoFile('staff', 'public', 'scripts', 'main.js');
    const staffHtml = readRepoFile('staff', 'public', 'index-adminlte.html');
    const staffServiceWorker = readRepoFile('staff', 'public', 'sw.js');

    expect(serviceWorker).toContain("docboard-pwa-20260718-1");
    expect(index).toContain('docboard-20260718-1');
    expect(main).toContain("DOCBOARD_PWA_VERSION = '20260718-1'");
    expect(main).toContain("updateViaCache: 'none'");
    expect(main).toContain("textContent = 'Update baru tersedia'");
    expect(main).toContain("registration.waiting?.postMessage({ type: 'SKIP_WAITING' })");
    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(server).toContain("filePath.endsWith('sw.js')");
    expect(server).toContain("'no-store, no-cache, must-revalidate'");
    expect(staffMain).toContain('data-docboard-version');
    expect(staffMain).toContain('/docboard/?embed=${encodeURIComponent(embedVersion)}');
    expect(staffHtml).toContain("window.STAFF_CACHE_VERSION = 'v297';");
    expect(staffServiceWorker).toContain("STAFF_PWA_VERSION = 'v297'");
  });
});
