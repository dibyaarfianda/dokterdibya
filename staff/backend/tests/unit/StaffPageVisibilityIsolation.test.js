const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...segments) {
    return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('staff page visibility isolation', () => {
    test('legacy page launchers delegate to the canonical page hider', () => {
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const financeAnalysis = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');
        const notifications = read('staff', 'public', 'scripts', 'shell', 'notifications.js');
        const shell = read('staff', 'public', 'index-adminlte.html');

        expect(patientTools).toContain('hideLegacyStaffPages();');
        expect(patientTools).not.toContain("document.querySelectorAll('[id$=\"-page\"]')");
        expect(financeAnalysis).toContain('window.hideAllPages?.();');
        expect(notifications).toContain('window.hideAllPages?.();');

        const supportChat = shell.slice(
            shell.indexOf('async function showSupportChatPage()'),
            shell.indexOf('window.showSupportChatPage = showSupportChatPage;')
        );
        expect(supportChat).toContain('window.hideAllPages();');
        expect(supportChat).not.toContain("document.querySelectorAll('[id$=\"-page\"]')");
    });

    test('fallback hiding explicitly covers non-suffix staff content containers', () => {
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');

        expect(patientTools).toMatch(/function hideLegacyStaffPages\(\)[\s\S]*?#content-staff-payroll/);
        expect(patientTools).toMatch(/function hideLegacyStaffPages\(\)[\s\S]*?#content-kantor-saya/);
    });

    test('legacy patient tools do not overwrite lazy staff activity handlers', () => {
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');

        expect(patientTools).toContain('window.showStaffActivityPage ||= function()');
        expect(patientTools).toContain('window.loadStaffActivityLogs ||= async function(page = 0)');
        expect(patientTools).toMatch(/window\.showGuestActivityPage = function\(\)[\s\S]*?hideLegacyStaffPages\(\);[\s\S]*?guest-activity-page/);
    });
});
