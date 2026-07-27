const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('shared staff API client contracts', () => {
    test('central client owns authentication, timeout, retry, coalescing, and page cancellation', () => {
        const client = read('staff', 'public', 'scripts', 'staff-api.js');

        expect(client).toContain("import { getIdToken } from './vps-auth-v2.js';");
        expect(client).toContain('class StaffApiError');
        expect(client).toContain('const RETRYABLE_STATUS');
        expect(client).toContain('timeoutController.abort');
        expect(client).toContain('const inFlightGets = new Map()');
        expect(client).toContain('function fingerprintToken(token)');
        expect(client).toContain('`${tokenFingerprint}:${method}:${resolveUrl(path)}`');
        expect(client).toContain('export function createPageRequestScope()');
        expect(client).toContain("controller.abort(new DOMException(reason, 'AbortError'))");
        expect(client).not.toMatch(/localStorage\.getItem\(['"]vps_auth_token/);
    });

    test('priority modules use the shared client and stop work when deactivated', () => {
        const medify = read('staff', 'public', 'scripts', 'medify-sync.js');
        const finance = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');

        expect(medify).toContain("import { createPageRequestScope } from './staff-api.js';");
        expect(medify).toContain('export function destroyMedifySync()');
        expect(medify).toContain("window.socket.off('medify_progress', medifyProgressHandler)");
        expect(finance).toContain("import { createPageRequestScope } from '../staff-api.js';");
        expect(finance).toContain('window.destroyFinanceAnalysisPage');
        expect(medify).not.toMatch(/\bfetch\s*\(/);
        expect(finance).not.toMatch(/\bfetch\s*\(/);
    });

    test('dynamic API content uses shared escaping and URL sanitization', () => {
        const safeRender = read('staff', 'public', 'scripts', 'safe-render.js');
        const medify = read('staff', 'public', 'scripts', 'medify-sync.js');
        const finance = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');

        expect(safeRender).toContain("replaceAll(\"'\", '&#39;')");
        expect(safeRender).toContain("parsed.protocol === 'https:'");
        expect(medify).toContain('escapeHtml(data.currentJob.patient_name)');
        expect(medify).toContain('sanitizeUrl(p.thumbnailUrl)');
        expect(finance).toContain('escapeHtml(apt.patient_name)');
        expect(finance).toContain('escapeHtml(apt.complaint)');
    });
});
