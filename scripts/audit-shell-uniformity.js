const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

function listHtmlFiles(dir) {
    return fs.readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith('.html'))
        .map((name) => path.join(dir, name));
}

function hasPatientShell(content) {
    return /<body[^>]*\bpatient-tool-shell\b/i.test(content);
}

function hasLegacyRetrofit(content) {
    return /<body[^>]*\blegacy-tool-retrofit\b/i.test(content);
}

function hasDataToolShell(content) {
    return /<body[^>]*\bdata-tool-shell-active=/i.test(content);
}

function hasLocalTopbarPortal(content) {
    return /<header[^>]*\btopbar-portal\b/i.test(content) ||
        /<div[^>]*\btopbar-portal\b/i.test(content) ||
        /\btopbar-portal-spacer\b/i.test(content);
}

function hasShellScript(content) {
    return /\/scripts\/patient-tool-shell\.js/i.test(content);
}

function hasRetrofitScript(content) {
    return /\/scripts\/patient-tool-retrofit\.js/i.test(content);
}

const files = listHtmlFiles(publicDir);
const findings = [];

for (const filePath of files) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    const shell = hasPatientShell(content);
    const retrofit = hasLegacyRetrofit(content);
    const toolData = hasDataToolShell(content);

    if (!(shell || retrofit || toolData)) {
        continue;
    }

    if (hasLocalTopbarPortal(content)) {
        findings.push({
            file: rel,
            type: 'duplicate-topbar',
            message: 'Found local topbar-portal while page uses shell/retrofit.'
        });
    }

    if (!hasShellScript(content)) {
        findings.push({
            file: rel,
            type: 'missing-shell-script',
            message: 'patient-tool-shell.js is missing.'
        });
    }

    if (retrofit && !hasRetrofitScript(content)) {
        findings.push({
            file: rel,
            type: 'missing-retrofit-script',
            message: 'legacy-tool-retrofit page is missing patient-tool-retrofit.js.'
        });
    }
}

if (findings.length) {
    console.error('Shell uniformity audit failed with findings:');
    findings.forEach((f, i) => {
        console.error(`${i + 1}. ${f.file} :: ${f.type} :: ${f.message}`);
    });
    process.exit(1);
}

console.log('Shell uniformity audit passed. No findings.');
