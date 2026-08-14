const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'staff-startup-performance-test-secret';

jest.mock('../../db', () => ({ query: jest.fn() }));

const express = require('express');
const request = require('supertest');
const sharp = require('sharp');
const db = require('../../db');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('staff startup performance regressions', () => {
    test('staff identity uses a lightweight avatar URL instead of returning inline image data', () => {
        const { resolveStaffIdentity, decodeDataImageUrl } = require('../../utils/staffIdentity');
        const identity = resolveStaffIdentity({
            name: 'dr. Dibya',
            userId: 'STAFF001',
            hasPhoto: true,
            avatarVersion: 1723600000
        });

        expect(identity.photo_url).toBe('/api/auth/staff-avatar/STAFF001?v=1723600000');
        expect(identity.gender).toBe('laki-laki');
        expect(decodeDataImageUrl('data:image/png;base64,aGVsbG8=')).toEqual({
            mimeType: 'image/png',
            buffer: Buffer.from('hello')
        });
        expect(decodeDataImageUrl('https://example.test/avatar.png')).toBeNull();
    });

    test('auth startup queries do not materialize the staff photo blob', () => {
        const authRoute = read('staff', 'backend', 'routes', 'auth.js');
        const meRoute = authRoute.slice(
            authRoute.indexOf("router.get('/api/auth/me'"),
            authRoute.indexOf('// GET /api/staff/verify')
        );

        expect(meRoute).toContain('AS has_photo');
        expect(meRoute).toContain('AS avatar_version');
        expect(meRoute).not.toContain('u.photo_url,');
        expect(authRoute).toContain("router.get('/api/auth/staff-avatar/:userId'");
    });

    test('staff avatar endpoint returns a small cacheable WebP image', async () => {
        const pngBuffer = await sharp({
            create: { width: 4, height: 4, channels: 4, background: '#1677ff' }
        }).png().toBuffer();
        const onePixelPng = `data:image/png;base64,${pngBuffer.toString('base64')}`;
        db.query.mockResolvedValueOnce([[{ photo_url: onePixelPng }]]);

        const app = express();
        app.use(require('../../routes/auth'));
        app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));

        const response = await request(app).get('/api/auth/staff-avatar/STAFF001?v=1');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^image\/webp/);
        expect(response.headers['cache-control']).toContain('max-age=604800');
        expect(response.body).toBeInstanceOf(Buffer);
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body.length).toBeLessThan(10000);
    });

    test('ordinary reload lands on Dashboard and defers background communication', () => {
        const main = read('staff', 'public', 'scripts', 'main.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const globalChatLoader = read('staff', 'public', 'scripts', 'global-chat-loader.js');
        const restoreStart = main.indexOf('function restoreLastPage()');
        const restoreEnd = main.indexOf('// -------------------- START PATIENT VISIT', restoreStart);
        const restoreBody = main.slice(restoreStart, restoreEnd);

        expect(restoreBody).not.toContain("sessionStorage.getItem('lastStaffNavId')");
        expect(restoreBody).toContain('showDashboardPage();');
        expect(main).toContain('scheduleRealtimeStartup');
        expect(bootstrap).toContain('scheduleDeferredStartup');
        expect(globalChatLoader).toContain('window.__lazyChatToggle');
        expect(globalChatLoader).toContain('window.requestIdleCallback(loadChatWhenIdle');

        const coreModulesStart = bootstrap.indexOf('const coreModulesPromise');
        const coreModulesEnd = bootstrap.indexOf('const serverVerifiedUser', coreModulesStart);
        expect(bootstrap.slice(coreModulesStart, coreModulesEnd)).not.toContain("import('../chat-popup.js')");
    });

    test('Kelola Pasien renders one stable final table after its assets are ready', () => {
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const index = read('staff', 'public', 'index-adminlte.html');
        const showStart = patientTools.indexOf('window.showManagePatientsPage = async function()');
        const showEnd = patientTools.indexOf('// ==================== Medical Import Functions', showStart);
        const showBody = patientTools.slice(showStart, showEnd);
        const loadStart = patientTools.indexOf('async function loadWebPatients(');
        const loadEnd = patientTools.indexOf('// Advanced Search Functions', loadStart);
        const loadBody = patientTools.slice(loadStart, loadEnd);

        expect(showBody).toContain('const enhancementPromise = Promise.allSettled');
        expect(showBody).toContain('const patientLoadPromise = loadWebPatients(enhancementPromise);');
        expect(showBody.indexOf("document.getElementById('manage-patients-page').classList.remove('d-none')"))
            .toBeLessThan(showBody.indexOf('const patientLoadPromise = loadWebPatients(enhancementPromise);'));
        expect(showBody).toContain('patientLoadPromise.finally');
        expect(showBody).not.toMatch(/await\s+Promise\.all\(\[\s*window\.ensureStaffFeature\('dataTables'\)/);
        expect(loadBody).toContain('enhanceManagePatientTableImmediately(savedPage);');
        expect(loadBody).toContain('if (enhancementPromise) await enhancementPromise;');
        expect(loadBody.indexOf('if (enhancementPromise) await enhancementPromise;'))
            .toBeLessThan(loadBody.indexOf('tbody.innerHTML = data.data.map(renderManagePatientRow)'));
        expect(loadBody).toContain('window.staffDebugLog?.');
        expect(loadBody).not.toMatch(/window\.staffDebugLog\(/);
        expect(patientTools).toContain('"autoWidth": false');
        expect(patientTools).toContain('function enhanceManagePatientTableImmediately(savedPage = 0)');
        expect(patientTools).toContain("document.querySelector('#manage-patients-tbody .btn-view-patient')");
        expect(index).toContain('id="manage-patients-table" class="table table-bordered table-striped table-sm" style="width: 100%;"');
        expect(bootstrap).toContain('warmPatientManagementAssets');
        expect(bootstrap).toContain("ensureFeature('patientTools')");
        expect(bootstrap).toContain("ensureFeature('dataTables')");
    });
});
